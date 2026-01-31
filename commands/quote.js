const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const webp = require('node-webpmux');
const crypto = require('crypto');

async function quoteCommand(sock, chatId, message, text) {
    const ctx = message.message?.extendedTextMessage?.contextInfo;

    let srcText = text;
    if (!srcText && ctx?.quotedMessage?.conversation) {
        srcText = ctx.quotedMessage.conversation;
    }

    if (!srcText) {
        await sock.sendMessage(
            chatId,
            { text: 'Напиши текст или ответь на сообщение с текстом' },
            { quoted: message }
        );
        return;
    }

    // determine sender JID (prefer the quoted participant when replying)
    let senderId = ctx?.participant
        ? ctx.participant
        : (message.key.participant || message.key.remoteJid || '');

    // Normalize senderId:
    // - If it's only digits (no @), append the standard domain so getDisplayName can resolve it.
    // - If it comes with the internal '@lid' domain, convert it to the standard WhatsApp JID.
    if (typeof senderId === 'string') {
        if (!senderId.includes('@')) {
            senderId = `${senderId}@s.whatsapp.net`;
        } else if (senderId.endsWith('@lid')) {
            senderId = senderId.replace(/@lid$/, '@s.whatsapp.net');
        }
    }

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

        if ((line + w).length <= maxLen) {
            line += w + ' ';
        } else {
            formatted += line.trim() + '\n';
            line = w + ' ';
        }

        if ((i + 1) % maxWords === 0) {
            formatted += line.trim() + '\n';
            line = '';
        }
    }

    if (line.trim()) formatted += line.trim();

    // Collect debugging info and send it as a chat message (instead of console)
    const debugLines = [];
    debugLines.push(`[quote] ctx participant: ${ctx?.participant || 'null'}`);
    debugLines.push(`[quote] message.key participant: ${message.key?.participant || 'null'} remoteJid: ${message.key?.remoteJid || 'null'}`);
    debugLines.push(`[quote] derived senderId: ${senderId || 'null'}`);
    debugLines.push(`[quote] sock.contacts available count: ${sock.contacts ? Object.keys(sock.contacts).length : 0}`);
    if (sock.contacts && sock.contacts[senderId]) {
        try {
            const contactStr = JSON.stringify(sock.contacts[senderId]);
            debugLines.push(`[quote] contact entry for senderId: ${contactStr.length > 800 ? contactStr.slice(0, 800) + '... (truncated)' : contactStr}`);
        } catch {
            debugLines.push('[quote] contact entry for senderId: [unserializable]');
        }
    }

    let name = 'user';
    try {
        const getDisplayName = require('../lib/getDisplayName');
        debugLines.push(`[quote] calling getDisplayName with jid=${senderId}`);
        const resolved = await getDisplayName(sock, senderId);
        debugLines.push(`[quote] getDisplayName returned: ${resolved || 'null'}`);

        // If resolved looks like a numeric id (no real display name), try fallbacks:
        const looksNumeric = resolved && String(resolved).replace(/\D/g, '').length === String(resolved).length;

        if (resolved && !looksNumeric) {
            name = resolved;
        } else {
            // 1) Try sock.contacts (may be populated)
            try {
                if (sock.contacts && sock.contacts[senderId]) {
                    const c = sock.contacts[senderId];
                    if (c.notify) name = c.notify;
                    else if (c.name) name = c.name;
                    else if (c.vname) name = c.vname;
                }
            } catch (e) {}

            // 2) Try group metadata participants (if in a group)
            if ((!name || name === 'user' || looksNumeric) && message.key && message.key.remoteJid && message.key.remoteJid.endsWith('@g.us')) {
                try {
                    const { getGroupMetadata } = require('../lib/groupCache');
                    const meta = await getGroupMetadata(sock, message.key.remoteJid).catch(() => null);
                    if (meta && Array.isArray(meta.participants)) {
                        const short = senderId.split('@')[0];
                        const p = meta.participants.find(px => (px.id || '').includes(short));
                        if (p) {
                            if (p.notify) name = p.notify;
                            else if (p.vname) name = p.vname;
                        }
                    }
                } catch (e) {}
            }

            // 3) Try reading pushName from quoted message context (best-effort)
            if ((!name || name === 'user' || looksNumeric) && ctx?.quotedMessage) {
                try {
                    const quoted = ctx.quotedMessage;
                    // extendedTextMessage may carry a 'contextInfo' with 'participant' and 'extendedTextMessage'
                    const pn = message.message?.extendedTextMessage?.contextInfo?.participant || message.key?.participant || '';
                    if (pn && pn === senderId && message.pushName) name = message.pushName;
                } catch (e) {}
            }

            // final fallback: use resolved even if numeric
            if ((!name || name === 'user') && resolved) name = resolved;
        }
    } catch (err) {
        debugLines.push(`[quote] getDisplayName error: ${err && err.message ? err.message : String(err)}`);
    }

    // Send debug info to the chat (quoted to the original message)
    try {
        await sock.sendMessage(chatId, { text: debugLines.join('\n') }, { quoted: message });
    } catch (e) {
        // ignore send errors
    }

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

    const res = await fetch('https://bot.lyo.su/quote/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        await sock.sendMessage(chatId, { text: 'Ошибка генерации quote' }, { quoted: message });
        return;
    }

    const json = await res.json();
    if (!json?.result?.image) {
        await sock.sendMessage(chatId, { text: 'Некорректный ответ сервиса' }, { quoted: message });
        return;
    }

    const tmpDir = path.join(os.tmpdir(), 'quote');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const pngPath = path.join(tmpDir, `q_${Date.now()}.png`);
    const webpPath = path.join(tmpDir, `q_${Date.now()}.webp`);

    fs.writeFileSync(pngPath, Buffer.from(json.result.image, 'base64'));

    await new Promise((resolve, reject) => {
        exec(
            `ffmpeg -y -i "${pngPath}" -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -c:v libwebp -pix_fmt yuva420p -quality 75 "${webpPath}"`,
            err => err ? reject(err) : resolve()
        );
    });

    const img = new webp.Image();
    await img.load(fs.readFileSync(webpPath));

    const meta = {
        'sticker-pack-id': crypto.randomBytes(16).toString('hex'),
        'sticker-pack-name': 'Quote',
        'emojis': ['💬']
    };

    const exifBase = Buffer.from([
        0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,
        0x01,0x00,0x41,0x57,0x07,0x00,0x00,0x00,
        0x00,0x00,0x16,0x00,0x00,0x00
    ]);

    const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8');
    const exif = Buffer.concat([exifBase, metaBuf]);
    exif.writeUIntLE(metaBuf.length, 14, 4);

    img.exif = exif;

    const finalBuffer = await img.save(null);

    await sock.sendMessage(
        chatId,
        { sticker: finalBuffer },
        { quoted: message }
    );

    try {
        fs.unlinkSync(pngPath);
        fs.unlinkSync(webpPath);
    } catch {}
}

module.exports = quoteCommand;
