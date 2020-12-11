import { actions, log, selectors, types, util } from 'vortex-api';
import * as path from 'path';
import { zEditSettingsReducer, zEditSessionReducer } from './reducers/reducers';
import MergePluginsPage from './views/MergePluginsPage';
import MergePluginsDialog from './views/MergePluginsDialog';
import { setzEditDialogMerge } from './actions/actions';


const supportedGames: string[] = [
  "skyrim",
  "skyrimse",
  "fallout4",
  "falloutnv"
]

function main(context: types.IExtensionContext) {

  // We need the plugin management extension for this as that's where users will be able to access these settings. 
  context.requireExtension('gamebryo-plugin-management');

  // Register the actual page for the user to interact with.
  context.registerMainPage(
    '', 
    'Merge Plugins', 
    MergePluginsPage, 
    { 
      group:'hidden',
      props: () => ({ supportedGames })
    }
  );

  context.registerDialog('merge-plugins-dialog', MergePluginsDialog);

  // Add a button to the plugins tab to open the main page containing our settings.
  context.registerAction('gamebryo-plugin-icons', 300, 'transfer', {}, 'Merge Plugins', () => {
    context.api.events.emit('show-main-page', 'Merge Plugins');
  }, () => isMergePluginsGame(context.api));

  const iszEditInstalled = (): boolean|string => {
    const zEdit = util.getSafe(context.api.getState(), ['settings', 'zEdit', 'path'], undefined);
    return !!zEdit ? true : 'zEdit could not be located.';
  }

  // Single action right right click menu.
  context.registerAction('gamebryo-plugins-action-icons', 100, 'add', {}, 'Add to Merge', 
    (instanceIds: string[]) => {
      context.api.store.dispatch(setzEditDialogMerge(undefined, instanceIds));
      // context.api.store.dispatch(actions.setDialogVisible('merge-plugins-dialog'));
    },
    () => iszEditInstalled()
  );

  // Mult-row action
  context.registerAction('gamebryo-plugins-multirow-actions', 100, 'add', {}, 'Add to Merge', 
    (instanceIds: string[]) => {
      context.api.store.dispatch(setzEditDialogMerge(undefined, instanceIds));
      // context.api.store.dispatch(actions.setDialogVisible('merge-plugins-dialog'));
    },
    () => iszEditInstalled()
  );

  context.registerReducer(['settings', 'zEdit'], zEditSettingsReducer);
  context.registerReducer(['session', 'zEdit'], zEditSessionReducer);

  context.once(() => {
    // Load our custom styles.
    context.api.setStylesheet('zedit-support', path.join(__dirname, 'stylesheets', 'zedit-support.scss'));
  });

  return true;

}

// Check if the active game supports zEdit/zMerge
function isMergePluginsGame(api: types.IExtensionApi): boolean {
  const state: types.IState = api.store.getState();
  const gameId: string = selectors.activeGameId(state);
  return supportedGames.includes(gameId);
}

export default main;
