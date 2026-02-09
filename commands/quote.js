const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const webp = require('node-webpmux');
const crypto = require('crypto');

async function getDisplayName(sock, jid) {
    if (!jid) return 'user';
    const store = sock.store?.contacts || {};
    const normalized = jid.endsWith('@lid') ? jid.split('@')[0] + '@s.whatsapp.net' : jid;

    const contact = store[normalized];
    if (contact?.name && !/^\d+$/.test(contact.name)) return contact.name;

    try {
        const name = await sock.getName(normalized);
        if (name && !/^\d+$/.test(name)) return name;
    } catch {}
    return normalized.split('@')[0];
}

async function quoteCommand(sock, chatId, message, text) {
    const ctx = message.message?.extendedTextMessage?.contextInfo;

    let srcText = text;
    if (!srcText && ctx?.quotedMessage?.conversation) {
        srcText = ctx.quotedMessage.conversation;
    }

    if (!srcText) {
        await sock.sendMessage(chatId, { text: 'Напиши текст или ответь на сообщение с текстом' }, { quoted: message });
        return;
    }

    let senderId = ctx?.participant || message.key.participant || message.key.remoteJid;
    if (senderId.endsWith('@lid')) senderId = senderId.split('@')[0] + '@s.whatsapp.net';

    // Форматируем текст
    const words = srcText.split(' ');
    const maxWords = 5;
    const maxLen = 30;
    let formatted = '';
    let line = '';
    for (let i = 0; i < words.length; i++) {
        let w = words[i];
        while (w.length > maxLen) {
            formatted += w.slice(0, maxLen) + '\n';
            w = w.slice(maxLen);
        }
        if ((line + w).length <= maxLen) line += w + ' ';
        else {
            formatted += line.trim() + '\n';
            line = w + ' ';
        }
        if ((i + 1) % maxWords === 0) {
            formatted += line.trim() + '\n';
            line = '';
        }
    }
    if (line.trim()) formatted += line.trim();

    const name = await getDisplayName(sock, senderId);

    let avatar;
    try {
        avatar = await sock.profilePictureUrl(senderId, 'image');
    } catch {
        avatar = 'https://www.clipartmax.com/png/full/245-2459068_marco-martinangeli-coiffeur-portrait-of-a-man.png';
    }

    const payload = {
        type: 'q',
        format: 'png',
        backgroundColor: '#000000',
        width: 1800,
        height: 1000,
        scale: 1,
        messages: [{
            avatar: true,
            from: {
                id: 1,
                name,
                photo: { url: avatar }
            },
            text: formatted
        }]
    };

    try {
        const res = await fetch('https://bot.lyo.su/quote/generate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Ошибка генерации quote');
        const json = await res.json();
        if (!json?.result?.image) throw new Error('Некорректный ответ сервиса');

        const tmpDir = path.join(os.tmpdir(), 'quote');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        const pngPath = path.join(tmpDir, `q_${Date.now()}.png`);
        const webpPath = path.join(tmpDir, `q_${Date.now()}.webp`);
        fs.writeFileSync(pngPath, Buffer.from(json.result.image, 'base64'));

        await new Promise((resolve, reject) => {
            exec(`ffmpeg -y -i "${pngPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -pix_fmt yuva420p -quality 75 "${webpPath}"`, 
            err => err ? reject(err) : resolve());
        });

        const img = new webp.Image();
        await img.load(fs.readFileSync(webpPath));
        const meta = {
            'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
            'sticker-pack-name': 'Quote',
            'emojis': ['💬']
        };
        const exifBase = Buffer.from([0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00]);
        const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8');
        const exif = Buffer.concat([exifBase, metaBuf]);
        exif.writeUIntLE(metaBuf.length, 14, 4);
        img.exif = exif;

        const finalBuffer = await img.save(null);
        await sock.sendMessage(chatId, { sticker: finalBuffer }, { quoted: message });

        try { fs.unlinkSync(pngPath); fs.unlinkSync(webpPath); } catch {}
    } catch (e) {
        console.error(e);
        await sock.sendMessage(chatId, { text: 'Ошибка генерации стикера' }, { quoted: message });
    }
}

module.exports = quoteCommand;
