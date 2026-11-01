const { ipcMain } = require('electron');
const net = require('net');

const CLIENT_ID = '1566346807276081162';
const ASSET_KEY = 'parnasocial';
const RECONNECT_MS = 5000;
const SEND_INTERVAL_MS = 15000;
const DOWNLOAD_URL = 'https://github.com/vexikoff/parnasocial';

let socket = null;
let connected = false;
let enabled = false;
let lastPayload = null;
let wantClear = false;
let degraded = false;
let lastSendAt = 0;
let trailingTimer = null;
let reconnectTimer = null;
let nonce = 0;
let buffer = Buffer.alloc(0);
let trackedSender = null;

function log(message) {
    console.log('[rpc] ' + message);
}

function pipeName(index) {
    return '\\\\?\\pipe\\discord-ipc-' + index;
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

function writeFrame(opcode, payload) {
    if (!socket) {
        return;
    }

    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode, 0);
    header.writeUInt32LE(body.length, 4);

    try {
        socket.write(Buffer.concat([header, body]));
    } catch (error) {
    }
}

function nextNonce() {
    nonce += 1;
    return String(nonce);
}

function buildActivity() {
    const p = lastPayload;

    const activity = {
        details: p.title || 'Parnasocial',
        state: p.mode === 'video' ? 'Parnasocial' : (p.artist || 'Parnasocial'),
        assets: {
            large_image: ASSET_KEY,
            large_text: formatTime(p.currentTime || 0) + ' / ' + formatTime(p.duration || 0)
        }
    };

    if (!degraded) {
        activity.type = p.mode === 'video' ? 3 : 2;
        activity.buttons = [
            {
                label: 'Скачать',
                url: DOWNLOAD_URL
            }
        ];
    }

    if (p.playing && p.startedAt) {
        activity.timestamps = {
            start: p.startedAt
        };
    }

    return activity;
}

function flush() {
    lastSendAt = Date.now();

    if (wantClear) {
        wantClear = false;
        log('clear activity');
        writeFrame(1, {
            cmd: 'SET_ACTIVITY',
            args: {
                pid: process.pid,
                activity: null
            },
            nonce: nextNonce()
        });
        return;
    }

    if (!lastPayload) {
        return;
    }

    log('set activity: ' + (lastPayload.title || 'empty'));
    writeFrame(1, {
        cmd: 'SET_ACTIVITY',
        args: {
            pid: process.pid,
            activity: buildActivity()
        },
        nonce: nextNonce()
    });
}

function scheduleSend() {
    if (!connected) {
        return;
    }

    const wait = SEND_INTERVAL_MS - (Date.now() - lastSendAt);

    if (wait <= 0) {
        flush();
        return;
    }

    if (trailingTimer) {
        return;
    }

    trailingTimer = setTimeout(() => {
        trailingTimer = null;
        flush();
    }, wait);
}

function scheduleReconnect() {
    if (reconnectTimer || !enabled) {
        return;
    }

    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;

        if (enabled && !connected && !socket) {
            connect(0);
        }
    }, RECONNECT_MS);
}

function handleFrames() {
    while (buffer.length >= 8) {
        const opcode = buffer.readUInt32LE(0);
        const len = buffer.readUInt32LE(4);

        if (buffer.length < 8 + len) {
            break;
        }

        const body = buffer.slice(8, 8 + len);
        buffer = buffer.slice(8 + len);

        if (opcode === 1) {
            let parsed = null;

            try {
                parsed = JSON.parse(body.toString('utf8'));
            } catch (error) {
            }

            if (parsed && parsed.evt === 'ERROR' && !degraded && lastPayload) {
                degraded = true;
                log('discord rejected payload, retry minimal');
                flush();
                continue;
            }

            if (!connected) {
                connected = true;
                log('ready');
                scheduleSend();
            }
        } else if (opcode === 2) {
            disconnect();
        }
    }
}

function disconnect() {
    connected = false;

    if (socket) {
        try {
            socket.destroy();
        } catch (error) {
        }

        socket = null;
    }

    buffer = Buffer.alloc(0);
    scheduleReconnect();
}

function connect(index) {
    if (connected || socket) {
        return;
    }

    if (index > 9) {
        scheduleReconnect();
        return;
    }

    const sock = net.createConnection(pipeName(index));
    socket = sock;

    sock.on('connect', () => {
        buffer = Buffer.alloc(0);
        log('pipe ' + index + ' connected');
        writeFrame(0, {
            v: 1,
            client_id: CLIENT_ID
        });
    });

    sock.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        handleFrames();
    });

    sock.on('error', () => {
        if (socket === sock) {
            socket = null;
            connected = false;
            buffer = Buffer.alloc(0);
            connect(index + 1);
        } else {
            try {
                sock.destroy();
            } catch (error) {
            }
        }
    });

    sock.on('close', () => {
        if (socket === sock) {
            disconnect();
        }
    });
}

function trackSender(sender) {
    if (trackedSender === sender) {
        return;
    }

    trackedSender = sender;

    sender.once('destroyed', () => {
        trackedSender = null;
        enabled = false;
        lastPayload = null;
        wantClear = true;
        scheduleSend();
    });
}

ipcMain.on('parnasocial:rpc:update', (event, payload) => {
    if (!payload || typeof payload !== 'object') {
        return;
    }

    trackSender(event.sender);

    if (payload.enabled !== true) {
        enabled = false;
        lastPayload = null;
        wantClear = true;
        scheduleSend();
        return;
    }

    enabled = true;
    lastPayload = payload;
    wantClear = false;

    if (!connected && !socket) {
        connect(0);
    }

    scheduleSend();
});