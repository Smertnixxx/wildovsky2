const fs = require('fs');
const path = require('path');

const warnPath = path.join(process.cwd(), 'data', 'warns.json');

function format(ms) {
    if (ms <= 0) return 'истекло';
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

async function warnlist(sock, chatId) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах' });
            return;
        }

        const warns = load();
        const group = warns[chatId];

        if (!group || Object.keys(group).length === 0) {
            await sock.sendMessage(chatId, { text: '⚪ В этой группе нет пользователей с предупреждениями' });
            return;
        }

        const now = Date.now();
        const lines = [];
        const mentions = [];

        for (const [uid, data] of Object.entries(group)) {
            if (!data.count || data.count === 0) continue;

            const name = await sock.getName(uid);
            mentions.push(uid);

            const reasons = [];
            for (let i = 0; i < data.list.length; i++) {
                const w = data.list[i];
                const adminName = await sock.getName(w.admin).catch(() => 'Неизвестно');
                reasons.push(`   ${i + 1}. ${w.reason} — от ${adminName}\n      ⏰ ${format(w.expiration - now)}`);
            }

            lines.push(`*${name}* (${data.count}/3)\n${reasons.join('\n')}`);
        }

        if (lines.length === 0) {
            await sock.sendMessage(chatId, { text: '⚪ В этой группе нет пользователей с предупреждениями' });
            return;
        }

        await sock.sendMessage(chatId, {
            text: `⚠️ *Предупреждения в группе:*\n\n${lines.join('\n\n')}`,
            mentions
        });

    } catch (e) {
        console.error('Error in warnlist:', e);
        await sock.sendMessage(chatId, { text: '❌ Не удалось получить список предупреждений' });
    }
}

module.exports = warnlist;