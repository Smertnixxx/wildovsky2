const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const dbDir = path.join(process.cwd(), 'data');
const mutePath = path.join(dbDir, 'mutes.json');

function init() {
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    if (!fs.existsSync(mutePath)) {
        fs.writeFileSync(mutePath, JSON.stringify({}), 'utf8');
    }
}

function parse(duration) {
    const regex = /(\d+)\s*(с(ек(унд(ы|а)?)?)?|м(ин(ут(ы|а)?)?)?|ч(ас(ов)?)?|д(н(ей|и|я)?)?)/gi;
    const map = {
        с: 1000,
        м: 60000,
        ч: 3600000,
        д: 86400000,
    };

    let total = 0;
    let matches;
    while ((matches = regex.exec(duration)) !== null) {
        let [, value, unit] = matches;
        total += parseInt(value) * map[unit[0].toLowerCase()];
    }
    return total;
}

function format(ms) {
    let s = Math.floor(ms / 1000) % 60;
    let m = Math.floor(ms / 60000) % 60;
    let h = Math.floor(ms / 3600000) % 24;
    let d = Math.floor(ms / 86400000);

    const plural = (n, singular, few, many) => {
        if (n % 10 === 1 && n % 100 !== 11) return singular;
        if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
        return many;
    };

    let parts = [];
    if (d > 0) parts.push(`${d} ${plural(d, 'день', 'дня', 'дней')}`);
    if (h > 0) parts.push(`${h} ${plural(h, 'час', 'часа', 'часов')}`);
    if (m > 0) parts.push(`${m} ${plural(m, 'минута', 'минуты', 'минут')}`);
    if (s > 0) parts.push(`${s} ${plural(s, 'секунда', 'секунды', 'секунд')}`);

    return parts.join(', ');
}

async function muteCommand2(sock, chatId, senderId, message) {
    try {
        init();

        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { 
                text: 'Эту команду можно использовать только в группах'
            });
            return;
        }

        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ Дайте боту права администратора для использования этой команды'}, { quoted: message });
            return;
        }

        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { 
                text: '❌ Только администраторы группы могут использовать эту команду'
            }, { quoted: message });
            return;
        }
return sock.sendMessage(chatId, {text: 'команда мут временно недоступна'}, { quoted: message })
        let who = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                  message.message?.extendedTextMessage?.contextInfo?.participant;

        if (!who) {
            await sock.sendMessage(chatId, { 
                text: '❕ Упомяните участника или ответьте на его сообщение\n\nПример: .мут @user причина 1 час'
            }, { quoted: message });
            return;
        }

        // Нормализуем ID пользователя для единообразия
        const normalizedWho = who.includes('@lid') ? who : 
                             who.includes('@s.whatsapp.net') ? who : 
                             who + '@s.whatsapp.net';
        
        console.log(`Попытка замутить: ${normalizedWho} в чате ${chatId}`);

      const botId = sock.user.jid;
const botOwnerId = sock.user.id;
const groupMeta = await sock.groupMetadata(chatId);
const owner = groupMeta.owner || groupMeta.participants.find(p => p.admin === 'superadmin')?.id;


// 1. Проверка на бота
if (normalizedWho === botId) {
    await sock.sendMessage(chatId, { 
        text: '❌ Нельзя замутить бота',
        mentions: [normalizedWho]
    }, { quoted: message });
    return;
}

// 2. Проверка на владельца бота
if (normalizedWho.split('@')[0] === botOwnerId.split('@')[0]) {
    await sock.sendMessage(chatId, { 
        text: '❌ Нельзя замутить владельца бота',
        mentions: [normalizedWho]
    }, { quoted: message });
    return;
}

// 3. Проверка на самого себя
if (normalizedWho === senderId) {
    await sock.sendMessage(chatId, { 
        text: '❌ Нельзя замутить самого себя',
        mentions: [normalizedWho]
    }, { quoted: message });
    return;
}
        const text = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text || '';
        
        let args = text.replace('@' + who.split('@')[0], '').trim().split(/\s+/);
        args.shift(); // удаляем команду .мут
        
        let reasonParts = [];
        let timePart = '';
        let duration = 0;

        for (let i = 0; i < args.length; i++) {
            let part = args[i];
            if (!isNaN(part) && i < args.length - 1) {
                let unit = args[i + 1].toLowerCase();
                if (/^(с|сек|мин|час|дн)/.test(unit)) {
                    timePart = part + ' ' + unit;
                    duration = parse(timePart);
                    i++;
                } else {
                    reasonParts.push(part);
                }
            } else {
                reasonParts.push(part);
            }
        }

        let reason = reasonParts.join(' ').trim();
        if (!reason) reason = 'Без причины';
        if (!duration) duration = 7 * 24 * 60 * 60 * 1000;

        let mutes = {};
        try {
            mutes = JSON.parse(fs.readFileSync(mutePath, 'utf8'));
        } catch (e) {
            mutes = {};
        }

        if (!mutes[chatId]) mutes[chatId] = {};
        
        mutes[chatId][normalizedWho] = {
            muted: true,
            reason: reason,
            expiration: Date.now() + duration,
            admin: senderId,
            time: Date.now()
        };

        fs.writeFileSync(mutePath, JSON.stringify(mutes, null, 2));
        
        console.log(`Пользователь ${normalizedWho} замучен на ${format(duration)}`);

        const name = await sock.getName(normalizedWho);
        await sock.sendMessage(chatId, {
            text: `🚫 *${name}* получил мут на *${format(duration)}*\n💬 Причина: *${reason}*`,
            mentions: [normalizedWho, senderId]
        }, { quoted: message });

    } catch (error) {
        console.error('Error in mute command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Не удалось выдать мут'
        }, { quoted: message });
    }
}

async function check(sock, chatId, senderId, message) {
    try {
        init();

        if (!chatId.endsWith('@g.us')) return;
        if (!message?.key?.id) return;

        let mutes;
        try {
            mutes = JSON.parse(fs.readFileSync(mutePath, 'utf8'));
        } catch {
            return;
        }

        if (!mutes[chatId]) return;

        const now = Date.now();
        let changed = false;

        // 1. снимаем истёкшие муты и уведомляем
        for (const [uid, data] of Object.entries(mutes[chatId])) {
            if (!data.muted) continue;

            if (data.expiration <= now) {
                delete mutes[chatId][uid];
                changed = true;

                await sock.sendMessage(chatId, {
                    text: `✅ *@${uid.split('@')[0]}*, ваш мут истёк и теперь вы снова можете общаться`,
                    mentions: [uid]
                });
            }
        }

        if (changed) {
            if (Object.keys(mutes[chatId]).length === 0) {
                delete mutes[chatId];
            }
            fs.writeFileSync(mutePath, JSON.stringify(mutes, null, 2));
        }

        // 2. проверяем, замьючен ли отправитель
        const possibleIds = [
            senderId,
            senderId.split('@')[0] + '@s.whatsapp.net',
            senderId.split('@')[0] + '@lid'
        ];

        let mutedId = null;
        for (const id of possibleIds) {
            if (mutes[chatId]?.[id]?.muted) {
                mutedId = id;
                break;
            }
        }

        if (!mutedId) return;

        // 3. удаляем сообщение замьюченного
        await sock.sendMessage(chatId, {
            delete: {
                remoteJid: chatId,
                fromMe: false,
                id: message.key.id,
                participant: message.key.participant || mutedId
            }
        });

    } catch (e) {
        console.error('Error checking mute:', e);
    }
}


module.exports = { muteCommand2, check };