const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const webp = require('node-webpmux');

async function convertCommand(sock, chatId, message) {
    const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const sticker = quoted?.stickerMessage;

    if (!sticker) {
        await sock.sendMessage(chatId, { text: '❌ Ответь на стикер' }, { quoted: message });
        return;
    }

    const target = {
        key: {
            remoteJid: chatId,
            id: message.message.extendedTextMessage.contextInfo.stanzaId,
            participant: message.message.extendedTextMessage.contextInfo.participant
        },
        message: quoted
    };

    try {
        const buffer = await downloadMediaMessage(
            target,
            'buffer',
            {},
            { logger: undefined, reuploadRequest: sock.updateMediaMessage }
        );

        const img = new webp.Image();
        await img.load(buffer);

        const isAnimated = img.hasAnim;

        const tmp = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmp)) fs.mkdirSync(tmp, { recursive: true });

        const input = path.join(tmp, `st_${Date.now()}.webp`);
        fs.writeFileSync(input, buffer);

        if (!isAnimated) {
            const out = path.join(tmp, `img_${Date.now()}.png`);

            await new Promise((res, rej) => {
                exec(`ffmpeg -i "${input}" "${out}"`, e => e ? rej(e) : res());
            });

            const png = fs.readFileSync(out);

            await sock.sendMessage(chatId, { image: png }, { quoted: message });

            fs.unlinkSync(out);
        } else {
            const out = path.join(tmp, `vid_${Date.now()}.mp4`);

            await new Promise((res, rej) => {
                exec(`ffmpeg -i "${input}" -movflags faststart -pix_fmt yuv420p "${out}"`, e => e ? rej(e) : res());
            });

            const mp4 = fs.readFileSync(out);

            await sock.sendMessage(chatId, { video: mp4 }, { quoted: message });

            fs.unlinkSync(out);
        }

        fs.unlinkSync(input);

    } catch (e) {
        console.error(e);
        await sock.sendMessage(chatId, { text: '❌ Ошибка конвертации' }, { quoted: message });
    }
}

module.exports = convertCommand;