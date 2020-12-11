import { types } from "vortex-api";

const defaultFileExprs = [
    "docs/**/*",
    "interface/**/*",
    "meshes/**/*",
    "lodsettings/**/*",
    "music/**/*",
    "scripts/*.pex",
    "scripts/source/*.psc",
    "seq/*.seq",
    "sound/**/*",
    "textures/**/*"
];

type zEditModManager = 'None' | 'Vortex' | 'Mod Organizer 2' | 'Mod Organizer' | 'Nexus Mod Manager';

interface zEditProfileSettings {
    recordView: {
        autoExpand: boolean;
        showArrayIndexes: boolean;
        promptOnDeletion: boolean;
        defaultColumnWidths: {
            names: number;
            records: number;
        }
    };
    treeView: {
        showGroupSignatures: boolean;
        promptOnDeletion: boolean;
        showFileHeaders: boolean;
    };
    cacheErrors: boolean;
    modManager: zEditModManager;
    managerPath: string;
    modsPath: string;
    mergePath: string;
    mergeIntegrations: {
        disablePlugins: boolean;
        disableMods: boolean;
    },
    archiveCreation: {
        fileExprs: string[];
        createMultipleArchives: boolean;
        minFileCount: number;
        initialized: boolean;
        createTexturesArchive: true;
        maxSize: number;
    }
}

class zEditProfileSettings {
    constructor(vortexPath: string, stagingPath: string) {
        this.recordView = {
            autoExpand: false,
            showArrayIndexes: true,
            promptOnDeletion: false,
            defaultColumnWidths: {
                names: 250,
                records: 300
            }
        }

        this.treeView = {
            showGroupSignatures: false,
            promptOnDeletion: true,
            showFileHeaders: false
        }

        this.cacheErrors = true;
        this.modManager = 'Vortex';
        this.managerPath = vortexPath;
        this.modsPath = stagingPath;
        this.mergePath = stagingPath;
        this.mergeIntegrations = {
            disablePlugins: true,
            disableMods: false
        }

        this.archiveCreation = {
            fileExprs: defaultFileExprs,
            createMultipleArchives: true,
            minFileCount: 10,
            initialized: true,
            createTexturesArchive: true,
            maxSize: 2147483648
        }
    }
}

type zEditMergeMethod = 'Clobber' | 'Clean';
type zEditMergeArchiveAction = 'Extract' | 'Copy' | 'Ignore';

interface zEditMerge {
    name: string;
    filename: string;
    method: zEditMergeMethod;
    loadOrder: string[];
    archiveAction: zEditMergeArchiveAction;
    buildMergedArchives: boolean;
    useGameLoadOrder: boolean;
    handleFaceData: boolean;
    handleVoiceData: boolean;
    handleBillboards: boolean;
    handleScriptFragments?: boolean;
    handleStringFiles: boolean;
    handleTranslations: boolean;
    handleIniFiles: boolean;
    handleDialogViews?: boolean;
    copyGeneralAssets: boolean;
    dateBuilt: Date;
    plugins: zEditMergePlugin[];
    // We probably want to save the Vortex mod that controls this merge, but it's not natively supported by zEdit.
    vortexModId?: string;
}

class zEditMerge {
    constructor(name: string, plugins: zEditMergePlugin[], loadOrder: string[]) {
        this.name = name;
        this.filename = `${name}.esp`;
        this.method = 'Clean';
        this.loadOrder = loadOrder;
        this.archiveAction = 'Copy';
        this.buildMergedArchives = false;
        this.useGameLoadOrder = false;
        this.handleFaceData = true;
        this.handleVoiceData = true;
        this.handleBillboards = true;
        this.handleStringFiles = true;
        this.handleScriptFragments = false;
        this.handleTranslations = true;
        this.handleIniFiles = true;
        this.handleDialogViews = true;
        this.copyGeneralAssets = false;
        this.dateBuilt = new Date();
        this.plugins = plugins;
    }
}

interface zEditMergePlugin {
    filename: string,
    dataFolder: string,
    // Extra attributes assigned by Vortex.
    pluginInfo?: any,
    missing?: boolean,
    mod?: types.IMod,
    setRef?: (ref: any) => void;
}

// gameMode must match the id in this list.
type zEditGame = 'Fallout NV' | 'Fallout 3' | 'Oblivion' | 'Skyrim' | 'Skyrim SE' | 'Fallout 4';

type zEditLanguage = 
    'English' | 'French' | 'German' | 'Italian' | 
    'Spanish' | 'Russian' | 'Polish' | 'Japanese' |
    'Portugese' | 'Chinese'

interface zEditProfileCache {
    name: string;
    gameMode: number;
    gamePath: string;
    language: zEditLanguage;

}

export { zEditProfileSettings, zEditMerge, zEditMergePlugin, zEditProfileCache, zEditGame };