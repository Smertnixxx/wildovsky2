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
    if (!srcText && ctx?.quotedMessage?.extendedTextMessage?.text) {
        srcText = ctx.quotedMessage.extendedTextMessage.text;
    }

    if (!srcText) {
        await sock.sendMessage(
            chatId,
            { text: 'Напиши текст или ответь на сообщение с текстом' },
            { quoted: message }
        );
        return;
    }

    // ============================================
    // 🔧 ИСПРАВЛЕНИЕ: Правильное получение senderId
    // ============================================
    let senderId;
    let senderLid; // Сохраняем оригинальный LID для получения имени
    
    // В группах используем participant из quoted message или из ключа сообщения
    if (chatId.endsWith('@g.us')) {
        // Приоритет: quoted participant > message participant
        senderId = ctx?.participant || message.key?.participant || message.key?.remoteJid;
        senderLid = senderId; // Сохраняем оригинальный LID
        
        // Конвертируем @lid в @s.whatsapp.net для получения аватарки
        if (senderId && senderId.endsWith('@lid')) {
            const lidNumber = senderId.split('@')[0];
            senderId = `${lidNumber}@s.whatsapp.net`;
        }
    } else {
        // В личных сообщениях
        senderId = message.key?.remoteJid || message.key?.participant || '';
    }

    // Нормализация senderId
    if (typeof senderId === 'string' && !senderId.includes('@')) {
        senderId = `${senderId}@s.whatsapp.net`;
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

    // ============================================
    // 🔧 ИСПРАВЛЕНИЕ: Правильное получение имени QUOTED USER
    // ============================================
    let name = 'user';
    
    try {
        // 1) Сначала пробуем получить имя из метаданных группы (САМЫЙ НАДЁЖНЫЙ СПОСОБ)
        if (chatId.endsWith('@g.us')) {
            try {
                const groupMeta = await sock.groupMetadata(chatId).catch(() => null);
                if (groupMeta && groupMeta.participants) {
                    // Ищем участника по LID (оригинальному идентификатору)
                    const participant = groupMeta.participants.find(p => {
                        const pId = p.id || '';
                        const pLid = p.lid || '';
                        
                        // Сравниваем и с обычным id и с lid
                        return pId === senderLid || 
                               pId === senderId || 
                               pLid === senderLid ||
                               pId.split('@')[0] === (senderLid || '').split('@')[0];
                    });
                    
                    if (participant) {
                        // Приоритет: notify (пушнейм) > vname (имя в контактах) > имя из профиля
                        name = participant.notify || participant.vname || participant.name || name;
                        console.log(`[quote] Found name from group metadata: ${name}`);
                    }
                }
            } catch (e) {
                console.error('[quote] Error getting group metadata:', e);
            }
        }
        
        // 2) ИСПРАВЛЕНИЕ: Пробуем получить pushName из QUOTED сообщения (НЕ из текущего)
        if (name === 'user' && ctx?.quotedMessage) {
            // Ищем pushName в контексте quoted сообщения
            // Структура может быть разной, пробуем все варианты
            const quotedPushName = ctx.pushName || 
                                   ctx.quotedMessage?.pushName ||
                                   message.message?.extendedTextMessage?.contextInfo?.pushName;
            
            if (quotedPushName) {
                name = quotedPushName;
                console.log(`[quote] Using quoted message pushName: ${name}`);
            }
        }
        
        // 3) Если всё ещё не нашли и это НЕ quoted сообщение, используем pushName текущего отправителя
        // (это для случая когда пишут .quote <текст> без reply)
        if (name === 'user' && !ctx?.quotedMessage && message.pushName) {
            name = message.pushName;
            console.log(`[quote] Using current message pushName: ${name}`);
        }
        
        // 4) Пробуем getDisplayName как fallback
        if (name === 'user') {
            const getDisplayName = require('../lib/getDisplayName');
            const resolved = await getDisplayName(sock, senderId).catch(() => null);
            if (resolved && String(resolved).replace(/\D/g, '').length !== String(resolved).length) {
                name = resolved;
                console.log(`[quote] Using getDisplayName: ${name}`);
            }
        }
        
        // 5) Проверяем sock.contacts
        if (name === 'user' && sock.contacts && sock.contacts[senderId]) {
            const c = sock.contacts[senderId];
            name = c.notify || c.name || c.vname || name;
            console.log(`[quote] Using sock.contacts: ${name}`);
        }
        
    } catch (err) {
        console.error('[quote] Error getting name:', err);
    }

    // ============================================
    // 🔧 ИСПРАВЛЕНИЕ: Правильное получение аватарки
    // ============================================
    let avatar = null;
    
    // Пробуем разные варианты ID для получения аватарки
    const tryIds = [];
    
    // В группах: сначала пробуем оригинальный participant (может быть @lid)
    if (chatId.endsWith('@g.us')) {
        if (ctx?.participant) tryIds.push(ctx.participant);
        if (message.key?.participant) tryIds.push(message.key.participant);
        
        // Конвертированные версии
        if (senderId) tryIds.push(senderId);
        
        // Пробуем получить из метаданных группы
        try {
            const groupMeta = await sock.groupMetadata(chatId).catch(() => null);
            if (groupMeta && groupMeta.participants) {
                const participant = groupMeta.participants.find(p => {
                    const pId = p.id || '';
                    return pId === senderLid || 
                           pId === senderId || 
                           pId.split('@')[0] === (senderLid || '').split('@')[0];
                });
                
                if (participant && participant.id) {
                    tryIds.push(participant.id);
                }
            }
        } catch (e) {}
    } else {
        // В личных сообщениях
        tryIds.push(senderId);
        if (message.key?.remoteJid) tryIds.push(message.key.remoteJid);
    }
    
    // Пробуем получить аватарку для каждого ID
    for (const idTry of tryIds) {
        if (!idTry) continue;
        
        try {
            console.log(`[quote] Trying to get avatar for: ${idTry}`);
            avatar = await sock.profilePictureUrl(idTry, 'image');
            if (avatar) {
                console.log(`[quote] Avatar found for: ${idTry}`);
                break;
            }
        } catch (e) {
            // Продолжаем пробовать следующий ID
        }
    }
    
    // Fallback аватарка
    if (!avatar) {
        avatar = 'https://www.clipartmax.com/png/full/245-2459068_marco-martinangeli-coiffeur-portrait-of-a-man.png';
        console.log('[quote] Using default avatar');
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