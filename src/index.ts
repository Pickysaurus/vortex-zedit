import { log, selectors, types } from 'vortex-api';
import * as path from 'path';
import zEditReducer from './reducers/reducers';
import MergePluginsPage from './views/MergePluginsPage';


const supportedGames: string[] = [
  "skyrim",
  "skyrimse",
  "fallout4",
  "falloutnv"
]

function main(context: types.IExtensionContext) {

  // We need the plugin management extension for this as that's where users will be able to access these settings. 
  context.requireExtension('gamebryo-plugin-management');

  // Add a button to the plugins tab to open the main page containing our settings.
  context.registerAction('gamebryo-plugin-icons', 300, 'transfer', {}, 'Merge Plugins', () => {
    context.api.events.emit('show-main-page', 'Merge Plugins');
  }, () => isMergePluginsGame(context.api));

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

  context.registerReducer(['settings', 'zEdit'], zEditReducer);

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
