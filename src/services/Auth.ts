import Service from '@/services/Service';

import ModelsCache from '@/models/ModelsCache';
import OfflineUser from '@/models/users/OfflineUser';
import SolidUser from '@/models/users/SolidUser';
import User from '@/models/users/User';

import EventBus from '@/utils/EventBus';

import OfflineLogoutModal from '@/components/modals/OfflineLogoutModal.vue';

interface State {
    user: User | null;
}

interface HasUser {
    user: User;
}

export default class Auth extends Service<State> {

    protected storeName: string = 'auth';

    public get loggedIn(): boolean {
        return !!this.state.user;
    }

    public get user(): User | null {
        return this.state.user;
    }

    public get isOffline(): boolean | null {
        return this.loggedIn ? this.user instanceof OfflineUser : null;
    }

    public isLoggedIn(): this is HasUser {
        return this.loggedIn;
    }

    public async loginOffline(): Promise<void> {
        await this.updateUser(new OfflineUser());
    }

    public async loginWithSolid(idp: string): Promise<void> {
        await SolidUser.login(idp);
    }

    public async logout(force: boolean = false): Promise<void> {
        if (!this.loggedIn)
            return;

        if (this.isOffline && !this.app.$media.empty && !force) {
            this.app.$ui.openModal(OfflineLogoutModal);

            return;
        }

        this.updateUser(null);
    }

    protected async init(): Promise<void> {
        await super.init();

        await SolidUser.trackSession(solidUser => {
            if (!!this.user && !(this.user instanceof SolidUser)) {
                return;
            }

            this.updateUser(solidUser);
        });

        if (OfflineUser.isLoggedIn())
            await this.updateUser(new OfflineUser());
    }

    protected getInitialState(): State {
        return { user: null };
    }

    protected async updateUser(newUser: User | null = null): Promise<void> {
        const previousUser = this.user;

        if (!newUser)
            ModelsCache.clear();

        if (newUser === previousUser)
            return;

        this.setState({ user: newUser });

        if (!newUser) {
            previousUser!.logout();

            EventBus.emit('logout');

            if (this.app.$router.currentRoute.name !== 'login')
                this.app.$router.push({ name: 'login' });

            return;
        }

        await newUser.login();

        if (this.app.$router.currentRoute.name === 'login')
            this.app.$router.replace({ name: 'home' });

        EventBus.emit('login', newUser);
    }

}
