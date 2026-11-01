const SETTINGS_KEY = 'parnasocial:settings';

const settingsDefaults = {
    startWithWindows: false,
    savePlaylist: true,
    keepInTray: true,
    crossfade: false,
    discordRpc: false,
    customCss: false,
    customCssContent: '',
    videoPreview: false,
    autoRatio: false,
    vizualizator: false,
    bassBoost: false,
    largeTimeline: false,
    highContrast: false,
    stayAwake: false,
    watchFolders: false,
    outputDevice: '',
    hardwareAccel: true
};

let settingsStore = Object.assign({}, settingsDefaults);

try {
    const settingsRaw = localStorage.getItem(SETTINGS_KEY);

    if (settingsRaw) {
        const parsedSettings = JSON.parse(settingsRaw);

        for (const key of Object.keys(settingsDefaults)) {
            if (typeof parsedSettings[key] === typeof settingsDefaults[key]) {
                settingsStore[key] = parsedSettings[key];
            }
        }

        if (typeof parsedSettings.visualizer === 'boolean' && typeof parsedSettings.vizualizator !== 'boolean') {
            settingsStore.vizualizator = parsedSettings.visualizer;
        }
    }
} catch (error) {
}

function persistSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsStore));
    } catch (error) {
    }
}

window.pSettings = {
    get: (key) => settingsStore[key],
    set: (key, value) => {
        if (!(key in settingsStore)) {
            return;
        }

        if (settingsStore[key] === value) {
            return;
        }

        settingsStore[key] = value;
        persistSettings();
        window.dispatchEvent(new CustomEvent('parnasocial:settings', { detail: key }));
    }
};

const startSwitch = document.querySelector('.switchsss input[type="checkbox"]');
const saveSwitch = document.querySelector('.switchccc input[type="checkbox"]');
const traySwitch = document.querySelector('.switchcccc input[type="checkbox"]');
const crossfadeSwitch = document.querySelector('.switchcc input[type="checkbox"]');
const rpcSwitch = document.querySelector('.rpc input[type="checkbox"]');
const awakeSwitch = document.querySelector('.awake input[type="checkbox"]');
const hardwareSwitch = document.querySelector('.hardware input[type="checkbox"]');
const cssSwitch = document.querySelector('.css input[type="checkbox"]');
const previewSwitch = document.querySelector('.switchvideoprew input[type="checkbox"]');
const ratioSwitch = document.querySelector('.switchautoratio input[type="checkbox"]');
const vizSwitch = document.querySelector('.switchvizual input[type="checkbox"]');
const bassSwitch = document.querySelector('.bassc input[type="checkbox"]');
const watchSwitch = document.querySelector('.watchfolders input[type="checkbox"]');
const timelineSwitch = document.querySelector('.heighttimeline input[type="checkbox"]');
const contrastSwitch = document.querySelector('.contrast input[type="checkbox"]');
const outputSelect = document.getElementById('outputdev');

let cssEditor = null;
let cssTextarea = null;
let cssPreview = null;

let predCont = null;

function syncRatioDisabled() {
    if (ratioSwitch) {
        ratioSwitch.disabled = !settingsStore.videoPreview;
    }
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isHexColor(token) {
    return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(token);
}

function highlightCss(css) {
    if (!css) {
        return '';
    }

    let out = '';
    let i = 0;
    let depth = 0;
    const n = css.length;

    while (i < n) {
        const ch = css[i];

        if (ch === '/' && css[i + 1] === '*') {
            let end = css.indexOf('*/', i + 2);
            end = end === -1 ? n : end + 2;
            out += '<span class="css-comment">' + escapeHtml(css.slice(i, end)) + '</span>';
            i = end;
            continue;
        }

        if (ch === '"' || ch === "'") {
            let j = i + 1;
            while (j < n && css[j] !== ch) {
                if (css[j] === '\\') {
                    j++;
                }
                j++;
            }
            j = Math.min(j + 1, n);
            out += '<span class="css-string">' + escapeHtml(css.slice(i, j)) + '</span>';
            i = j;
            continue;
        }

        if (ch === '@') {
            let j = i + 1;
            while (j < n && /[a-zA-Z0-9_-]/.test(css[j])) {
                j++;
            }
            out += '<span class="css-atrule">' + escapeHtml(css.slice(i, j)) + '</span>';
            i = j;
            continue;
        }

        if (ch === '#') {
            let j = i + 1;
            while (j < n && /[0-9a-fA-F]/.test(css[j])) {
                j++;
            }
            const hex = css.slice(i, j);
            if (isHexColor(hex)) {
                out += '<span class="css-color">' + escapeHtml(hex) + '</span>';
                i = j;
                continue;
            }
            let k = i + 1;
            while (k < n && /[a-zA-Z0-9_-]/.test(css[k])) {
                k++;
            }
            if (k > i + 1) {
                out += '<span class="css-id">' + escapeHtml(css.slice(i, k)) + '</span>';
                i = k;
                continue;
            }
            out += escapeHtml(ch);
            i++;
            continue;
        }

        if (ch === '.') {
            let j = i + 1;
            while (j < n && /[a-zA-Z0-9_-]/.test(css[j])) {
                j++;
            }
            if (j > i + 1) {
                out += '<span class="css-class">' + escapeHtml(css.slice(i, j)) + '</span>';
                i = j;
                continue;
            }
            out += escapeHtml(ch);
            i++;
            continue;
        }

        if (ch === ':') {
            let j = i + 1;
            while (j < n && /[a-zA-Z0-9_-]/.test(css[j])) {
                j++;
            }
            if (depth === 0 && j > i + 1) {
                out += '<span class="css-colon">:</span><span class="css-pseudo">' + escapeHtml(css.slice(i + 1, j)) + '</span>';
                i = j;
                continue;
            }
            out += '<span class="css-colon">:</span>';
            i++;
            continue;
        }

        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(css[i + 1] || ''))) {
            const numMatch = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(css.slice(i));
            if (numMatch) {
                const numEnd = i + numMatch[0].length;
                const unitMatch = /^[a-zA-Z%]+/.exec(css.slice(numEnd));
                const unit = unitMatch ? unitMatch[0] : '';
                out += '<span class="css-number">' + escapeHtml(css.slice(i, numEnd + unit.length)) + '</span>';
                i = numEnd + unit.length;
                continue;
            }
        }

        if (/[a-zA-Z_-]/.test(ch)) {
            let j = i;
            while (j < n && /[a-zA-Z0-9_-]/.test(css[j])) {
                j++;
            }
            const word = css.slice(i, j);
            let look = j;
            while (look < n && /\s/.test(css[look])) {
                look++;
            }
            if (css[look] === '(') {
                out += '<span class="css-function">' + escapeHtml(word) + '</span>';
                i = j;
                continue;
            }
            if (depth > 0 && css[look] === ':') {
                out += '<span class="css-property">' + escapeHtml(word) + '</span>';
                i = j;
                continue;
            }
            if (depth === 0) {
                out += '<span class="css-tag">' + escapeHtml(word) + '</span>';
                i = j;
                continue;
            }
            out += '<span class="css-value">' + escapeHtml(word) + '</span>';
            i = j;
            continue;
        }

        if (ch === '{') {
            depth++;
            out += '<span class="css-brace">{</span>';
            i++;
            continue;
        }

        if (ch === '}') {
            if (depth > 0) {
                depth--;
            }
            out += '<span class="css-brace">}</span>';
            i++;
            continue;
        }

        if (ch === ';') {
            out += '<span class="css-semicolon">;</span>';
            i++;
            continue;
        }

        if (ch === ',') {
            out += '<span class="css-comma">,</span>';
            i++;
            continue;
        }

        if (ch === '(' || ch === ')') {
            out += '<span class="css-paren">' + escapeHtml(ch) + '</span>';
            i++;
            continue;
        }

        out += escapeHtml(ch);
        i++;
    }

    return out;
}

function applyCustomCss() {
    let styleEl = document.getElementById('custom-css-style');

    if (!settingsStore.customCss || !settingsStore.customCssContent) {
        if (styleEl) {
            styleEl.remove();
        }
        return;
    }

    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'custom-css-style';
        document.head.appendChild(styleEl);
    }

    styleEl.textContent = settingsStore.customCssContent;
}

function createCssEditor() {
    if (cssEditor) {
        return;
    }

    cssEditor = document.createElement('div');
    cssEditor.id = 'custom-css-editor';

    cssPreview = document.createElement('pre');
    cssPreview.id = 'custom-css-preview';
    cssPreview.setAttribute('aria-hidden', 'true');

    cssTextarea = document.createElement('textarea');
    cssTextarea.id = 'custom-css-textarea';
    cssTextarea.setAttribute('spellcheck', 'false');
    cssTextarea.setAttribute('autocomplete', 'off');
    cssTextarea.setAttribute('autocorrect', 'off');
    cssTextarea.setAttribute('autocapitalize', 'off');
    cssTextarea.setAttribute('wrap', 'soft');
    cssTextarea.placeholder = '/* your css */';

    cssEditor.appendChild(cssPreview);
    cssEditor.appendChild(cssTextarea);

    const settingsMain = document.querySelector('.settings > .main');

    if (settingsMain) {
        settingsMain.appendChild(cssEditor);
    }

    cssTextarea.value = settingsStore.customCssContent || '';
    cssPreview.innerHTML = highlightCss(cssTextarea.value);

    const sync = () => {
        const value = cssTextarea.value;
        settingsStore.customCssContent = value;
        persistSettings();
        applyCustomCss();
        cssPreview.innerHTML = highlightCss(value);
        cssPreview.scrollTop = cssTextarea.scrollTop;
        cssPreview.scrollLeft = cssTextarea.scrollLeft;
    };

    cssTextarea.addEventListener('input', sync);

    cssTextarea.addEventListener('scroll', () => {
        cssPreview.scrollTop = cssTextarea.scrollTop;
        cssPreview.scrollLeft = cssTextarea.scrollLeft;
    });

    cssTextarea.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            const start = cssTextarea.selectionStart;
            const end = cssTextarea.selectionEnd;
            const value = cssTextarea.value;
            cssTextarea.value = value.slice(0, start) + '  ' + value.slice(end);
            cssTextarea.selectionStart = start + 2;
            cssTextarea.selectionEnd = start + 2;
            sync();
        }
    });
}

function showCssEditor() {
    if (!cssEditor) {
        createCssEditor();
    }

    cssEditor.style.display = 'block';
    cssTextarea.value = settingsStore.customCssContent || '';
    cssPreview.innerHTML = highlightCss(cssTextarea.value);
}

function hideCssEditor() {
    if (cssEditor) {
        cssEditor.style.display = 'none';
    }
}

function applyTimelineHeight() {
    const timecont = document.querySelector('.timecont');
    const time = document.getElementById('time');

    if (timecont) {
        timecont.style.height = settingsStore.largeTimeline ? '8px' : '';
    }

    if (time) {
        time.style.height = settingsStore.largeTimeline ? '100%' : '';
    }
}

function applyHighContrast() {
    if (settingsStore.highContrast) {
        document.documentElement.classList.add('highcontrast');
    } else {
        document.documentElement.classList.remove('highcontrast');
    }
}

function ensurePredCont() {
    if (predCont && predCont.isConnected) {
        return predCont;
    }

    const existing = document.querySelector('.predcont');

    if (existing) {
        predCont = existing;
        return predCont;
    }

    const created = document.createElement('div');
    created.className = 'predcont';
    created.innerHTML = '<div class="pred"><h1>To save the changes, you need to restart the application.</h1><p>All data and information will be preserved</p><div class="row"><button class="restart" id="restart">Restart</button><button id="skip">Skip</button></div></div>';

    if (document.body.firstChild) {
        document.body.insertBefore(created, document.body.firstChild);
    } else {
        document.body.appendChild(created);
    }

    predCont = created;

    const restartBtn = created.querySelector('#restart');
    const skipBtn = created.querySelector('#skip');

    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            if (window.parnasocial && window.parnasocial.app && typeof window.parnasocial.app.restart === 'function') {
                window.parnasocial.app.restart();
            }
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            hidePredCont();
        });
    }

    return predCont;
}

function showPredCont() {
    const cont = ensurePredCont();
    cont.style.display = '';
}

function hidePredCont() {
    if (predCont) {
        predCont.style.display = 'none';
    }
}

function hasRealOutputs(list) {
    for (const d of list) {
        if (d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications') {
            return true;
        }
    }

    return false;
}

async function requestMediaPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const tracks = stream.getTracks();

        for (const t of tracks) {
            t.stop();
        }

        return true;
    } catch (error) {
        console.log('[output] getUserMedia failed: ' + (error && error.name ? error.name : String(error)));
        return false;
    }
}

function renderOutputOptions(devices) {
    if (!outputSelect) {
        return;
    }

    const outs = devices.filter((d) => d.kind === 'audiooutput');
    const previous = outputSelect.value;

    outputSelect.innerHTML = '';

    const auto = document.createElement('option');
    auto.value = '';
    auto.textContent = 'Auto';
    outputSelect.appendChild(auto);

    const seen = new Set();

    for (const d of outs) {
        if (!d.deviceId || d.deviceId === 'default' || d.deviceId === 'communications') {
            continue;
        }

        if (seen.has(d.deviceId)) {
            continue;
        }

        seen.add(d.deviceId);

        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label ? d.label : ('Output ' + seen.size);
        outputSelect.appendChild(opt);
    }

    const stored = settingsStore.outputDevice || '';

    if (stored && Array.from(outputSelect.options).some((o) => o.value === stored)) {
        outputSelect.value = stored;
        return;
    }

    if (previous && Array.from(outputSelect.options).some((o) => o.value === previous)) {
        outputSelect.value = previous;
        return;
    }

    outputSelect.value = '';

    if (stored) {
        settingsStore.outputDevice = '';
        persistSettings();
    }
}

let populateInFlight = false;

async function populateOutputs() {
    if (!outputSelect || populateInFlight) {
        return;
    }

    populateInFlight = true;

    try {
        let devices = [];

        try {
            devices = await navigator.mediaDevices.enumerateDevices();
        } catch (error) {
            devices = [];
        }

        if (!hasRealOutputs(devices)) {
            const granted = await requestMediaPermission();

            if (granted) {
                try {
                    devices = await navigator.mediaDevices.enumerateDevices();
                } catch (error) {
                    devices = [];
                }
            }
        }

        renderOutputOptions(devices);
    } finally {
        populateInFlight = false;
    }
}

if (startSwitch) {
    startSwitch.checked = settingsStore.startWithWindows;
}

if (saveSwitch) {
    saveSwitch.checked = settingsStore.savePlaylist;
}

if (traySwitch) {
    traySwitch.checked = settingsStore.keepInTray;
}

if (crossfadeSwitch) {
    crossfadeSwitch.checked = settingsStore.crossfade;
}

if (rpcSwitch) {
    rpcSwitch.checked = settingsStore.discordRpc;
}

if (awakeSwitch) {
    awakeSwitch.checked = settingsStore.stayAwake;
}

if (hardwareSwitch) {
    hardwareSwitch.checked = settingsStore.hardwareAccel;
}

if (cssSwitch) {
    cssSwitch.checked = settingsStore.customCss;
}

if (previewSwitch) {
    previewSwitch.checked = settingsStore.videoPreview;
}

if (ratioSwitch) {
    ratioSwitch.checked = settingsStore.autoRatio;
}

if (vizSwitch) {
    vizSwitch.checked = settingsStore.vizualizator;
}

if (bassSwitch) {
    bassSwitch.checked = settingsStore.bassBoost;
}

if (watchSwitch) {
    watchSwitch.checked = settingsStore.watchFolders;
}

if (timelineSwitch) {
    timelineSwitch.checked = settingsStore.largeTimeline;
}

if (contrastSwitch) {
    contrastSwitch.checked = settingsStore.highContrast;
}

syncRatioDisabled();

if (startSwitch) {
    startSwitch.addEventListener('change', async () => {
        const value = startSwitch.checked;

        window.pSettings.set('startWithWindows', value);

        if (window.parnasocial && window.parnasocial.settings && typeof window.parnasocial.settings.setAutostart === 'function') {
            const ok = await window.parnasocial.settings.setAutostart(value);

            if (!ok) {
                startSwitch.checked = !value;
                window.pSettings.set('startWithWindows', !value);
            }
        }
    });
}

if (saveSwitch) {
    saveSwitch.addEventListener('change', () => {
        window.pSettings.set('savePlaylist', saveSwitch.checked);
    });
}

if (traySwitch) {
    traySwitch.addEventListener('change', () => {
        window.pSettings.set('keepInTray', traySwitch.checked);

        if (window.parnasocial && window.parnasocial.settings && typeof window.parnasocial.settings.setTray === 'function') {
            window.parnasocial.settings.setTray(traySwitch.checked);
        }
    });
}

if (crossfadeSwitch) {
    crossfadeSwitch.addEventListener('change', () => {
        window.pSettings.set('crossfade', crossfadeSwitch.checked);
    });
}

if (rpcSwitch) {
    rpcSwitch.addEventListener('change', () => {
        window.pSettings.set('discordRpc', rpcSwitch.checked);
    });
}

if (awakeSwitch) {
    awakeSwitch.addEventListener('change', () => {
        window.pSettings.set('stayAwake', awakeSwitch.checked);
    });
}

if (hardwareSwitch) {
    hardwareSwitch.addEventListener('change', () => {
        const value = hardwareSwitch.checked;
        window.pSettings.set('hardwareAccel', value);

        if (window.parnasocial && window.parnasocial.hardware && typeof window.parnasocial.hardware.set === 'function') {
            window.parnasocial.hardware.set(value);
        }

        showPredCont();
    });
}

if (cssSwitch) {
    cssSwitch.addEventListener('change', () => {
        const value = cssSwitch.checked;
        window.pSettings.set('customCss', value);

        if (value) {
            showCssEditor();
            applyCustomCss();
        } else {
            hideCssEditor();
            applyCustomCss();
        }
    });
}

if (previewSwitch) {
    previewSwitch.addEventListener('change', () => {
        window.pSettings.set('videoPreview', previewSwitch.checked);
        syncRatioDisabled();
    });
}

if (ratioSwitch) {
    ratioSwitch.addEventListener('change', () => {
        window.pSettings.set('autoRatio', ratioSwitch.checked);
    });
}

if (vizSwitch) {
    vizSwitch.addEventListener('change', () => {
        window.pSettings.set('vizualizator', vizSwitch.checked);
    });
}

if (bassSwitch) {
    bassSwitch.addEventListener('change', () => {
        window.pSettings.set('bassBoost', bassSwitch.checked);
    });
}

if (watchSwitch) {
    watchSwitch.addEventListener('change', () => {
        window.pSettings.set('watchFolders', watchSwitch.checked);
    });
}

if (timelineSwitch) {
    timelineSwitch.addEventListener('change', () => {
        window.pSettings.set('largeTimeline', timelineSwitch.checked);
        applyTimelineHeight();
    });
}

if (contrastSwitch) {
    contrastSwitch.addEventListener('change', () => {
        window.pSettings.set('highContrast', contrastSwitch.checked);
        applyHighContrast();
    });
}

if (outputSelect) {
    outputSelect.addEventListener('change', () => {
        window.pSettings.set('outputDevice', outputSelect.value);
    });
}

(async () => {
    if (!window.parnasocial || !window.parnasocial.settings) {
        return;
    }

    if (typeof window.parnasocial.settings.setTray === 'function') {
        window.parnasocial.settings.setTray(settingsStore.keepInTray);
    }

    if (typeof window.parnasocial.settings.getAutostart === 'function') {
        try {
            const real = await window.parnasocial.settings.getAutostart();

            if (typeof real === 'boolean' && real !== settingsStore.startWithWindows) {
                settingsStore.startWithWindows = real;
                persistSettings();

                if (startSwitch) {
                    startSwitch.checked = real;
                }
            }
        } catch (error) {
        }
    }
})();

const editorStyle = document.createElement('style');
editorStyle.id = 'custom-css-editor-style';
editorStyle.textContent = `
#custom-css-editor {
    width: 100%;
    max-width: 300px;
    height: 200px;
    margin: 8px 0 24px 0;
    position: relative;
    box-sizing: border-box;
    display: none;
}

#custom-css-preview,
#custom-css-textarea {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 8px;
    border: none;
    border-radius: 4px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    tab-size: 2;
    letter-spacing: normal;
    word-spacing: normal;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    word-break: break-word;
    font-variant-ligatures: none;
    font-feature-settings: 'liga' 0, 'clig' 0;
    overflow: auto;
}

#custom-css-preview {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    background: #1e1e1e;
    color: #d4d4d4;
    pointer-events: none;
}

#custom-css-textarea {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    resize: none;
    background: transparent;
    color: transparent;
    caret-color: #e8e8e8;
    outline: none;
}

#custom-css-textarea::placeholder {
    color: rgba(212,212,212,0.35);
}

#custom-css-textarea::selection {
    background: rgba(38,79,120,0.6);
    color: transparent;
}

#custom-css-preview::-webkit-scrollbar,
#custom-css-textarea::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

#custom-css-preview::-webkit-scrollbar-track,
#custom-css-textarea::-webkit-scrollbar-track {
    background: transparent;
}

#custom-css-preview::-webkit-scrollbar-thumb,
#custom-css-textarea::-webkit-scrollbar-thumb {
    background: rgba(127,127,127,0.4);
    border-radius: 4px;
}

.css-comment { color: #6a9955; font-style: italic; }
.css-string { color: #ce9178; }
.css-atrule { color: #c586c0; }
.css-color { color: #d7ba7d; }
.css-id { color: #d7ba7d; }
.css-class { color: #d7ba7d; }
.css-pseudo { color: #d7ba7d; }
.css-tag { color: #4ec9b0; }
.css-property { color: #9cdcfe; }
.css-function { color: #dcdcaa; }
.css-value { color: #ce9178; }
.css-number { color: #b5cea8; }
.css-colon { color: #d4d4d4; }
.css-semicolon { color: #d4d4d4; }
.css-comma { color: #d4d4d4; }
.css-paren { color: #ffd700; }
.css-brace { color: #ffd700; }
`;
document.head.appendChild(editorStyle);

applyCustomCss();
applyTimelineHeight();
applyHighContrast();

if (settingsStore.customCss) {
    showCssEditor();
}

populateOutputs();

if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
    navigator.mediaDevices.addEventListener('devicechange', () => {
        populateOutputs();
    });
}

if (outputSelect) {
    outputSelect.addEventListener('focus', () => {
        populateOutputs();
    });
}

setTimeout(() => {
    populateOutputs();
}, 2000);
ensurePredCont();
hidePredCont();