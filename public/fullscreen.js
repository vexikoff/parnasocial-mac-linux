const video = document.getElementById('video');
const timeCont = document.querySelector('.timecont');
const timeFill = document.getElementById('time');
const playButton = document.getElementById('play');
const volumeButton = document.getElementById('volumepok');
const volumeInput = document.getElementById('volume');
const fullscreenButton = document.getElementById('fullscreen');
const backToAudioButton = document.getElementById('backtoaudio');
const backBtn = document.getElementById('back');
const nextBtn = document.getElementById('next');
const mainContainer = document.querySelector('.main');
const controlsEl = document.querySelector('.controls');
const settings = document.querySelector('.settings');
const themeSwitch = document.querySelector('.switch input[type="checkbox"]');

const ICON_PLAY = '\uEE8D';
const ICON_PAUSE = '\uED5B';
const ICON_VOLUME_MUTED = '\uF113';
const ICON_VOLUME_20 = '\uF105';
const ICON_VOLUME_40 = '\uF107';
const ICON_VOLUME_60 = '\uF109';
const ICON_VOLUME_80 = '\uF109';
const ICON_FULLSCREEN = '\uE951';
const ICON_FULLSCREEN_ACTIVE = '\uE953';

const HIDE_DELAY = 3000;
const THEME_KEY = 'yaebalneironki';
const VIDEO_EXTS = ['mp4', 'webm', 'mkv', 'mov', 'avi'];
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma'];

let savedVolume = 70;
let hideTimer = null;
let currentState = null;
let isWindowFullScreen = false;

let coverImg = null;
let coverCustom = false;

let fsAudioCtx = null;
let fsSource = null;
let fsBassFilter = null;
let fsGraphReady = false;
let fsGestureBound = false;

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

    refreshCoverFallback();
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

function openset() {
    if (settings) {
        settings.classList.toggle('vniz');
    }
}

if (themeSwitch) {
    themeSwitch.addEventListener('change', () => {
        saveth(themeSwitch.checked ? '1' : '0');
    });
}

aplittheme();
syncThemeToMain(yaebalneironki);

function isBassOn() {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        return window.pSettings.get('bassBoost') === true;
    }

    return false;
}

function isAwakeOn() {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        return window.pSettings.get('stayAwake') === true;
    }

    return false;
}

function getOutputDevice() {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        const value = window.pSettings.get('outputDevice');
        return typeof value === 'string' ? value : '';
    }

    return '';
}

function applyPower() {
    if (!window.parnasocial || !window.parnasocial.power || typeof window.parnasocial.power.set !== 'function') {
        return;
    }

    const on = isAwakeOn() && !!video.src && !video.paused;

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

    if (fsGraphReady) {
        tryCtxSink(fsAudioCtx, id);
    }

    tryElSink(video, id);
}

let rpcStartedAt = 0;

function isRpcOn() {
    if (window.pSettings && typeof window.pSettings.get === 'function') {
        return window.pSettings.get('discordRpc') === true;
    }

    return false;
}

function stripExtLocal(name) {
    if (typeof name !== 'string') {
        return '';
    }

    const idx = name.lastIndexOf('.');

    return idx === -1 ? name : name.slice(0, idx);
}

function reportRpc() {
    if (!window.parnasocial || !window.parnasocial.rpc || typeof window.parnasocial.rpc.update !== 'function') {
        return;
    }

    const track = currentState && Array.isArray(currentState.playlist) ? currentState.playlist[currentState.currentIndex] : null;
    const title = track ? stripExtLocal(track.name) : (currentState && currentState.name ? currentState.name : '');
    const playing = !!video.src && !video.paused;

    window.parnasocial.rpc.update({
        enabled: isRpcOn(),
        mode: 'video',
        title,
        artist: '',
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        currentTime: video.currentTime || 0,
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

function ensureFsBassGraph() {
    if (fsGraphReady) {
        return true;
    }

    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;

        if (!Ctx) {
            return false;
        }

        fsAudioCtx = new Ctx();
        fsSource = fsAudioCtx.createMediaElementSource(video);
        fsBassFilter = fsAudioCtx.createBiquadFilter();
        fsBassFilter.type = 'lowshelf';
        fsBassFilter.frequency.value = 150;
        fsBassFilter.gain.value = 0;

        fsSource.connect(fsBassFilter);
        fsBassFilter.connect(fsAudioCtx.destination);

        fsGraphReady = true;

        applyOutputDevice();

        return true;
    } catch (error) {
        fsGraphReady = false;
        return false;
    }
}

function resumeFsAudio() {
    if (fsAudioCtx && fsAudioCtx.state === 'suspended') {
        fsAudioCtx.resume().catch(() => {
        });
    }
}

function applyFsBassState() {
    if (!fsGraphReady || !fsBassFilter) {
        return;
    }

    fsBassFilter.gain.value = isBassOn() ? 14 : 0;
}

function bindFsFirstGesture() {
    if (fsGestureBound) {
        return;
    }

    fsGestureBound = true;

    const onGesture = () => {
        resumeFsAudio();

        if (isBassOn()) {
            ensureFsBassGraph();
            applyFsBassState();
        }

        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
    };

    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
}

window.addEventListener('parnasocial:settings', (event) => {
    if (event.detail === 'bassBoost') {
        if (isBassOn()) {
            ensureFsBassGraph();
        }

        applyFsBassState();
    }

    if (event.detail === 'stayAwake') {
        applyPower();
    }

    if (event.detail === 'outputDevice') {
        applyOutputDevice();
    }
});

function loadState() {
    try {
        const raw = localStorage.getItem('parnasocial:fullscreen:state');

        if (!raw) {
            return null;
        }

        return JSON.parse(raw);
    } catch (error) {
        return null;
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
    const value = Number(volumeInput.value);
    video.volume = value / 100;
    volumeButton.textContent = getVolumeIcon(value);
}

function setVolumeValue(value) {
    if (value < 0) {
        value = 0;
    }

    if (value > 100) {
        value = 100;
    }

    volumeInput.value = String(value);

    if (value > 0) {
        savedVolume = value;
    }

    applyVolume();
}

function changeVolume(delta) {
    setVolumeValue(Number(volumeInput.value) + delta);
}

function toggleMute() {
    const current = Number(volumeInput.value);

    if (current > 0) {
        savedVolume = current;
        setVolumeValue(0);
    } else {
        if (savedVolume > 0) {
            setVolumeValue(savedVolume);
        } else {
            setVolumeValue(70);
        }
    }
}

function togglePlay() {
    if (!video.src) {
        return;
    }

    if (video.paused) {
        video.play().catch(() => {
        });
    } else {
        video.pause();
    }
}

function seekBy(seconds) {
    if (!Number.isFinite(video.duration)) {
        return;
    }

    let target = video.currentTime + seconds;

    if (target < 0) {
        target = 0;
    }

    if (target > video.duration) {
        target = video.duration;
    }

    video.currentTime = target;
}

function updateTimeline() {
    if (Number.isFinite(video.duration) && video.duration > 0) {
        timeFill.style.width = ((video.currentTime / video.duration) * 100) + '%';
    } else {
        timeFill.style.width = '0%';
    }
}

function updateFullscreenIcon() {
    fullscreenButton.textContent = isWindowFullScreen ? ICON_FULLSCREEN_ACTIVE : ICON_FULLSCREEN;
}

async function toggleFullscreen() {
    if (window.parnasocial && window.parnasocial.window && typeof window.parnasocial.window.setFullScreen === 'function') {
        let current = isWindowFullScreen;

        if (typeof window.parnasocial.window.isFullScreen === 'function') {
            try {
                current = (await window.parnasocial.window.isFullScreen()) === true;
            } catch (error) {
            }
        }

        const target = !current;

        try {
            let result = (await window.parnasocial.window.setFullScreen(target)) === true;

            isWindowFullScreen = result;
            updateFullscreenIcon();

            if (result !== target) {
                result = (await window.parnasocial.window.setFullScreen(target)) === true;
                isWindowFullScreen = result;
                updateFullscreenIcon();
            }
        } catch (error) {
        }

        return;
    }

    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {
        });
    } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {
        });
    }
}

function showControls() {
    if (!controlsEl) {
        return;
    }

    controlsEl.style.opacity = '1';
    controlsEl.style.pointerEvents = 'auto';
}

function hideControls() {
    if (!controlsEl) {
        return;
    }

    controlsEl.style.opacity = '0';
    controlsEl.style.pointerEvents = 'none';
}

function resetHideTimer() {
    showControls();

    if (hideTimer) {
        clearTimeout(hideTimer);
    }

    hideTimer = setTimeout(hideControls, HIDE_DELAY);
}

function ensureCoverDom() {
    if (!mainContainer) {
        return;
    }

    if (!coverImg) {
        coverImg = document.createElement('img');
        coverImg.className = 'video';
        coverImg.alt = '';
        coverImg.draggable = false;
    }

    if (coverImg.parentNode !== mainContainer) {
        if (controlsEl && controlsEl.parentNode === mainContainer) {
            mainContainer.insertBefore(coverImg, controlsEl);
        } else {
            mainContainer.appendChild(coverImg);
        }
    }
}

function extOf(path) {
    if (typeof path !== 'string') {
        return '';
    }

    const dot = path.lastIndexOf('.');

    if (dot === -1) {
        return '';
    }

    return path.slice(dot + 1).toLowerCase();
}

function isAudioTrack() {
    if (currentState && currentState.type === 'audio') {
        return true;
    }

    if (currentState && currentState.type === 'video') {
        return false;
    }

    const src = currentState ? currentState.src : video.currentSrc || video.src;
    const ext = extOf(src);

    if (AUDIO_EXTS.includes(ext)) {
        return true;
    }

    if (VIDEO_EXTS.includes(ext)) {
        return false;
    }

    return false;
}

function refreshCoverFallback() {
    if (!coverImg || coverCustom) {
        return;
    }

    coverImg.src = yaebalneironki === '1' ? '../assets/unknowndark.png' : '../assets/unknown.png';
}

async function loadCoverForTrack(src) {
    if (!coverImg) {
        return;
    }

    coverCustom = false;
    refreshCoverFallback();

    if (!src || !window.parnasocial || !window.parnasocial.media || typeof window.parnasocial.media.getMetadata !== 'function') {
        return;
    }

    try {
        const meta = await window.parnasocial.media.getMetadata(src);

        if (meta && meta.pictureBase64) {
            coverCustom = true;
            coverImg.src = 'data:' + (meta.pictureMime || 'image/jpeg') + ';base64,' + meta.pictureBase64;
        }
    } catch (error) {
    }
}

function applyCoverVisibility() {
    ensureCoverDom();

    if (!coverImg) {
        return;
    }

    if (isAudioTrack()) {
        video.style.display = 'none';
        coverImg.style.display = '';
        loadCoverForTrack(currentState ? currentState.src : (video.currentSrc || video.src));
    } else {
        video.style.display = '';
        coverImg.style.display = 'none';
        coverCustom = false;
    }
}

function loadTrackFromPlaylist(index, autoPlay) {
    if (!currentState || !Array.isArray(currentState.playlist)) {
        return;
    }

    if (index < 0 || index >= currentState.playlist.length) {
        return;
    }

    currentState.currentIndex = index;
    const track = currentState.playlist[index];

    if (!track) {
        return;
    }

    currentState.src = track.path;
    currentState.type = track.type;
    video.src = track.path;
    video.load();
    applyCoverVisibility();
    reportRpc();

    if (autoPlay) {
        video.play().catch(() => {
        });
    }
}

function playNext() {
    if (!currentState || !Array.isArray(currentState.playlist) || currentState.playlist.length === 0) {
        return;
    }

    let next = currentState.currentIndex + 1;

    if (next >= currentState.playlist.length) {
        if (currentState.repeat === 'all') {
            next = 0;
        } else {
            video.pause();
            return;
        }
    }

    loadTrackFromPlaylist(next, true);
}

function playPrev() {
    if (!currentState || !Array.isArray(currentState.playlist) || currentState.playlist.length === 0) {
        return;
    }

    if (video.currentTime > 3) {
        video.currentTime = 0;
        return;
    }

    let prev = currentState.currentIndex - 1;

    if (prev < 0) {
        if (currentState.repeat === 'all') {
            prev = currentState.playlist.length - 1;
        } else {
            prev = 0;
        }
    }

    loadTrackFromPlaylist(prev, true);
}

function backToAudio() {
    if (currentState) {
        try {
            const returnState = {
                currentIndex: currentState.currentIndex,
                currentTime: video.currentTime,
                isPlaying: !video.paused,
                volume: Number(volumeInput.value),
                repeat: currentState.repeat,
                shuffle: currentState.shuffle,
                playlist: currentState.playlist
            };

            localStorage.setItem('parnasocial:returnState', JSON.stringify(returnState));
        } catch (error) {
        }
    }

    try {
        localStorage.removeItem('parnasocial:fullscreen:state');
    } catch (error) {
    }

    if (isWindowFullScreen && window.parnasocial && window.parnasocial.window && typeof window.parnasocial.window.setFullScreen === 'function') {
        window.parnasocial.window.setFullScreen(false);
    }

    if (window.parnasocial && typeof window.parnasocial.navigate === 'function') {
        window.parnasocial.navigate('index');
        return;
    }

    window.location.href = 'index.html';
}

function openExternalFile(filePath) {
    if (typeof filePath !== 'string' || filePath === '') {
        return;
    }

    const ext = extOf(filePath);

    if (!VIDEO_EXTS.includes(ext)) {
        return;
    }

    if (!currentState) {
        currentState = {
            playlist: [],
            currentIndex: -1,
            repeat: 'none',
            shuffle: false
        };
    }

    if (!Array.isArray(currentState.playlist)) {
        currentState.playlist = [];
    }

    let idx = currentState.playlist.findIndex((t) => t.path === filePath);

    if (idx === -1) {
        currentState.playlist.push({
            name: filePath.split(/[\\/]/).pop() || filePath,
            path: filePath,
            type: 'video'
        });
        idx = currentState.playlist.length - 1;
    }

    currentState.currentIndex = idx;
    currentState.currentTime = 0;
    currentState.src = filePath;
    currentState.type = 'video';

    video.src = filePath;
    video.load();
    applyCoverVisibility();
    video.play().catch(() => {
    });

    resetHideTimer();
}

video.addEventListener('play', () => {
    playButton.textContent = ICON_PAUSE;
    resumeFsAudio();

    if (!rpcStartedAt) {
        rpcStartedAt = Date.now();
    }

    startRpcTimer();
    reportRpc();
    applyPower();
});

video.addEventListener('pause', () => {
    playButton.textContent = ICON_PLAY;
    rpcStartedAt = 0;
    stopRpcTimer();
    reportRpc();
    applyPower();
});

video.addEventListener('ended', () => {
    playButton.textContent = ICON_PLAY;
    applyPower();

    if (currentState && currentState.repeat === 'one') {
        video.currentTime = 0;
        video.play().catch(() => {
        });
    } else {
        playNext();
    }
});

video.addEventListener('timeupdate', updateTimeline);

video.addEventListener('loadedmetadata', () => {
    applyVolume();
    updateTimeline();
    reportRpc();

    if (currentState && typeof currentState.currentTime === 'number' && currentState.currentTime > 0) {
        video.currentTime = currentState.currentTime;
        currentState.currentTime = 0;

        if (currentState.isPlaying) {
            video.play().catch(() => {
            });
        }
    }
});

video.addEventListener('durationchange', updateTimeline);

video.addEventListener('seeked', updateTimeline);

video.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePlay();
    resetHideTimer();
});

playButton.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePlay();
    playButton.blur();
    resetHideTimer();
});

volumeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleMute();
    volumeButton.blur();
    resetHideTimer();
});

fullscreenButton.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFullscreen();
    fullscreenButton.blur();
    resetHideTimer();
});

backToAudioButton.addEventListener('click', (event) => {
    event.stopPropagation();
    backToAudio();
});

if (backBtn) {
    backBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playPrev();
        backBtn.blur();
        resetHideTimer();
    });
}

if (nextBtn) {
    nextBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        playNext();
        nextBtn.blur();
        resetHideTimer();
    });
}

volumeInput.addEventListener('input', () => {
    const value = Number(volumeInput.value);

    if (value > 0) {
        savedVolume = value;
    }

    applyVolume();
    resetHideTimer();
});

timeCont.addEventListener('click', (event) => {
    event.stopPropagation();

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
        return;
    }

    const rect = timeCont.getBoundingClientRect();

    if (rect.width <= 0) {
        return;
    }

    let ratio = (event.clientX - rect.left) / rect.width;

    if (ratio < 0) {
        ratio = 0;
    }

    if (ratio > 1) {
        ratio = 1;
    }

    video.currentTime = ratio * video.duration;
    updateTimeline();
    resetHideTimer();
});

document.addEventListener('mousemove', resetHideTimer);

document.addEventListener('keydown', (event) => {
    const active = document.activeElement;

    if (active && active !== video) {
        const tag = active.tagName;

        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable) {
            return;
        }
    }

    resetHideTimer();

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
        changeVolume(5);
        return;
    }

    if (event.code === 'ArrowDown') {
        event.preventDefault();
        changeVolume(-5);
        return;
    }

    if (event.code === 'KeyM') {
        event.preventDefault();
        toggleMute();
        return;
    }

    if (event.code === 'KeyF') {
        event.preventDefault();
        toggleFullscreen();
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

    if (event.code === 'Escape') {
        backToAudio();
        return;
    }
});

if (window.parnasocial && window.parnasocial.window && typeof window.parnasocial.window.onFullScreenState === 'function') {
    window.parnasocial.window.onFullScreenState((value) => {
        isWindowFullScreen = value === true;
        updateFullscreenIcon();
    });
}

if (window.parnasocial && window.parnasocial.app && typeof window.parnasocial.app.onOpenFile === 'function') {
    window.parnasocial.app.onOpenFile(openExternalFile);
}

(async function initFullscreen() {
    ensureCoverDom();
    bindFsFirstGesture();
    applyOutputDevice();

    let pending = null;

    if (window.parnasocial && window.parnasocial.app && typeof window.parnasocial.app.getPendingFile === 'function') {
        try {
            pending = await window.parnasocial.app.getPendingFile();
        } catch (error) {
            pending = null;
        }
    }

    if (pending && typeof pending === 'string' && pending !== '') {
        const ext = extOf(pending);

        if (VIDEO_EXTS.includes(ext)) {
            currentState = {
                playlist: [{
                    name: pending.split(/[\\/]/).pop() || pending,
                    path: pending,
                    type: 'video'
                }],
                currentIndex: 0,
                repeat: 'none',
                shuffle: false,
                currentTime: 0,
                isPlaying: true,
                src: pending,
                type: 'video'
            };

            video.src = pending;
            video.load();
            applyCoverVisibility();
            video.play().catch(() => {
            });

            savedVolume = Number(volumeInput.value) > 0 ? Number(volumeInput.value) : 70;
            applyVolume();
            updateTimeline();
            updateFullscreenIcon();
            resetHideTimer();

            if (isBassOn()) {
                ensureFsBassGraph();
                applyFsBassState();
            }

            return;
        }
    }

    currentState = loadState();

    if (currentState && currentState.src) {
        video.src = currentState.src;
        video.load();
        applyCoverVisibility();

        if (typeof currentState.volume === 'number') {
            volumeInput.value = String(currentState.volume);
            savedVolume = currentState.volume > 0 ? currentState.volume : 70;
        }
    } else {
        applyCoverVisibility();
    }

    savedVolume = Number(volumeInput.value) > 0 ? Number(volumeInput.value) : 70;
    applyVolume();
    updateTimeline();
    updateFullscreenIcon();
    resetHideTimer();

    if (isBassOn()) {
        ensureFsBassGraph();
        applyFsBassState();
    }

    reportRpc();
})();