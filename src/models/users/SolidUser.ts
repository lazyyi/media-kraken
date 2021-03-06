import { SolidEngine, Fetch, SolidDocument } from 'soukai-solid';
import SolidAuthClient, { Session } from 'solid-auth-client';
import Soukai from 'soukai';

import MediaContainer from '@/models/soukai/MediaContainer';
import ModelsCache from '@/models/ModelsCache';
import TypeRegistration from '@/models/soukai/TypeRegistration';
import User from '@/models/users/User';

import RDFStore from '@/utils/RDFStore';
import Storage from '@/utils/Storage';
import Time from '@/utils/Time';
import Url from '@/utils/Url';
import UUID from '@/utils/UUID';

export interface SolidUserJSON {
    id: string;
    name: string;
    avatar_url: string | null;
    storages: string[];
    typeIndexUrl: string;
}

export interface SessionListener {
    onUserUpdated(user: SolidUser | null): void;
    onError(error: Error): void;
}

export default class SolidUser extends User<SolidUserJSON> {

    private static _fetch?: Fetch;

    public static get fetch(): Fetch {
        return this._fetch || SolidAuthClient.fetch.bind(SolidAuthClient);
    }

    public static setFetch(fetch: Fetch): void {
        this._fetch = fetch;
    }

    public static async trackSession(listener: SessionListener): Promise<void> {
        let activeSessionWebId: string | null = null;
        const onSessionUpdated = async (session: Session | void) => {
            if (!session) {
                if (activeSessionWebId !== null) {
                    activeSessionWebId = null;
                    listener.onUserUpdated(null);
                }

                return;
            }

            if (session.webId === activeSessionWebId)
                return;

            activeSessionWebId = session.webId;

            const user = await this.fromWebId(activeSessionWebId);

            listener.onUserUpdated(user);
        };

        try {
            await SolidAuthClient.currentSession().then(onSessionUpdated);

            SolidAuthClient.trackSession(onSessionUpdated);
        } catch (error) {
            listener.onError(error);
        }
    }

    public static async login(idp: string): Promise<boolean> {
        const session = await SolidAuthClient.login(idp);

        if (!session)
            // Valid urls return an empty session before redirecting so there is no
            // way to distinguish between an actual error or everything working as expected.
            // We'll just wait a couple of seconds before returning, if the browser hasn't
            // redirected by then something is probably going wrong.
            await Time.wait(2000);

        return !!session;
    }

    public static async logout(): Promise<void> {
        await SolidAuthClient.logout();

        // Clean up storage
        // @see https://github.com/solid/solid-auth-client/issues/96
        Storage.remove('solid-auth-client');
    }

    public static isSolidUserJSON(json: object): json is SolidUserJSON {
        return 'id' in json
            && 'name' in json
            && 'avatar_url' in json
            && 'storages' in json
            && 'typeIndexUrl' in json;
    }

    public static async fromJSON(json: SolidUserJSON): Promise<SolidUser> {
        return new SolidUser(
            json.id,
            json.name,
            json.avatar_url,
            json.storages,
            json.typeIndexUrl,
        );
    }

    public static async fromWebId(webId: string): Promise<SolidUser> {
        const store = await RDFStore.fromUrl(this.fetch, webId);

        const name = store.statement(webId, 'foaf:name');
        const avatarUrl = store.statement(webId, 'foaf:img');
        const storages = store.statements(webId, 'pim:storage');
        const typeIndexStatement = store.statement(webId, 'solid:privateTypeIndex');

        if (!typeIndexStatement)
            throw new Error("Couldn't find solid:privateTypeIndex in profile");

        if (storages.length === 0)
            throw new Error("Couldn't find pim:storage in profile");

        return new SolidUser(
            webId,
            name ? name.object.value : 'Unknown',
            avatarUrl ? avatarUrl.object.value : null,
            storages.map(storage => storage.object.value),
            typeIndexStatement.object.value,
        );
    }

    public readonly id: string;

    private storages: string[];
    private typeIndexUrl: string;
    private moviesContainerUrl?: string | null;

    constructor(
        id: string,
        name: string,
        avatarUrl: string | null,
        storages: string[],
        typeIndexUrl: string,
    ) {
        super(name, avatarUrl);

        this.id = id;
        this.storages = storages;
        this.typeIndexUrl = typeIndexUrl;
    }

    public initSoukaiEngine(): void {
        // TODO implement maxGlobbingSize config option
        Soukai.useEngine(new SolidEngine(SolidUser.fetch, {
            globbingBatchSize: null,
        }));
    }

    public async logout(): Promise<void> {
        await SolidUser.logout();
    }

    public toJSON(): SolidUserJSON {
        return {
            id: this.id,
            name: this.name,
            avatar_url: this.avatarUrl,
            storages: this.storages,
            typeIndexUrl: this.typeIndexUrl,
        };
    }

    protected async getCachedMoviesContainer(): Promise<MediaContainer | null> {
        const moviesContainerDocument = await this.getMoviesContainerDocument();

        if (!moviesContainerDocument)
            return null;

        // Given that we've set the date in the client after receiving a response, there may be some
        // difference in the modified date used in the server depending on the network latency.
        // We will use a 10 seconds threshold to consider models valid.
        const models = await ModelsCache.getFromDocument(moviesContainerDocument, 10000);
        const [moviesContainer] = (models || []).filter(model => model.modelClass === MediaContainer);

        return moviesContainer as MediaContainer || null;
    }

    protected async initMoviesContainer(): Promise<MediaContainer> {
        const now = new Date();
        const url = await this.getMoviesContainerUrl();
        const existingContainer = url ? await MediaContainer.find<MediaContainer>(url) : null;
        const moviesContainer = existingContainer || await this.createMoviesContainer();

        // Reading containers causes their modified date to be updated in node-solid-server, so
        // we will set the modified date of this document in the cache to now.
        ModelsCache.rememberDocument(moviesContainer.url, now);
        ModelsCache.remember(moviesContainer, { documents: moviesContainer.documents });

        return moviesContainer;
    }

    private async getMoviesContainerDocument(): Promise<SolidDocument | null> {
        const url = await this.getMoviesContainerUrl();

        if (!url)
            return null;

        const store = await RDFStore.fromUrl(SolidUser.fetch, Url.parentDirectory(url!));
        const modified = store.statement(url, 'purl:modified');

        if (!modified)
            return null;

        return new SolidDocument({ url, updatedAt: new Date(modified.object.value) }, true);
    }

    private async getMoviesContainerUrl(): Promise<string | null> {
        if (typeof this.moviesContainerUrl === 'undefined') {
            const store = await RDFStore.fromUrl(SolidUser.fetch, this.typeIndexUrl);

            const moviesContainerType = store.statements(null, 'rdfs:type', 'solid:TypeRegistration')
                .find(statement =>
                    store.contains(statement.subject.value, 'solid:forClass', 'schema:Movie')  &&
                    store.contains(statement.subject.value, 'solid:instanceContainer'),
                );

            this.moviesContainerUrl = moviesContainerType
                ? store.statement(moviesContainerType.subject.value, 'solid:instanceContainer')!.object.value
                : null;
        }

        return this.moviesContainerUrl;
    }

    private async createMoviesContainer(): Promise<MediaContainer> {
        // TODO ask for preferred storage
        const storage = this.storages[0];
        const moviesContainer = new MediaContainer({ name: 'Movies' });
        const rdfsClasses = [
            'https://schema.org/Movie',
            'https://schema.org/WatchAction',
        ];

        moviesContainer.setRelationModels('movies', []);

        await moviesContainer.save(storage);
        await Promise.all(rdfsClasses.map(rdfsClass => {
            const typeRegistration = new TypeRegistration({
                forClass: rdfsClass,
                instanceContainer: moviesContainer.url,
            });

            typeRegistration.mintUrl(this.typeIndexUrl, true, UUID.generate());

            return typeRegistration.save(this.typeIndexUrl);
        }));

        return moviesContainer;
    }

}
