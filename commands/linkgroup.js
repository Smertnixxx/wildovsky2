const isAdmin = require('../lib/isAdmin');

async function linkgroup(sock, chatId, senderId, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: '❌ Эту команду можно использовать только в группе'
            }, { quoted: message });
            return;
        }

        const { isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ Бот должен быть администратором'
            }, { quoted: message });
            return;
        }

        const code = await sock.groupInviteCode(chatId);
        const link = 'https://chat.whatsapp.com/' + code;

        await sock.sendMessage(chatId, {
            text: `🔗 Ссылка на группу:\n${link}`
        }, { quoted: message });

    } catch (e) {
        console.error('linkgroup error:', e);
        await sock.sendMessage(chatId, {
            text: '❌ Не удалось получить ссылку'
        }, { quoted: message });
    }
}

module.exports = linkgroup;