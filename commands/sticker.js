const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const webp = require('node-webpmux');
const crypto = require('crypto');

async function getStickerName(sock, chatId, senderId) {
    const store = require('../lib/lightweight_store');
    const c = store.contacts?.[senderId];
    if (c?.name && !/^\d+$/.test(c.name)) return c.name;
    try {
        const name = await sock.getName(senderId);
        if (name && !/^\+?\d+$/.test(name)) return name;
    } catch {}
    if (chatId.endsWith('@g.us')) {
        try {
            const meta = await sock.groupMetadata(chatId);
            const p = meta?.participants?.find(p => p.id === senderId);
            if (p?.phoneNumber) {
                const c2 = store.contacts?.[p.phoneNumber];
                if (c2?.name && !/^\d+$/.test(c2.name)) return c2.name;
                try { const n = await sock.getName(p.phoneNumber); if (n && !/^\+?\d+$/.test(n)) return n; } catch {}
            }
        } catch {}
    }
    return null;
}

async function stickerCommand(sock, chatId, message) {
    const messageToQuote = message;
    let targetMessage = message;
    let mediaMessage = message.message?.imageMessage || message.message?.videoMessage || message.message?.documentMessage;

    if (!mediaMessage && message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const qi = message.message.extendedTextMessage.contextInfo;
        targetMessage = { key: { remoteJid: chatId, id: qi.stanzaId, participant: qi.participant }, message: qi.quotedMessage };
        mediaMessage = targetMessage.message?.imageMessage || targetMessage.message?.videoMessage || targetMessage.message?.documentMessage;
    }

    if (!mediaMessage) {
        const inner = message.message?.viewOnceMessage?.message || message.message?.viewOnceMessageV2?.message || message.message?.ephemeralMessage?.message;
        if (inner) {
            mediaMessage = inner.imageMessage || inner.videoMessage || inner.documentMessage;
            if (mediaMessage) targetMessage = { key: message.key, message: inner };
        }
    }

    if (!mediaMessage) {
        const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const voq = quoted?.viewOnceMessage?.message || quoted?.viewOnceMessageV2?.message;
        if (voq) {
            mediaMessage = voq.imageMessage || voq.videoMessage;
            if (mediaMessage) {
                const qi = message.message.extendedTextMessage.contextInfo;
                targetMessage = { key: { remoteJid: chatId, id: qi.stanzaId, participant: qi.participant }, message: voq };
            }
        }
    }

    const senderId = (message?.key?.participant || message?.key?.remoteJid) || '';
    const name = await getStickerName(sock, chatId, senderId) || 'wildovsky';

    if (!mediaMessage) {
        await sock.sendMessage(chatId, { text: 'Ответь на сообщение чтобы сделать стикер или отправь картинку/видео с подписью .стикер' }, { quoted: messageToQuote });
        return;
    }

    try {
        const mediaBuffer = await downloadMediaMessage(targetMessage, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        if (!mediaBuffer) { await sock.sendMessage(chatId, { text: 'Не удалось скачать медиа.' }); return; }

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const tempInput = path.join(tmpDir, `temp_${Date.now()}`);
        const tempOutput = path.join(tmpDir, `sticker_${Date.now()}.webp`);
        fs.writeFileSync(tempInput, mediaBuffer);

        const isAnimated = mediaMessage.mimetype?.includes('gif') || mediaMessage.mimetype?.includes('video') || mediaMessage.seconds > 0;

        const vf = isAnimated
            ? `scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=15`
            : `scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba`;

        const cmd = `ffmpeg -i "${tempInput}" -vf "${vf}" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 75 -compression_level 6 "${tempOutput}"`;

        await new Promise((resolve, reject) => { exec(cmd, (err) => err ? reject(err) : resolve()); });
        let webpBuffer = fs.readFileSync(tempOutput);

        if (isAnimated && webpBuffer.length > 1000 * 1024) {
            try {
                const t2 = path.join(tmpDir, `sticker_fb_${Date.now()}.webp`);
                const big = mediaBuffer.length / 1024 > 5000;
                const fbCmd = big
                    ? `ffmpeg -y -i "${tempInput}" -t 2 -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=8" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 30 -compression_level 6 -b:v 100k -max_muxing_queue_size 1024 "${t2}"`
                    : `ffmpeg -y -i "${tempInput}" -t 3 -vf "scale=512:512:force_original_aspect_ratio=increase,crop=512:512,fps=12" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 45 -compression_level 6 -b:v 150k -max_muxing_queue_size 1024 "${t2}"`;
                await new Promise((resolve, reject) => { exec(fbCmd, (err) => err ? reject(err) : resolve()); });
                if (fs.existsSync(t2)) { webpBuffer = fs.readFileSync(t2); try { fs.unlinkSync(t2); } catch {} }
            } catch {}
        }

        const img = new webp.Image();
        await img.load(webpBuffer);
        const json = { 'sticker-pack-id': crypto.randomBytes(32).toString('hex'), 'sticker-pack-name': name, 'emojis': ['🦆'] };
        const exifAttr = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
        const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
        const exif = Buffer.concat([exifAttr, jsonBuf]);
        exif.writeUIntLE(jsonBuf.length, 14, 4);
        img.exif = exif;
        let finalBuffer = await img.save(null);

        if (isAnimated && finalBuffer.length > 900 * 1024) {
            try {
                const t3 = path.join(tmpDir, `sticker_sm_${Date.now()}.webp`);
                await new Promise((resolve, reject) => {
                    exec(`ffmpeg -y -i "${tempInput}" -t 2 -vf "scale=320:320:force_original_aspect_ratio=increase,crop=320:320,fps=8" -c:v libwebp -preset default -loop 0 -vsync 0 -pix_fmt yuva420p -quality 30 -compression_level 6 -b:v 80k -max_muxing_queue_size 1024 "${t3}"`, (err) => err ? reject(err) : resolve());
                });
                if (fs.existsSync(t3)) {
                    const img2 = new webp.Image();
                    await img2.load(fs.readFileSync(t3));
                    img2.exif = exif;
                    finalBuffer = await img2.save(null);
                    try { fs.unlinkSync(t3); } catch {}
                }
            } catch {}
        }

        await sock.sendMessage(chatId, { sticker: finalBuffer }, { quoted: messageToQuote });
        try { fs.unlinkSync(tempInput); } catch {}
        try { fs.unlinkSync(tempOutput); } catch {}

    } catch (error) {
        console.error('Error in sticker command:', error);
        await sock.sendMessage(chatId, { text: 'Не удалось создать стикер! Попробуйте позже.' });
    }
}

module.exports = stickerCommand;