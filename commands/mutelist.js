const fs = require('fs');
const path = require('path');

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

function format(ms) {
    let s = Math.floor(ms / 1000) % 60;
    let m = Math.floor(ms / 60000) % 60;
    let h = Math.floor(ms / 3600000) % 24;
    let d = Math.floor(ms / 86400000);

    const plural = (n, one, few, many) => {
        if (n % 10 === 1 && n % 100 !== 11) return one;
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

async function mutelist(sock, chatId) {
    try {
        init();

        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, {
                text: 'Эту команду можно использовать только в группах'
            });
            return;
        }

        let mutes = {};
        try {
            mutes = JSON.parse(fs.readFileSync(mutePath, 'utf8'));
        } catch {
            mutes = {};
        }

        const groupMutes = mutes[chatId];
        if (!groupMutes) {
            await sock.sendMessage(chatId, {
                text: '⚪ В этой группе нет замьюченных пользователей'
            });
            return;
        }

        const now = Date.now();
        const active = [];

        for (const [userId, data] of Object.entries(groupMutes)) {
            if (!data.muted) continue;

            if (data.expiration <= now) {
                delete groupMutes[userId];
                continue;
            }

            const name = await sock.getName(userId);
            const admin = await sock.getName(data.admin);

            active.push({
                id: userId,
                name: name || 'Без имени',
                reason: data.reason || 'Нет причины',
                timeLeft: format(data.expiration - now),
                expiration: new Date(data.expiration).toLocaleString('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                admin: admin || 'Неизвестно'
            });
        }

        if (active.length === 0) {
            delete mutes[chatId];
            fs.writeFileSync(mutePath, JSON.stringify(mutes, null, 2));

            await sock.sendMessage(chatId, {
                text: '⚪ В этой группе нет замьюченных пользователей'
            });
            return;
        }

        fs.writeFileSync(mutePath, JSON.stringify(mutes, null, 2));

        const text = active.map((u, i) =>
            `${i + 1}. *${u.name}*\n` +
            `⏰ До: ${u.expiration}\n` +
            `⌛ Осталось: ${u.timeLeft}\n` +
            `💬 Причина: ${u.reason}\n` +
            `👮 Заглушил: ${u.admin}`
        ).join('\n\n');

        await sock.sendMessage(chatId, {
            text: `⚪ *Список замьюченных пользователей:*\n\n${text}`,
            mentions: active.map(u => u.id)
        });

    } catch (e) {
        console.error('Error in mutelist:', e);
        await sock.sendMessage(chatId, {
            text: '❌ Не удалось получить список замьюченных'
        });
    }
}

module.exports = mutelist;
