const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

async function exec(sock, chatId, message) {
    const senderId = (message.key.participant || message.key.remoteJid) || '';
    const userId = senderId.split('@')[0];

    if (!message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        await sock.sendMessage(chatId, { text: `testtssadhdshsd`, mentions: [senderId] });
        return;
    }

    // Берём цитированное сообщение
    const quoted = message.message.extendedTextMessage.contextInfo.quotedMessage;

    // Преобразуем в JSON с форматированием
    const parsed = JSON.stringify(quoted, null, 2);

    // Если сообщение слишком большое — делим на части
    const maxChunk = 4000;
    const chunks = [];
    for (let i = 0; i < parsed.length; i += maxChunk) {
        chunks.push(parsed.slice(i, i + maxChunk));
    }

    // Отправляем каждую часть
    for (const chunk of chunks) {
        const msg = generateWAMessageFromContent(chatId, {
            extendedTextMessage: proto.Message.ExtendedTextMessage.create({
                text: `${chunk}`,
                contextInfo: { mentionedJid: [senderId] }
            })
        }, { quoted: message });

        await sock.relayMessage(chatId, msg.message, { messageId: msg.key.id });
    }
}

module.exports = exec;
