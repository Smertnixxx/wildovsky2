const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'clans.json');
const msgPath = path.join(process.cwd(), 'data', 'messageCount.json');

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

function lvl(xp) {
    let cur = LEVELS[0];
    for (const l of LEVELS) {
        if (xp >= l.xp) cur = l;
        else break;
    }
    return cur;
}

function xpForLevel(level) {
    const l = LEVELS.find(l => l.level === level);
    return l ? l.xp : null;
}

// Найти клан по названию или тегу
function findClan(db, query) {
    const q = query.toLowerCase();
    return Object.values(db.clans).find(c =>
        c.name.toLowerCase() === q || c.tag.toLowerCase() === q
    ) || null;
}

// Получить упомянутого или quoted пользователя
function getTarget(message) {
    return message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
           message.message?.extendedTextMessage?.contextInfo?.participant || null;
}

async function handle(sock, chatId, senderId, rawText, message) {
    // Только владелец бота
    if (!message.key.fromMe) {
        await sock.sendMessage(chatId, { text: '❌ Только владелец бота может использовать эту команду' }, { quoted: message });
        return;
    }

    const parts = rawText.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {

        // ─── XP клана ────────────────────────────────────────────────

        case '.setxp': {
            // .setxp [название клана] [число]
            if (args.length < 2) {
                await sock.sendMessage(chatId, { text: '❕ .setxp [клан] [число]' }, { quoted: message });
                return;
            }
            const amount = parseInt(args[args.length - 1]);
            const query = args.slice(0, -1).join(' ');
            if (isNaN(amount) || amount < 0) {
                await sock.sendMessage(chatId, { text: '❌ Укажите корректное число' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clan = findClan(db, query);
            if (!clan) {
                await sock.sendMessage(chatId, { text: `❌ Клан не найден: ${query}` }, { quoted: message });
                return;
            }
            const oldXp = clan.xp;
            clan.xp = amount;
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ XP клана *[${clan.tag}] ${clan.name}*\n${oldXp} → ${amount}\nУровень: ${lvl(amount).level}`
            }, { quoted: message });
            break;
        }

        case '.addxp': {
            // .addxp [название клана] [число]
            if (args.length < 2) {
                await sock.sendMessage(chatId, { text: '❕ .addxp [клан] [число]' }, { quoted: message });
                return;
            }
            const amount = parseInt(args[args.length - 1]);
            const query = args.slice(0, -1).join(' ');
            if (isNaN(amount)) {
                await sock.sendMessage(chatId, { text: '❌ Укажите корректное число' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clan = findClan(db, query);
            if (!clan) {
                await sock.sendMessage(chatId, { text: `❌ Клан не найден: ${query}` }, { quoted: message });
                return;
            }
            const oldXp = clan.xp;
            clan.xp = Math.max(0, clan.xp + amount);
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ XP клана *[${clan.tag}] ${clan.name}*\n${oldXp} → ${clan.xp} (${amount >= 0 ? '+' : ''}${amount})\nУровень: ${lvl(clan.xp).level}`
            }, { quoted: message });
            break;
        }

        case '.delxp': {
            // .delxp [название клана] [число]
            if (args.length < 2) {
                await sock.sendMessage(chatId, { text: '❕ .delxp [клан] [число]' }, { quoted: message });
                return;
            }
            const amount = parseInt(args[args.length - 1]);
            const query = args.slice(0, -1).join(' ');
            if (isNaN(amount) || amount < 0) {
                await sock.sendMessage(chatId, { text: '❌ Укажите корректное положительное число' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clan = findClan(db, query);
            if (!clan) {
                await sock.sendMessage(chatId, { text: `❌ Клан не найден: ${query}` }, { quoted: message });
                return;
            }
            const oldXp = clan.xp;
            clan.xp = Math.max(0, clan.xp - amount);
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ XP клана *[${clan.tag}] ${clan.name}*\n${oldXp} → ${clan.xp} (-${amount})\nУровень: ${lvl(clan.xp).level}`
            }, { quoted: message });
            break;
        }

        // ─── Уровень клана ───────────────────────────────────────────

        case '.setlvl': {
            // .setlvl [название клана] [1-10]
            if (args.length < 2) {
                await sock.sendMessage(chatId, { text: '❕ .setlvl [клан] [1-10]' }, { quoted: message });
                return;
            }
            const level = parseInt(args[args.length - 1]);
            const query = args.slice(0, -1).join(' ');
            if (isNaN(level) || level < 1 || level > 10) {
                await sock.sendMessage(chatId, { text: '❌ Уровень должен быть от 1 до 10' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clan = findClan(db, query);
            if (!clan) {
                await sock.sendMessage(chatId, { text: `❌ Клан не найден: ${query}` }, { quoted: message });
                return;
            }
            const newXp = xpForLevel(level);
            const oldXp = clan.xp;
            clan.xp = newXp;
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ Уровень клана *[${clan.tag}] ${clan.name}* установлен на *${level}*\nXP: ${oldXp} → ${newXp}`
            }, { quoted: message });
            break;
        }

        // ─── Сообщения пользователя ──────────────────────────────────

        case '.setmsgs': {
            // .setmsgs @user [число]
            const target = getTarget(message);
            if (!target) {
                await sock.sendMessage(chatId, { text: '❕ .setmsgs @user [число]' }, { quoted: message });
                return;
            }
            const amount = parseInt(args.find(a => !isNaN(parseInt(a))));
            if (isNaN(amount) || amount < 0) {
                await sock.sendMessage(chatId, { text: '❌ Укажите корректное число' }, { quoted: message });
                return;
            }
            const data = loadMsg();
            if (!data[chatId]) data[chatId] = {};
            const old = data[chatId][target] || 0;
            data[chatId][target] = amount;
            saveMsg(data);
            await sock.sendMessage(chatId, {
                text: `✅ Сообщения @${target.split('@')[0]}: ${old} → ${amount}`,
                mentions: [target]
            }, { quoted: message });
            break;
        }

        case '.addmsgs': {
            // .addmsgs @user [число]
            const target = getTarget(message);
            if (!target) {
                await sock.sendMessage(chatId, { text: '❕ .addmsgs @user [число]' }, { quoted: message });
                return;
            }
            const amount = parseInt(args.find(a => !isNaN(parseInt(a))));
            if (isNaN(amount)) {
                await sock.sendMessage(chatId, { text: '❌ Укажите корректное число' }, { quoted: message });
                return;
            }
            const data = loadMsg();
            if (!data[chatId]) data[chatId] = {};
            const old = data[chatId][target] || 0;
            data[chatId][target] = Math.max(0, old + amount);
            saveMsg(data);
            await sock.sendMessage(chatId, {
                text: `✅ Сообщения @${target.split('@')[0]}: ${old} → ${data[chatId][target]} (${amount >= 0 ? '+' : ''}${amount})`,
                mentions: [target]
            }, { quoted: message });
            break;
        }

        case '.delmsgs': {
            // .delmsgs @user [число]
            const target = getTarget(message);
            if (!target) {
                await sock.sendMessage(chatId, { text: '❕ .delmsgs @user [число]' }, { quoted: message });
                return;
            }
            const amount = parseInt(args.find(a => !isNaN(parseInt(a))));
            if (isNaN(amount) || amount < 0) {
                await sock.sendMessage(chatId, { text: '❌ Укажите корректное положительное число' }, { quoted: message });
                return;
            }
            const data = loadMsg();
            if (!data[chatId]) data[chatId] = {};
            const old = data[chatId][target] || 0;
            data[chatId][target] = Math.max(0, old - amount);
            saveMsg(data);
            await sock.sendMessage(chatId, {
                text: `✅ Сообщения @${target.split('@')[0]}: ${old} → ${data[chatId][target]} (-${amount})`,
                mentions: [target]
            }, { quoted: message });
            break;
        }

        // ─── Управление участием ─────────────────────────────────────

        case '.clanunban': {
            // .clanunban @user [клан] — убрать из чёрного списка
            const target = getTarget(message);
            const query = args.filter(a => !a.startsWith('@')).join(' ');
            if (!target || !query) {
                await sock.sendMessage(chatId, { text: '❕ .clanunban @user [клан]' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clan = findClan(db, query);
            if (!clan) {
                await sock.sendMessage(chatId, { text: `❌ Клан не найден: ${query}` }, { quoted: message });
                return;
            }
            if (!(clan.blacklist || []).includes(target)) {
                await sock.sendMessage(chatId, { text: '❌ Пользователь не в чёрном списке этого клана' }, { quoted: message });
                return;
            }
            clan.blacklist = clan.blacklist.filter(b => b !== target);
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ @${target.split('@')[0]} удалён из чёрного списка клана *[${clan.tag}] ${clan.name}*`,
                mentions: [target]
            }, { quoted: message });
            break;
        }

        case '.clankick': {
            // .clankick @user — принудительно выгнать из клана
            const target = getTarget(message);
            if (!target) {
                await sock.sendMessage(chatId, { text: '❕ .clankick @user' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clanId = db.users[target];
            if (!clanId || !db.clans[clanId]) {
                await sock.sendMessage(chatId, { text: '❌ Пользователь не состоит в клане' }, { quoted: message });
                return;
            }
            const clan = db.clans[clanId];
            if (clan.owner === target) {
                await sock.sendMessage(chatId, { text: '⚠️ Это владелец клана. Используйте .clandel чтобы удалить клан или .clanowner для смены владельца' }, { quoted: message });
                return;
            }
            clan.members = clan.members.filter(m => m !== target);
            clan.officers = (clan.officers || []).filter(o => o !== target);
            clan.veterans = (clan.veterans || []).filter(v => v !== target);
            if (clan.membersSince) delete clan.membersSince[target];
            delete db.users[target];
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ @${target.split('@')[0]} принудительно выгнан из клана *[${clan.tag}] ${clan.name}*`,
                mentions: [target]
            }, { quoted: message });
            break;
        }

        case '.clanowner': {
            // .clanowner @user [клан] — сменить владельца
            const target = getTarget(message);
            const query = args.filter(a => !a.startsWith('@')).join(' ');
            if (!target || !query) {
                await sock.sendMessage(chatId, { text: '❕ .clanowner @user [клан]' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clan = findClan(db, query);
            if (!clan) {
                await sock.sendMessage(chatId, { text: `❌ Клан не найден: ${query}` }, { quoted: message });
                return;
            }
            if (!clan.members.includes(target)) {
                await sock.sendMessage(chatId, { text: '❌ Пользователь не состоит в этом клане' }, { quoted: message });
                return;
            }
            const oldOwner = clan.owner;
            clan.owner = target;
            clan.officers = (clan.officers || []).filter(o => o !== target);
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ Владелец клана *[${clan.tag}] ${clan.name}* изменён\n${oldOwner.split('@')[0]} → @${target.split('@')[0]}`,
                mentions: [target]
            }, { quoted: message });
            break;
        }

        // ─── Удаление клана ──────────────────────────────────────────

        case '.clandel': {
            // .clandel [клан] — принудительно удалить клан
            const query = args.join(' ');
            if (!query) {
                await sock.sendMessage(chatId, { text: '❕ .clandel [клан]' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const clan = findClan(db, query);
            if (!clan) {
                await sock.sendMessage(chatId, { text: `❌ Клан не найден: ${query}` }, { quoted: message });
                return;
            }
            for (const m of clan.members) delete db.users[m];
            delete db.clans[clan.id];
            saveDb(db);
            await sock.sendMessage(chatId, {
                text: `✅ Клан *[${clan.tag}] ${clan.name}* удалён. Освобождено участников: ${clan.members.length}`
            }, { quoted: message });
            break;
        }

        // ─── Список всех кланов ──────────────────────────────────────

        case '.clanlist': {
            const db = loadDb();
            const clans = Object.values(db.clans);
            if (clans.length === 0) {
                await sock.sendMessage(chatId, { text: '⚪ Кланов нет' }, { quoted: message });
                return;
            }
            const lines = clans.map((c, i) => {
                const l = lvl(c.xp);
                return `${i + 1}. *[${c.tag}] ${c.name}* ${c.emblem} — ур.${l.level}, ${c.xp} XP, ${c.members.length} уч.`;
            });
            await sock.sendMessage(chatId, {
                text: `🏰 *Все кланы (${clans.length}):*\n\n${lines.join('\n')}`
            }, { quoted: message });
            break;
        }

        // ─── Инфо о пользователе в кланах ───────────────────────────

        case '.clanwho': {
            // .clanwho @user — клан и сообщения пользователя
            const target = getTarget(message);
            if (!target) {
                await sock.sendMessage(chatId, { text: '❕ .clanwho @user' }, { quoted: message });
                return;
            }
            const db = loadDb();
            const data = loadMsg();
            const clanId = db.users[target];
            const msgs = data[chatId]?.[target] || 0;
            let clanInfo = 'не состоит в клане';
            if (clanId && db.clans[clanId]) {
                const c = db.clans[clanId];
                clanInfo = `*[${c.tag}] ${c.name}* ${c.emblem} (ур.${lvl(c.xp).level}, ${c.xp} XP)`;
            }
            await sock.sendMessage(chatId, {
                text: `👤 @${target.split('@')[0]}\n💬 Сообщений: ${msgs}\n🏰 Клан: ${clanInfo}`,
                mentions: [target]
            }, { quoted: message });
            break;
        }

        default: {
            await sock.sendMessage(chatId, {
                text: `тебе сюда нельзя`
            }, { quoted: message });
            break;
        }
    }
}

module.exports = { handle };