'use strict';

const fs   = require('fs');
const path = require('path');

const msgPath = path.join(process.cwd(), 'data', 'messageCount.json');

const CFG = {
    window:          12_000,
    threshold:       7,
    rapidMs:         900,
    minRapidSamples: 4,
    dupLimit:        3,
    simThreshold:    0.9,
    minDupLength:    8,
    scoreLimit:      5,
    scoreDecayMs:    10_000,
    timeoutMs:       180_000,

    // Через сколько мс неактивная запись из state удаляется
    staleMs:        600_000,  // 10 минут
    cleanupMs:      120_000,  // чистка каждые 2 минуты
};

const state   = {};
const blocked = {};

// ─── периодическая чистка ─────────────────────────────────────────────────

setInterval(() => {
    const now = Date.now();

    // Чистим протухшие state-записи
    for (const k in state) {
        const s = state[k];
        const last = s.timestamps.length ? s.timestamps[s.timestamps.length - 1] : s.lastScoreDecay;
        if (now - last > CFG.staleMs) {
            delete state[k];
        }
    }

    // Чистим истёкшие блокировки
    for (const k in blocked) {
        if (now >= blocked[k]) {
            delete blocked[k];
        }
    }
}, CFG.cleanupMs);

// ─── helpers ──────────────────────────────────────────────────────────────

function loadMsg() {
    try { return JSON.parse(fs.readFileSync(msgPath, 'utf8')); }
    catch { return {}; }
}

function saveMsg(data) {
    try { fs.writeFileSync(msgPath, JSON.stringify(data, null, 2)); }
    catch {}
}

function deduct(chatId, jid, n) {
    try {
        const data = loadMsg();
        if (!data[chatId]) return;
        const cur = data[chatId][jid] || 0;
        data[chatId][jid] = Math.max(0, cur - n);
        saveMsg(data);
    } catch {}
}

function key(chatId, jid) {
    return chatId + ':' + jid;
}

function sim(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 1;

    const bigrams = s => {
        const map = new Map();
        for (let i = 0; i < s.length - 1; i++) {
            const g = s.slice(i, i + 2);
            map.set(g, (map.get(g) || 0) + 1);
        }
        return map;
    };

    const ba = bigrams(a);
    const bb = bigrams(b);
    let inter = 0;

    for (const [g, cnt] of ba) {
        if (bb.has(g)) inter += Math.min(cnt, bb.get(g));
    }

    const total = (a.length - 1) + (b.length - 1);
    return total <= 0 ? 0 : (2 * inter) / total;
}

function init(k) {
    state[k] = {
        timestamps:     [],
        lastText:       null,
        dupCount:       0,
        score:          0,
        lastScoreDecay: Date.now(),
    };
}

function decay(s) {
    const now = Date.now();
    if (now - s.lastScoreDecay >= CFG.scoreDecayMs) {
        s.score = Math.max(0, s.score - 1);
        s.lastScoreDecay = now;
    }
}

function block(chatId, jid, spamCount, reason) {
    deduct(chatId, jid, spamCount);
    const k = key(chatId, jid);
    blocked[k] = Date.now() + CFG.timeoutMs;
    delete state[k];
    return { spam: true, reason, spamCount, remaining: Math.ceil(CFG.timeoutMs / 1000) };
}

// ─── public API ───────────────────────────────────────────────────────────

function check(chatId, jid, text = '') {
    const now = Date.now();
    const k   = key(chatId, jid);

    if (blocked[k]) {
        if (now < blocked[k]) {
            return { spam: true, remaining: Math.ceil((blocked[k] - now) / 1000) };
        }
        delete blocked[k];
    }

    if (!state[k]) init(k);
    const s = state[k];

    decay(s);

    s.timestamps = s.timestamps.filter(t => now - t < CFG.window);
    s.timestamps.push(now);

    const norm = (text || '').trim().toLowerCase();

    if (
        norm &&
        s.lastText &&
        norm.length >= CFG.minDupLength &&
        sim(norm, s.lastText) >= CFG.simThreshold
    ) {
        s.dupCount++;
    } else {
        s.dupCount = 1;
    }

    s.lastText = norm || s.lastText;

    if (s.dupCount >= CFG.dupLimit)                       s.score += 3;
    if (s.timestamps.length >= CFG.minRapidSamples) {
        const gaps = [];
        for (let i = 1; i < s.timestamps.length; i++) gaps.push(s.timestamps[i] - s.timestamps[i - 1]);
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        if (avg < CFG.rapidMs)                            s.score += 2;
    }
    if (s.timestamps.length > CFG.threshold)              s.score += 2;

    if (s.score >= CFG.scoreLimit) return block(chatId, jid, s.timestamps.length, 'score_limit');

    return { spam: false };
}

function remaining(chatId, jid) {
    const k   = key(chatId, jid);
    const now = Date.now();
    if (!blocked[k] || now >= blocked[k]) return 0;
    return Math.ceil((blocked[k] - now) / 1000);
}

function isBlocked(chatId, jid) {
    return remaining(chatId, jid) > 0;
}

function unblock(chatId, jid) {
    const k = key(chatId, jid);
    delete blocked[k];
    delete state[k];
}

module.exports = { check, isBlocked, remaining, unblock };