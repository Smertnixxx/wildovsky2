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
    staleMs:         600_000,  // 10 мин — после этого запись state удаляется
    cleanupMs:       120_000,  // чистка раз в 2 минуты
};

const state   = {};
const blocked = {};

// ─── периодическая чистка ────────────────────────────────────────────────
// Только итерируем уже существующие записи, не создаём новых объектов.

setInterval(() => {
    const now = Date.now();
    for (const k in state) {
        const s    = state[k];
        const last = s.timestamps.length ? s.timestamps[s.timestamps.length - 1] : s.lastScoreDecay;
        if (now - last > CFG.staleMs) delete state[k];
    }
    for (const k in blocked) {
        if (now >= blocked[k]) delete blocked[k];
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
        data[chatId][jid] = Math.max(0, (data[chatId][jid] || 0) - n);
        saveMsg(data);
    } catch {}
}

function key(chatId, jid) {
    return chatId + ':' + jid;
}

// Оптимизированный sim: без создания Map-объектов.
// Используем простой счётчик общих символов — достаточно для детекции дублей.
function sim(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 1;
    if (Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 0.4) return 0;

    // Dice coefficient через bigrams — но используем объект вместо Map (дешевле)
    const ba = {};
    for (let i = 0; i < a.length - 1; i++) {
        const g = a[i] + a[i + 1];
        ba[g] = (ba[g] || 0) + 1;
    }
    let inter = 0;
    for (let i = 0; i < b.length - 1; i++) {
        const g = b[i] + b[i + 1];
        if (ba[g] > 0) { inter++; ba[g]--; }
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
        if (now < blocked[k]) return { spam: true, remaining: Math.ceil((blocked[k] - now) / 1000) };
        delete blocked[k];
    }

    if (!state[k]) init(k);
    const s = state[k];

    decay(s);

    // Фильтрация старых timestamps без создания нового массива через filter
    let start = 0;
    while (start < s.timestamps.length && now - s.timestamps[start] >= CFG.window) start++;
    if (start > 0) s.timestamps.splice(0, start);
    s.timestamps.push(now);

    const norm = (text || '').trim().toLowerCase();

    if (norm && s.lastText && norm.length >= CFG.minDupLength && sim(norm, s.lastText) >= CFG.simThreshold) {
        s.dupCount++;
    } else {
        s.dupCount = 1;
    }
    s.lastText = norm || s.lastText;

    if (s.dupCount >= CFG.dupLimit) s.score += 3;

    if (s.timestamps.length >= CFG.minRapidSamples) {
        let sumGaps = 0;
        for (let i = 1; i < s.timestamps.length; i++) sumGaps += s.timestamps[i] - s.timestamps[i - 1];
        const avg = sumGaps / (s.timestamps.length - 1);
        if (avg < CFG.rapidMs) s.score += 2;
    }

    if (s.timestamps.length > CFG.threshold) s.score += 2;

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