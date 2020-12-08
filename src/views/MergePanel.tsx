import * as React from 'react';
import { connect } from 'react-redux';
import { Button, ButtonGroup, Panel, FormGroup, ControlLabel, FormControl } from 'react-bootstrap';
import { ComponentEx, selectors, types, util, Icon, Toggle, DraggableList } from 'vortex-api';
import { zEditMerge, zEditMergePlugin } from '../types/zEditTypes';
import { createModEntry, getFullPluginData, runzEdit } from '../util/zEditUtils';
import MergePlugin from './MergePlugin';

interface ICompnentProps {
    t: (text: string) => string;
    merge: zEditMerge;
    zEditPath: string;
    zEditProfile: string;
    idx: number;
    update: (idx: number, data: zEditMerge) => void;
}

interface IConnectedProps {
    gameId: string;
    mods: { [id: string] : types.IMod };
    plugins: { [id: string] : any };
    stagingFolder: string;
}

type MergePanelProps = ICompnentProps & IConnectedProps;

interface MergePanelState {
    canMerge: boolean;
    mergeStatus?: string;
    expanded: boolean;
    editMode: boolean;
    showMasters: boolean;
    unsavedChanges: any;
}

function nop() {
    // nop
}

class MergePanel extends ComponentEx<MergePanelProps,MergePanelState> {
    private mMergeRef;

    constructor(props: MergePanelProps) {
        super(props);

        this.initState({
            expanded: false,
            editMode: false,
            showMasters: false,
            unsavedChanges: {},
            ...this.checkMerge(props.merge, props.plugins)
        });

        this.toggleEditMode = this.toggleEditMode.bind(this);

        this.mMergeRef = React.createRef();
    }

    checkMerge(merge: zEditMerge, plugins: { [id: string]: any }): {canMerge: boolean, mergeStatus?: string} {
        const pluginsArray = Object.values(plugins);
        let mergeStatus = 'Ready to Merge';
        let canMerge = true;

        const validPlugins = merge.plugins.filter((p) => pluginsArray.find((pl) => pl.name == p.filename));
        const validLoadOrder = merge.loadOrder.filter((item: string) => pluginsArray.find((pl) => pl.name == item));

        if (!merge.plugins.length) {
            canMerge = false;
            mergeStatus = 'No Plugins Selected';
        }
        // If there are plugins in the merge that aren't deployed.
        else if (validPlugins.length !== merge.plugins.length) {
            canMerge = false;
            mergeStatus = 'Plugins Unavailable';
        }
        // Items from the load order are missing (masters)
        else if (validLoadOrder.length !== merge.loadOrder.length) {
            canMerge = false;
            mergeStatus = 'Missing Masters';
        }

        return {canMerge, mergeStatus};
    }

    render() {
        const { merge, t } = this.props;  
        const { canMerge, expanded, editMode, mergeStatus } = this.state;
        
        const lastBuild = new Date(merge.dateBuilt);
        const relLastBuild = util.relativeTime(lastBuild, t)

        return (
            <Panel expanded={expanded} eventKey={merge.name} onToggle={nop} className='merge-panel'>
                <span ref={this.mMergeRef} />
                <Panel.Heading onClick={this.toggleExpanded}>
                    <Panel.Title><Icon name={expanded ? 'showhide-down' : 'showhide-right'}/> {merge.name}</Panel.Title>
                </Panel.Heading>
                <Panel.Body collapsible>
                {this.renderMergeInfo()}
                </Panel.Body>
                <Panel.Footer className='merge-panel-footer'>
                    <ButtonGroup>
                    <Button disabled={!canMerge} onClick={this.run}><Icon name='launch-application'/> {t('Merge')}</Button>
                    <Button onClick={() => this.toggleEditMode(true)}><Icon name={!editMode ? 'edit' : 'savegame'}/> {t(!editMode ? 'Edit' : 'Save')}</Button>
                    {!editMode 
                     ? <Button className='warning-btn' onClick={this.deleteMerge}><Icon name='delete'/> {t('Delete')}</Button>
                     : <Button onClick={this.discardEdits}><Icon name='toggle-disabled'/> {t('Cancel')}</Button>
                    }
                    </ButtonGroup>
                    <span title={lastBuild.toLocaleString()}><b>Last Built: </b> {relLastBuild}</span>
                    <span className={canMerge ? 'ready' : 'warning'}><b>Status: </b> <Icon name={canMerge ? 'toggle-enabled' : 'toggle-disabled'} /> {t(mergeStatus)}</span>
                </Panel.Footer>
            </Panel>
        );
    }

    private run = () => {
        const { zEditPath, zEditProfile, merge } = this.props;
        runzEdit(this.context.api, zEditPath, 'merge', zEditProfile, merge.name);
    }

    renderMergeInfo(): JSX.Element {
        return (
            <div className='merge-panel-info'>
                {this.renderPluginsColumn()}
                {this.renderInfoColumn()}
            </div>
        )
    }

    renderInfoColumn(): JSX.Element {
        const { merge, t, mods } = this.props;
        const { editMode, unsavedChanges } = this.state;

        const mod : types.IMod = merge.vortexModId 
            ? util.getSafe(mods, [merge.vortexModId], undefined) 
            : util.getSafe(mods, [merge.name], undefined);

        // Show the object, including unsaved changes.
        const m = Object.assign({}, merge, unsavedChanges);

        return (
            <div className='merge-panel-settings'>
                <h4>Settings</h4>
            <FormGroup>
                <ControlLabel>{t('Name')}</ControlLabel>
                <FormControl
                    type='text'
                    value={m.name}
                    disabled={!editMode}
                    onChange={(event) => this.updateStringAttribute(event, 'name')}
                />                                 
            </FormGroup>
            <FormGroup>
                <ControlLabel>{t('Plugin Name')}</ControlLabel>
                <FormControl
                    type='text'
                    value={m.filename}
                    disabled={!editMode}
                    onChange={(event) => this.updateStringAttribute(event, 'filename', isPluginName)}
                />                                  
            </FormGroup>
            <FormGroup>
                <ControlLabel>{t('Vortex Mod')}</ControlLabel>
                {mod 
                    ?
                    <FormControl
                    type='text'
                    value={mod.attributes.name || mod.id}
                    disabled={true}
                    />
                    : <div><Button onClick={this.createMod}><Icon name='add' /> {t('Create Mod')}</Button></div>

                }
                                                    
            </FormGroup>
            <FormGroup>
                <ControlLabel>{t('Merge Method')}</ControlLabel>
                <FormControl
                    componentClass='select'
                    value={m.method}
                    disabled={!editMode}
                    onChange={(event) => this.updateStringAttribute(event, 'method')}
                >
                    <option key='clobber' value='Clobber'>{t('Clobber')}</option>
                    <option key='clean' value='Clean'>{t('Clean')}</option>
                                        
                </FormControl>                                    
            </FormGroup>
            <FormGroup>
                <ControlLabel>{t('Archive Action')}</ControlLabel>
                <Toggle disabled={!editMode} checked={m.buildMergedArchives} onToggle={() => undefined}>{t('Build Merged Archives')}</Toggle>
                <FormControl
                    componentClass='select'
                    value={m.archiveAction}
                    disabled={!editMode}
                    onChange={(event) => this.updateStringAttribute(event, 'archiveAction')}
                >
                    <option key='extract' value='Extract'>{t('Extract')}</option>
                    <option key='copy' value='Copy'>{t('Copy')}</option>
                    <option key='ignore' value='Ignore'>{t('Ignore')}</option>              
                </FormControl>                                    
            </FormGroup>
            <FormGroup>
                <ControlLabel>{t('Merge includes:')}</ControlLabel>
                <div className='merge-plugins-checkbox-row'>
                    <span className='merge-plugins-checkbox'>
                    <Toggle disabled={!editMode} checked={m.handleBillboards} onToggle={() => this.toggleGeneralAttribute('handleBillboards')}>{t('Tree Billboards')}</Toggle>
                    </span>
                    <span className='merge-plugins-checkbox'>
                    <Toggle className='merge-plugins-checkbox' disabled={!editMode} checked={m.handleFaceData} onToggle={() => this.toggleGeneralAttribute('handleFaceData')}>{t('Face Data')}</Toggle>
                    </span>
                </div>
                <div className='merge-plugins-checkbox-row'>
                    <span className='merge-plugins-checkbox'>
                    <Toggle disabled={!editMode} checked={m.handleIniFiles} onToggle={() => this.toggleGeneralAttribute('handleIniFiles')}>{t('INI files')}</Toggle>
                    </span>
                    <span className='merge-plugins-checkbox'>
                    <Toggle disabled={!editMode} checked={m.handleScriptFragments} onToggle={() => this.toggleGeneralAttribute('handleScriptFragments')}>{t('Script Fragments')}</Toggle>
                    </span>                    
                </div>
                <div className='merge-plugins-checkbox-row'>
                    <span className='merge-plugins-checkbox'>
                    <Toggle disabled={!editMode} checked={m.handleStringFiles} onToggle={() => this.toggleGeneralAttribute('handleStringFiles')}>{t('String Files')}</Toggle>
                    </span>
                    <span className='merge-plugins-checkbox'>
                    <Toggle disabled={!editMode} checked={m.handleTranslations} onToggle={() => this.toggleGeneralAttribute('handleTranslations')}>{t('Translations')}</Toggle>
                    </span>                    
                </div>
                <div className='merge-plugins-checkbox-row'>
                    <span className='merge-plugins-checkbox'>
                    <Toggle disabled={!editMode} checked={m.handleVoiceData} onToggle={() => this.toggleGeneralAttribute('handleVoiceData')}>{t('Voice Data')}</Toggle>
                    </span>
                    <span className='merge-plugins-checkbox'>
                    <div></div>
                    </span>
                </div>
            </FormGroup>
            <FormGroup>
                <ControlLabel>{t('Mod Assets')}</ControlLabel>
                <Toggle disabled={!editMode} checked={m.copyGeneralAssets} onToggle={() => this.toggleGeneralAttribute('copyGeneralAssets')}>{t('Copy General Assets')}</Toggle>
            </FormGroup>
            </div>
        )
    }

    renderPluginsColumn(): JSX.Element {
        const { merge, t, mods, plugins, stagingFolder } = this.props;
        const { editMode, unsavedChanges, showMasters } = this.state;

        // Show the object, including unsaved changes.
        const m = Object.assign({}, merge, unsavedChanges);

        const masters = showMasters ? m.loadOrder.filter((p) => !m.plugins.find((pl) => pl.filename === p)) : [];

        const fullPluginData = getFullPluginData(m.plugins, plugins, mods, stagingFolder);

        return (
            <div className='merge-panel-settings'>
                <h4>Plugins</h4>
                <div className='merge-panel-list'>
                    <div className="header-row">
                        <span className='drag' />
                        <span className='name'>{t('Plugin Name')}</span>
                        <span className='status-icon'>{t('Valid')}</span>
                        <span className='status-icon'>{t('Mod')}</span>
                    </div>
                    { showMasters ? this.renderMasters(masters) : '' }
                    {this.renderPluginList(fullPluginData)}
                </div>
                <ButtonGroup>
                    <Button disabled={!editMode}>
                        <Icon name='add' /> {t('Add')}
                    </Button>
                    <Button disabled={!editMode}>
                        <Icon name='remove' /> {t('Remove missing')}
                    </Button>
                    <Button onClick={this.toggleMasters}>
                        <Icon name={showMasters ? 'hide' : 'show'} /> {t(showMasters ? 'Hide Masters' : 'Show Masters')}
                    </Button>
                </ButtonGroup>
            </div>
        )

    }

    private toggleMasters = () => {
        this.nextState.showMasters = !this.state.showMasters;
        // this.mMergeRef.current.scrollIntoView({
        //     behaviour: 'smooth',
        //     block: 'start'
        // });
    }

    renderMasters(masters: string[]): JSX.Element {
        const masterlist = masters.map(
            (master) => (
                <div className='table-entry'>
                    <span className='drag' />
                    <span className='name' title={master}><i>{master}</i></span>
                    <span className='status-icon' />
                    <span className='status-icon' />
                </div>
            ));
        
        return (<>{masterlist}</>);
    }

    renderPluginList(data: zEditMergePlugin[]): JSX.Element {
        const { t } = this.props;
        const { editMode } = this.state;
        if (!data.length) return <>{t('No plugins')}</>

        if (!editMode) {
            const staticList = data.map((plugin) => (
                <div className='table-entry'>
                <span className='drag' />
                <span className='name' title={plugin.filename}>{plugin.filename}</span>
                <span className='status-icon'><Icon name={plugin.missing ? 'toggle-disabled' : 'toggle-enabled'} /></span>
                <span className='status-icon' title={plugin.mod?.attributes?.name || plugin.mod?.id || 'Not installed'}><Icon name={plugin.mod ? 'mods' : 'dialog-question'} /></span>
                </div>
            ));
            return (<>{staticList}</>);
        }

        return (
            <DraggableList 
                id='merge-plugins-list-draggable'
                itemTypeId='merge-plugins-plugin'
                items={data}
                itemRenderer={MergePlugin}
                apply={this.onApplyLoadOrder}
                idFunc={(item: zEditMergePlugin) => item.filename}
            />
        )

    }

    private onApplyLoadOrder = (ordered: zEditMergePlugin[]) => {
        const { unsavedChanges } = this.state;
        const { merge } = this.props;

        // Remove excess data from each entry.
        const newOrder = ordered.map((item: zEditMergePlugin) => ({ filename: item.filename, dataFolder: item.dataFolder }));

        // Get the load order entry.
        const currentLoadOrder = [...merge.loadOrder];

        // Get only the masters of the mergeable plugins.
        const dependencies = currentLoadOrder.filter((p) => !newOrder.find(pl => pl.filename === p));

        // Apply the revised load order by combining the masters with the new order.
        unsavedChanges.loadOrder = dependencies.concat(newOrder.map((p) => p.filename));

        // Get the current plugin list
        const current = unsavedChanges?.plugins || merge.plugins;
        
        // If the same, do nothing (might need lodash?)
        if (newOrder === current) return;

        // If the same as the base, delete the override.
        if (unsavedChanges?.plugins && newOrder === merge.plugins) {
            delete unsavedChanges.plugins;
        }
        // Assign the new order to override display.
        else unsavedChanges.plugins = newOrder;       

    }

    private createMod = () => {
        const { gameId, merge, update, idx } = this.props;
        // Create a mod table association for this mod. 
        const api = this.context.api;

        createModEntry(api, gameId, merge)
            .then((modId) => {
                merge.vortexModId = modId;
                update(idx, merge);
            })

    }

    private updateStringAttribute = (evt: any, key: string, validate?: (input: string) => string) => {
        const { unsavedChanges } = this.state;
        const { merge } = this.props;

        let value = evt.target.value;

        if (validate) value = validate(value);

        const currentValue: string = unsavedChanges[key] || merge[key];

        // If the value hasn't changed. 
        if (currentValue === value) return;
        
        // If we've reverted back to merge value.
        if (unsavedChanges[key] && merge[key] === value) {
            delete unsavedChanges[key];
        }
        else {
            unsavedChanges[key] = value;
        }

        this.nextState.unsavedChanges = unsavedChanges;
    }

    private toggleGeneralAttribute = (key: string) => {
        const { unsavedChanges } = this.state;
        const { merge } = this.props;

        const currentValue: boolean = unsavedChanges[key] || merge[key];
        const newValue: boolean = !currentValue;

        // If we're switching back to how the value was when the merge loaded, delete it from the unsaved changes.
        if (unsavedChanges[key] && newValue === merge[key]) {
            delete unsavedChanges[key];
        }
        // Assign the value to unsaved changes.
        else {
            unsavedChanges[key] = newValue;
        }
        // Not sure if this is actually necessary, but just in case. 
        this.nextState.unsavedChanges = unsavedChanges;
    }

    private toggleEditMode = (save: boolean) => {
        const { editMode, unsavedChanges, expanded } = this.state;
        const { merge, idx, update, plugins } = this.props;

        // this.mMergeRef.current.scrollIntoView({
        //     behaviour: 'smooth',
        //     block: 'start'
        // });

        if (editMode && Object.keys(unsavedChanges).length) {
            if (!save) {
                // We have unsaved changes, warn they will be lost. 
                
            }
            else {
                const newMerge = Object.assign({}, merge, unsavedChanges);
                update(idx, newMerge);
                this.checkMerge(newMerge, plugins);
            }
        }

        if (!editMode && !expanded) this.nextState.expanded = true;

        this.nextState.unsavedChanges = {};
        this.nextState.editMode = !editMode;
    }

    private discardEdits = () => {
        this.nextState.editMode = false;
        this.nextState.unsavedChanges = {};
    }

    private deleteMerge = () => {
        const { merge, idx, update, t } = this.props;
        this.context.api.showDialog('question', t('Delete {{name}}', { replace: { name: merge.name } }), {
            text: t('You are about to delete the merge "{{name}}", this cannot be undone. Are you sure you want to continue?', { replace: { name: merge.name } })
        }, [
            {
                label: t('Delete'),
                action: () => update(idx, undefined)
            },
            {
                label: t('Cancel')
            }
        ])        
    }

    private toggleExpanded = () => {
        this.nextState.expanded = !this.state.expanded;
    }
}

function isPluginName(input: string): string {
    if (!input.endsWith('.esp')) return `${input}.esp`;
    else return input;
}

function mapStateToProps(state: types.IState): IConnectedProps {
    const gameId = selectors.activeGameId(state);
    const mods = util.getSafe(state, ['persistent', 'mods', gameId], {});
    const plugins = util.getSafe(state, ['session', 'plugins', 'pluginInfo'], {});
    const stagingFolder = selectors.installPath(state);
    return {
        gameId,
        mods,
        plugins,
        stagingFolder,
    };
}
  
function mapDispatchToProps(dispatch: any) {
    return {};
}

export default (connect(mapStateToProps, mapDispatchToProps)(MergePanel));