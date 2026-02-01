const { downloadMediaMessage } = require('@whiskeysockets/baileys');

async function ptvCommand(sock, chatId, message) {
    const quotedInfo = message.message?.extendedTextMessage?.contextInfo;

    if (!quotedInfo?.quotedMessage) {
        await sock.sendMessage(
            chatId,
            { text: 'Ответь на видео, чтобы сделать видеокружок' },
            { quoted: message }
        );
        return;
    }

    const targetMessage = {
        key: {
            remoteJid: chatId,
            id: quotedInfo.stanzaId,
            participant: quotedInfo.participant
        },
        message: quotedInfo.quotedMessage
    };

    const videoMsg = targetMessage.message?.videoMessage;

    if (!videoMsg) {
        await sock.sendMessage(
            chatId,
            { text: 'Нужно отвечать именно на видео' },
            { quoted: message }
        );
        return;
    }

    try {
        const buffer = await downloadMediaMessage(
            targetMessage,
            'buffer',
            {},
            {
                logger: undefined,
                reuploadRequest: sock.updateMediaMessage
            }
        );

        if (!buffer) {
            await sock.sendMessage(
                chatId,
                { text: 'Не удалось скачать видео' },
                { quoted: message }
            );
            return;
        }

        await sock.sendMessage(
            chatId,
            {
                video: buffer,
                ptv: true
            },
            { quoted: message }
        );

    } catch (e) {
        console.error('[ptv]', e);
        await sock.sendMessage(
            chatId,
            { text: 'Ошибка при создании видеокружка' },
            { quoted: message }
        );
    }
}

module.exports = {
    ptvCommand
};
