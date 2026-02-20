const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const warnPath = path.join(process.cwd(), 'data', 'warns.json');

function load() {
    try { return JSON.parse(fs.readFileSync(warnPath, 'utf8')); }
    catch { return {}; }
}

function save(data) {
    fs.writeFileSync(warnPath, JSON.stringify(data, null, 2));
}

async function unwarn(sock, chatId, senderId, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах' });
            return;
        }

        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: '❌ Дайте боту права администратора' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: '❌ Только администраторы могут использовать эту команду' }, { quoted: message });
            return;
        }

        let who = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                  message.message?.extendedTextMessage?.contextInfo?.participant;

        if (!who) {
            await sock.sendMessage(chatId, {
                text: '❕ Упомяните участника или ответьте на его сообщение\n\nПример: .разпред @user'
            }, { quoted: message });
            return;
        }

        const normalizedWho = who.includes('@') ? who : who + '@s.whatsapp.net';
        const warns = load();

        const entry = warns[chatId]?.[normalizedWho];

        if (!entry || entry.count === 0) {
            const name = await sock.getName(normalizedWho);
            await sock.sendMessage(chatId, {
                text: `❕ У *${name}* нет предупреждений`,
                mentions: [normalizedWho]
            }, { quoted: message });
            return;
        }

        warns[chatId][normalizedWho].count -= 1;
        warns[chatId][normalizedWho].list.pop();

        if (warns[chatId][normalizedWho].count === 0) {
            delete warns[chatId][normalizedWho];
        }

        if (Object.keys(warns[chatId] || {}).length === 0) {
            delete warns[chatId];
        }

        save(warns);

        const count = entry.count - 1;
        const name = await sock.getName(normalizedWho);

        await sock.sendMessage(chatId, {
            text: `❎ Предупреждение снято с *${name}*\nСейчас: *(${count}/3)*`,
            mentions: [normalizedWho]
        }, { quoted: message });

    } catch (e) {
        console.error('Error in unwarn command:', e);
        await sock.sendMessage(chatId, { text: '❌ Не удалось снять предупреждение' }, { quoted: message });
    }
}

module.exports = unwarn;