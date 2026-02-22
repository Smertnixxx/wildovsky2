'use strict';

const fs   = require('fs');
const path = require('path');

const msgPath = path.join(process.cwd(), 'data', 'messageCount.json');

// ─── Конфиг ────────────────────────────────────────────────────────────────

const CFG = {
    // Флуд по частоте
    window:    8_000,   // окно наблюдения, мс
    threshold: 5,       // сколько сообщений в окне = спам

    // Флуд по скорости: если 2 сообщения подряд быстрее N мс — счётчик быстрых растёт
    rapidMs:   1_200,   // порог "быстро", мс
    rapidLimit: 4,      // сколько подряд "быстрых" = спам

    // Дубли: сколько одинаковых/похожих сообщений подряд = спам
    dupLimit:  4,
    // порог похожести (0..1): 1 = только точные совпадения, 0.7 = похожие
    simThreshold: 0.80,

    // Штраф
    timeoutMs: 60_000,  // 1 минута
};

// ─── Состояние (in-memory) ─────────────────────────────────────────────────

// key = jid
const state   = {};   // { timestamps[], lastText, dupCount, rapidCount, lastTs }
const blocked = {};   // { jid: unblockAt }

// ─── Хранилище ─────────────────────────────────────────────────────────────

function loadMsg() {
    try { return JSON.parse(fs.readFileSync(msgPath, 'utf8')); }
    catch { return {}; }
}

function saveMsg(data) {
    try { fs.writeFileSync(msgPath, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('antispam saveMsg:', e.message); }
}

function deduct(chatId, jid, n) {
    try {
        const data = loadMsg();
        if (!data[chatId]) return;
        const cur = data[chatId][jid] || 0;
        data[chatId][jid] = Math.max(0, cur - n);
        saveMsg(data);
    } catch (e) {
        console.error('antispam deduct:', e.message);
    }
}

// ─── Утилиты ───────────────────────────────────────────────────────────────

// Простая мера похожести двух строк (Dice coefficient по биграммам)
function sim(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 1;

    const bigrams = s => {
        const set = new Map();
        for (let i = 0; i < s.length - 1; i++) {
            const g = s.slice(i, i + 2);
            set.set(g, (set.get(g) || 0) + 1);
        }
        return set;
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

function initState(jid) {
    state[jid] = { timestamps: [], lastText: null, dupCount: 0, rapidCount: 0, lastTs: 0 };
}

function block(chatId, jid, spamCount, reason) {
    deduct(chatId, jid, spamCount);
    blocked[jid] = Date.now() + CFG.timeoutMs;
    delete state[jid];
    return {
        spam: true,
        reason,
        spamCount,
        remaining: Math.ceil(CFG.timeoutMs / 1000),
    };
}

// ─── Основная функция ──────────────────────────────────────────────────────

/**
 * @param {string} chatId
 * @param {string} jid
 * @param {string} [text]  — текст сообщения (для проверки дублей)
 * @returns {{ spam: boolean, reason?: string, spamCount?: number, remaining?: number }}
 */
function check(chatId, jid, text = '') {
    const now = Date.now();

    // Проверяем таймаут
    if (blocked[jid]) {
        if (now < blocked[jid]) {
            return { spam: true, remaining: Math.ceil((blocked[jid] - now) / 1000) };
        }
        delete blocked[jid];
    }

    if (!state[jid]) initState(jid);
    const s = state[jid];

    // 1. Очищаем старые метки из окна
    s.timestamps = s.timestamps.filter(t => now - t < CFG.window);
    s.timestamps.push(now);

    // 2. Проверка быстрых сообщений подряд
    const gap = now - s.lastTs;
    s.lastTs = now;

    if (gap > 0 && gap < CFG.rapidMs) {
        s.rapidCount++;
    } else {
        s.rapidCount = 1;
    }

    // 3. Проверка дублей/похожих сообщений
    const norm = (text || '').trim().toLowerCase();
    if (norm && s.lastText !== null) {
        if (sim(norm, s.lastText) >= CFG.simThreshold) {
            s.dupCount++;
        } else {
            s.dupCount = 1;
        }
    } else {
        s.dupCount = 1;
    }
    s.lastText = norm || s.lastText;

    // ── Триггеры ──

    if (s.dupCount >= CFG.dupLimit) {
        const cnt = s.timestamps.length;
        return block(chatId, jid, cnt, 'duplicate');
    }

    if (s.rapidCount >= CFG.rapidLimit) {
        const cnt = s.timestamps.length;
        return block(chatId, jid, cnt, 'rapid');
    }

    if (s.timestamps.length > CFG.threshold) {
        const cnt = s.timestamps.length;
        return block(chatId, jid, cnt, 'flood');
    }

    return { spam: false };
}

// ─── Хелперы ───────────────────────────────────────────────────────────────

function remaining(jid) {
    const now = Date.now();
    if (!blocked[jid] || now >= blocked[jid]) return 0;
    return Math.ceil((blocked[jid] - now) / 1000);
}

function isBlocked(jid) {
    return remaining(jid) > 0;
}

function unblock(jid) {
    delete blocked[jid];
    delete state[jid];
}

module.exports = { check, isBlocked, remaining, unblock };