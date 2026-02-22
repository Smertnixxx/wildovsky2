'use strict';

const fs   = require('fs');
const path = require('path');

const msgPath = path.join(process.cwd(), 'data', 'messageCount.json');

// ─── Физические константы ──────────────────────────────────────────────────

const MAX_SCORE   = 100;
const DECAY_RATE  = 8;     // очков/сек
const EMA_ALPHA   = 0.25;
const EMA_INIT_MS = 3_000;

// ─── Состояние ─────────────────────────────────────────────────────────────

// Map живёт вечно — EMA baseline на каждого юзера ценна
const users = new Map(); // jid → state

// ─── Storage ───────────────────────────────────────────────────────────────

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
        data[chatId][jid] = Math.max(0, cur - Math.floor(n));
        saveMsg(data);
    } catch (e) {
        console.error('antispam deduct:', e.message);
    }
}

// ─── Утилиты ───────────────────────────────────────────────────────────────

function sim(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim();
    b = b.toLowerCase().trim();
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;

    const bg = s => {
        const m = new Map();
        for (let i = 0; i < s.length - 1; i++) {
            const g = s.slice(i, i + 2);
            m.set(g, (m.get(g) || 0) + 1);
        }
        return m;
    };

    const ba = bg(a), bb = bg(b);
    let inter = 0;
    for (const [g, cnt] of ba) {
        if (bb.has(g)) inter += Math.min(cnt, bb.get(g));
    }
    const total = (a.length - 1) + (b.length - 1);
    return total <= 0 ? 0 : (2 * inter) / total;
}

function mkState() {
    return {
        score:        0,
        scoreTs:      Date.now(),
        emaInterval:  EMA_INIT_MS,
        lastTs:       0,
        lastText:     null,
        blockedUntil: 0,
        scorePeak:    0,
    };
}

function decayed(u, now) {
    const elapsed = (now - u.scoreTs) / 1000;
    return Math.max(0, u.score - elapsed * DECAY_RATE);
}

// ─── Основная функция ──────────────────────────────────────────────────────

function check(chatId, jid, text = '') {
    const now = Date.now();

    if (!users.has(jid)) users.set(jid, mkState());
    const u = users.get(jid);

    if (u.blockedUntil > now) {
        return { spam: true, remaining: Math.ceil((u.blockedUntil - now) / 1000) };
    }
    if (u.blockedUntil && u.blockedUntil <= now) {
        u.score        = 0;
        u.scoreTs      = now;
        u.scorePeak    = 0;
        u.blockedUntil = 0;
        // EMA не трогаем — юзер вернулся, его темп нам известен
    }

    u.score   = decayed(u, now);
    u.scoreTs = now;

    let reason   = null;
    let addScore = 0;

    // ── Интервал ────────────────────────────────────────────────────────

    const gap              = u.lastTs > 0 ? now - u.lastTs : EMA_INIT_MS;
    const anomalyThreshold = u.emaInterval * 0.35;
    u.lastTs = now;

    if (gap >= anomalyThreshold) {
        // Нормальный темп — обновляем baseline
        u.emaInterval = EMA_ALPHA * gap + (1 - EMA_ALPHA) * u.emaInterval;
        u.emaInterval = Math.max(500, Math.min(u.emaInterval, 30_000));
    } else {
        const ratio = anomalyThreshold > 0 ? gap / anomalyThreshold : 0;
        addScore += Math.round((1 - ratio) * 35);
        reason = 'rapid';
    }

    // ── Дубли ───────────────────────────────────────────────────────────

    const norm = (text || '').trim().toLowerCase();
    if (norm && u.lastText !== null) {
        const s = sim(norm, u.lastText);
        if (s >= 0.75) {
            addScore += Math.round((s - 0.75) / 0.25 * 15 + 15);
            if (!reason) reason = 'duplicate';
        }
    }
    if (norm) u.lastText = norm;

    // ── Score + блок ────────────────────────────────────────────────────

    u.score += addScore;
    if (u.score > u.scorePeak) u.scorePeak = u.score;

    if (u.score >= MAX_SCORE) {
        const overflow  = Math.max(0, u.scorePeak - MAX_SCORE);
        const timeoutMs = Math.min(300_000, 30_000 + overflow * 600);

        deduct(chatId, jid, Math.ceil(u.score / 10));

        u.blockedUntil = now + timeoutMs;
        u.score        = 0;
        u.scoreTs      = now;
        u.scorePeak    = 0;

        return {
            spam:      true,
            reason:    reason || 'flood',
            remaining: Math.ceil(timeoutMs / 1000),
        };
    }

    return { spam: false };
}

// ─── Хелперы ───────────────────────────────────────────────────────────────

function remaining(jid) {
    const u = users.get(jid);
    if (!u) return 0;
    const now = Date.now();
    if (!u.blockedUntil || now >= u.blockedUntil) return 0;
    return Math.ceil((u.blockedUntil - now) / 1000);
}

function isBlocked(jid) {
    return remaining(jid) > 0;
}

function unblock(jid) {
    const u = users.get(jid);
    if (!u) return;
    u.blockedUntil = 0;
    u.score        = 0;
    u.scorePeak    = 0;
}

function debug(jid) {
    const u = users.get(jid);
    if (!u) return null;
    const now = Date.now();
    return {
        score:     Math.round(decayed(u, now)),
        ema:       Math.round(u.emaInterval),
        blocked:   u.blockedUntil > now,
        remaining: remaining(jid),
        total:     users.size,
    };
}

module.exports = { check, isBlocked, remaining, unblock, debug };