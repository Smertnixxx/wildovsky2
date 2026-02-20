const fs = require('fs');
const path = require('path');
const getDisplayName = require('../lib/getDisplayName');
const { getGroupMetadata } = require('../lib/groupMetadataQueue');

const dataFilePath = path.join(__dirname, '..', 'data', 'messageCount.json');
const clansPath = path.join(__dirname, '..', 'data', 'clans.json');

function loadMessageCounts() {
    if (fs.existsSync(dataFilePath)) {
        return JSON.parse(fs.readFileSync(dataFilePath));
    }
    return {};
}

function loadClans() {
    try { return JSON.parse(fs.readFileSync(clansPath, 'utf8')); }
    catch { return { clans: {}, users: {} }; }
}

const LEVELS = [
    { level: 1,  xp: 0     },
    { level: 2,  xp: 1000  },
    { level: 3,  xp: 3000  },
    { level: 4,  xp: 6000  },
    { level: 5,  xp: 10000 },
    { level: 6,  xp: 16000 },
    { level: 7,  xp: 25000 },
    { level: 8,  xp: 37000 },
    { level: 9,  xp: 53000 },
    { level: 10, xp: 75000 },
];

function clanLvl(xp) {
    let cur = LEVELS[0];
    for (const l of LEVELS) {
        if (xp >= l.xp) cur = l;
        else break;
    }
    return cur;
}

function clanRole(clan, jid) {
    if (clan.owner === jid) return '👑 Владелец';
    if ((clan.officers || []).includes(jid)) return '⚔️ Офицер';
    if ((clan.veterans || []).includes(jid)) return '🛡️ Ветеран';
    const days = (Date.now() - (clan.membersSince?.[jid] || 0)) / 86400000;
    if (days < 3) return '🌱 Новобранец';
    return '👤 Участник';
}

async function profileCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const name = await getDisplayName(sock, senderId);
        const messageCounts = loadMessageCounts();
        const userMessages = messageCounts[chatId]?.[senderId] || 0;

        let role = 'Участник';
        if (chatId.endsWith('@g.us')) {
            const meta = await getGroupMetadata(sock, chatId);
            if (meta) {
                const participant = (meta.participants || []).find(p => p.id === senderId);
                if (participant?.admin === 'superadmin') role = 'Владелец';
                else if (participant?.admin === 'admin') role = 'Админ';
            }
        }

        // Брак
        let marriageLine = '';
        try {
            const users = global.db?.data?.users || {};
            if (users[senderId]?.pasangan) {
                const partnerJid = users[senderId].pasangan;
                const partnerName = users[senderId].pasanganName || await getDisplayName(sock, partnerJid);
                marriageLine = `\n💞 Брак: ${partnerName}`;
            }
        } catch {}

        // Клан
        let clanLine = '';
        try {
            const db = loadClans();
            const clanId = db.users[senderId];
            if (clanId && db.clans[clanId]) {
                const clan = db.clans[clanId];
                const lvlData = clanLvl(clan.xp);
                const memberRole = clanRole(clan, senderId);
                clanLine = `\n🏰 Клан: ${clan.emblem} *[${clan.tag}] ${clan.name}*\n   ⭐ Ур.${lvlData.level} • ${memberRole}`;
            }
        } catch {}

        const profile = [
            `Привет ${name} котик`,
            `💬 Сообщения: ${userMessages}`,
            `👤 Роль: ${role}`,
            marriageLine ? marriageLine : null,
            clanLine ? clanLine : null,
        ].filter(Boolean).join('\n');

        await sock.sendMessage(chatId, { text: profile }, { quoted: message });
    } catch (e) {
        console.error(e);
        await sock.sendMessage(chatId, { text: 'ошибка при получении профиля' }, { quoted: message });
    }
}

module.exports = profileCommand;