const os = require('os');
const settings = require('../settings.js');

function formatTime(seconds) {
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds = seconds % (24 * 60 * 60);
    const hours = Math.floor(seconds / (60 * 60));
    seconds = seconds % (60 * 60);
    const minutes = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);

    let time = '';
    if (days > 0) time += `${days}d `;
    if (hours > 0) time += `${hours}h `;
    if (minutes > 0) time += `${minutes}m `;
    if (seconds > 0 || time === '') time += `${seconds}s`;

    return time.tr
}

async function pingCommand(sock, chatId, message) {
    try {
        const start = Date.now();


        const sent = await sock.sendMessage(chatId, { text: 'Понг!' }, { quoted: message });
        const statusKey = sent.key;

        const end = Date.now();
        const ping = Math.round((end - start) / 2);

        const uptimeInSeconds = process.uptime();
        const uptimeFormatted = formatTime(uptimeInSeconds);

        const botInfo = `
пинг ботаааааааффф - ${ping} ms
время его работы - ${uptimeFormatted}
`.trim();
        await sock.sendMessage(chatId, { text: botInfo, edit: statusKey });

    } catch (error) {
        console.error('Error in ping command:', error);
        await sock.sendMessage(chatId, { text: 'ошибка при получении сведений о пинге' });
    }
}

module.exports = pingCommand;
