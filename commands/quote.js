const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const webp = require('node-webpmux');
const crypto = require('crypto');

async function resolve(sock, jid, chatId) {
    if (!jid) return null;

    // Если уже нормальный JID
    if (jid.endsWith('@s.whatsapp.net')) return jid;

    // Резолвим @lid через участников группы
    if (jid.endsWith('@lid') && chatId?.endsWith('@g.us')) {
        try {
            const meta = await sock.groupMetadata(chatId);
            const lidNum = jid.split('@')[0];
            const match = meta.participants?.find(p => p.lid?.split('@')[0] === lidNum || p.id?.split('@')[0] === lidNum);
            if (match?.id?.endsWith('@s.whatsapp.net')) return match.id;
        } catch {}
    }

    // Fallback — пробуем просто заменить суффикс
    return jid.split('@')[0] + '@s.whatsapp.net';
}

async function name(sock, jid, chatId) {
    const store = require('../lib/lightweight_store');

    // Пробуем напрямую через store
    const c = store.contacts?.[jid];
    if (c?.name && !/^\+?\d+$/.test(c.name)) return c.name;

    // getName по оригинальному jid
    try {
        const n = await sock.getName(jid);
        if (n && !/^\+?\d+$/.test(n)) return n;
    } catch {}

    // Если @lid — ищем через groupMetadata и phoneNumber (как в sticker.js)
    if (chatId?.endsWith('@g.us')) {
        try {
            const meta = await sock.groupMetadata(chatId);
            const p = meta?.participants?.find(p => p.id === jid || p.lid === jid);

            if (p?.phoneNumber) {
                const c2 = store.contacts?.[p.phoneNumber];
                if (c2?.name && !/^\+?\d+$/.test(c2.name)) return c2.name;
                try {
                    const n2 = await sock.getName(p.phoneNumber);
                    if (n2 && !/^\+?\d+$/.test(n2)) return n2;
                } catch {}
            }

            // phoneNumber нет — пробуем резолвнуть lid в @s.whatsapp.net
            if (p?.id?.endsWith('@s.whatsapp.net') && p.id !== jid) {
                const c3 = store.contacts?.[p.id];
                if (c3?.name && !/^\+?\d+$/.test(c3.name)) return c3.name;
                try {
                    const n3 = await sock.getName(p.id);
                    if (n3 && !/^\+?\d+$/.test(n3)) return n3;
                } catch {}
            }
        } catch {}
    }

    return jid.split('@')[0];
}

async function avatar(sock, jid, chatId) {
    const resolved = await resolve(sock, jid, chatId);
    const fallback = 'https://www.clipartmax.com/png/full/245-2459068_marco-martinangeli-coiffeur-portrait-of-a-man.png';

    if (!resolved) return fallback;

    // Пробуем оригинальный и резолвнутый JID
    for (const id of [resolved, jid]) {
        try {
            const url = await sock.profilePictureUrl(id, 'image');
            if (url) return url;
        } catch {}
    }

    return fallback;
}

async function quoteCommand(sock, chatId, message, text) {
    const ctx = message.message?.extendedTextMessage?.contextInfo;

    let srcText = text;
    if (!srcText && ctx?.quotedMessage?.conversation) {
        srcText = ctx.quotedMessage.conversation;
    }
    if (!srcText && ctx?.quotedMessage?.extendedTextMessage?.text) {
        srcText = ctx.quotedMessage.extendedTextMessage.text;
    }

    if (!srcText) {
        await sock.sendMessage(chatId, { text: 'Напиши текст или ответь на сообщение с текстом' }, { quoted: message });
        return;
    }

    const rawSender = ctx?.participant || message.key.participant || message.key.remoteJid;

    // Форматируем текст
    const words = srcText.split(' ');
    const maxLen = 30;
    const maxWords = 5;
    let formatted = '';
    let line = '';
    for (let i = 0; i < words.length; i++) {
        let w = words[i];
        while (w.length > maxLen) {
            formatted += w.slice(0, maxLen) + '\n';
            w = w.slice(maxLen);
        }
        if ((line + w).length <= maxLen) line += w + ' ';
        else { formatted += line.trim() + '\n'; line = w + ' '; }
        if ((i + 1) % maxWords === 0) { formatted += line.trim() + '\n'; line = ''; }
    }
    if (line.trim()) formatted += line.trim();

    const [userName, userAvatar] = await Promise.all([
        name(sock, rawSender, chatId),
        avatar(sock, rawSender, chatId)
    ]);

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
                name: userName,
                photo: { url: userAvatar }
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

        const ts = Date.now();
        const pngPath = path.join(tmpDir, `q_${ts}.png`);
        const webpPath = path.join(tmpDir, `q_${ts}.webp`);
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
        console.error('quote error:', e);
        await sock.sendMessage(chatId, { text: 'Ошибка генерации стикера' }, { quoted: message });
    }
}

module.exports = quoteCommand;