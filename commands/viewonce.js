const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function viewonceCommand(sock, chatId, message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    const quotedImage = quoted?.imageMessage;
    const quotedVideo = quoted?.videoMessage;
    const quotedAudio = quoted?.audioMessage;

    if (quotedImage && quotedImage.viewOnce) {
        const stream = await downloadContentFromMessage(quotedImage, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        await sock.sendMessage(chatId, {
            image: buffer,
            fileName: 'media.jpg',
            caption: quotedImage.caption || ''
        }, { quoted: message });

    } else if (quotedVideo && quotedVideo.viewOnce) {
        const stream = await downloadContentFromMessage(quotedVideo, 'video');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        await sock.sendMessage(chatId, {
            video: buffer,
            fileName: 'media.mp4',
            caption: quotedVideo.caption || ''
        }, { quoted: message });

    } else if (quotedAudio && quotedAudio.viewOnce) {
        const stream = await downloadContentFromMessage(quotedAudio, 'audio');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

        await sock.sendMessage(chatId, {
            audio: buffer,
            mimetype: 'audio/mp4',
            ptt: true
        }, { quoted: message });

    } else {
        await sock.sendMessage(chatId, {
            text: '❌ Ответь на однократное фото, видео или аудио'
        }, { quoted: message });
    }
}

module.exports = viewonceCommand;