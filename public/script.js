const state = {
    playlist: [],
    currentIndex: -1,
    repeat: 'none',
    shuffle: false,
    shuffleOrder: [],
    shuffleIndex: -1,
    volume: 70,
    savedVolume: 70,
    isPlaying: false,
    currentTime: 0,
    openedDirs: [],
    searchLeft: '',
    searchRight: '',
    activeFolder: null,
    directoryTrees: [],
    rootDirs: []
};

const STORAGE_KEY = 'parnasocial:state';
const THEME_KEY = 'yaebalneironki';
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma'];
const VIDEO_EXTS = ['mp4', 'webm', 'mkv', 'mov', 'avi'];
const CROSSFADE_MS = 500;
const PREVIEW_MAX = 512;

const ICON_PLAY = '\uEE8D';
const ICON_PAUSE = '\uED5B';
const ICON_VOLUME_MUTED = '\uF113';
const ICON_VOLUME_20 = '\uF105';
const ICON_VOLUME_40 = '\uF107';
const ICON_VOLUME_60 = '\uF109';
const ICON_VOLUME_80 = '\uF109';
const ICON_REPEAT_NONE = '\uE137';
const ICON_REPEAT_ALL = '\uE135';
const ICON_REPEAT_ONE = '\uE133';
const ICON_SHUFFLE = '\uE14B';
const ICON_FOLDER = '\uE8EB';
const ICON_MUSIC = '\uEA05';
const ICON_VIDEO = '\uF4FB';
const ICON_FOLDER_CLOSED = '\uE48E';
const ICON_FOLDER_OPEN = '\uE488';

function createPlayer() {
    const player = new Audio();
    player.preload = 'metadata';
    return player;
}

let audio = createPlayer();
let audioAlt = null;
let fadeRaf = null;
let fadeAbort = null;

let audioCtx = null;
let analyser = null;
let bassFilter = null;
let masterGain = null;
let sourceMap = new WeakMap();
let viz = null;
let graphReady = false;
let gestureBound = false;

const settings = document.querySelector('.settings');
const themeSwitch = document.querySelector('.switch input[type="checkbox"]');

const directoryEl = document.querySelector('.directory');
const playlistEl = document.querySelector('.playlist');
const prewEl = document.querySelector('.prew');
const playerImg = document.getElementById('playerimg');
const timeCont = document.querySelector('.timecont');
const timeFill = document.getElementById('time');
const trackName = document.querySelector('.trackname');
const trackAuthor = document.querySelector('.trackauthor');
const trackTime = document.querySelector('.tracktime');
const playBtn = document.getElementById('play');
const backBtn = document.getElementById('back');
const nextBtn = document.getElementById('next');
const videoModeBtn = document.getElementById('videomode');
const volumeBtn = document.getElementById('volumepok');
const volumeInput = document.getElementById('volume');
const openFolderBtn = document.getElementById('openfolder');
const repeatFolderBtn = document.getElementById('repeatfolder');
const shuffleFolderBtn = document.getElementById('shufflefolder');
const folderToPlaylistBtn = document.getElementById('foldertoplaylist');
const searchLeftBtn = document.getElementById('srch');
const searchLeftInput = document.getElementById('srcc');
const openPlaylistBtn = document.getElementById('openplaylist');
const repeatPlaylistBtn = document.getElementById('repeatplaylist');
const shufflePlaylistBtn = document.getElementById('shuffleplaylist');
const addPlaylistBtn = document.getElementById('addplaylist');
const addFolderPlaylistBtn = document.getElementById('addfolderplaylist');
const searchRightBtn = document.getElementById('srchp');
const searchRightInput = document.getElementById('srccp');
const leftPanel = document.querySelector('.main > .left');
const rightPanel = document.querySelector('.main > .right');

const fileBtn = document.getElementById('file');
const fileMenu = document.getElementById('files');
const recentMenu = document.querySelector('.recentt');
const fileRows = fileMenu ? fileMenu.querySelectorAll('.file.row') : [];
const recentBtn = fileRows[1];
const exitBtn = fileRows[2];

const metaCache = {};

let internalDragPath = null;

const previewVideo = document.createElement('video');
previewVideo.preload = 'metadata';
previewVideo.muted = true;
previewVideo.style.display = 'none';

if (prewEl && timeCont) {
    prewEl.insertBefore(previewVideo, timeCont);
}

function settingValue(key, fallback) {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        return window.pSettings.get(key);
    }

    return fallback;
}

function isSaveOn() {
    return settingValue('savePlaylist', true) === true;
}

function isCrossfadeOn() {
    return settingValue('crossfade', false) === true;
}

function isPreviewOn() {
    return settingValue('videoPreview', false) === true;
}

function isAutoRatioOn() {
    return settingValue('autoRatio', false) === true;
}

function isAwakeOn() {
    return settingValue('stayAwake', false) === true;
}

function isWatchOn() {
    return settingValue('watchFolders', false) === true;
}

function getOutputDevice() {
    const value = settingValue('outputDevice', '');
    return typeof value === 'string' ? value : '';
}

function applyPower() {
    if (!window.parnasocial || !window.parnasocial.power || typeof window.parnasocial.power.set !== 'function') {
        return;
    }

    const on = isAwakeOn() && state.currentIndex >= 0 && !!audio.src && !audio.paused;

    window.parnasocial.power.set(on);
}

function tryCtxSink(ctx, id) {
    if (ctx && typeof ctx.setSinkId === 'function') {
        try {
            const result = ctx.setSinkId(id);

            if (result && typeof result.catch === 'function') {
                result.catch(() => {
                });
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    return false;
}

function tryElSink(el, id) {
    if (el && typeof el.setSinkId === 'function') {
        try {
            const result = el.setSinkId(id);

            if (result && typeof result.catch === 'function') {
                result.catch(() => {
                });
            }
        } catch (error) {
        }
    }
}

function applyOutputDevice() {
    const id = getOutputDevice();

    if (graphReady) {
        tryCtxSink(audioCtx, id);
    }

    tryElSink(audio, id);
    tryElSink(previewVideo, id);

    if (audioAlt) {
        tryElSink(audioAlt, id);
    }
}

function syncWatch() {
    if (!window.parnasocial || !window.parnasocial.watch || typeof window.parnasocial.watch.set !== 'function') {
        return;
    }

    window.parnasocial.watch.set(isWatchOn() ? state.rootDirs.slice() : []);
}

let yaebalneironki = localStorage.getItem(THEME_KEY);

if (yaebalneironki !== '0' && yaebalneironki !== '1') {
    yaebalneironki = '0';
}

function syncThemeToMain(theme) {
    if (!window.parnasocial || typeof window.parnasocial.changeth !== 'function') {
        return;
    }

    window.parnasocial.changeth(theme);
}

function aplittheme() {
    document.documentElement.setAttribute('data-theme', yaebalneironki);

    if (themeSwitch) {
        themeSwitch.checked = yaebalneironki === '1';
    }

    refreshUnknownCover();
}

function saveth(theme) {
    if (theme !== '0' && theme !== '1') {
        return;
    }

    yaebalneironki = theme;
    localStorage.setItem(THEME_KEY, yaebalneironki);
    aplittheme();
    syncThemeToMain(yaebalneironki);
}

function aplitheme() {
    if (yaebalneironki === '1') {
        saveth('0');
    } else {
        saveth('1');
    }
}

function getth() {
    return yaebalneironki;
}

function unknownCover() {
    return yaebalneironki === '1' ? '../assets/unknowndark.png' : '../assets/unknown.png';
}

function refreshUnknownCover() {
    const track = state.playlist[state.currentIndex];

    if (!track || !playerImg) {
        return;
    }

    const stored = metaCache[track.path];

    if (stored && stored.picture) {
        return;
    }

    playerImg.src = unknownCover();
}

function openset() {
    settings.classList.toggle('vniz');
}

function bindThemeSwitch() {
    if (!themeSwitch) {
        return;
    }

    themeSwitch.addEventListener('change', () => {
        saveth(themeSwitch.checked ? '1' : '0');
    });
}

aplittheme();
bindThemeSwitch();
syncThemeToMain(yaebalneironki);

async function adlf() {
    const nameHeading = document.getElementById('name');

    if (!nameHeading) {
        return;
    }

    if (!window.parnasocial || typeof window.parnasocial.getWindowsUsername !== 'function') {
        nameHeading.textContent = 'user';
        return;
    }

    try {
        const username = await window.parnasocial.getWindowsUsername();

        if (typeof username === 'string' && username.trim() !== '') {
            nameHeading.textContent = username.trim();
        } else {
            nameHeading.textContent = 'user';
        }
    } catch (error) {
        nameHeading.textContent = 'user';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', adlf);
} else {
    adlf();
}

let fileTimer = null;
let recentTimer = null;
let recentFolders = [];

try {
    const recentRaw = localStorage.getItem('parnasocial:recentFolders');

    if (recentRaw) {
        const parsedRecent = JSON.parse(recentRaw);

        if (Array.isArray(parsedRecent)) {
            recentFolders = parsedRecent;
        }
    }
} catch (error) {
}

function saveRecentFolders() {
    try {
        localStorage.setItem('parnasocial:recentFolders', JSON.stringify(recentFolders));
    } catch (error) {
    }
}

function pushRecentFolder(dirPath) {
    recentFolders = recentFolders.filter((p) => p !== dirPath);
    recentFolders.unshift(dirPath);

    if (recentFolders.length > 8) {
        recentFolders = recentFolders.slice(0, 8);
    }

    saveRecentFolders();
    renderRecentMenu();
}

function cancelFileClose() {
    clearTimeout(fileTimer);
}

function cancelRecentClose() {
    clearTimeout(recentTimer);
}

function hideFileMenu() {
    if (fileMenu) {
        fileMenu.classList.add('hidden');
    }
}

function hideRecentMenu() {
    if (recentMenu) {
        recentMenu.classList.add('hidden');
    }
}

function scheduleFileClose() {
    cancelFileClose();
    fileTimer = setTimeout(hideFileMenu, 150);
}

function scheduleRecentClose() {
    cancelRecentClose();
    recentTimer = setTimeout(hideRecentMenu, 150);
}

function place(el, x, y) {
    if (!el) {
        return;
    }

    el.classList.remove('hidden');
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('left', x + 'px', 'important');
    el.style.setProperty('top', y + 'px', 'important');
    el.style.setProperty('margin-left', '0px', 'important');
    el.style.setProperty('margin-top', '0px', 'important');
    el.style.setProperty('width', 'max-content', 'important');
    el.style.setProperty('transform', 'none', 'important');
    el.style.setProperty('transition', 'none', 'important');
    el.style.setProperty('animation', 'none', 'important');
    el.style.setProperty('z-index', '9999', 'important');
}

function renderRecentMenu() {
    if (!recentMenu) {
        return;
    }

    recentMenu.innerHTML = '';

    if (recentFolders.length === 0) {
        const empty = document.createElement('button');
        empty.className = 'file row';
        empty.textContent = 'No recent folders';
        empty.style.opacity = '0.5';
        recentMenu.appendChild(empty);
        return;
    }

    for (const folderPath of recentFolders) {
        const btn = document.createElement('button');
        btn.className = 'file row';
        btn.textContent = folderPath.split(/[\\/]/).pop() || folderPath;
        btn.title = folderPath;

        btn.addEventListener('mouseenter', () => {
            cancelRecentClose();
            cancelFileClose();
        });

        btn.addEventListener('click', async () => {
            hideFileMenu();
            hideRecentMenu();
            await openFolderByPath(folderPath);
        });

        recentMenu.appendChild(btn);
    }
}

async function openFolderByPath(dirPath) {
    if (!window.parnasocial || !window.parnasocial.folder) {
        return;
    }

    const tree = await window.parnasocial.folder.read(dirPath);

    const rootNode = {
        name: dirPath.split(/[\\/]/).pop() || dirPath,
        path: dirPath,
        type: 'folder',
        children: Array.isArray(tree) ? tree : []
    };

    const existing = state.directoryTrees.findIndex((n) => n.path === dirPath);

    if (existing !== -1) {
        state.directoryTrees[existing] = rootNode;
    } else {
        state.directoryTrees.push(rootNode);
    }

    if (!state.rootDirs.includes(dirPath)) {
        state.rootDirs.push(dirPath);
    }

    if (!state.openedDirs.includes(dirPath)) {
        state.openedDirs.push(dirPath);
    }

    state.activeFolder = dirPath;

    pushRecentFolder(dirPath);
    renderDirectory();
    saveState();
    syncWatch();
}

if (fileBtn && fileMenu) {
    fileBtn.addEventListener('mouseenter', () => {
        const r = fileBtn.getBoundingClientRect();

        cancelRecentClose();
        hideRecentMenu();

        place(fileMenu, r.left, r.bottom);
    });

    fileBtn.addEventListener('mouseleave', scheduleFileClose);
    fileMenu.addEventListener('mouseenter', cancelFileClose);

    fileMenu.addEventListener('mouseleave', () => {
        scheduleFileClose();
        scheduleRecentClose();
    });
}

const openRow = fileRows[0];

if (openRow) {
    openRow.addEventListener('click', async () => {
        hideFileMenu();
        hideRecentMenu();

        const dirPath = await openFolderAndAdd();

        if (dirPath) {
            pushRecentFolder(dirPath);
        }
    });
}

if (recentBtn && recentMenu) {
    renderRecentMenu();

    recentBtn.addEventListener('mouseenter', () => {
        const r = recentBtn.getBoundingClientRect();

        cancelRecentClose();
        cancelFileClose();
        renderRecentMenu();
        place(recentMenu, r.right, r.top);
    });

    recentBtn.addEventListener('mouseleave', scheduleRecentClose);

    recentMenu.addEventListener('mouseenter', () => {
        cancelRecentClose();
        cancelFileClose();
    });

    recentMenu.addEventListener('mouseleave', () => {
        scheduleRecentClose();
        scheduleFileClose();
    });
}

if (exitBtn) {
    exitBtn.addEventListener('click', () => {
        if (window.parnasocial && window.parnasocial.window && typeof window.parnasocial.window.close === 'function') {
            window.parnasocial.window.close();
        }
    });
}

function getFileExtension(filePath) {
    if (typeof filePath !== 'string') {
        return '';
    }

    const idx = filePath.lastIndexOf('.');

    if (idx === -1) {
        return '';
    }

    return filePath.slice(idx + 1).toLowerCase();
}

function getMediaType(filePath) {
    const ext = getFileExtension(filePath);

    if (AUDIO_EXTS.includes(ext)) {
        return 'audio';
    }

    if (VIDEO_EXTS.includes(ext)) {
        return 'video';
    }

    return 'file';
}

function stripExt(name) {
    const idx = name.lastIndexOf('.');

    if (idx === -1) {
        return name;
    }

    return name.slice(0, idx);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function saveState() {
    if (!isSaveOn()) {
        return;
    }

    try {
        const data = {
            playlist: state.playlist,
            currentIndex: state.currentIndex,
            repeat: state.repeat,
            shuffle: state.shuffle,
            volume: state.volume,
            openedDirs: state.openedDirs,
            rootDirs: state.rootDirs
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
    }
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return;
        }

        const data = JSON.parse(raw);

        if (typeof data.currentIndex === 'number') {
            state.currentIndex = data.currentIndex;
        }

        if (data.repeat === 'none' || data.repeat === 'all' || data.repeat === 'one') {
            state.repeat = data.repeat;
        }

        if (typeof data.shuffle === 'boolean') {
            state.shuffle = data.shuffle;
        }

        if (typeof data.volume === 'number') {
            state.volume = data.volume;
            state.savedVolume = data.volume > 0 ? data.volume : 70;
        }

        if (Array.isArray(data.openedDirs)) {
            state.openedDirs = data.openedDirs;
        }

        if (Array.isArray(data.rootDirs)) {
            state.rootDirs = data.rootDirs;
        }

        if (isSaveOn() && Array.isArray(data.playlist)) {
            state.playlist = data.playlist;
        } else {
            state.playlist = [];
            state.currentIndex = -1;
        }
    } catch (error) {
    }
}

async function restoreDirectoryTrees() {
    if (!window.parnasocial || !window.parnasocial.folder || typeof window.parnasocial.folder.read !== 'function') {
        return;
    }

    const dirs = Array.isArray(state.rootDirs) ? state.rootDirs.slice() : [];

    if (dirs.length === 0) {
        return;
    }

    const trees = [];

    for (const dirPath of dirs) {
        try {
            const tree = await window.parnasocial.folder.read(dirPath);

            trees.push({
                name: dirPath.split(/[\\/]/).pop() || dirPath,
                path: dirPath,
                type: 'folder',
                children: Array.isArray(tree) ? tree : []
            });
        } catch (error) {
        }
    }

    if (trees.length > 0) {
        state.directoryTrees = trees;
        renderDirectory();
    }
}

function getVolumeIcon(value) {
    if (value <= 0) {
        return ICON_VOLUME_MUTED;
    }

    if (value <= 20) {
        return ICON_VOLUME_20;
    }

    if (value <= 40) {
        return ICON_VOLUME_40;
    }

    if (value < 80) {
        return ICON_VOLUME_60;
    }

    return ICON_VOLUME_80;
}

function applyVolume() {
    audio.volume = state.volume / 100;

    if (audioAlt && !fadeRaf) {
        audioAlt.volume = state.volume / 100;
    }

    if (volumeBtn) {
        volumeBtn.textContent = getVolumeIcon(state.volume);
    }

    if (volumeInput) {
        volumeInput.value = String(state.volume);
    }
}

function setVolumeValue(value) {
    if (value < 0) {
        value = 0;
    }

    if (value > 100) {
        value = 100;
    }

    state.volume = Math.round(value);

    if (state.volume > 0) {
        state.savedVolume = state.volume;
    }

    applyVolume();
    saveState();
}

function toggleMute() {
    if (state.volume > 0) {
        state.savedVolume = state.volume;
        setVolumeValue(0);
    } else {
        if (state.savedVolume > 0) {
            setVolumeValue(state.savedVolume);
        } else {
            setVolumeValue(70);
        }
    }
}

function shuffleArray(arr) {
    const result = arr.slice();

    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = result[i];
        result[i] = result[j];
        result[j] = tmp;
    }

    return result;
}

function regenerateShuffleOrder() {
    const indices = [];

    for (let i = 0; i < state.playlist.length; i++) {
        indices.push(i);
    }

    state.shuffleOrder = shuffleArray(indices);

    const currentIdx = state.shuffleOrder.indexOf(state.currentIndex);

    if (currentIdx !== -1) {
        state.shuffleOrder.splice(currentIdx, 1);
        state.shuffleOrder.unshift(state.currentIndex);
    }

    state.shuffleIndex = 0;
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }

    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;

    return minutes + ':' + (secs < 10 ? '0' : '') + secs;
}

function previewActive() {
    const track = state.playlist[state.currentIndex];
    return isPreviewOn() && !!track && track.type === 'video';
}

function applyRatio() {
    if (!prewEl) {
        return;
    }

    if (!previewActive() || !isAutoRatioOn() || !previewVideo.videoWidth || !previewVideo.videoHeight) {
        prewEl.style.width = '';
        prewEl.style.height = '';
        return;
    }

    const vw = previewVideo.videoWidth;
    const vh = previewVideo.videoHeight;

    let w = PREVIEW_MAX;
    let h = Math.round(w * vh / vw);

    if (h > PREVIEW_MAX) {
        h = PREVIEW_MAX;
        w = Math.round(h * vw / vh);
    }

    prewEl.style.width = w + 'px';
    prewEl.style.height = h + 'px';
}

function updatePreviewDisplay() {
    const active = previewActive();

    if (playerImg) {
        playerImg.style.display = active ? 'none' : '';
    }

    previewVideo.style.display = active ? '' : 'none';

    applyRatio();
}

function syncPreviewSource() {
    const track = state.playlist[state.currentIndex];

    if (previewActive() && track) {
        const currentSrc = previewVideo.getAttribute('src');

        if (currentSrc !== track.path) {
            previewVideo.src = track.path;
            previewVideo.load();
        }

        if (!audio.paused) {
            previewVideo.currentTime = audio.currentTime;
            previewVideo.play().catch(() => {
            });
        }
    } else {
        previewVideo.pause();
    }

    updatePreviewDisplay();
}

window.addEventListener('parnasocial:settings', (event) => {
    if (event.detail === 'videoPreview' || event.detail === 'autoRatio') {
        syncPreviewSource();
    }
});

function applyMeta(index, stored) {
    if (index !== state.currentIndex) {
        return;
    }

    const track = state.playlist[index];

    if (trackName) {
        trackName.textContent = stored.title ? stored.title : stripExt(track.name);
    }

    if (trackAuthor) {
        trackAuthor.textContent = stored.artist ? stored.artist : '';
    }

    if (playerImg) {
        playerImg.src = stored.picture ? stored.picture : unknownCover();
    }
}

async function loadMetadata(index) {
    const track = state.playlist[index];

    if (!track || track.type !== 'audio') {
        return;
    }

    if (metaCache[track.path]) {
        applyMeta(index, metaCache[track.path]);
        return;
    }

    if (!window.parnasocial || !window.parnasocial.media || typeof window.parnasocial.media.getMetadata !== 'function') {
        return;
    }

    try {
        const meta = await window.parnasocial.media.getMetadata(track.path);

        const stored = {
            title: meta && meta.title ? meta.title : '',
            artist: meta && meta.artist ? meta.artist : '',
            picture: meta && meta.pictureBase64 ? ('data:' + (meta.pictureMime || 'image/jpeg') + ';base64,' + meta.pictureBase64) : ''
        };

        metaCache[track.path] = stored;
        track.metaTitle = stored.title;
        track.metaArtist = stored.artist;
        applyMeta(index, stored);
        saveState();
        reportRpc();
    } catch (error) {
    }
}

function updateTrackInfo() {
    const track = state.playlist[state.currentIndex];

    if (!track) {
        if (trackName) {
            trackName.textContent = 'Parnasocial';
        }

        if (trackAuthor) {
            trackAuthor.textContent = 'vexikoff';
        }

        if (trackTime) {
            trackTime.textContent = '0:00';
        }

        if (playerImg) {
            playerImg.src = '../assets/pre.png';
        }

        return;
    }

    const stored = metaCache[track.path];

    if (trackName) {
        trackName.textContent = stored ? (stored.title ? stored.title : stripExt(track.name)) : (track.metaTitle ? track.metaTitle : stripExt(track.name));
    }

    if (trackAuthor) {
        trackAuthor.textContent = stored ? stored.artist : (track.metaArtist || '');
    }

    if (playerImg) {
        if (stored && stored.picture) {
            playerImg.src = stored.picture;
        } else {
            playerImg.src = unknownCover();
        }
    }
}

function updatePlayButton() {
    if (playBtn) {
        playBtn.textContent = state.isPlaying ? ICON_PAUSE : ICON_PLAY;
    }
}

function updateRepeatButtons() {
    const icon = state.repeat === 'none'
        ? ICON_REPEAT_NONE
        : state.repeat === 'all'
            ? ICON_REPEAT_ALL
            : ICON_REPEAT_ONE;

    if (repeatFolderBtn) {
        repeatFolderBtn.textContent = icon;
    }

    if (repeatPlaylistBtn) {
        repeatPlaylistBtn.textContent = icon;
    }
}

function updateShuffleButtons() {
    if (shuffleFolderBtn) {
        shuffleFolderBtn.textContent = ICON_SHUFFLE;
        shuffleFolderBtn.style.opacity = state.shuffle ? '1' : '0.45';

        if (state.shuffle) {
            shuffleFolderBtn.classList.add('active');
        } else {
            shuffleFolderBtn.classList.remove('active');
        }
    }

    if (shufflePlaylistBtn) {
        shufflePlaylistBtn.textContent = ICON_SHUFFLE;
        shufflePlaylistBtn.style.opacity = state.shuffle ? '1' : '0.45';

        if (state.shuffle) {
            shufflePlaylistBtn.classList.add('active');
        } else {
            shufflePlaylistBtn.classList.remove('active');
        }
    }
}

function updateTimeline() {
    if (!timeFill) {
        return;
    }

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
        timeFill.style.width = ((audio.currentTime / audio.duration) * 100) + '%';
    } else {
        timeFill.style.width = '0%';
    }

    if (trackTime) {
        trackTime.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
    }
}

function attachPlayer(player) {
    player.addEventListener('play', () => {
        if (player !== audio) {
            return;
        }

        state.isPlaying = true;
        updatePlayButton();

        if (!rpcStartedAt) {
            rpcStartedAt = Date.now();
        }

        startRpcTimer();
        reportRpc();
        applyPower();

        if (previewActive()) {
            previewVideo.play().catch(() => {
            });
        }
    });

    player.addEventListener('pause', () => {
        if (player !== audio) {
            return;
        }

        state.isPlaying = false;
        updatePlayButton();
        rpcStartedAt = 0;
        stopRpcTimer();
        reportRpc();
        applyPower();
        previewVideo.pause();
    });

    player.addEventListener('ended', () => {
        if (player !== audio) {
            return;
        }

        state.isPlaying = false;
        updatePlayButton();
        stopRpcTimer();
        applyPower();

        playNext();
    });

    player.addEventListener('timeupdate', () => {
        if (player !== audio) {
            return;
        }

        updateTimeline();

        const track = state.playlist[state.currentIndex];

        if (track && Number.isFinite(audio.duration) && audio.duration > 0 && track.duration !== audio.duration) {
            track.duration = audio.duration;
            saveState();
            renderPlaylist();
        }

        if (previewActive() && Math.abs(previewVideo.currentTime - audio.currentTime) > 0.5) {
            previewVideo.currentTime = audio.currentTime;
        }

        if (isCrossfadeOn() && fadeRaf === null && !audio.paused && Number.isFinite(audio.duration) && audio.duration > CROSSFADE_MS / 1000 && (audio.duration - audio.currentTime) <= CROSSFADE_MS / 1000) {
            const next = getNextIndex();

            if (next !== -1 && next !== state.currentIndex) {
                state.currentIndex = next;

                const nextTrack = state.playlist[next];

                startCrossfade(getAltPlayer(), nextTrack);
                updateTrackInfo();
                loadMetadata(next);
                syncPreviewSource();

                if (state.shuffle) {
                    const shuffleIdx = state.shuffleOrder.indexOf(next);

                    if (shuffleIdx !== -1) {
                        state.shuffleIndex = shuffleIdx;
                    }
                }

                saveState();
                renderPlaylist();
            }
        }
    });

    player.addEventListener('loadedmetadata', () => {
        if (player !== audio) {
            return;
        }

        updateTimeline();
        reportRpc();
    });

    player.addEventListener('durationchange', () => {
        if (player !== audio) {
            return;
        }

        updateTimeline();
    });

    player.addEventListener('seeked', () => {
        if (player !== audio) {
            return;
        }

        updateTimeline();

        if (previewActive()) {
            previewVideo.currentTime = audio.currentTime;
        }
    });
}

function getAltPlayer() {
    if (!audioAlt) {
        audioAlt = createPlayer();
        attachPlayer(audioAlt);

        if (graphReady) {
            wirePlayerSource(audioAlt);
        }
    }

    return audioAlt;
}

function startCrossfade(incoming, track) {
    const from = audio;
    const base = state.volume / 100;

    if (fadeAbort) {
        fadeAbort();
        fadeAbort = null;
    }

    if (fadeRaf) {
        cancelAnimationFrame(fadeRaf);
        fadeRaf = null;
    }

    incoming.volume = 0;
    incoming.src = track.path;

    audio = incoming;
    audioAlt = from;

    let settled = false;

    const cleanup = () => {
        incoming.removeEventListener('playing', onPlaying);
        incoming.removeEventListener('error', onError);
        clearTimeout(guard);
        fadeAbort = null;
    };

    const hardFallback = () => {
        if (settled) {
            return;
        }

        settled = true;
        cleanup();

        if (fadeRaf) {
            cancelAnimationFrame(fadeRaf);
            fadeRaf = null;
        }

        incoming.pause();
        incoming.removeAttribute('src');
        incoming.load();

        audio = from;
        audioAlt = incoming;

        from.volume = base;
        from.src = track.path;
        from.load();
        from.play().catch(() => {
        });
    };

    const beginFade = () => {
        if (settled) {
            return;
        }

        settled = true;
        cleanup();

        const start = performance.now();

        const step = (now) => {
            const t = Math.min(1, (now - start) / CROSSFADE_MS);

            incoming.volume = base * t;
            from.volume = base * (1 - t);

            if (t < 1) {
                fadeRaf = requestAnimationFrame(step);
            } else {
                from.pause();
                from.removeAttribute('src');
                from.load();
                from.volume = base;
                fadeRaf = null;
            }
        };

        fadeRaf = requestAnimationFrame(step);
    };

    const onPlaying = () => {
        beginFade();
    };

    const onError = () => {
        hardFallback();
    };

    const guard = setTimeout(hardFallback, 4000);

    fadeAbort = cleanup;

    incoming.addEventListener('playing', onPlaying);
    incoming.addEventListener('error', onError);

    incoming.play().catch(() => {
        hardFallback();
    });
}

function stopCrossfade() {
    if (fadeAbort) {
        fadeAbort();
        fadeAbort = null;
    }

    if (fadeRaf) {
        cancelAnimationFrame(fadeRaf);
        fadeRaf = null;
    }

    if (audioAlt) {
        audioAlt.pause();
        audioAlt.removeAttribute('src');
        audioAlt.load();
        audioAlt.volume = state.volume / 100;
    }
}

function loadTrack(index, autoPlay) {
    if (index < 0 || index >= state.playlist.length) {
        return;
    }

    state.currentIndex = index;
    const track = state.playlist[index];

    const useCrossfade = autoPlay && isCrossfadeOn() && fadeRaf === null && !audio.paused && !!audio.src;

    if (useCrossfade) {
        startCrossfade(getAltPlayer(), track);
    } else {
        stopCrossfade();
        audio.src = track.path;
        audio.load();

        if (autoPlay) {
            audio.play().catch(() => {
            });
        }
    }

    rpcStartedAt = 0;

    updateTrackInfo();
    loadMetadata(index);
    syncPreviewSource();
    reportRpc();
    applyPower();

    if (state.shuffle) {
        const shuffleIdx = state.shuffleOrder.indexOf(index);

        if (shuffleIdx !== -1) {
            state.shuffleIndex = shuffleIdx;
        }
    }

    saveState();
    renderPlaylist();
}

function getNextIndex() {
    if (state.playlist.length === 0) {
        return -1;
    }

    if (state.repeat === 'one') {
        return state.currentIndex;
    }

    if (state.shuffle && state.shuffleOrder.length > 0) {
        state.shuffleIndex = (state.shuffleIndex + 1) % state.shuffleOrder.length;
        return state.shuffleOrder[state.shuffleIndex];
    }

    const next = state.currentIndex + 1;

    if (next >= state.playlist.length) {
        if (state.repeat === 'all') {
            return 0;
        }

        return -1;
    }

    return next;
}

function getPrevIndex() {
    if (state.playlist.length === 0) {
        return -1;
    }

    if (state.shuffle && state.shuffleOrder.length > 0) {
        state.shuffleIndex = (state.shuffleIndex - 1 + state.shuffleOrder.length) % state.shuffleOrder.length;
        return state.shuffleOrder[state.shuffleIndex];
    }

    const prev = state.currentIndex - 1;

    if (prev < 0) {
        if (state.repeat === 'all') {
            return state.playlist.length - 1;
        }

        return 0;
    }

    return prev;
}

function playNext() {
    const next = getNextIndex();

    if (next === -1) {
        audio.pause();
        state.isPlaying = false;
        updatePlayButton();
        return;
    }

    loadTrack(next, true);
}

function playPrev() {
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }

    const prev = getPrevIndex();

    if (prev === -1) {
        return;
    }

    loadTrack(prev, true);
}

function togglePlay() {
    if (state.playlist.length === 0) {
        return;
    }

    if (state.currentIndex === -1) {
        loadTrack(0, true);
        return;
    }

    if (audio.paused) {
        audio.play().catch(() => {
        });
    } else {
        audio.pause();
    }
}

function seekBy(seconds) {
    if (!Number.isFinite(audio.duration)) {
        return;
    }

    let target = audio.currentTime + seconds;

    if (target < 0) {
        target = 0;
    }

    if (target > audio.duration) {
        target = audio.duration;
    }

    audio.currentTime = target;
}

function seekToRatio(ratio) {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        return;
    }

    if (ratio < 0) {
        ratio = 0;
    }

    if (ratio > 1) {
        ratio = 1;
    }

    audio.currentTime = ratio * audio.duration;
    updateTimeline();
}

function cycleRepeat() {
    if (state.repeat === 'none') {
        state.repeat = 'all';
    } else if (state.repeat === 'all') {
        state.repeat = 'one';
    } else {
        state.repeat = 'none';
    }

    updateRepeatButtons();
    saveState();
}

function toggleShuffle() {
    state.shuffle = !state.shuffle;

    if (state.shuffle) {
        regenerateShuffleOrder();
    }

    updateShuffleButtons();
    saveState();
}

function filterTree(nodes, query) {
    if (!query) {
        return nodes;
    }

    const lower = query.toLowerCase();
    const result = [];

    for (const node of nodes) {
        if (node.type === 'folder') {
            const filteredChildren = filterTree(node.children || [], query);

            if (node.name.toLowerCase().includes(lower) || filteredChildren.length > 0) {
                result.push({
                    name: node.name,
                    path: node.path,
                    type: 'folder',
                    children: filteredChildren,
                    forceOpen: filteredChildren.length > 0
                });
            }
        } else if (node.type === 'audio' || node.type === 'video') {
            if (node.name.toLowerCase().includes(lower)) {
                result.push(node);
            }
        }
    }

    return result;
}

function filterPlaylist(items, query) {
    if (!query) {
        return items;
    }

    const lower = query.toLowerCase();

    return items.filter((item) => item.name.toLowerCase().includes(lower));
}

function findNodeByPath(nodes, targetPath) {
    for (const node of nodes) {
        if (node.path === targetPath) {
            return node;
        }

        if (node.type === 'folder' && node.children) {
            const found = findNodeByPath(node.children, targetPath);

            if (found) {
                return found;
            }
        }
    }

    return null;
}

function collectMediaFromNode(node) {
    const result = [];

    if (!node) {
        return result;
    }

    if (node.type === 'audio' || node.type === 'video') {
        result.push({
            id: generateId(),
            name: node.name,
            path: node.path,
            type: node.type
        });
        return result;
    }

    if (node.type === 'folder' && Array.isArray(node.children)) {
        for (const child of node.children) {
            const childMedia = collectMediaFromNode(child);

            for (const m of childMedia) {
                result.push(m);
            }
        }
    }

    return result;
}

function addToPlaylist(items) {
    for (const item of items) {
        state.playlist.push({
            id: generateId(),
            name: item.name,
            path: item.path,
            type: item.type
        });
    }

    if (state.shuffle) {
        regenerateShuffleOrder();
    }

    renderPlaylist();
    saveState();
}

function addPathsToPlaylist(paths) {
    const items = [];

    for (const p of paths) {
        const type = getMediaType(p);

        if (type === 'audio' || type === 'video') {
            items.push({
                name: p.split(/[\\/]/).pop() || p,
                path: p,
                type
            });
        }
    }

    addToPlaylist(items);
}

async function addFolderToPlaylist(dirPath) {
    if (!window.parnasocial || !window.parnasocial.folder) {
        return;
    }

    const tree = await window.parnasocial.folder.read(dirPath);

    if (!tree) {
        return;
    }

    const root = {
        type: 'folder',
        children: tree
    };

    const items = collectMediaFromNode(root);
    addToPlaylist(items);
}

function removeFromPlaylist(index) {
    if (index < 0 || index >= state.playlist.length) {
        return;
    }

    const removedCurrent = index === state.currentIndex;

    state.playlist.splice(index, 1);

    if (removedCurrent) {
        if (state.playlist.length === 0) {
            state.currentIndex = -1;
            stopCrossfade();
            audio.src = '';
            state.isPlaying = false;
            updateTrackInfo();
            updatePlayButton();
            updatePreviewDisplay();
        } else if (state.currentIndex >= state.playlist.length) {
            state.currentIndex = 0;
            loadTrack(0, false);
        } else {
            loadTrack(state.currentIndex, state.isPlaying);
        }
    } else if (index < state.currentIndex) {
        state.currentIndex--;
    }

    if (state.shuffle) {
        regenerateShuffleOrder();
    }

    renderPlaylist();
    saveState();
}

function buildFileNode(node) {
    const container = document.createElement('div');
    container.className = 'file';

    const row = document.createElement('div');
    row.className = 'row';
    row.style.alignItems = 'center';
    row.style.minWidth = '0';
    row.style.overflow = 'hidden';

    const icon = document.createElement('p');
    icon.className = 'segoeplus';
    icon.textContent = node.type === 'video' ? ICON_VIDEO : ICON_MUSIC;
    icon.style.lineHeight = '1';
    icon.style.flexShrink = '0';
    icon.style.alignSelf = 'center';

    const name = document.createElement('p');
    name.className = 'foldername';
    name.textContent = node.name;
    name.style.flex = '1 1 auto';
    name.style.minWidth = '0';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';

    row.appendChild(icon);
    row.appendChild(name);

    row.addEventListener('dblclick', (event) => {
        event.stopPropagation();

        const media = {
            id: generateId(),
            name: node.name,
            path: node.path,
            type: node.type
        };

        state.playlist.push(media);

        if (state.shuffle) {
            regenerateShuffleOrder();
        }

        const idx = state.playlist.length - 1;
        loadTrack(idx, true);
        saveState();
    });

    row.draggable = true;

    row.addEventListener('dragstart', (event) => {
        internalDragPath = node.path;
        event.dataTransfer.setData('text/parnasocial-node', node.path);
        event.dataTransfer.effectAllowed = 'copy';
    });

    row.addEventListener('dragend', () => {
        internalDragPath = null;
    });

    container.appendChild(row);
    return container;
}

function buildDirectoryNode(node, depth) {
    const container = document.createElement('div');
    container.className = 'folder';

    const row = document.createElement('div');
    row.className = 'row';
    row.style.alignItems = 'center';
    row.style.minWidth = '0';
    row.style.overflow = 'hidden';

    const chevron = document.createElement('p');
    chevron.className = 'segoeplus';
    chevron.style.lineHeight = '1';
    chevron.style.flexShrink = '0';
    chevron.style.alignSelf = 'center';

    const icon = document.createElement('p');
    icon.className = 'segoeplus';
    icon.textContent = ICON_FOLDER;
    icon.style.lineHeight = '1';
    icon.style.flexShrink = '0';
    icon.style.alignSelf = 'center';

    const name = document.createElement('p');
    name.className = 'foldername';
    name.textContent = node.name;
    name.style.flex = '1 1 auto';
    name.style.minWidth = '0';
    name.style.overflow = 'hidden';
    name.style.textOverflow = 'ellipsis';
    name.style.whiteSpace = 'nowrap';

    const isOpen = state.openedDirs.includes(node.path) || node.forceOpen === true;

    if (isOpen) {
        chevron.textContent = ICON_FOLDER_OPEN;
    } else {
        chevron.textContent = ICON_FOLDER_CLOSED;
    }

    row.appendChild(chevron);
    row.appendChild(icon);
    row.appendChild(name);

    row.addEventListener('click', (event) => {
        event.stopPropagation();

        const idx = state.openedDirs.indexOf(node.path);

        if (idx === -1) {
            state.openedDirs.push(node.path);
            state.activeFolder = node.path;
        } else {
            state.openedDirs.splice(idx, 1);

            if (state.activeFolder === node.path) {
                state.activeFolder = null;
            }
        }

        saveState();
        renderDirectory();
    });

    if (depth === 0) {
        row.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            event.stopPropagation();
            removeRootFolder(node.path);
        });
    }

    row.draggable = true;

    row.addEventListener('dragstart', (event) => {
        internalDragPath = node.path;
        event.dataTransfer.setData('text/parnasocial-node', node.path);
        event.dataTransfer.effectAllowed = 'copy';
    });

    row.addEventListener('dragend', () => {
        internalDragPath = null;
    });

    container.appendChild(row);

    if (isOpen && Array.isArray(node.children)) {
        const spacer = document.createElement('div');
        spacer.className = 'spacer';
        container.appendChild(spacer);

        for (const child of node.children) {
            if (child.type === 'folder') {
                container.appendChild(buildDirectoryNode(child, depth + 1));
            } else if (child.type === 'audio' || child.type === 'video') {
                container.appendChild(buildFileNode(child));
            }
        }
    }

    return container;
}

function makeEmptyText(text) {
    const empty = document.createElement('p');
    empty.className = 'foldername';
    empty.textContent = text;
    empty.style.opacity = '0.5';
    return empty;
}

function removeRootFolder(dirPath) {
    const idx = state.directoryTrees.findIndex((n) => n.path === dirPath);

    if (idx === -1) {
        return;
    }

    state.directoryTrees.splice(idx, 1);

    const rootIdx = state.rootDirs.indexOf(dirPath);

    if (rootIdx !== -1) {
        state.rootDirs.splice(rootIdx, 1);
    }

    state.openedDirs = state.openedDirs.filter((p) => {
        return p !== dirPath && !p.startsWith(dirPath + '\\') && !p.startsWith(dirPath + '/');
    });

    if (state.activeFolder === dirPath) {
        state.activeFolder = null;
    }

    saveState();
    syncWatch();
    renderDirectory();
}

function renderDirectory() {
    if (!directoryEl) {
        return;
    }

    directoryEl.innerHTML = '';

    if (!Array.isArray(state.directoryTrees) || state.directoryTrees.length === 0) {
        directoryEl.appendChild(makeEmptyText('No folders opened'));
        return;
    }

    const filtered = filterTree(state.directoryTrees, state.searchLeft);

    if (filtered.length === 0) {
        directoryEl.appendChild(makeEmptyText('Nothing found'));
        return;
    }

    for (const node of filtered) {
        if (node.type === 'folder') {
            directoryEl.appendChild(buildDirectoryNode(node, 0));
        } else if (node.type === 'audio' || node.type === 'video') {
            directoryEl.appendChild(buildFileNode(node));
        }
    }
}

function renderPlaylist() {
    if (!playlistEl) {
        return;
    }

    playlistEl.innerHTML = '';

    const filtered = filterPlaylist(state.playlist, state.searchRight);

    if (filtered.length === 0) {
        if (state.playlist.length === 0) {
            playlistEl.appendChild(makeEmptyText('Playlist is empty'));
        } else {
            playlistEl.appendChild(makeEmptyText('Nothing found'));
        }

        return;
    }

    for (const item of filtered) {
        const realIndex = state.playlist.indexOf(item);
        const container = document.createElement('div');
        container.className = 'file';

        if (realIndex === state.currentIndex) {
            container.classList.add('active');
        }

        const row = document.createElement('div');
        row.className = 'row';
        row.style.alignItems = 'center';
        row.style.minWidth = '0';
        row.style.overflow = 'hidden';

        const icon = document.createElement('p');
        icon.className = 'segoeplus';
        icon.textContent = item.type === 'video' ? ICON_VIDEO : ICON_MUSIC;
        icon.style.lineHeight = '1';
        icon.style.flexShrink = '0';
        icon.style.alignSelf = 'center';

        const name = document.createElement('p');
        name.className = 'foldername';
        name.textContent = stripExt(item.name);
        name.style.flex = '1 1 auto';
        name.style.minWidth = '0';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';

        row.appendChild(icon);
        row.appendChild(name);

        if (typeof item.duration === 'number' && Number.isFinite(item.duration)) {
            const dur = document.createElement('p');
            dur.className = 'foldername';
            dur.textContent = formatTime(item.duration);
            dur.style.marginLeft = 'auto';
            dur.style.opacity = '0.6';
            dur.style.flexShrink = '0';
            dur.style.whiteSpace = 'nowrap';
            dur.style.alignSelf = 'center';
            row.appendChild(dur);
        }

        row.addEventListener('click', (event) => {
            event.stopPropagation();
            loadTrack(realIndex, true);
        });

        row.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            removeFromPlaylist(realIndex);
        });

        container.appendChild(row);
        playlistEl.appendChild(container);
    }
}

async function openFolderAndAdd() {
    if (!window.parnasocial || !window.parnasocial.folder) {
        return null;
    }

    const dirPath = await window.parnasocial.folder.open();

    if (!dirPath) {
        return null;
    }

    const tree = await window.parnasocial.folder.read(dirPath);

    const rootNode = {
        name: dirPath.split(/[\\/]/).pop() || dirPath,
        path: dirPath,
        type: 'folder',
        children: Array.isArray(tree) ? tree : []
    };

    state.directoryTrees.push(rootNode);

    if (!state.rootDirs.includes(dirPath)) {
        state.rootDirs.push(dirPath);
    }

    if (!state.openedDirs.includes(dirPath)) {
        state.openedDirs.push(dirPath);
    }

    state.activeFolder = dirPath;

    renderDirectory();
    saveState();
    syncWatch();

    return dirPath;
}

async function addFilesDialog() {
    if (!window.parnasocial || !window.parnasocial.folder) {
        return;
    }

    const paths = await window.parnasocial.folder.openFiles();

    if (!paths || paths.length === 0) {
        return;
    }

    addPathsToPlaylist(paths);
}

async function addFolderDialog() {
    if (!window.parnasocial || !window.parnasocial.folder) {
        return;
    }

    const dirPath = await window.parnasocial.folder.open();

    if (!dirPath) {
        return;
    }

    await addFolderToPlaylist(dirPath);
}

function addActiveFolderToPlaylist() {
    if (!state.activeFolder || !Array.isArray(state.directoryTrees)) {
        return;
    }

    let rootNode = state.directoryTrees.find((n) => n.path === state.activeFolder);

    if (!rootNode) {
        for (const root of state.directoryTrees) {
            rootNode = findNodeByPath(root.children || [], state.activeFolder);

            if (rootNode) {
                break;
            }
        }
    }

    if (!rootNode) {
        return;
    }

    const items = collectMediaFromNode(rootNode);
    addToPlaylist(items);
}

function setupDropZone(element, handler, allowInternal) {
    if (!element) {
        return;
    }

    element.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        element.classList.add('dragover');
    });

    element.addEventListener('dragleave', () => {
        element.classList.remove('dragover');
    });

    element.addEventListener('drop', async (event) => {
        event.preventDefault();
        element.classList.remove('dragover');

        let nodePath = internalDragPath;

        if (!nodePath) {
            nodePath = event.dataTransfer.getData('text/parnasocial-node');
        }

        const wasInternal = internalDragPath !== null;
        internalDragPath = null;

        if (nodePath && Array.isArray(state.directoryTrees)) {
            if (wasInternal && allowInternal !== true) {
                return;
            }

            let foundNode = null;

            for (const root of state.directoryTrees) {
                if (root.path === nodePath) {
                    foundNode = root;
                    break;
                }

                const inner = findNodeByPath(root.children || [], nodePath);

                if (inner) {
                    foundNode = inner;
                    break;
                }
            }

            if (foundNode) {
                const items = collectMediaFromNode(foundNode);
                handler(items);
                return;
            }
        }

        const files = event.dataTransfer.files;

        if (files && files.length > 0) {
            const items = [];
            const canGetPath = window.parnasocial && window.parnasocial.files && typeof window.parnasocial.files.getPathForFile === 'function';

            for (let i = 0; i < files.length; i++) {
                const file = files[i];

                if (!file) {
                    continue;
                }

                let filePath = '';

                if (canGetPath) {
                    try {
                        filePath = window.parnasocial.files.getPathForFile(file) || '';
                    } catch (error) {
                        filePath = '';
                    }
                }

                if (!filePath && typeof file.path === 'string') {
                    filePath = file.path;
                }

                if (!filePath) {
                    continue;
                }

                const type = getMediaType(filePath);

                if (type === 'audio' || type === 'video') {
                    items.push({
                        name: file.name || filePath.split(/[\\/]/).pop(),
                        path: filePath,
                        type
                    });
                }
            }

            if (items.length > 0) {
                handler(items);
            }
        }
    });
}

setupDropZone(leftPanel, (items) => {
    addToPlaylist(items);
}, false);

setupDropZone(rightPanel, (items) => {
    addToPlaylist(items);
}, true);

document.addEventListener('dragover', (event) => {
    event.preventDefault();
});

document.addEventListener('drop', (event) => {
    event.preventDefault();
});

function bindSearchToggle(button, input, onChange) {
    if (!button || !input) {
        return;
    }

    let open = input.offsetParent !== null;

    button.addEventListener('click', () => {
        if (!open) {
            input.style.display = '';

            if (input.offsetParent === null) {
                input.style.display = 'block';
            }

            open = true;
            input.focus();
        } else if (input.value !== '') {
            input.value = '';
            onChange();
        } else {
            input.style.display = 'none';
            open = false;
        }

        button.blur();
    });

    input.addEventListener('input', () => {
        onChange();
    });
}

attachPlayer(audio);

previewVideo.addEventListener('loadedmetadata', () => {
    applyRatio();
});

function isVizOn() {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        return window.pSettings.get('vizualizator') === true;
    }

    return false;
}

function isBassOn() {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        return window.pSettings.get('bassBoost') === true;
    }

    return false;
}

let rpcStartedAt = 0;

function isRpcOn() {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        return window.pSettings.get('discordRpc') === true;
    }

    return false;
}

function reportRpc() {
    if (!window.parnasocial || !window.parnasocial.rpc || typeof window.parnasocial.rpc.update !== 'function') {
        return;
    }

    const track = state.playlist[state.currentIndex];
    const stored = track ? metaCache[track.path] : null;
    const playing = !!track && !audio.paused;

    window.parnasocial.rpc.update({
        enabled: isRpcOn(),
        mode: 'audio',
        title: track ? (stored && stored.title ? stored.title : (track.metaTitle ? track.metaTitle : stripExt(track.name))) : '',
        artist: track ? (stored ? stored.artist : (track.metaArtist || '')) : '',
        duration: Number.isFinite(audio.duration) ? audio.duration : 0,
        currentTime: audio.currentTime || 0,
        playing,
        startedAt: playing ? (rpcStartedAt || Date.now()) : 0
    });
}

let rpcTimer = null;

function startRpcTimer() {
    if (rpcTimer !== null) {
        return;
    }

    rpcTimer = setInterval(() => {
        reportRpc();
    }, 10000);
}

function stopRpcTimer() {
    if (rpcTimer === null) {
        return;
    }

    clearInterval(rpcTimer);
    rpcTimer = null;
}

function wirePlayerSource(player) {
    if (!audioCtx || sourceMap.has(player)) {
        return;
    }

    try {
        const src = audioCtx.createMediaElementSource(player);
        src.connect(bassFilter);
        sourceMap.set(player, src);
    } catch (error) {
    }
}

function ensureAudioGraph() {
    if (graphReady) {
        return true;
    }

    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;

        if (!Ctx) {
            return false;
        }

        audioCtx = new Ctx();
        bassFilter = audioCtx.createBiquadFilter();
        bassFilter.type = 'lowshelf';
        bassFilter.frequency.value = 150;
        bassFilter.gain.value = 0;
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0;
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 1;

        bassFilter.connect(analyser);
        analyser.connect(masterGain);
        masterGain.connect(audioCtx.destination);

        wirePlayerSource(audio);

        if (audioAlt) {
            wirePlayerSource(audioAlt);
        }

        graphReady = true;

        applyOutputDevice();

        return true;
    } catch (error) {
        graphReady = false;
        return false;
    }
}

function resumeAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {
        });
    }
}

function applyBassState() {
    if (!graphReady || !bassFilter) {
        return;
    }

    bassFilter.gain.value = isBassOn() ? 14 : 0;
}

function buildVizTargets() {
    const targets = [];

    if (prewEl) {
        targets.push({
            el: prewEl,
            lift: 1,
            liftPeak: 2,
            sway: 1,
            swayPeak: 4,
            rotMax: 3,
            rotPeak: 5,
            scaleMax: 0.002,
            scalePeak: 0.015,
            dir: 1
        });
    }

    const helloRow = document.querySelector('.center > .row');

    if (helloRow) {
        targets.push({
            el: helloRow,
            lift: 1,
            liftPeak: 2,
            sway: 2,
            swayPeak: 4,
            rotMax: 2,
            rotPeak: 4,
            scaleMax: 0.004,
            scalePeak: 0.01,
            dir: -1
        });
    }

    return targets;
}

function applyVizState() {
    if (!isVizOn()) {
        if (viz) {
            viz.stop();
        }

        return;
    }

    if (!ensureAudioGraph()) {
        return;
    }

    resumeAudio();
    applyBassState();

    if (typeof window.Vizualizator !== 'function') {
        return;
    }

    if (!viz) {
        viz = new window.Vizualizator(analyser, buildVizTargets(), function() {
            return graphReady && !!audioCtx && audioCtx.state === 'running';
        });
    }

    viz.start();
}

function bindFirstGesture() {
    if (gestureBound) {
        return;
    }

    gestureBound = true;

    const onGesture = () => {
        resumeAudio();

        if (isVizOn() || isBassOn()) {
            ensureAudioGraph();
            applyBassState();
            applyVizState();
        }

        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
    };

    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
}

window.addEventListener('parnasocial:settings', (event) => {
    if (event.detail === 'vizualizator') {
        applyVizState();
    }

    if (event.detail === 'bassBoost') {
        if (isBassOn() || isVizOn()) {
            ensureAudioGraph();
        }

        applyBassState();
    }

    if (event.detail === 'discordRpc') {
        reportRpc();
    }

    if (event.detail === 'stayAwake') {
        applyPower();
    }

    if (event.detail === 'outputDevice') {
        applyOutputDevice();
    }

    if (event.detail === 'watchFolders') {
        syncWatch();
    }
});

if (window.parnasocial && window.parnasocial.watch && typeof window.parnasocial.watch.onChanged === 'function') {
    window.parnasocial.watch.onChanged(async (dirPath) => {
        if (!isWatchOn()) {
            return;
        }

        if (!state.rootDirs.includes(dirPath)) {
            return;
        }

        if (!window.parnasocial || !window.parnasocial.folder || typeof window.parnasocial.folder.read !== 'function') {
            return;
        }

        try {
            const tree = await window.parnasocial.folder.read(dirPath);
            const idx = state.directoryTrees.findIndex((n) => n.path === dirPath);

            if (idx !== -1) {
                state.directoryTrees[idx].children = Array.isArray(tree) ? tree : [];
                renderDirectory();
            }
        } catch (error) {
        }
    });
}

if (playBtn) {
    playBtn.addEventListener('click', () => {
        togglePlay();
        playBtn.blur();
    });
}

if (backBtn) {
    backBtn.addEventListener('click', () => {
        playPrev();
        backBtn.blur();
    });
}

if (nextBtn) {
    nextBtn.addEventListener('click', () => {
        playNext();
        nextBtn.blur();
    });
}

if (videoModeBtn) {
    videoModeBtn.addEventListener('click', () => {
        const track = state.playlist[state.currentIndex];

        const fullState = {
            src: track ? track.path : '',
            currentTime: audio.currentTime,
            isPlaying: !audio.paused,
            volume: state.volume,
            name: track ? stripExt(track.name) : '',
            type: track ? track.type : 'audio',
            currentIndex: state.currentIndex,
            playlist: state.playlist,
            repeat: state.repeat,
            shuffle: state.shuffle
        };

        try {
            localStorage.setItem('parnasocial:fullscreen:state', JSON.stringify(fullState));
        } catch (error) {
        }

        if (window.parnasocial && typeof window.parnasocial.navigate === 'function') {
            window.parnasocial.navigate('fullscreen');
        } else {
            window.location.href = 'fullscreen.html';
        }

        videoModeBtn.blur();
    });
}

if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
        toggleMute();
        volumeBtn.blur();
    });
}

if (volumeInput) {
    volumeInput.addEventListener('input', () => {
        setVolumeValue(Number(volumeInput.value));
    });
}

if (timeCont) {
    timeCont.addEventListener('click', (event) => {
        const rect = timeCont.getBoundingClientRect();

        if (rect.width <= 0) {
            return;
        }

        seekToRatio((event.clientX - rect.left) / rect.width);
    });
}

if (openFolderBtn) {
    openFolderBtn.addEventListener('click', async () => {
        const dirPath = await openFolderAndAdd();

        if (dirPath) {
            pushRecentFolder(dirPath);
        }

        openFolderBtn.blur();
    });
}

if (repeatFolderBtn) {
    repeatFolderBtn.addEventListener('click', () => {
        cycleRepeat();
        repeatFolderBtn.blur();
    });
}

if (shuffleFolderBtn) {
    shuffleFolderBtn.addEventListener('click', () => {
        toggleShuffle();
        shuffleFolderBtn.blur();
    });
}

if (folderToPlaylistBtn) {
    folderToPlaylistBtn.addEventListener('click', () => {
        addActiveFolderToPlaylist();
        folderToPlaylistBtn.blur();
    });
}

bindSearchToggle(searchLeftBtn, searchLeftInput, () => {
    state.searchLeft = searchLeftInput ? searchLeftInput.value : '';
    renderDirectory();
});

if (openPlaylistBtn) {
    openPlaylistBtn.addEventListener('click', () => {
        addActiveFolderToPlaylist();
        openPlaylistBtn.blur();
    });
}

if (repeatPlaylistBtn) {
    repeatPlaylistBtn.addEventListener('click', () => {
        cycleRepeat();
        repeatPlaylistBtn.blur();
    });
}

if (shufflePlaylistBtn) {
    shufflePlaylistBtn.addEventListener('click', () => {
        toggleShuffle();
        shufflePlaylistBtn.blur();
    });
}

if (addPlaylistBtn) {
    addPlaylistBtn.addEventListener('click', () => {
        addFilesDialog();
        addPlaylistBtn.blur();
    });
}

if (addFolderPlaylistBtn) {
    addFolderPlaylistBtn.addEventListener('click', () => {
        addFolderDialog();
        addFolderPlaylistBtn.blur();
    });
}

bindSearchToggle(searchRightBtn, searchRightInput, () => {
    state.searchRight = searchRightInput ? searchRightInput.value : '';
    renderPlaylist();
});

document.addEventListener('keydown', (event) => {
    const active = document.activeElement;

    if (active) {
        const tag = active.tagName;

        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
            return;
        }
    }

    if (event.code === 'Space') {
        event.preventDefault();
        togglePlay();
        return;
    }

    if (event.code === 'ArrowLeft') {
        event.preventDefault();
        seekBy(-5);
        return;
    }

    if (event.code === 'ArrowRight') {
        event.preventDefault();
        seekBy(5);
        return;
    }

    if (event.code === 'ArrowUp') {
        event.preventDefault();
        setVolumeValue(state.volume + 5);
        return;
    }

    if (event.code === 'ArrowDown') {
        event.preventDefault();
        setVolumeValue(state.volume - 5);
        return;
    }

    if (event.code === 'KeyM') {
        event.preventDefault();
        toggleMute();
        return;
    }

    if (event.code === 'KeyN') {
        event.preventDefault();
        playNext();
        return;
    }

    if (event.code === 'KeyP') {
        event.preventDefault();
        playPrev();
        return;
    }
});

function handleExternalFile(filePath) {
    if (typeof filePath !== 'string' || filePath === '') {
        return;
    }

    const type = getMediaType(filePath);
    const name = filePath.split(/[\\/]/).pop() || filePath;

    if (type === 'video') {
        let idx = state.playlist.findIndex((t) => t.path === filePath);

        if (idx === -1) {
            state.playlist.push({
                id: generateId(),
                name,
                path: filePath,
                type
            });
            idx = state.playlist.length - 1;
        }

        state.currentIndex = idx;

        const fullState = {
            src: filePath,
            currentTime: 0,
            isPlaying: true,
            volume: state.volume,
            name: stripExt(name),
            type,
            currentIndex: idx,
            playlist: state.playlist,
            repeat: state.repeat,
            shuffle: state.shuffle
        };

        try {
            localStorage.setItem('parnasocial:fullscreen:state', JSON.stringify(fullState));
        } catch (error) {
        }

        if (window.parnasocial && typeof window.parnasocial.navigate === 'function') {
            window.parnasocial.navigate('fullscreen');
        } else {
            window.location.href = 'fullscreen.html';
        }

        return;
    }

    if (type === 'audio') {
        let idx = state.playlist.findIndex((t) => t.path === filePath);

        if (idx === -1) {
            addPathsToPlaylist([filePath]);
            idx = state.playlist.length - 1;
        }

        loadTrack(idx, true);
    }
}

async function pullPendingFile() {
    if (!window.parnasocial || !window.parnasocial.app || typeof window.parnasocial.app.getPendingFile !== 'function') {
        return;
    }

    try {
        const filePath = await window.parnasocial.app.getPendingFile();

        if (filePath && getMediaType(filePath) === 'audio') {
            handleExternalFile(filePath);
        }
    } catch (error) {
    }
}

if (window.parnasocial && window.parnasocial.app && typeof window.parnasocial.app.onOpenFile === 'function') {
    window.parnasocial.app.onOpenFile(handleExternalFile);
}

loadState();
applyVolume();
updateRepeatButtons();
updateShuffleButtons();
renderDirectory();
renderPlaylist();
updatePreviewDisplay();
restoreDirectoryTrees();
applyOutputDevice();
syncWatch();
applyPower();

if (state.currentIndex >= 0 && state.playlist.length > 0) {
    loadTrack(state.currentIndex, false);
}

pullPendingFile();
bindFirstGesture();
reportRpc();

if (isVizOn() || isBassOn()) {
    ensureAudioGraph();
    applyBassState();
    applyVizState();
}

(function handleReturnFromFullscreen() {
    try {
        const raw = localStorage.getItem('parnasocial:returnState');

        if (!raw) {
            return;
        }

        localStorage.removeItem('parnasocial:returnState');

        const data = JSON.parse(raw);

        if (typeof data.currentIndex === 'number') {
            state.currentIndex = data.currentIndex;
        }

        if (typeof data.volume === 'number') {
            state.volume = data.volume;
            state.savedVolume = data.volume > 0 ? data.volume : 70;
        }

        if (data.repeat === 'none' || data.repeat === 'all' || data.repeat === 'one') {
            state.repeat = data.repeat;
        }

        if (typeof data.shuffle === 'boolean') {
            state.shuffle = data.shuffle;
        }

        applyVolume();
        updateRepeatButtons();
        updateShuffleButtons();

        if (state.currentIndex >= 0 && state.playlist.length > 0) {
            loadTrack(state.currentIndex, false);

            if (typeof data.currentTime === 'number') {
                audio.currentTime = data.currentTime;
            }

            if (data.isPlaying) {
                audio.play().catch(() => {
                });
            }
        }
    } catch (error) {
    }
})();