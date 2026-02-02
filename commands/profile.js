const fs = require('fs');
const path = require('path');
const getDisplayName = require('../lib/getDisplayName');
const dataFilePath = path.join(__dirname, '..', 'data', 'messageCount.json');

function loadMessageCounts() {
    if (fs.existsSync(dataFilePath)) {
        return JSON.parse(fs.readFileSync(dataFilePath));
    }
    return {};
}

async function profileCommand(sock, chatId, message) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const name = await getDisplayName(sock, senderId);


        const messageCounts = loadMessageCounts();
        const userMessages =
            messageCounts[chatId]?.[senderId] || 0;

        let role = 'Участник';

        if (chatId.endsWith('@g.us')) {
            const meta = await sock.groupMetadata(chatId);
            const participant = meta.participants.find(p => p.id === senderId);

            if (participant?.admin === 'superadmin') {
                role = 'Владелец';
            } else if (participant?.admin === 'admin') {
                role = 'Админ';
            }
        }

        const profile = `
Привет ${name} котик

💬 Сообщения: ${userMessages}
👤 Роль: ${role}
        `.trim();

        await sock.sendMessage(
            chatId,
            { text: profile}
        );

    } catch (e) {
        console.error(e);
        await sock.sendMessage(chatId, { text: 'ошибка при получении профиля' }, {quoted: message});
    }
}

module.exports = profileCommand;
