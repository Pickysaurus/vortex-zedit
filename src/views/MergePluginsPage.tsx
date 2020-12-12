import { remote } from 'electron';
import * as React from 'react';
import * as path from 'path';
import { Alert, Button, ButtonGroup, Panel } from 'react-bootstrap';
import { MainPage, ComponentEx, selectors, types, util, IconBar, ToolbarIcon, Icon, Spinner, fs, log } from 'vortex-api';
import { withTranslation } from 'react-i18next';
import { connect } from 'react-redux';
import { setzEditPath, setzEditProfile, setzEditDialogMerge } from '../actions/actions';
import { runzEdit, getzEditFromGitHub, checkzEditConfig, getMerges, updateMerges } from '../util/zEditUtils';
import { zEditMerge } from '../types/zEditTypes';
import MergePanel from './MergePanel';

const zEditGitHubLink = 'https://z-edit.github.io/';
const zEditNexusMods = '';

interface IBaseProps {
    active: boolean;
    supportedGames: string[];
}

interface IConnectedProps {
    game: types.IGame;
    discovery: types.IDiscoveryResult;
    stagingFolder: string;
    vortexPath: string;
    mods: { [id: string] : types.IMod };
    plugins: { [id: string] : any };
    zEditPath: string;
    zEditProfile: string;
}

interface IActionProps {
    setzEditPath: (path: string) => void;
    setzEditProfile: (gameId: string, name: string) => void;
    setzEditDialogMerge: (mergeName: string, pluginIds?: string[]) => void;
}

interface IMergePluginsState {
    loading: boolean;
    loadingMessage?: string;
    busy: boolean;
    error?: Error;
    merges?: zEditMerge[];
}

type IMergePluginsProps = IConnectedProps & IActionProps & IBaseProps;

class MergePluginsPage extends ComponentEx<IMergePluginsProps,IMergePluginsState> {
    private staticButtons: types.IActionDefinition[];

    constructor(props: IMergePluginsProps) {
        super(props);

        this.initState({
            loading: false,
            busy: false,
        });

        this.staticButtons = [
            {
                component: ToolbarIcon,
                props: () => {
                    const { t } = this.props;
                    return {
                        id: 'btn-back-to-plugins',
                        key: 'btn-back-to-plugins',
                        icon: 'nav-back',
                        text: t('Back to Plugins'),
                        onClick: () => {
                            this.context.api.events.emit('show-main-page', 'gamebryo-plugins');
                        }
                    }
                }
            },
            {
                component: ToolbarIcon,
                props: () => {
                    const { t, zEditPath, zEditProfile, setzEditDialogMerge } = this.props;
                    const { merges } = this.state;
                    return {
                        id: 'btn-new-merge',
                        key: 'btn-new-merge',
                        icon: 'add',
                        text: t('Create Merge'),
                        onClick: () => {
                            // setzEditDialogMerge(undefined, [])
                            this.context.api.showDialog('question', t('Create new merge'), {
                                text: 'What would you like the new merge to be called?',
                                input: [
                                    {
                                        id: 'newMergeName',
                                        type: 'text',
                                        value: '',
                                        label: 'Merge Name'
                                    }
                                ]
                            }, [{ label: 'Create' }, { label: 'Cancel' }])
                            .then((result) => {
                                if (result.action === 'Cancel' || !result.input['newMergeName']) return;
                                const name = result.input['newMergeName'];
                                const newMerge = new zEditMerge(name, [], []);
                                const newList = [newMerge].concat(merges)
                                return updateMerges(zEditPath, zEditProfile, newList)
                                .then(() => {
                                    setzEditDialogMerge(name, [])
                                    this.nextState.merges = newList;
                                })
                                .catch((err) => this.context.api.showErrorNotification('Failed to create merge', err.message));
                            })
                        },
                        condition: () => !!zEditPath ? true: t('zEdit not detected.') as string
                    }
                },
                condition: () => (!!this.props.zEditPath)
            },
            {
                component: ToolbarIcon,
                props: () => {
                    const { t, zEditProfile, zEditPath } = this.props;
                    return {
                        id: 'btn-open-zedit',
                        key: 'btn-open-zedit',
                        icon: 'settings',
                        text: t('Open zEdit'),
                        onClick: () => {
                            const api = this.context.api;
                            if (!zEditPath) return api.sendNotification({type: 'error', message:'zEdit path has not been set', displayMS: 5000 });
                            runzEdit(api, zEditPath, 'merge', zEditProfile);
                        }
                    }
                },
                condition: () => (!!this.props.zEditPath)
            },
            {
                component: ToolbarIcon,
                props: () => {
                    const { setzEditPath, zEditPath, t } = this.props;
                    return {
                        id: 'btn-clear',
                        key: 'btn-clear',
                        icon: 'refresh',
                        text: 'Update zEdit Path',
                        onClick: () => setzEditPath(undefined),
                    }
                },
                condition: () => (!!this.props.zEditPath)
            },
            {
                component: ToolbarIcon,
                props: () => {
                    const { t, zEditPath, zEditProfile } = this.props;
                    return {
                        id: 'btn-clear',
                        key: 'btn-clear',
                        icon: 'refresh',
                        text: 'Update Merges',
                        action: async () => this.nextState.merges = zEditPath ? await getMerges(zEditPath, zEditProfile) : [],
                        condition: () => !!zEditPath ? true : t('zEdit not detected.') as string,
                        
                    }
                },
                condition: () => (!!this.props.zEditPath),
                title: 'Update merges from the zMerge JSON file.'
            }
        ];
    }

    public componentDidMount() {
        this.nextState.loading = true;
        this.start();
    }

    public componentWillUnmount() {
        this.nextState.loading = true;
    }

    private async start(): Promise<any> {
        const { 
            zEditPath, setzEditPath, 
            zEditProfile, setzEditProfile,
            game, discovery,
            vortexPath, stagingFolder, supportedGames 
        } = this.props;

        this.nextState.loadingMessage = 'Checking zEdit installation';
        this.nextState.error = undefined;

        // If we're somehow not on a supported game.
        if (!supportedGames.includes(game.id)) {
            log('info', 'Game not compatible with zMerge, exiting page.', game.id);
            return this.context.api.events.emit('show-main-page', 'Mods');
        }

        if (!zEditPath) {
            // zEdit isn't configured, so we have nothing to do here.
            this.nextState.loading = false;
            this.nextState.loadingMessage = undefined;
            return;
        }

        try {
            // Make sure zEdit is still configured.
            await fs.statAsync(zEditPath);
        }
        catch (err) {
            // If we get an error, zEdit probably doesn't exist anymore at the saved location.
            log('warn', 'Error setting up zEdit page.', err);
            setzEditPath(undefined);
            this.nextState.loading = false;
            this.nextState.loadingMessage = undefined;
            return;
        }

        this.nextState.loadingMessage = 'Checking zEdit configuration';

        try {
            const profile: string = await checkzEditConfig(zEditPath, game.id, discovery.path, vortexPath, stagingFolder);
            if (profile !== zEditProfile) setzEditProfile(game.id, profile);
            this.nextState.merges = await getMerges(zEditPath, profile);
            this.nextState.loading = false;
            this.nextState.loadingMessage = undefined;
            return;
        }
        catch (err) {
            log('warn', 'Error configuring zEdit.', err);
            this.nextState.error = err;
            this.nextState.loading = false;
            this.nextState.loadingMessage = undefined;
            return;
        }
    }

    render(): JSX.Element {
        const { loading, error } = this.state;
        const { t, zEditPath } = this.props;

        return (
            <MainPage id='merge-plugins-page'>
                <MainPage.Header>
                    <IconBar 
                        group='merge-plugins-icons'
                        staticElements={this.staticButtons}
                        className='menubar'
                        t={t}
                    />
                </MainPage.Header>
                <MainPage.Body>
                <Panel>
                    <Panel.Body>
                        <div id='merge-plugins-header'>
                        <h1>{t('Merge Plugins')}</h1>
                        <div>
                            {t('Some info about how zMerge works, and that it\'s written by Mator.')}
                            <p>zEdit has been located at {zEditPath || 'the interwebz'}.</p>
                        </div>
                        </div>
                        <div id='merge-plugins-container'>
                        {error 
                            ? <Alert className={'alert-warning'}><Icon name='feedback-warning'/> {error.message}</Alert> 
                            : ''
                        }
                        {loading 
                            ? this.renderSpinner() :
                            zEditPath 
                                ? this.renderMerges()
                                : this.renderGetzEdit()
                        }
                        </div>
                    </Panel.Body>
                </Panel>
                </MainPage.Body>
            </MainPage>
        )
    }

    renderSpinner(): JSX.Element {
        const { loadingMessage } = this.state;
        const { t } = this.props;
        return (
            <div id='merge-plugins-loader'>
                <Spinner /> { loadingMessage || t('Loading') }...
            </div>
        )
    }

    renderGetzEdit(): JSX.Element {
        const { t } = this.props;
        const { busy } = this.state;

        return (
        <div id='merge-plugins-missing'>
            <img 
                src={`file://${__dirname}/images/zEditIcon.png`}
                style={{maxWidth: '100px'}}
            />
            <h2>{t('zEdit not detected')}</h2>
            <p>{t('In order to manage your merges, you\'ll need a copy of zEdit by Mator. Vortex can download it for you, or you can use the browse option to use an existing copy.')}</p>
            <p><a onClick={() => util.opn(zEditGitHubLink).catch(() => undefined)}>{t('Learn more about zEdit...')}</a></p>
            <ButtonGroup>
                    <Button
                        tooltip={t('Download zEdit from GitHub')}
                        onClick={this.getzEdit}
                        disabled={busy}
                    >
                        <Icon name='download' /> {t('Download')}
                    </Button>
                    <Button
                        tooltip={t('Browse for an installed version of zEdit')}
                        onClick={this.browsePath}
                        disabled={busy}
                    >
                        <Icon name='browse' /> {t('Browse')}
                    </Button>
                    <Button
                        tooltip={t('View on Nexus Mods (ETA Jan 2021)')}
                        onClick={() => util.opn(zEditNexusMods).catch(() => undefined)}
                        disabled={true}
                    >
                        <Icon name='nexus' /> {t('Nexus Mods')}
                    </Button>
            </ButtonGroup>
        </div>
        );
    }

    private getzEdit = () => {
        this.nextState.busy = true;
        getzEditFromGitHub(this.context)
        .then((installPath: string) => {
            this.props.setzEditPath(installPath);
            this.nextState.busy = false;
            return this.start();
        })
        .catch((err: Error) => {
            log('warn', 'Error getting zEdit', err);
            this.nextState.error = err;
            this.nextState.busy = false;
            return;
        });
    }

    private browsePath = () => {
        this.context.api.selectFile({ 
            title: 'Select zEdit Executable', 
            filters: [{name: 'EXE', extensions: ['exe']}], 
            defaultPath: __dirname 
            })
            .then((selectedPath: string) => {
                if (!selectedPath) return;
                if (path.basename(selectedPath) === 'zEdit.exe') {
                    this.nextState.error = undefined;
                    this.props.setzEditPath(selectedPath);
                    this.start();
                }
                else {
                    this.nextState.error = new Error ('zEdit.exe not found');
                }
            })
    }

    renderMerges(): JSX.Element {
        const { zEditPath, zEditProfile, t } = this.props;
        const { merges } = this.state;

        const mergePanels = merges ? merges.map(
            (merge, index: number) => (
            <MergePanel 
            merge={merge} 
            idx={index}
            t={t} 
            update={this.updateMerge.bind(this)}
            zEditPath={zEditPath}
            zEditProfile={zEditProfile}
            />
            )): '';

        return (
        <div id='merge-plugins-list'>
            {mergePanels}
        </div>
        );
    }

    private async updateMerge(idx: number, newMerge: zEditMerge) {
        const { merges } = this.state;
        const { zEditPath, zEditProfile } = this.props

        const backup = { ...merges };

        if (!merges[idx]) return;

        if (!newMerge || !Object.keys(newMerge).length) {
            merges.splice(idx, 1);
        }
        else merges[idx] = newMerge;

        return updateMerges(zEditPath, zEditProfile, merges)
            .then(() => this.nextState.merges = merges)
            .catch((err) => {
                this.nextState.merges = backup;
                this.nextState.error = err;
            });
    }

}


function mapStateToProps(state: types.IState): IConnectedProps {
    const gameId = selectors.activeGameId(state);
    const game = selectors.gameById(state, gameId);
    const stagingFolder = selectors.installPath(state);
    const vortexPath = remote.app.getPath('exe');
    const mods = util.getSafe(state, ['persistent', 'mods', gameId], {});
    const plugins = util.getSafe(state, ['session', 'plugins', 'pluginInfo'], {});
    const zEditPath = util.getSafe(state, ['settings', 'zEdit', 'path'], undefined);
    const zEditProfile = util.getSafe(state, ['settings', 'zEdit', 'profiles', gameId], undefined);
    const discovery = util.getSafe(state, ['settings', 'gameMode', 'discovered', gameId], {});
    return {
        game,
        discovery,
        stagingFolder,
        vortexPath,
        mods,
        plugins,
        zEditPath,
        zEditProfile
    };
}
  
function mapDispatchToProps(dispatch: any): IActionProps {
    return {
        setzEditPath: (path: string) => dispatch(setzEditPath(path)),
        setzEditProfile: (gameId: string, name: string) => dispatch(setzEditProfile(gameId, name)),
        setzEditDialogMerge: (mergeName: string, pluginIds?: string[]) => dispatch(setzEditDialogMerge(mergeName, pluginIds))
    };
}

export default withTranslation([ 'common' ])(
    connect(mapStateToProps, mapDispatchToProps)
    (MergePluginsPage));