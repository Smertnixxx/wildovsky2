const { downloadMediaMessage } = require('@whiskeysockets/baileys');

async function ptvCommand(sock, chatId, message) {
    let targetMessage = message;
    let videoMsg = message.message?.videoMessage;

    if (!videoMsg) {
        const quotedInfo = message.message?.extendedTextMessage?.contextInfo;
        if (quotedInfo?.quotedMessage) {
            targetMessage = {
                key: { remoteJid: chatId, id: quotedInfo.stanzaId, participant: quotedInfo.participant },
                message: quotedInfo.quotedMessage
            };
            videoMsg = targetMessage.message?.videoMessage;
        }
    }

    if (!videoMsg) {
        const inner = message.message?.viewOnceMessage?.message || message.message?.viewOnceMessageV2?.message || message.message?.ephemeralMessage?.message;
        if (inner?.videoMessage) {
            videoMsg = inner.videoMessage;
            targetMessage = { key: message.key, message: inner };
        }
    }

    if (!videoMsg) {
        await sock.sendMessage(chatId, { text: 'Ответь на видео или отправь видео с командой .ptv' }, { quoted: message });
        return;
    }

    try {
        const buffer = await downloadMediaMessage(targetMessage, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        if (!buffer) {
            await sock.sendMessage(chatId, { text: 'Не удалось скачать видео' }, { quoted: message });
            return;
        }
        await sock.sendMessage(chatId, { video: buffer, ptv: true }, { quoted: message });
    } catch (e) {
        console.error('[ptv]', e);
        await sock.sendMessage(chatId, { text: 'Ошибка при создании видеокружка' }, { quoted: message });
    }
}

module.exports = { ptvCommand };