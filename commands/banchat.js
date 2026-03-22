// commands/banchat.js
// Блокировка бота в конкретной группе — только для владельца

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/bannedChats.json');

// ──────────────────────────────────────────────
// Хранилище
// ──────────────────────────────────────────────
function readData() {
    try {
        if (!fs.existsSync(DATA_FILE)) return { banned: [] };
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    } catch {
        return { banned: [] };
    }
}

function writeData(data) {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ──────────────────────────────────────────────
// Публичное API
// ──────────────────────────────────────────────

/** Проверяет, заблокирована ли группа */
function isChatBanned(chatId) {
    const data = readData();
    return data.banned.includes(chatId);
}

/** Основной обработчик команд .банчат / .разбанчат */
async function handle(sock, chatId, senderId, message) {
    const isOwner = message.key.fromMe;

    if (!isOwner) {
        await sock.sendMessage(chatId, {
            text: '❌ Эту команду может использовать только владелец бота.'
        }, { quoted: message });
        return;
    }

    const userMessage = (
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        ''
    ).trim().toLowerCase();

    const data = readData();

    // ── .банчат ──────────────────────────────
    if (userMessage === '.банчат') {
        if (data.banned.includes(chatId)) {
await sock.sendMessage(chatId, {
    react: {
        text: '❌',         
        key: message.key
    }
});

            return;
        }

        data.banned.push(chatId);
        writeData(data);

await sock.sendMessage(chatId, {
    react: {
        text: '🔒',         
        key: message.key
    }
});

        return;
    }

    // ── .разбанчат ───────────────────────────
    if (userMessage === '.разбанчат') {
        const idx = data.banned.indexOf(chatId);

        if (idx === -1) {
await sock.sendMessage(chatId, {
    react: {
        text: '❌',         
        key: message.key
    }
});

            return;
        }

        data.banned.splice(idx, 1);
        writeData(data);

await sock.sendMessage(chatId, {
    react: {
        text: '🔓',         
        key: message.key
    }
});

        return;
    }
}

module.exports = { handle, isChatBanned };