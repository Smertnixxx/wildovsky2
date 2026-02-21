const fs = require('fs');
const path = require('path');

const msgPath = path.join(process.cwd(), 'data', 'messageCount.json');

const windows = {};  // { jid: { chatId, timestamps[] } }
const timeout = {};  // { jid: timeoutUntil }

const WINDOW_MS  = 8 * 1000;   // окно 8 секунд
const THRESHOLD  = 3;           // триггер на 4-м сообщении
const TIMEOUT_MS = 5 * 60 * 1000;   // таймаут 5 минут

function loadMsg() {
    try { return JSON.parse(fs.readFileSync(msgPath, 'utf8')); }
    catch { return {}; }
}

function saveMsg(data) {
    try { fs.writeFileSync(msgPath, JSON.stringify(data, null, 2)); }
    catch (e) { console.error('antispam saveMsg error:', e.message); }
}

// Списываем только spamCount сообщений у пользователя в конкретном чате
function deductSpamMsgs(chatId, jid, spamCount) {
    try {
        const data = loadMsg();
        if (!data[chatId]) return;
        const current = data[chatId][jid] || 0;
        data[chatId][jid] = Math.max(0, current - spamCount);
        saveMsg(data);
    } catch (e) {
        console.error('antispam deductSpamMsgs error:', e.message);
    }
}

// Возвращает { spam, spamCount, resetDone, remaining }
function check(chatId, jid) {
    const now = Date.now();

    // В таймауте — сообщение не засчитываем
    if (timeout[jid]) {
        if (now < timeout[jid]) {
            return { spam: true, remaining: Math.ceil((timeout[jid] - now) / 1000) };
        }
        // Таймаут истёк — восстанавливаем
        delete timeout[jid];
        delete windows[jid];
    }

    if (!windows[jid]) windows[jid] = { chatId, timestamps: [] };

    // Убираем записи вне окна
    windows[jid].timestamps = windows[jid].timestamps.filter(t => now - t < WINDOW_MS);
    windows[jid].timestamps.push(now);

    if (windows[jid].timestamps.length > THRESHOLD) {
        // Сколько сообщений было в окне — именно их и списываем
        const spamCount = windows[jid].timestamps.length;
        deductSpamMsgs(chatId, jid, spamCount);

        timeout[jid] = now + TIMEOUT_MS;
        delete windows[jid];

        return { spam: true, resetDone: true, spamCount, remaining: Math.ceil(TIMEOUT_MS / 1000) };
    }

    return { spam: false };
}

function remaining(jid) {
    const now = Date.now();
    if (!timeout[jid] || now >= timeout[jid]) return 0;
    return Math.ceil((timeout[jid] - now) / 1000);
}

function isBlocked(jid) {
    return remaining(jid) > 0;
}

function unblock(jid) {
    delete timeout[jid];
    delete windows[jid];
}

module.exports = { check, isBlocked, remaining, unblock };