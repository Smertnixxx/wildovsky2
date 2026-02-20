const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const dbDir = path.join(process.cwd(), 'data');
const warnPath = path.join(dbDir, 'warns.json');

function init() {
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    if (!fs.existsSync(warnPath)) fs.writeFileSync(warnPath, JSON.stringify({}), 'utf8');
}

function parse(duration) {
    const regex = /(\d+)\s*(с(ек(унд(ы|а)?)?)?|м(ин(ут(ы|а)?)?)?|ч(ас(ов)?)?|д(н(ей|и|я)?)?)/gi;
    const map = { с: 1000, м: 60000, ч: 3600000, д: 86400000 };
    let total = 0, m;
    while ((m = regex.exec(duration)) !== null) {
        total += parseInt(m[1]) * map[m[2][0].toLowerCase()];
    }
    return total;
}

function format(ms) {
    const plural = (n, a, b, c) =>
        n % 10 === 1 && n % 100 !== 11 ? a :
        n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;

    const d = Math.floor(ms / 86400000);
    const h = Math.floor(ms / 3600000) % 24;
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;

    return [
        d > 0 && `${d} ${plural(d, 'день', 'дня', 'дней')}`,
        h > 0 && `${h} ${plural(h, 'час', 'часа', 'часов')}`,
        m > 0 && `${m} ${plural(m, 'минута', 'минуты', 'минут')}`,
        s > 0 && `${s} ${plural(s, 'секунда', 'секунды', 'секунд')}`,
    ].filter(Boolean).join(', ');
}

function load() {
    try { return JSON.parse(fs.readFileSync(warnPath, 'utf8')); }
    catch { return {}; }
}

function save(data) {
    fs.writeFileSync(warnPath, JSON.stringify(data, null, 2));
}

async function warn(sock, chatId, senderId, message) {
    try {
        init();

        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах' });
            return;
        }

        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: '❌ Дайте боту права администратора' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { text: '❌ Только администраторы могут использовать эту команду' }, { quoted: message });
            return;
        }

        let who = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                  message.message?.extendedTextMessage?.contextInfo?.participant;

        if (!who) {
            await sock.sendMessage(chatId, {
                text: '❕ Упомяните участника или ответьте на его сообщение\n\nПример: .пред @user причина 1 час'
            }, { quoted: message });
            return;
        }

        const normalizedWho = who.includes('@') ? who : who + '@s.whatsapp.net';

        const botId = sock.user.jid;
        const botOwnerId = sock.user.id;
        const groupMeta = await sock.groupMetadata(chatId);
        const owner = groupMeta.owner || groupMeta.participants.find(p => p.admin === 'superadmin')?.id;

        if (normalizedWho === botId) {
            await sock.sendMessage(chatId, { text: '❌ Нельзя выдать предупреждение боту', mentions: [normalizedWho] }, { quoted: message });
            return;
        }

        if (normalizedWho.split('@')[0] === botOwnerId.split('@')[0]) {
            await sock.sendMessage(chatId, { text: '❌ Нельзя выдать предупреждение владельцу бота', mentions: [normalizedWho] }, { quoted: message });
            return;
        }

        if (normalizedWho === senderId) {
            await sock.sendMessage(chatId, { text: '❌ Нельзя выдать предупреждение самому себе', mentions: [normalizedWho] }, { quoted: message });
            return;
        }

        if (owner && normalizedWho.split('@')[0] === owner.split('@')[0]) {
            await sock.sendMessage(chatId, { text: '❌ Нельзя выдать предупреждение владельцу группы', mentions: [normalizedWho] }, { quoted: message });
            return;
        }

        const text = message.message?.conversation ||
                     message.message?.extendedTextMessage?.text || '';

        let args = text.replace('@' + who.split('@')[0], '').trim().split(/\s+/);
        args.shift();

        let reasonParts = [];
        let duration = 0;

        for (let i = 0; i < args.length; i++) {
            const part = args[i];
            if (!isNaN(part) && i < args.length - 1) {
                const unit = args[i + 1].toLowerCase();
                if (/^(с|сек|мин|час|дн)/.test(unit)) {
                    duration = parse(part + ' ' + unit);
                    i++;
                } else {
                    reasonParts.push(part);
                }
            } else {
                reasonParts.push(part);
            }
        }

        let reason = reasonParts.join(' ').trim() || 'Без причины';
        if (!duration) duration = 7 * 24 * 60 * 60 * 1000;

        const warns = load();
        if (!warns[chatId]) warns[chatId] = {};
        if (!warns[chatId][normalizedWho]) warns[chatId][normalizedWho] = { count: 0, list: [] };

        warns[chatId][normalizedWho].count += 1;
        warns[chatId][normalizedWho].list.push({
            reason,
            admin: senderId,
            expiration: Date.now() + duration,
            time: Date.now()
        });

        const count = warns[chatId][normalizedWho].count;
        save(warns);

        const name = await sock.getName(normalizedWho);

        await sock.sendMessage(chatId, {
            text: `⚠️ *${name}* получает предупреждение *(${count}/3)*\n⏰ Истекает через: *${format(duration)}*\n💬 Причина: *${reason}*`,
            mentions: [normalizedWho, senderId]
        }, { quoted: message });

        if (count >= 3) {
            warns[chatId][normalizedWho].count = 0;
            warns[chatId][normalizedWho].list = [];
            save(warns);

            await sock.sendMessage(chatId, {
                text: `🔴 *${name}* достиг лимита предупреждений и был исключён из группы`,
                mentions: [normalizedWho]
            });

            await sock.groupParticipantsUpdate(chatId, [normalizedWho], 'remove');
        }

    } catch (e) {
        console.error('Error in warn command:', e);
        await sock.sendMessage(chatId, { text: '❌ Не удалось выдать предупреждение' }, { quoted: message });
    }
}

module.exports = warn;