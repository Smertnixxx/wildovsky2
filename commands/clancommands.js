const fs = require('fs');
const path = require('path');
const getDisplayName = require('../lib/getDisplayName');

const dbPath = path.join(process.cwd(), 'data', 'clans.json');
const msgPath = path.join(process.cwd(), 'data', 'clanmessages.json');

const pendingCreate = {};

const validReactions = [
    '👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿',
    '👎', '👎🏻', '👎🏼', '👎🏽', '👎🏾', '👎🏿'
];

const CREATE_COST = 1000;
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

// ─── db ───────────────────────────────────────────────────────────────

function initDb() {
    const dir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify({ clans: {}, users: {} }), 'utf8');
    if (!fs.existsSync(msgPath)) fs.writeFileSync(msgPath, JSON.stringify({}), 'utf8');
}

function loadDb() {
    try { return JSON.parse(fs.readFileSync(dbPath, 'utf8')); }
    catch { return { clans: {}, users: {} }; }
}

function saveDb(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

function loadMsg() {
    try { return JSON.parse(fs.readFileSync(msgPath, 'utf8')); }
    catch { return {}; }
}

function saveMsg(data) {
    fs.writeFileSync(msgPath, JSON.stringify(data, null, 2));
}

// ─── helpers ──────────────────────────────────────────────────────────

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

// ─── message counter (для доната) ─────────────────────────────────────

function addMsg(jid) {
    initDb();
    const data = loadMsg();
    data[jid] = (data[jid] || 0) + 1;
    saveMsg(data);
}

function getMsg(jid) {
    const data = loadMsg();
    return data[jid] || 0;
}

// ─── команды ──────────────────────────────────────────────────────────

async function create(sock, chatId, senderId, args, message) {
    if (args.length < 3) {
        await sock.sendMessage(chatId, {
            text: '❕ Использование: .клан создать [название] [тег 5 симв] [эмодзи]\nПример: .клан создать Уточки YKTI 🦆'
        }, { quoted: message });
        return;
    }

    initDb();
    const db = loadDb();

    if (db.users[senderId]) {
        await sock.sendMessage(chatId, { text: '❌ Вы уже состоите в клане' }, { quoted: message });
        return;
    }

    const [name, rawTag, emblem] = args;
    const tag = rawTag.toUpperCase();

    if (name.length > 15) {
        await sock.sendMessage(chatId, { text: '❌ Название не должно превышать 15 символов' }, { quoted: message });
        return;
    }
    if (tag.length !== 5) {
        await sock.sendMessage(chatId, { text: '❌ Тег должен содержать ровно 5 символов' }, { quoted: message });
        return;
    }

    const list = Object.values(db.clans);
    if (list.some(c => c.name.toLowerCase() === name.toLowerCase())) {
        await sock.sendMessage(chatId, { text: '❌ Клан с таким названием уже существует' }, { quoted: message });
        return;
    }
    if (list.some(c => c.tag === tag)) {
        await sock.sendMessage(chatId, { text: '❌ Клан с таким тегом уже существует' }, { quoted: message });
        return;
    }

    const userMsgs = getMsg(senderId);
    if (userMsgs < CREATE_COST) {
        await sock.sendMessage(chatId, {
            text: `❌ Недостаточно сообщений для создания клана\nНужно: *${CREATE_COST}*, у вас: *${userMsgs}*`
        }, { quoted: message });
        return;
    }

    // Отправляем запрос подтверждения
    const sent = await sock.sendMessage(chatId, {
        text: `🏰 *Создание клана*\n\n` +
              `Название: *${name}*\n` +
              `Тег: *[${tag}]*\n` +
              `Эмблема: ${emblem}\n\n` +
              `Стоимость: *${CREATE_COST} сообщений*\n` +
              `У вас: *${userMsgs} сообщений*\n\n` +
              `Поставьте реакцию на это сообщение:\n` +
              `👍 — подтвердить создание\n` +
              `👎 — отменить`
    }, { quoted: message });

    pendingCreate[sent.key.id] = {
        senderId,
        name,
        tag,
        emblem,
        messageObj: sent
    };

    // Таймаут 3 минуты
    setTimeout(() => {
        if (pendingCreate[sent.key.id]) {
            delete pendingCreate[sent.key.id];
            sock.sendMessage(chatId, {
                text: '⌛ Время подтверждения создания клана истекло'
            }, { quoted: sent }).catch(() => {});
        }
    }, 3 * 60 * 1000);
}

async function handleReaction(sock, reactionMessage) {
    try {
        const messageId = reactionMessage.message?.reactionMessage?.key?.id;
        const reactionText = reactionMessage.message?.reactionMessage?.text || '';
        if (!messageId || !pendingCreate[messageId]) return;

        const pending = pendingCreate[messageId];
        const reactor = reactionMessage.key.participant || reactionMessage.key.remoteJid;
        const chatId = reactionMessage.key.remoteJid;

        // Реагировать может только тот кто создавал
        if (reactor !== pending.senderId) return;
        if (!validReactions.includes(reactionText)) return;

        delete pendingCreate[messageId];

        if (reactionText.startsWith('👎')) {
            await sock.sendMessage(chatId, {
                text: '❌ Создание клана отменено'
            }, { quoted: pending.messageObj });
            return;
        }

        if (reactionText.startsWith('👍')) {
            initDb();
            const db = loadDb();

            if (db.users[pending.senderId]) {
                await sock.sendMessage(chatId, { text: '❌ Вы уже состоите в клане' }, { quoted: pending.messageObj });
                return;
            }

            const userMsgs = getMsg(pending.senderId);
            if (userMsgs < CREATE_COST) {
                await sock.sendMessage(chatId, {
                    text: `❌ Недостаточно сообщений (нужно ${CREATE_COST}, у вас ${userMsgs})`
                }, { quoted: pending.messageObj });
                return;
            }

            // Списываем сообщения
            const msgData = loadMsg();
            msgData[pending.senderId] = (msgData[pending.senderId] || 0) - CREATE_COST;
            saveMsg(msgData);

            const id = genId();
            db.clans[id] = {
                id,
                name: pending.name,
                tag: pending.tag,
                emblem: pending.emblem,
                description: '',
                owner: pending.senderId,
                officers: [],
                veterans: [],
                members: [pending.senderId],
                membersSince: { [pending.senderId]: Date.now() },
                level: 1,
                xp: 0,
                created: Date.now()
            };
            db.users[pending.senderId] = id;
            saveDb(db);

            await sock.sendMessage(chatId, {
                text: `✅ Клан *[${pending.tag}] ${pending.name}* ${pending.emblem} создан!\n👑 Вы — Владелец\n💎 Списано: *${CREATE_COST} сообщений*\nОсталось: *${msgData[pending.senderId]}*`
            }, { quoted: pending.messageObj });
        }

    } catch (e) {
        console.error('clan handleReaction error:', e);
    }
}

async function disband(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец может распустить клан' }, { quoted: message });
        return;
    }

    for (const m of clan.members) delete db.users[m];
    delete db.clans[clanId];
    saveDb(db);

    await sock.sendMessage(chatId, {
        text: `💀 Клан *[${clan.tag}] ${clan.name}* распущен`
    }, { quoted: message });
}

async function transfer(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец может передать права' }, { quoted: message });
        return;
    }

    const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                   message.message?.extendedTextMessage?.contextInfo?.participant;

    if (!target || !clan.members.includes(target) || target === senderId) {
        await sock.sendMessage(chatId, { text: '❕ Упомяните другого участника клана' }, { quoted: message });
        return;
    }

    clan.owner = target;
    clan.officers = clan.officers.filter(o => o !== target);
    saveDb(db);

    const name = await getDisplayName(sock, target);
    await sock.sendMessage(chatId, {
        text: `👑 Права владельца переданы *${name}*`,
        mentions: [target]
    }, { quoted: message });
}

async function setDesc(sock, chatId, senderId, args, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец может изменить описание' }, { quoted: message });
        return;
    }

    const desc = args.join(' ').trim();
    if (!desc) {
        await sock.sendMessage(chatId, { text: '❕ Укажите описание' }, { quoted: message });
        return;
    }

    clan.description = desc;
    saveDb(db);
    await sock.sendMessage(chatId, { text: '✅ Описание обновлено' }, { quoted: message });
}

async function join(sock, chatId, senderId, args, message) {
    initDb();
    const db = loadDb();
    if (db.users[senderId]) {
        await sock.sendMessage(chatId, { text: '❌ Сначала выйдите из текущего клана' }, { quoted: message });
        return;
    }

    const query = args.join(' ').trim().toLowerCase();
    if (!query) {
        await sock.sendMessage(chatId, { text: '❕ Укажите название или тег клана' }, { quoted: message });
        return;
    }

    const clan = Object.values(db.clans).find(c =>
        c.name.toLowerCase() === query || c.tag.toLowerCase() === query
    );
    if (!clan) {
        await sock.sendMessage(chatId, { text: '❌ Клан не найден' }, { quoted: message });
        return;
    }

    const lvlData = lvl(clan.xp);
    if (clan.members.length >= lvlData.maxMembers) {
        await sock.sendMessage(chatId, {
            text: `❌ Клан заполнен (${clan.members.length}/${lvlData.maxMembers})`
        }, { quoted: message });
        return;
    }

    clan.members.push(senderId);
    if (!clan.membersSince) clan.membersSince = {};
    clan.membersSince[senderId] = Date.now();
    db.users[senderId] = clan.id;
    saveDb(db);

    await sock.sendMessage(chatId, {
        text: `✅ Вы вступили в клан *[${clan.tag}] ${clan.name}* ${clan.emblem}`
    }, { quoted: message });
}

async function leave(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (clan.owner === senderId) {
        await sock.sendMessage(chatId, { text: '❌ Владелец не может покинуть клан. Передайте права или распустите клан' }, { quoted: message });
        return;
    }

    clan.members = clan.members.filter(m => m !== senderId);
    clan.officers = clan.officers.filter(o => o !== senderId);
    clan.veterans = (clan.veterans || []).filter(v => v !== senderId);
    if (clan.membersSince) delete clan.membersSince[senderId];
    delete db.users[senderId];
    saveDb(db);

    await sock.sendMessage(chatId, {
        text: `✅ Вы покинули клан *[${clan.tag}] ${clan.name}*`
    }, { quoted: message });
}

async function invite(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (!canManage(clan, senderId)) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец или офицер может приглашать' }, { quoted: message });
        return;
    }

    const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                   message.message?.extendedTextMessage?.contextInfo?.participant;

    if (!target) {
        await sock.sendMessage(chatId, { text: '❕ Упомяните пользователя' }, { quoted: message });
        return;
    }
    if (db.users[target]) {
        await sock.sendMessage(chatId, { text: '❌ Этот пользователь уже состоит в клане' }, { quoted: message });
        return;
    }

    const lvlData = lvl(clan.xp);
    if (clan.members.length >= lvlData.maxMembers) {
        await sock.sendMessage(chatId, {
            text: `❌ Клан заполнен (${clan.members.length}/${lvlData.maxMembers})`
        }, { quoted: message });
        return;
    }

    clan.members.push(target);
    if (!clan.membersSince) clan.membersSince = {};
    clan.membersSince[target] = Date.now();
    db.users[target] = clan.id;
    saveDb(db);

    const name = await getDisplayName(sock, target);
    await sock.sendMessage(chatId, {
        text: `✅ *${name}* добавлен в клан *[${clan.tag}] ${clan.name}* ${clan.emblem}`,
        mentions: [target]
    }, { quoted: message });
}

async function kick(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (!canManage(clan, senderId)) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец или офицер может исключать' }, { quoted: message });
        return;
    }

    const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                   message.message?.extendedTextMessage?.contextInfo?.participant;

    if (!target) {
        await sock.sendMessage(chatId, { text: '❕ Упомяните участника' }, { quoted: message });
        return;
    }
    if (target === clan.owner) {
        await sock.sendMessage(chatId, { text: '❌ Нельзя кикнуть владельца' }, { quoted: message });
        return;
    }
    if (!clan.members.includes(target)) {
        await sock.sendMessage(chatId, { text: '❌ Этот пользователь не в вашем клане' }, { quoted: message });
        return;
    }
    if ((clan.officers || []).includes(target) && clan.owner !== senderId) {
        await sock.sendMessage(chatId, { text: '❌ Офицер не может кикнуть другого офицера' }, { quoted: message });
        return;
    }

    clan.members = clan.members.filter(m => m !== target);
    clan.officers = (clan.officers || []).filter(o => o !== target);
    clan.veterans = (clan.veterans || []).filter(v => v !== target);
    if (clan.membersSince) delete clan.membersSince[target];
    delete db.users[target];
    saveDb(db);

    const name = await getDisplayName(sock, target);
    await sock.sendMessage(chatId, {
        text: `✅ *${name}* исключён из клана`,
        mentions: [target]
    }, { quoted: message });
}

async function promote(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец может повышать участников' }, { quoted: message });
        return;
    }

    const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                   message.message?.extendedTextMessage?.contextInfo?.participant;

    if (!target || !clan.members.includes(target) || target === senderId) {
        await sock.sendMessage(chatId, { text: '❕ Упомяните другого участника клана' }, { quoted: message });
        return;
    }

    const name = await getDisplayName(sock, target);
    const lvlData = lvl(clan.xp);

    if ((clan.officers || []).includes(target)) {
        await sock.sendMessage(chatId, { text: `❌ *${name}* уже является офицером`, mentions: [target] }, { quoted: message });
        return;
    }

    if ((clan.veterans || []).includes(target)) {
        if (lvlData.officers === 0) {
            await sock.sendMessage(chatId, { text: '❌ Офицеры разблокируются на 4 уровне клана' }, { quoted: message });
            return;
        }
        if ((clan.officers?.length || 0) >= lvlData.officers) {
            await sock.sendMessage(chatId, {
                text: `❌ Достигнут лимит офицеров для вашего уровня (макс. ${lvlData.officers})`
            }, { quoted: message });
            return;
        }
        if (!clan.officers) clan.officers = [];
        clan.officers.push(target);
        clan.veterans = clan.veterans.filter(v => v !== target);
        saveDb(db);
        await sock.sendMessage(chatId, { text: `⚔️ *${name}* повышен до Офицера`, mentions: [target] }, { quoted: message });
        return;
    }

    if (!clan.veterans) clan.veterans = [];
    clan.veterans.push(target);
    saveDb(db);
    await sock.sendMessage(chatId, { text: `🛡️ *${name}* получил звание Ветерана`, mentions: [target] }, { quoted: message });
}

async function demote(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    if (clan.owner !== senderId) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец может понижать участников' }, { quoted: message });
        return;
    }

    const target = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                   message.message?.extendedTextMessage?.contextInfo?.participant;

    if (!target || !clan.members.includes(target)) {
        await sock.sendMessage(chatId, { text: '❕ Упомяните участника клана' }, { quoted: message });
        return;
    }

    const name = await getDisplayName(sock, target);

    if ((clan.officers || []).includes(target)) {
        clan.officers = clan.officers.filter(o => o !== target);
        if (!clan.veterans) clan.veterans = [];
        clan.veterans.push(target);
        saveDb(db);
        await sock.sendMessage(chatId, { text: `🛡️ *${name}* понижен до Ветерана`, mentions: [target] }, { quoted: message });
        return;
    }
    if ((clan.veterans || []).includes(target)) {
        clan.veterans = clan.veterans.filter(v => v !== target);
        saveDb(db);
        await sock.sendMessage(chatId, { text: `👤 *${name}* понижен до Участника`, mentions: [target] }, { quoted: message });
        return;
    }

    await sock.sendMessage(chatId, { text: `❌ *${name}* уже имеет минимальный ранг`, mentions: [target] }, { quoted: message });
}

async function info(sock, chatId, senderId, args, message) {
    initDb();
    const db = loadDb();

    let clan;
    if (args.length > 0) {
        const query = args.join(' ').toLowerCase();
        clan = Object.values(db.clans).find(c =>
            c.name.toLowerCase() === query || c.tag.toLowerCase() === query
        );
    } else {
        const clanId = db.users[senderId];
        if (clanId) clan = db.clans[clanId];
    }

    if (!clan) {
        await sock.sendMessage(chatId, { text: '❌ Клан не найден' }, { quoted: message });
        return;
    }

    const lvlData = lvl(clan.xp);
    const next = nextLvl(clan.xp);
    const ownerName = await getDisplayName(sock, clan.owner);
    const created = new Date(clan.created).toLocaleDateString('ru-RU');
    const xpInfo = next ? `${clan.xp}/${next.xp} XP` : `${clan.xp} XP (макс. уровень)`;

    const lines = [
        `${clan.emblem} *[${clan.tag}] ${clan.name}*`,
        ``,
        `⭐ Уровень: *${lvlData.level}/10*`,
        `💎 XP: *${xpInfo}*`,
        `👥 Участников: *${clan.members.length}/${lvlData.maxMembers}*`,
        `👑 Владелец: *${ownerName}*`,
        `📅 Создан: *${created}*`,
        clan.description ? `📝 ${clan.description}` : null
    ].filter(Boolean).join('\n');

    await sock.sendMessage(chatId, { text: lines }, { quoted: message });
}

async function myClan(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    if (!db.users[senderId]) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    await info(sock, chatId, senderId, [], message);
}

async function top(sock, chatId, message) {
    initDb();
    const db = loadDb();
    const clans = Object.values(db.clans).sort((a, b) => b.xp - a.xp).slice(0, 10);

    if (clans.length === 0) {
        await sock.sendMessage(chatId, { text: '⚪ Кланов пока нет' }, { quoted: message });
        return;
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = clans.map((c, i) => {
        const l = lvl(c.xp);
        const m = medals[i] || `${i + 1}.`;
        return `${m} *[${c.tag}] ${c.name}* ${c.emblem}\n   ⭐ Ур.${l.level} • 💎 ${c.xp} XP • 👥 ${c.members.length} уч.`;
    });

    await sock.sendMessage(chatId, {
        text: `🏆 *Топ кланов*\n\n${lines.join('\n\n')}`
    }, { quoted: message });
}

async function membersList(sock, chatId, senderId, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }
    const clan = db.clans[clanId];
    const lvlData = lvl(clan.xp);
    const mentions = [];
    const lines = [];

    for (const jid of clan.members) {
        const name = await getDisplayName(sock, jid);
        const r = roleOf(clan, jid);
        lines.push(`${r.icon} *${name}* — ${r.label}`);
        mentions.push(jid);
    }

    await sock.sendMessage(chatId, {
        text: `${clan.emblem} *[${clan.tag}] ${clan.name}* — участники (${clan.members.length}/${lvlData.maxMembers})\n\n${lines.join('\n')}`,
        mentions
    }, { quoted: message });
}

async function donate(sock, chatId, senderId, args, message) {
    initDb();
    const db = loadDb();
    const clanId = db.users[senderId];
    if (!clanId) {
        await sock.sendMessage(chatId, { text: '❌ Вы не состоите в клане' }, { quoted: message });
        return;
    }

    const amount = parseInt(args[0]);
    if (!amount || amount <= 0 || isNaN(amount)) {
        const userMsgs = getMsg(senderId);
        await sock.sendMessage(chatId, {
            text: `❕ Использование: .клан донат [количество]\nПример: .клан донат 100\n\nВаши сообщения: *${userMsgs}*`
        }, { quoted: message });
        return;
    }

    const userMsgs = getMsg(senderId);
    if (userMsgs < amount) {
        await sock.sendMessage(chatId, {
            text: `❌ Недостаточно сообщений\nУ вас: *${userMsgs}*, нужно: *${amount}*`
        }, { quoted: message });
        return;
    }

    const msgData = loadMsg();
    msgData[senderId] = (msgData[senderId] || 0) - amount;
    saveMsg(msgData);

    const clan = db.clans[clanId];
    const prevLvl = lvl(clan.xp).level;
    clan.xp += amount;
    const newLvl = lvl(clan.xp).level;
    saveDb(db);

    let text = `💎 Вы вложили *${amount} XP* в клан *[${clan.tag}] ${clan.name}*\nИтого XP клана: *${clan.xp}*\nВаши сообщения: *${msgData[senderId]}*`;
    if (newLvl > prevLvl) text += `\n\n🎉 Клан достиг *${newLvl} уровня*!`;

    await sock.sendMessage(chatId, { text }, { quoted: message });
}

// ─── router ───────────────────────────────────────────────────────────

async function handle(sock, chatId, senderId, rawText, message) {
    const parts = rawText.trim().split(/\s+/);
    const sub = (parts[1] || '').toLowerCase();
    const args = parts.slice(2);

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
                text: `🏰 *Система кланов*\n\n` +
                    `*Управление:*\n.клан создать [название] [тег] [эмодзи]\n.клан описание [текст]\n.клан передать @user\n.клан распустить\n\n` +
                    `*Участники:*\n.клан вступить [название]\n.клан выйти\n.клан пригласить @user\n.клан кик @user\n.клан повысить @user\n.клан понизить @user\n\n` +
                    `*Инфо:*\n.клан инфо [название]\n.клан мои\n.клан топ\n.клан участники\n\n` +
                    `*Казна:*\n.клан донат [сумма] — конвертирует ваши сообщения в XP клана`
            }, { quoted: message });
        }
    }
}

module.exports = { handle, addMsg };