import { Store } from 'vuex';

import MediaContainer from '@/models/soukai/MediaContainer';
import Movie from '@/models/soukai/Movie';
import ThirdPartyMovie from '@/models/third-party/ThirdPartyMovie';
import User from '@/models/users/User';

import Service from '@/services/Service';

import EventBus from '@/utils/EventBus';

interface State {
    moviesContainer: MediaContainer | null;
}

interface ImportListener {
    onStart?(totalRaw: number): void;
    onProgress?(current: number, totalRaw: number, imported: boolean): void;
    onCompleted?(totalRaw: number, totalImported: number): void;
}

export default class Media extends Service {

    public get movies(): Movie[] {
        if (!this.storage.moviesContainer)
            return [];

        return this.storage.moviesContainer.movies || [];
    }

    public get moviesContainer(): MediaContainer | null {
        return this.storage.moviesContainer;
    }

    protected get storage(): State {
        return this.app.$store.state.media
            ? this.app.$store.state.media
            : {};
    }

    public async importMovies(thirdPartyMovies: ThirdPartyMovie[], listener: ImportListener = {}): Promise<Movie[]> {
        // TODO implement createMany in soukai
        const movies: Movie[] = [];

        // TODO implement cancelling the import process
        // TODO show information on failed imports?

        listener.onStart && listener.onStart(thirdPartyMovies.length);

        for (const [i, thirdPartyMovie] of Object.entries(thirdPartyMovies)) {
            const index = parseInt(i);

            if (this.movies.find(movie => thirdPartyMovie.is(movie))) {
                listener.onProgress && listener.onProgress(index, thirdPartyMovies.length, false);

                continue;
            }

            const movie = await thirdPartyMovie.import(this.moviesContainer!);

            movies.push(movie);

            listener.onProgress && listener.onProgress(index, thirdPartyMovies.length, true);
        }

        listener.onCompleted && listener.onCompleted(thirdPartyMovies.length, movies.length);

        return movies;
    }

    protected async init(): Promise<void> {
        await super.init();
        await this.app.$auth.ready;

        if (this.app.$auth.isLoggedIn()) {
            await this.load(this.app.$auth.user);
        }

        EventBus.on('login', this.load.bind(this));
        EventBus.on('logout', this.unload.bind(this));
    }

    protected registerStoreModule(store: Store<State>): void {
        store.registerModule('media', {
            state: {
                moviesContainer: null,
            },
            mutations: {
                setMoviesContainer(state: State, moviesContainer: MediaContainer | null) {
                    state.moviesContainer = moviesContainer;
                },
            },
        });
    }

    private async load(user: User): Promise<void> {
        const { movies: moviesContainer } = await user.initContainers();

        if (!moviesContainer.isRelationLoaded('movies'))
            await moviesContainer.loadRelation('movies');

        const actionPromises = moviesContainer.movies!.map(async movie => {
            if (movie.isRelationLoaded('actions'))
                return;

            await movie.loadRelation('actions');
        });

        await Promise.all(actionPromises);

        this.app.$store.commit('setMoviesContainer', moviesContainer);
    }

    private async unload(): Promise<void> {
        this.app.$store.commit('setMoviesContainer', null);
    }

}
