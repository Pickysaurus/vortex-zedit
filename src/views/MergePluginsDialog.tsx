import * as React from 'react';
import { withTranslation } from 'react-i18next';
import { Button } from 'react-bootstrap';
import { connect } from 'react-redux';
import { Creatable } from 'react-select';
import { ComponentEx, types, selectors, util, Modal, Spinner, Table, ITableRowAction, TableTextFilter } from "vortex-api";
import { setzEditDialogMerge } from '../actions/actions';
import { zEditMerge, zEditMergePlugin } from "../types/zEditTypes";
import { getMerges, loadOrderFromPlugins } from '../util/zEditUtils';

interface IBaseProps {
    visible: boolean;
    onHide: () => void;
}

interface IActionProps {
    setDialogMerge: (name: string, pluginIds: string[]) => void;
}

interface IConnectedProps {
    path: string;
    gameId: string;
    profile: string;
    mergeName?: string;
    mods: { [id: string] : types.IMod };
    plugins: { [id: string] : any };
    stagingFolder: string;
    pluginIds: string[];
    discovery: types.IDiscoveryResult;
}

type DialogProps = IActionProps & IConnectedProps & IBaseProps;

type DialogStep = 'load' | 'name' | 'plugins';

interface DialogState {
    allMerges?: zEditMerge[]
    activeMerge?: zEditMerge;
    newName?: string;
    newPlugins?: zEditMergePlugin[];
    newLoadOrder?: string[];
    step: DialogStep;
}


class MergePluginsDialog extends ComponentEx<DialogProps, DialogState> {
    private mAttributes: types.ITableAttribute[];
    private mActions: ITableRowAction[];

    constructor(props: DialogProps) {
        super(props);

        this.initState({
            step: 'load',
        });

        this.mAttributes = this.genAttributes();
        this.mActions = this.genActions();
    }

    public componentDidUpdate(prevProps: DialogProps, prevState: DialogState) {
        if (this.props.pluginIds && !prevProps.pluginIds) {
            this.nextState.allMerges = undefined;
            this.nextState.activeMerge = undefined;
            this.nextState.newPlugins = undefined;
            this.nextState.newLoadOrder = undefined;
            this.start();
        }
    }

    private async start(): Promise<any> {
        const { path, profile, mergeName, pluginIds, plugins, stagingFolder, mods } = this.props;
        this.nextState.allMerges = await getMerges(path, profile);
        let merge : zEditMerge;
        if (mergeName) {
            merge = this.nextState.allMerges.find((m) => m.name === mergeName);
            if (mergeName) this.nextState.activeMerge = merge;
        }
        if (plugins && pluginIds) {
            const mappedPlugins: zEditMergePlugin[] = pluginIds.map((p) => {
                const pluginInfo = plugins[p];
                const mod = pluginInfo?.modName ? mods[pluginInfo.modName] : undefined;

                return {
                    filename: pluginInfo?.name || p,
                    dataFolder: mod ? `${stagingFolder}\\${mod?.id}` : '',
                    pluginInfo,
                    mod
                }
            });
            this.nextState.newPlugins = merge ? mappedPlugins.concat(merge.plugins) : mappedPlugins;
            this.nextState.newLoadOrder = loadOrderFromPlugins(this.nextState.newPlugins, plugins);
        }

        this.nextState.step = (merge ? 'plugins' : 'name');
    }

    private nop = () => undefined;

    private cancel = () => this.props.setDialogMerge(undefined, undefined);;

    private async save(): Promise<any> {
        const { setDialogMerge } = this.props;
        // Save changes

        // Dimiss the modal
        setDialogMerge(undefined, undefined);
    }

    private next = () => this.nextState.step = 'plugins';

    render() {
        const { t, pluginIds, mergeName } = this.props;
        const { activeMerge, step } = this.state;

        const title = activeMerge ? t('Editing {{m}}', { replace: { m: activeMerge.name }}) : t('Add new merge');
        
        return (
            <Modal id='merge-plugins-modal' show={!!pluginIds || !!mergeName} onHide={this.nop}>
                <Modal.Header>
                    <h2>{title}</h2>
                </Modal.Header>
                <Modal.Body>
                    {this.renderContent()}
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={this.cancel}>{t('Cancel')}</Button>
                    <Button disabled={step === 'load'} onClick={step === 'name' ? this.next : this.save}>{t(step === 'name' ? 'Next' : 'Save')}</Button>
                </Modal.Footer>
            </Modal>
        )
    }

    renderContent(): JSX.Element {
        const { step } = this.state;
        switch (step) {
            case 'load': return this.renderSpinner();
            case 'name': return this.renderSelector();
            case 'plugins': return this.renderPluginPicker();
            default: return undefined;
        }
    }

    renderSpinner(): JSX.Element {
        return (
            <Spinner />
        )
    }

    renderSelector(): JSX.Element {
        const { allMerges, activeMerge } = this.state;

        const merges = allMerges ? allMerges.map((m, idx) => ({ label: m.name, value: m.name  })) : [];
        const current = merges.find(o => o.value === activeMerge?.name) || activeMerge ? {label: activeMerge.name, value: activeMerge.name} : undefined;

        return (
            <div>
            <Creatable 
                value={current || undefined}
                placeholder='Select an existing merge...'
                onChange={this.setActiveMerge}
                options={merges}
                promptTextCreator={this.createPrompt}
            />
            </div>
        )
    }

    private setActiveMerge = (selection: { label: string, value: string }) => {
        const { allMerges, newPlugins, newLoadOrder } = this.state;
        const newMerge = allMerges.find((m) => m.name === selection.value) || new zEditMerge(selection.value, newPlugins, newLoadOrder);
        this.nextState.activeMerge = newMerge;
    }

    private createPrompt = (label: string): string => {
        const { t } = this.props;
        return t('Create new merge: {{label}}', { replace: { label } });
    }

    renderPluginPicker(): JSX.Element {
        const { plugins } = this.props;

        return (
            <Table 
                tableId='merge-plugins-selector'
                data={plugins}
                actions={this.mActions}
                staticElements={this.mAttributes}
            />
        )
    }

    private genActions(): ITableRowAction[] {
        return [];
    }

    private isPluginInState(plugin: any): boolean {
        const { newPlugins } = this.state;
        if (!newPlugins) return false;
        const inState = newPlugins.find((p) => p.filename === plugin.name);
        return !!inState;
    }

    private togglePluginInState(plugin: any): void {
        const { newPlugins } = this.state;
        const { stagingFolder, discovery } = this.props;
        const mp = newPlugins 
            ? newPlugins.find((p) => p.filename === plugin.name) 
            : undefined;
        
        if (mp) newPlugins.splice(newPlugins.indexOf(mp), 1)
        else {
            const dataFolder = plugin.modName 
                ? `${stagingFolder}\\${plugin.modName}`
                : `${discovery.path}\\Data`;
            
            newPlugins.push( { filename: plugin.name, dataFolder });
        }
    }

    private genAttributes(): types.ITableAttribute[] {
        return [
            {
                id: 'status',
                name: 'Include',
                description: 'Should this mod be included in the merge?',
                icon: 'level-up',
                calc: plugin => this.isPluginInState(plugin) ? 'Yes' : 'No',
                externalData: () => undefined,
                placement: 'table',
                isToggleable: false,
                isSortable: true,
                isVolatile: true,
                edit: {
                    inline: true,
                    choices: () => [
                        { key: 'yes', text: 'Yes'},
                        { key: 'no', text: 'No' }
                    ],
                    onChangeValue: this.togglePluginInState.bind(this)
                }
            },
            {
                id: 'name',
                name: 'Plugin name',
                description: 'The plugin file name.',
                icon: 'quote-left',
                calc: plugin => plugin.name,
                placement: 'both',
                isSortable: true,
                filter: new TableTextFilter(true),
                noShrink: true,
                edit: {},
                sortFunc: (lhs: string, rhs: string, locale: string): number => {
                    return lhs.localeCompare(rhs, locale, { sensitivity: 'base' });
                }
            },
            {
                id: 'lo-index',
                name: 'Load Order',
                description: 'Load Order Position',
                calc: plugin => plugin.loadOrder,
                isSortable: true,
                isDefaultSort: true,
                edit: {},
                placement: 'table'
            }
        ];
    }

}

// function mapPluginArrayToObject(array : zEditMergePlugin[]): { [id: string] : zEditMergePlugin} {
//     let result = {};
//     array.map((p) => result[p.filename] = p);
//     return result
// }

function mapStateToProps(state: types.IState): IConnectedProps {
    const path: string = util.getSafe(state, ['settings', 'zEdit', 'path'], undefined);
    const gameId: string = selectors.activeGameId(state);
    const profile: string = util.getSafe(state, ['settings', 'zEdit', 'profiles', gameId], undefined);
    const mergeName: string = util.getSafe(state, ['session', 'zEdit', 'mergeName'], undefined);
    const pluginIds: string[] = util.getSafe(state, ['session', 'zEdit', 'pluginIds'], undefined);
    const mods = util.getSafe(state, ['persistent', 'mods', gameId], {});
    const plugins = util.getSafe(state, ['session', 'plugins', 'pluginInfo'], {});
    const stagingFolder: string = selectors.installPath(state);
    const discovery = util.getSafe(state, ['settings', 'gameMode', 'discovered', gameId], {});
    return {
        path, gameId, profile, mergeName,
        mods, plugins, stagingFolder, pluginIds,
        discovery
    }
}
  
function mapDispatchToProps(dispatch: any): IActionProps {
    return {
        setDialogMerge: (name: string, pluginIds: string[]) => dispatch(setzEditDialogMerge(name, pluginIds))
    };
}

export default withTranslation([ 'common' ])(
    connect(mapStateToProps, mapDispatchToProps)
    (MergePluginsDialog));