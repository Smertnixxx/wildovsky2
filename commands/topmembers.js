const fs = require('fs');
const path = require('path');
const getDisplayName = require('../lib/getDisplayName');

const dataFilePath = path.join(__dirname, '..', 'data', 'messageCount.json');

function loadMessageCounts() {
    if (fs.existsSync(dataFilePath)) {
        return JSON.parse(fs.readFileSync(dataFilePath));
    }
    return {};
}

function saveMessageCounts(messageCounts) {
    fs.writeFileSync(dataFilePath, JSON.stringify(messageCounts, null, 2));
}

function incrementMessageCount(groupId, userId) {
    const messageCounts = loadMessageCounts();

    if (!messageCounts[groupId]) {
        messageCounts[groupId] = {};
    }

    if (!messageCounts[groupId][userId]) {
        messageCounts[groupId][userId] = 0;
    }

    messageCounts[groupId][userId] += 1;

    saveMessageCounts(messageCounts);
}

async function topMembers(sock, chatId, isGroup) {
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: 'Команда может быть использована только в группах' });
        return;
    }

    const messageCounts = loadMessageCounts();
    const groupCounts = messageCounts[chatId] || {};

    const totalMessages = Object.values(groupCounts)
        .reduce((sum, count) => sum + count, 0);

    const sortedMembers = Object.entries(groupCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10);

    if (sortedMembers.length === 0) {
        await sock.sendMessage(chatId, { text: 'Удивительно но сообщений нету.' });
        return;
    }

    let message =
        `💬 Таблица лидеров по сообщениям в группе\n` +
        `Всего сообщений: ${totalMessages}\n\n`;

    for (let i = 0; i < sortedMembers.length; i++) {
        const [userId, count] = sortedMembers[i];

        let name;
        try {
            name = await getDisplayName(sock, userId);
        } catch {
            name = userId;
        }

        message += `${i + 1}. ${name} - ${count} ✉️\n`;
    }

    await sock.sendMessage(chatId, { text: message });
}

module.exports = { incrementMessageCount, topMembers };
