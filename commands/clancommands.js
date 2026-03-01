'use strict';

const fs   = require('fs');
const path = require('path');
const getDisplayName = require('../lib/getDisplayName');

const dbPath  = path.join(process.cwd(), 'data', 'clans.json');
const msgPath = path.join(process.cwd(), 'data', 'messageCount.json');

const CREATE_COST = 1000;

if (!global._clanPending) global._clanPending = {};
const pendingCreate = global._clanPending;

const validReactions = [
    '👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿',
    '👎', '👎🏻', '👎🏼', '👎🏽', '👎🏾', '👎🏿',
];

const LEVELS = [
    { level: 1,  xp: 0,     maxMembers: 10, officers: 0 },
    { level: 2,  xp: 1000,  maxMembers: 15, officers: 0 },
    { level: 3,  xp: 3000,  maxMembers: 20, officers: 0 },
    { level: 4,  xp: 6000,  maxMembers: 25, officers: 1 },
    { level: 5,  xp: 10000, maxMembers: 30, officers: 1 },
    { level: 6,  xp: 16000, maxMembers: 35, officers: 2 },
    { level: 7,  xp: 25000, maxMembers: 40, officers: 2 },
    { level: 8,  xp: 37000, maxMembers: 50, officers: 3 },
    { level: 9,  xp: 53000, maxMembers: 60, officers: 3 },
    { level: 10, xp: 75000, maxMembers: 75, officers: 3 },
];

// ─── In-memory кэш БД кланов ─────────────────────────────────────────────
// Читаем один раз при старте, пишем раз в 10 сек ТОЛЬКО если были изменения.
// В setInterval — никакого readFileSync. Только запись по dirty-флагу.

let _db      = null;
let _dbDirty = false;

function ensureDir() {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function initDb() {
    if (_db) return;
    ensureDir();
    if (!fs.existsSync(dbPath)) {
        _db = { clans: {}, users: {} };
        fs.writeFileSync(dbPath, JSON.stringify(_db), 'utf8');
    } else {
        try { _db = JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
        catch { _db = { clans: {}, users: {} }; }
    }
    if (!_db.clans) _db.clans = {};
    if (!_db.users) _db.users = {};
}

function loadDb() {
    initDb();
    return _db;
}

function saveDb() {
    _dbDirty = true;
}

// Только запись, никакого чтения в интервале.
setInterval(() => {
    if (_dbDirty && _db) {
        try {
            fs.writeFileSync(dbPath, JSON.stringify(_db, null, 2));
            _dbDirty = false;
        } catch (e) {
            console.error('clan db flush error:', e.message);
        }
    }
}, 10_000);

// ─── messageCount helpers ─────────────────────────────────────────────────
// НЕ кэшируем глобально — читаем по требованию (только при командах).
// Вычеты накапливаем и сбрасываем с debounce 2 секунды.

let _msgWriteTimer = null;
let _msgPending    = null;

function readMsgFile() {
    try { return JSON.parse(fs.readFileSync(msgPath, 'utf8')); }
    catch { return {}; }
}

function getMsgCount(chatId, senderId) {
    return readMsgFile()[chatId]?.[senderId] || 0;
}

function deductMsgs(chatId, senderId, amount) {
    if (!_msgPending) _msgPending = {};
    if (!_msgPending[chatId]) _msgPending[chatId] = {};
    _msgPending[chatId][senderId] = (_msgPending[chatId][senderId] || 0) + amount;

    if (_msgWriteTimer) return;
    _msgWriteTimer = setTimeout(() => {
        _msgWriteTimer = null;
        const pending = _msgPending;
        _msgPending   = null;
        if (!pending) return;
        try {
            const data = readMsgFile();
            for (const cid in pending) {
                if (!data[cid]) data[cid] = {};
                for (const jid in pending[cid]) {
                    data[cid][jid] = Math.max(0, (data[cid][jid] || 0) - pending[cid][jid]);
                }
            }
            fs.writeFileSync(msgPath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('clan deductMsgs flush error:', e.message);
        }
    }, 2000);
}

// ─── helpers ──────────────────────────────────────────────────────────────

function lvl(xp) {
    let cur = LEVELS[0];
    for (const l of LEVELS) {
        if (xp >= l.xp) cur = l;
        else break;
    }
    return cur;
}

function nextLvl(xp) {
    for (const l of LEVELS) {
        if (xp < l.xp) return l;
    }
    return null;
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function canManage(clan, jid) {
    return clan.owner === jid || (clan.officers || []).includes(jid);
}

function roleOf(clan, jid) {
    if (clan.owner === jid) return { icon: '👑', label: 'Владелец' };
    if ((clan.officers || []).includes(jid)) return { icon: '⚔️', label: 'Офицер' };
    if ((clan.veterans || []).includes(jid)) return { icon: '🛡️', label: 'Ветеран' };
    const days = (Date.now() - (clan.membersSince?.[jid] || 0)) / 86400000;
    if (days < 3) return { icon: '🌱', label: 'Новобранец' };
    return { icon: '👤', label: 'Участник' };
}

function getTarget(message) {
    return message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
           message.message?.extendedTextMessage?.contextInfo?.participant || null;
}

// ─── команды ──────────────────────────────────────────────────────────────

async function create(sock, chatId, senderId, args, message) {
    if (args.length < 3) {
        await sock.sendMessage(chatId, {
            text: '❕ Использование: .клан создать [название] [тег 5 симв] [эмодзи]\nПример: .клан создать Уточки YTOKI 🦆\n\n*Название — одно слово без пробелов*',
        }, { quoted: message });
        return;
    }

    const [name, rawTag, emblem] = args;
    const tag = rawTag.toUpperCase();

    if (/\s/.test(name)) { await sock.sendMessage(chatId, { text: '❌ Название клана должно быть одним словом без пробелов' }, { quoted: message }); return; }
    if (name.length > 15) { await sock.sendMessage(chatId, { text: '❌ Название не должно превышать 15 символов' }, { quoted: message }); return; }
    if (tag.length !== 5) { await sock.sendMessage(chatId, { text: '❌ Тег должен содержать ровно 5 символов' }, { quoted: message }); return; }

    const db   = loadDb();
    const list = Object.values(db.clans);

    if (db.users[senderId]) { await sock.sendMessage(chatId, { text: '❌ Вы уже состоите в клане' }, { quoted: message }); return; }
    if (list.some(c => c.name.toLowerCase() === name.toLowerCase())) { await sock.sendMessage(chatId, { text: '❌ Клан с таким названием уже существует' }, { quoted: message }); return; }
    if (list.some(c => c.tag === tag)) { await sock.sendMessage(chatId, { text: '❌ Клан с таким тегом уже существует' }, { quoted: message }); return; }

    const userMsgs = getMsgCount(chatId, senderId);
    if (userMsgs < CREATE_COST) {
        await sock.sendMessage(chatId, { text: `❌ Недостаточно сообщений\nНужно: *${CREATE_COST}*, у вас: *${userMsgs}*` }, { quoted: message });
        return;
    }

    const sent = await sock.sendMessage(chatId, {
        text: `🏰 *Создание клана*\n\nНазвание: *${name}*\nТег: *[${tag}]*\nЭмблема: ${emblem}\n\nСтоимость: *${CREATE_COST} сообщений*\nУ вас: *${userMsgs} сообщений*\n\nПоставьте реакцию:\n👍 — подтвердить\n👎 — отменить`,
    }, { quoted: message });

    pendingCreate[sent.key.id] = { senderId, chatId, name, tag, emblem, messageObj: sent };

    setTimeout(() => {
        if (pendingCreate[sent.key.id]) {
            delete pendingCreate[sent.key.id];
            sock.sendMessage(chatId, { text: '⌛ Время подтверждения истекло' }, { quoted: sent }).catch(() => {});
        }
    }, 3 * 60 * 1000);
}

async function handleReaction(sock, reactionMessage) {
    try {
        const messageId    = reactionMessage.message?.reactionMessage?.key?.id;
        const reactionText = reactionMessage.message?.reactionMessage?.text || '';
        if (!messageId || !pendingCreate[messageId]) return;

        const pending = pendingCreate[messageId];
        const reactor = reactionMessage.key.participant || reactionMessage.key.remoteJid;
        const chatId  = reactionMessage.key.remoteJid;

        if (reactor !== pending.senderId) return;
        if (!validReactions.includes(reactionText)) return;

        delete pendingCreate[messageId];

        if (reactionText.startsWith('👎')) {
            await sock.sendMessage(chatId, { text: '❌ Создание клана отменено' }, { quoted: pending.messageObj });
            return;
        }

        if (reactionText.startsWith('👍')) {
            const db = loadDb();
            if (db.users[pending.senderId]) { await sock.sendMessage(chatId, { text: '❌ Вы уже состоите в клане' }, { quoted: pending.messageObj }); return; }

            const userMsgs = getMsgCount(pending.chatId, pending.senderId);
            if (userMsgs < CREATE_COST) { await sock.sendMessage(chatId, { text: `❌ Недостаточно сообщений (нужно ${CREATE_COST}, у вас ${userMsgs})` }, { quoted: pending.messageObj }); return; }

            deductMsgs(pending.chatId, pending.senderId, CREATE_COST);

            const id = genId();
            db.clans[id] = {
                id, name: pending.name, tag: pending.tag, emblem: pending.emblem,
                description: '', owner: pending.senderId, officers: [], veterans: [],
                members: [pending.senderId], membersSince: { [pending.senderId]: Date.now() },
                level: 1, xp: 0, created: Date.now(),
            };
            db.users[pending.senderId] = id;
            saveDb();

            await sock.sendMessage(chatId, {
                text: `✅ Клан *[${pending.tag}] ${pending.name}* ${pending.emblem} создан!\n👑 Вы — Владелец\n💎 Списано: *${CREATE_COST} сообщений*`,
            }, { quoted: pending.messageObj });
        }
    } catch (e) {
        console.error('clan handleReaction error:', e);
    }
}

async function disband(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) { await sock.sendMessage(chatId, { text: '❌ Только владелец может распустить клан' }, { quoted: message }); return; }
    for (const m of clan.members) delete db.users[m];
    delete db.clans[clanId]; saveDb();
    await sock.sendMessage(chatId, { text: `💀 Клан *[${clan.tag}] ${clan.name}* распущен` }, { quoted: message });
}

async function transfer(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) { await sock.sendMessage(chatId, { text: '❌ Только владелец может передать права' }, { quoted: message }); return; }
    const target = getTarget(message);
    if (!target || !clan.members.includes(target) || target === senderId) { await sock.sendMessage(chatId, { text: '❕ Упомяните другого участника клана' }, { quoted: message }); return; }
    clan.owner = target; clan.officers = (clan.officers || []).filter(o => o !== target); saveDb();
    const name = await getDisplayName(sock, target);
    await sock.sendMessage(chatId, { text: `👑 Права владельца переданы *${name}*`, mentions: [target] }, { quoted: message });
}

async function setDesc(sock, chatId, senderId, args, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) { await sock.sendMessage(chatId, { text: '❌ Только владелец может изменить описание' }, { quoted: message }); return; }
    const desc = args.join(' ').trim();
    if (!desc) { await sock.sendMessage(chatId, { text: '❕ Укажите описание' }, { quoted: message }); return; }
    clan.description = desc; saveDb();
    await sock.sendMessage(chatId, { text: '✅ Описание обновлено' }, { quoted: message });
}

async function join(sock, chatId, senderId, args, message) {
    const db = loadDb();
    if (db.users[senderId]) { await sock.sendMessage(chatId, { text: '❌ Сначала выйдите из текущего клана' }, { quoted: message }); return; }
    const query = args.join(' ').trim().toLowerCase();
    if (!query) { await sock.sendMessage(chatId, { text: '❕ Укажите название или тег клана' }, { quoted: message }); return; }
    const clan = Object.values(db.clans).find(c => c.name.toLowerCase() === query || c.tag.toLowerCase() === query);
    if (!clan) { await sock.sendMessage(chatId, { text: '❌ Клан не найден' }, { quoted: message }); return; }
    const lvlData = lvl(clan.xp);
    if (clan.members.length >= lvlData.maxMembers) { await sock.sendMessage(chatId, { text: `❌ Клан заполнен (${clan.members.length}/${lvlData.maxMembers})` }, { quoted: message }); return; }
    clan.members.push(senderId);
    if (!clan.membersSince) clan.membersSince = {};
    clan.membersSince[senderId] = Date.now();
    db.users[senderId] = clan.id; saveDb();
    await sock.sendMessage(chatId, { text: `✅ Вы вступили в клан *[${clan.tag}] ${clan.name}* ${clan.emblem}` }, { quoted: message });
}

async function leave(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId];
    if (clan.owner === senderId) { await sock.sendMessage(chatId, { text: '❌ Владелец не может покинуть клан. Передайте права или распустите клан' }, { quoted: message }); return; }
    clan.members  = clan.members.filter(m => m !== senderId);
    clan.officers = (clan.officers || []).filter(o => o !== senderId);
    clan.veterans = (clan.veterans || []).filter(v => v !== senderId);
    if (clan.membersSince) delete clan.membersSince[senderId];
    delete db.users[senderId]; saveDb();
    await sock.sendMessage(chatId, { text: `✅ Вы покинули клан *[${clan.tag}] ${clan.name}*` }, { quoted: message });
}

async function invite(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId]; const target = getTarget(message);
    if (!target) { await sock.sendMessage(chatId, { text: '❕ Упомяните пользователя' }, { quoted: message }); return; }
    if (db.users[target]) { await sock.sendMessage(chatId, { text: '❌ Этот пользователь уже состоит в клане' }, { quoted: message }); return; }
    const isBlacklisted = (clan.blacklist || []).includes(target);
    if (isBlacklisted && clan.owner !== senderId) { await sock.sendMessage(chatId, { text: '❌ Этот пользователь был исключён. Только владелец клана может пригласить его обратно' }, { quoted: message }); return; }
    if (!canManage(clan, senderId)) { await sock.sendMessage(chatId, { text: '❌ Только владелец или офицер может приглашать' }, { quoted: message }); return; }
    const lvlData = lvl(clan.xp);
    if (clan.members.length >= lvlData.maxMembers) { await sock.sendMessage(chatId, { text: `❌ Клан заполнен (${clan.members.length}/${lvlData.maxMembers})` }, { quoted: message }); return; }
    clan.members.push(target);
    if (!clan.membersSince) clan.membersSince = {};
    clan.membersSince[target] = Date.now();
    if (isBlacklisted) clan.blacklist = clan.blacklist.filter(b => b !== target);
    db.users[target] = clan.id; saveDb();
    const name = await getDisplayName(sock, target);
    await sock.sendMessage(chatId, { text: `✅ *${name}* добавлен в клан *[${clan.tag}] ${clan.name}* ${clan.emblem}`, mentions: [target] }, { quoted: message });
}

async function kick(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId];
    if (!canManage(clan, senderId)) { await sock.sendMessage(chatId, { text: '❌ Только владелец или офицер может исключать' }, { quoted: message }); return; }
    const target = getTarget(message);
    if (!target) { await sock.sendMessage(chatId, { text: '❕ Упомяните участника' }, { quoted: message }); return; }
    if (target === clan.owner) { await sock.sendMessage(chatId, { text: '❌ Нельзя кикнуть владельца' }, { quoted: message }); return; }
    if (!clan.members.includes(target)) { await sock.sendMessage(chatId, { text: '❌ Этот пользователь не в вашем клане' }, { quoted: message }); return; }
    if ((clan.officers || []).includes(target) && clan.owner !== senderId) { await sock.sendMessage(chatId, { text: '❌ Офицер не может кикнуть другого офицера' }, { quoted: message }); return; }
    clan.members  = clan.members.filter(m => m !== target);
    clan.officers = (clan.officers || []).filter(o => o !== target);
    clan.veterans = (clan.veterans || []).filter(v => v !== target);
    if (clan.membersSince) delete clan.membersSince[target];
    if (!clan.blacklist) clan.blacklist = [];
    if (!clan.blacklist.includes(target)) clan.blacklist.push(target);
    delete db.users[target]; saveDb();
    const name = await getDisplayName(sock, target);
    await sock.sendMessage(chatId, { text: `✅ *${name}* исключён из клана`, mentions: [target] }, { quoted: message });
}

async function promote(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) { await sock.sendMessage(chatId, { text: '❌ Только владелец может повышать участников' }, { quoted: message }); return; }
    const target = getTarget(message);
    if (!target || !clan.members.includes(target) || target === senderId) { await sock.sendMessage(chatId, { text: '❕ Упомяните другого участника клана' }, { quoted: message }); return; }
    const name = await getDisplayName(sock, target); const lvlData = lvl(clan.xp);
    if ((clan.officers || []).includes(target)) { await sock.sendMessage(chatId, { text: `❌ *${name}* уже является офицером`, mentions: [target] }, { quoted: message }); return; }
    if ((clan.veterans || []).includes(target)) {
        if (lvlData.officers === 0) { await sock.sendMessage(chatId, { text: '❌ Офицеры разблокируются на 4 уровне клана' }, { quoted: message }); return; }
        if ((clan.officers?.length || 0) >= lvlData.officers) { await sock.sendMessage(chatId, { text: `❌ Достигнут лимит офицеров (макс. ${lvlData.officers})` }, { quoted: message }); return; }
        if (!clan.officers) clan.officers = [];
        clan.officers.push(target); clan.veterans = clan.veterans.filter(v => v !== target); saveDb();
        await sock.sendMessage(chatId, { text: `⚔️ *${name}* повышен до Офицера`, mentions: [target] }, { quoted: message }); return;
    }
    if (!clan.veterans) clan.veterans = [];
    clan.veterans.push(target); saveDb();
    await sock.sendMessage(chatId, { text: `🛡️ *${name}* получил звание Ветерана`, mentions: [target] }, { quoted: message });
}

async function demote(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) { await sock.sendMessage(chatId, { text: '❌ Только владелец может понижать участников' }, { quoted: message }); return; }
    const target = getTarget(message);
    if (!target || !clan.members.includes(target)) { await sock.sendMessage(chatId, { text: '❕ Упомяните участника клана' }, { quoted: message }); return; }
    const name = await getDisplayName(sock, target);
    if ((clan.officers || []).includes(target)) {
        clan.officers = clan.officers.filter(o => o !== target);
        if (!clan.veterans) clan.veterans = [];
        clan.veterans.push(target); saveDb();
        await sock.sendMessage(chatId, { text: `🛡️ *${name}* понижен до Ветерана`, mentions: [target] }, { quoted: message }); return;
    }
    if ((clan.veterans || []).includes(target)) {
        clan.veterans = clan.veterans.filter(v => v !== target); saveDb();
        await sock.sendMessage(chatId, { text: `👤 *${name}* понижен до Участника`, mentions: [target] }, { quoted: message }); return;
    }
    await sock.sendMessage(chatId, { text: `❌ *${name}* уже имеет минимальный ранг`, mentions: [target] }, { quoted: message });
}

async function info(sock, chatId, senderId, args, message) {
    const db = loadDb();
    let clan;
    if (args.length > 0) {
        const q = args.join(' ').toLowerCase();
        clan = Object.values(db.clans).find(c => c.name.toLowerCase() === q || c.tag.toLowerCase() === q);
    } else {
        const clanId = db.users[senderId];
        if (clanId) clan = db.clans[clanId];
    }
    if (!clan) { await sock.sendMessage(chatId, { text: '❌ Клан не найден' }, { quoted: message }); return; }
    const lvlData   = lvl(clan.xp);
    const next      = nextLvl(clan.xp);
    const ownerName = await getDisplayName(sock, clan.owner);
    const xpInfo    = next ? `${clan.xp}/${next.xp} XP` : `${clan.xp} XP (макс. уровень)`;
    const lines = [
        `${clan.emblem} *[${clan.tag}] ${clan.name}*`, ``,
        `⭐ Уровень: *${lvlData.level}/10*`,
        `💎 XP: *${xpInfo}*`,
        `👥 Участников: *${clan.members.length}/${lvlData.maxMembers}*`,
        `👑 Владелец: *${ownerName}*`,
        `📅 Создан: *${new Date(clan.created).toLocaleDateString('ru-RU')}*`,
        clan.description ? `📝 ${clan.description}` : null,
    ].filter(Boolean).join('\n');
    await sock.sendMessage(chatId, { text: lines }, { quoted: message });
}

async function myClan(sock, chatId, senderId, message) {
    const db = loadDb();
    if (!db.users[senderId]) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    await info(sock, chatId, senderId, [], message);
}

async function top(sock, chatId, message) {
    const db    = loadDb();
    const clans = Object.values(db.clans).sort((a, b) => b.xp - a.xp).slice(0, 10);
    if (clans.length === 0) { await sock.sendMessage(chatId, { text: '⚪ Кланов пока нет' }, { quoted: message }); return; }
    const medals = ['🥇', '🥈', '🥉'];
    const lines  = clans.map((c, i) => { const l = lvl(c.xp); return `${medals[i] || `${i + 1}.`} *[${c.tag}] ${c.name}* ${c.emblem}\n   ⭐ Ур.${l.level} • 💎 ${c.xp} XP • 👥 ${c.members.length} уч.`; });
    await sock.sendMessage(chatId, { text: `🏆 *Топ кланов*\n\n${lines.join('\n\n')}` }, { quoted: message });
}

async function membersList(sock, chatId, senderId, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const clan = db.clans[clanId]; const lvlData = lvl(clan.xp);
    const mentions = []; const lines = [];
    for (const jid of clan.members) {
        const name = await getDisplayName(sock, jid); const r = roleOf(clan, jid);
        lines.push(`${r.icon} *${name}* — ${r.label}`); mentions.push(jid);
    }
    await sock.sendMessage(chatId, { text: `${clan.emblem} *[${clan.tag}] ${clan.name}* — участники (${clan.members.length}/${lvlData.maxMembers})\n\n${lines.join('\n')}`, mentions }, { quoted: message });
}

async function donate(sock, chatId, senderId, args, message) {
    const db = loadDb(); const clanId = db.users[senderId];
    if (!clanId) { await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message }); return; }
    const amount   = parseInt(args[0]);
    const userMsgs = getMsgCount(chatId, senderId);
    if (!amount || amount <= 0 || isNaN(amount)) { await sock.sendMessage(chatId, { text: `❕ Использование: .клан донат [количество]\nВаших сообщений: *${userMsgs}*` }, { quoted: message }); return; }
    if (amount < 10) { await sock.sendMessage(chatId, { text: '❌ Минимальный донат — 10 сообщений' }, { quoted: message }); return; }
    if (userMsgs < amount) { await sock.sendMessage(chatId, { text: `❌ Недостаточно сообщений\nУ вас: *${userMsgs}*, нужно: *${amount}*` }, { quoted: message }); return; }
    deductMsgs(chatId, senderId, amount);
    const clan = db.clans[clanId]; const prevLvlN = lvl(clan.xp).level;
    clan.xp += amount; const newLvlN = lvl(clan.xp).level; saveDb();
    let text = `💎 Вы вложили *${amount} XP* в клан *[${clan.tag}] ${clan.name}*\nИтого XP клана: *${clan.xp}*`;
    if (newLvlN > prevLvlN) text += `\n\n🎉 Клан достиг *${newLvlN} уровня*!`;
    await sock.sendMessage(chatId, { text }, { quoted: message });
}

// ─── router ───────────────────────────────────────────────────────────────

async function handle(sock, chatId, senderId, rawText, message) {
    const parts = rawText.trim().split(/\s+/);
    const sub   = (parts[1] || '').toLowerCase();
    const args  = parts.slice(2);

    switch (sub) {
        case 'создать':    return create(sock, chatId, senderId, args, message);
        case 'распустить': return disband(sock, chatId, senderId, message);
        case 'передать':   return transfer(sock, chatId, senderId, message);
        case 'описание':   return setDesc(sock, chatId, senderId, args, message);
        case 'вступить':   return join(sock, chatId, senderId, args, message);
        case 'выйти':      return leave(sock, chatId, senderId, message);
        case 'пригласить': return invite(sock, chatId, senderId, message);
        case 'кик':        return kick(sock, chatId, senderId, message);
        case 'повысить':   return promote(sock, chatId, senderId, message);
        case 'понизить':   return demote(sock, chatId, senderId, message);
        case 'инфо':       return info(sock, chatId, senderId, args, message);
        case 'мои':        return myClan(sock, chatId, senderId, message);
        case 'топ':        return top(sock, chatId, message);
        case 'участники':  return membersList(sock, chatId, senderId, message);
        case 'донат':      return donate(sock, chatId, senderId, args, message);
        default: {
            await sock.sendMessage(chatId, {
                text: `🏰 *Кланы*\n\n` +
                    `*Управление:*\n.клан создать [название] [тег] [эмодзи]\n.клан описание [текст]\n.клан передать @user\n.клан распустить\n\n` +
                    `*Участники:*\n.клан вступить [название]\n.клан выйти\n.клан пригласить @user\n.клан кик @user\n.клан повысить @user\n.клан понизить @user\n\n` +
                    `*Инфо:*\n.клан инфо [название]\n.клан мои\n.клан топ\n.клан участники\n\n` +
                    `*Казна:*\n.клан донат [сумма]`,
            }, { quoted: message });
        }
    }
}

// Вызывается на каждое сообщение. Только in-memory операции, никакого I/O.
function trackMsg(chatId, senderId) {
    try {
        const db     = loadDb();
        const clanId = db.users[senderId];
        if (!clanId || !db.clans[clanId]) return;
        const clan    = db.clans[clanId];
        const prevLvl = lvl(clan.xp).level;
        clan.xp      += 1;
        const newLvl  = lvl(clan.xp).level;
        saveDb(); // dirty-флаг, реальная запись раз в 10 сек
        if (newLvl > prevLvl) {
            if (!global._clanLevelUp) global._clanLevelUp = {};
            global._clanLevelUp[chatId] = { clan, newLvl };
        }
    } catch (e) {
        console.error('trackMsg error:', e.message);
    }
}

module.exports = { handle, handleReaction, trackMsg };