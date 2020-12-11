import { app as appIn, remote } from 'electron';
import * as _ from 'lodash';
import { actions, fs, types, log, util, selectors } from 'vortex-api';
import * as path from 'path';
import { zEditProfileSettings, zEditMerge, zEditMergePlugin, zEditProfileCache, zEditGame } from '../types/zEditTypes';
import { getLatestReleases, download } from './GitHubDownloader';

const app = appIn || remote.app;

async function getzEditFromGitHub(context: types.IComponentContext): Promise<string> {
        // Get the latest version from GitHub, download it and install it to the extension folder.
        const downloadPath: string = path.join(__dirname, 'temp');
        const installPath: string = path.join(__dirname, 'zEdit');

        try {
            await fs.ensureDirWritableAsync(downloadPath);
            await fs.ensureDirWritableAsync(installPath);
        }
        catch(err) {
            err.message = 'Unable to create folder inside AppData: '+err.message;
            throw err;
        }

        let archivePath: string;

        try {
            const releases = await getLatestReleases();
            const latest = releases[0];
            archivePath = await download(context, latest, downloadPath);
        }
        catch (err) {
            err.message = 'Error downloading from Github: '+err.message;
            log('error', err.message);
            throw err;
        }

        const szip = new util.SevenZip();
        await szip.extractFull(archivePath, installPath);
        const exe = path.join(installPath, 'zEdit.exe');
        
        try {
            await fs.statAsync(exe);
            await fs.removeAsync(downloadPath);
            return exe;
        }
        catch(err) {
            return '';
        }
}

async function checkzEditConfig(
    installPath: string, 
    gameId: string,
    gamePath: string,
    vortexPath: string,
    stagingPath: string
    ): Promise<string> {
    const installFolder: string = path.dirname(installPath);
    const gameName: zEditGame = gameIdToProfile(gameId);
    const profileName = `${gameName} - Vortex`
    const profilesFolder: string = path.join(installFolder, 'profiles', profileName);

    try {
        // Make sure the profiles folder exists.
        await fs.ensureDirWritableAsync(profilesFolder);
    }
    catch (err) {
        err.message = 'Failed to create profiles folder - '+err.message;
        throw err;
    }

    // Check for the JSON settings file.
    const profileSettings = path.join(profilesFolder, 'settings.json');

    let settings: zEditProfileSettings;

    try {
        // Import existing JSON.
        const rawProfile = await fs.readFileAsync(profileSettings);
        settings = (JSON.parse(rawProfile) as zEditProfileSettings);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            // If the file doesn't exist, create a new one. 
            const newProfile = new zEditProfileSettings(vortexPath, stagingPath);
            await fs.writeFileAsync(profileSettings, JSON.stringify(newProfile, null, 2), { encoding: 'utf-8' })
                .catch((err) => {
                    log('error', 'Error creating new profile settings JSON', err);
                    err.message = 'Error creating new profile settings JSON' + err;
                    throw err;
                })
            settings = newProfile;
        }
    }

    // If our settings aren't configrued correctly, try and fix them.
    if (settings.managerPath !== vortexPath || settings.mergePath !== stagingPath || settings.modsPath !== stagingPath) {
        settings.managerPath = vortexPath;
        settings.mergePath = stagingPath;
        settings.modsPath = stagingPath;
        try {
            await fs.writeFileAsync(profileSettings, JSON.stringify(settings, null, 2), { encoding: 'utf-8' })
        }
        catch (err) {
            log('error', 'Error updating profile settings JSON', err);
            err.message = 'Error updating profile settings JSON' + err;
            throw err;
        }
    }

    // Add this profile to zEdit's appData cache.
    const newProfile : zEditProfileCache = {
        name: profileName,
        gameMode: gameNameToIntId(gameName),
        gamePath: gamePath,
        language: 'English'
    };

    const cachePath = path.join(app.getPath('appData'), 'zEdit', 'profiles.json');
    let cachedProfiles: zEditProfileCache[]
    try {
        const cacheRaw = await fs.readFileAsync(cachePath);
        cachedProfiles = JSON.parse(cacheRaw);
        // If the profile isn't already in the cache, insert it and resave.
        const existing = cachedProfiles.find(profile => profile.name === newProfile.name);

        if (!existing || !_.isEqual(existing, newProfile)) {
            // If it exists but isn't the same, replace it. Otherwise insert it.
            existing ? cachedProfiles[cachedProfiles.indexOf(existing)] = newProfile : cachedProfiles.push(newProfile);
            await fs.writeFileAsync(cachePath, JSON.stringify(cachedProfiles, null, 2), { encoding: 'utf-8' });
        }
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            try {
                await fs.writeFileAsync(cachePath, JSON.stringify([newProfile], null , 2), { encoding: 'utf-8' });
            }
            catch (innerErr) {
                log('warn', 'Unable to create zEdit profile cache file', err.message);
            }
        }
        else log('warn', 'Unable to update zEdit profile cache file', err.message);
    }


    // Return our profile name. 
    return profileName;
}

async function getMerges(installPath: string, profile: string): Promise<zEditMerge[]> {
    const installFolder: string = path.dirname(installPath);
    const mergePath: string = path.join(installFolder, 'profiles', profile, 'merges.json');

    try {
        const raw = await fs.readFileAsync(mergePath);
        const merges = JSON.parse(raw) as zEditMerge[];
        return merges;
    }
    catch(err) {
        log('info', 'Error getting merges for zMerge profile: '+profile, err.message);
        try {
            await fs.writeFileAsync(mergePath, '[]', { encoding: 'utf-8' });
        }
        catch (err) {
            log('warn', 'Error creating new merge.json for '+ profile, err.message);
        }
        return [];
    }
}

async function updateMerges(installPath: string, profile: string, merges: zEditMerge[]): Promise<void> {
    const installFolder: string = path.dirname(installPath);
    const mergePath: string = path.join(installFolder, 'profiles', profile, 'merges.json');

    try {
        await fs.writeFileAsync(mergePath, JSON.stringify(merges, null, 2), { encoding: 'utf-8' });
    }
    catch (err) {
        log('warn', 'Error saving merged for zMerge profile: '+profile, err.message);
        err.message = 'Error saving merged for zMerge profile: '+err.message;
        throw err;
    }
}

async function createModEntry(api: types.IExtensionApi, gameId:string, merge: zEditMerge): Promise<string> {
    const dateVersion = (date: Date) => `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
    // For some reason, if the Mod ID and Install Path are different, Vortex ignores the install path...
    const modId: string = merge.name //`merge-${merge.name.toLowerCase().replace(' ', '')}`;

    const state: types.IState = api.getState();
    const staging: string = selectors.installPathForGame(state, gameId);
    const profile: types.IProfile = selectors.activeProfile(state);
    const modFolder: string = path.join(staging, merge.name);

    try {
        await fs.ensureDirWritableAsync(modFolder);
    }
    catch (err) {
        log('error', 'Failed to create mod folder', { game: gameId, path: modFolder });
        api.sendNotification({
            id: 'failed-to-create-merged-mod',
            type: 'error',
            title: 'Could not create mod folder',
            message: merge.name,
            displayMS: 5000
        });
        return;
    }
    
    const modEntry: types.IMod = {
        id: modId,
        type: '',
        state: 'installed',
        installationPath: merge.name,
        attributes: {
            name: merge.name,
            author: 'zMerge',
            installTime: new Date(),
            version: dateVersion(new Date()),
            notes: `Created with zMerge`,
            shortDescription: `Merge "${merge.name}"`,
            description: merge.plugins.map((p) => p.filename).join('<br />'),
            pictureUrl: `file://${__dirname}/images/zEditIcon.png`
        }


    }

    api.store.dispatch(actions.addMod(gameId, modEntry));
    api.store.dispatch(actions.setModInstallationPath(gameId, modId, merge.name));
    api.store.dispatch(actions.setModEnabled(profile.id, modId, true));
    return modId;
}

function getFullPluginData(mergePlugins: zEditMergePlugin[], plugins: {[id: string]: any}, mods: {[id: string]: types.IMod}, stagingFolder: string): zEditMergePlugin[] {
    const pluginArray = Object.values(plugins);
    
    return mergePlugins.map((plugin: zEditMergePlugin) => {
        const mp = {...plugin};
        const deployedPlugin = pluginArray.find((p) => p.name === mp.filename);
        mp.missing = deployedPlugin === undefined;
        mp.pluginInfo = deployedPlugin;
        
        const modId = util.getSafe(deployedPlugin, ['modName'], undefined);
        if (modId) {
            mp.mod = mods[modId];
            mp.dataFolder = path.join(stagingFolder, mp.mod.installationPath);
        };

        return mp;
    })
}

function gameIdToProfile(gameId: string): zEditGame {
    switch (gameId) {
        case ('skyrim'): return 'Skyrim';
        case ('skyrimse'): return 'Skyrim SE';
        case ('skyrimspecialedition'): return 'Skyrim SE';
        case ('fallout4'): return 'Fallout 4';
        case ('falloutnv'): return 'Fallout NV';
    }
}

function gameNameToIntId(game: string): number {
    return ['Fallout NV', 'Fallout 3', 'Oblivion', 
        'Skyrim', 'Skyrim SE', 'Fallout 4'].indexOf(game);
}

function loadOrderFromPlugins(mergePlugins: zEditMergePlugin[], plugins?: {[id: string] : any}): string[] {
    // Build a very basic load order using the existing plugin load order. 
    let loPlugins = mergePlugins.reduce((prev, cur) => {
        const masters = cur.pluginInfo?.masterList;
        if (masters) return prev.concat(masters);
        return prev;
    }, [])

    let sorted = [...new Set(loPlugins)];

    if (plugins) {
        sorted.sort((a, b) => {
            const pluginInfoA = plugins[a.toLowerCase()];
            const pluginsInfoB = plugins[b.toLowerCase()];
            return pluginInfoA.loadOrder >= pluginsInfoB.loadOrder ? 1 : -1;
        });
    }

    return sorted;
}

function runzEdit(api: types.IExtensionApi, zEditPath: string, mode?: string, zEditProfile?: string, mergeName?: string) {
    const args = [];
    if (mode) args.push(`-appMode="${mode}"`)
    if (zEditProfile) args.push(`-profile="${zEditProfile}"`)
    if (mergeName) args.push(`-merge="${mergeName}"`);

    api.runExecutable(zEditPath, args, {
        onSpawned: () => api.store.dispatch(actions.setToolRunning(zEditPath, Date.now(), false))
    });
}

export { runzEdit, getzEditFromGitHub, checkzEditConfig, getMerges, updateMerges, createModEntry, getFullPluginData, loadOrderFromPlugins };