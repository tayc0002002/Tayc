const path = require("path");
const { GETPRIVACY, LOADSETTINGS } = require("../../lib/myfunc");
const fs = require('fs');
const ALL_SETTINGS_PATH = path.join(__dirname, '../db/settings.json');

let globalForwardState = {
    isRunning: false,
    stopSignal: false,
    sent: 0,
    error: 0,
    total: 0,
    est: undefined
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function estimateForwardTime(count) {
    const base = 8; // seconds
    const jitter = 4; // +/- 2s => moyenne = 10s
    const pauseEvery = 100;
    const pauseDuration = 2 * 60; // secondes
    const fullPauseCount = Math.floor(count / pauseEvery);
    const total = count * (base + jitter / 2) + fullPauseCount * pauseDuration;

    return {
        seconds: Math.round(total),
        human: msToTime(total * 1000)
    };
}

function msToTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function getForwardStatus() {
    return globalForwardState.isRunning
        ? {
            ...globalForwardState,
            remaining: globalForwardState.total - globalForwardState.sent
        }
        : null;
}

function MakeItGlobal() {
    global.globalForwardState = globalForwardState
}

function stopForwarding() {
    globalForwardState.stopSignal = true;
MakeItGlobal()
    return true;
}

/**
 * 
 * @param {import("@whiskeysockets/baileys").SocketConfig} Tayc 
 * @param {Array<String>} Jids 
 * @param {String} mess 
 * @returns Object
 */
async function FORWARDMESSAGE(Tayc, Jids, mess) {
    if (Jids.length > 700) return { error: true, msg: '*Too many numbers. Split them first.*' };
    if (globalForwardState.isRunning) return { error: true, msg: '*A forward is already in progress.*' };

    const settings = LOADSETTINGS();
    const lastForwarding = new Date(settings.lastforwarding);
    const diff = Date.now() - lastForwarding.getTime();
    if (diff < 30 * 60 * 1000)
        return { error: true, msg: '*Please wait 30 minutes before next broadcast.*' };

    const est = estimateForwardTime(Jids.length);
    globalForwardState = {
        isRunning: true,
        stopSignal: false,
        sent: 0,
        error: 0,
        total: Jids.length,
        est
    };

    const success = [], error = [];

    for (let i = 0; i < Jids.length; i++) {
        const jid = Jids[i];
        if (globalForwardState.stopSignal) break;

        try {
            await Tayc.sendMessage(jid, { text: mess });
            success.push(jid);
            globalForwardState.sent++;
        } catch (e) {
            error.push(jid);
            globalForwardState.error++;
        }

        if (i > 0 && i % 100 === 0) {
            const rest = 1.5 + Math.random();
            await sleep(rest * 60 * 1000);
        } else {
            const delay = 8000 + (Math.random() * 4000 - 2000); // entre 6s et 10s
            await sleep(delay);
        }
        MakeItGlobal()
    }

    globalForwardState.isRunning = false;
    globalForwardState.stopSignal = false;
    globalForwardState.est = undefined;
    MakeItGlobal();
    fs.writeFileSync(ALL_SETTINGS_PATH, JSON.stringify({ ...settings, lastforwarding: new Date() }, null, 2));

    const response = `✅ *Forward complete*\n- Success: ${success.length}\n- Error: ${error.length}\n\n🧾 Success: ${success
        .map(j => '@' + j.split('@')[0])
        .join('\n')}\n\n❌ Error: ${error.map(j => '@' + j.split('@')[0]).join('\n')}`;

    Tayc.sendMessage(Tayc.user.id, { text: response, mentions: [...success, ...error] });
    return { success, error };
}

module.exports = {
    FORWARDMESSAGE,
    estimateForwardTime,
    getForwardStatus,
    stopForwarding
};
