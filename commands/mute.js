const isAdmin = require('../lib/isAdmin');

async function muteCommand(sock, chatId, senderId, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах' }, { quoted: message });
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

    try {
        await sock.groupSettingUpdate(chatId, 'announcement');
    } catch (e) {
        console.error('Error in muteCommand:', e);
        await sock.sendMessage(chatId, { text: 'не удалось' }, { quoted: message });
    }
}

async function unmuteCommand(sock, chatId, senderId, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах' }, { quoted: message });
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

    try {
        await sock.groupSettingUpdate(chatId, 'not_announcement');
    } catch (e) {
        console.error('Error in unmuteCommand:', e);
        await sock.sendMessage(chatId, { text: 'не удалось' }, { quoted: message });
    }
}

module.exports = { muteCommand, unmuteCommand };