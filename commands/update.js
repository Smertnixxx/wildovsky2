const { exec } = require('child_process');
const isOwnerOrSudo = require('../lib/isOwner');

function run(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
            if (err) return reject(stderr || err.message);
            resolve(stdout.toString().trim());
        });
    });
}

async function updateCommand(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid;
    const isOwner = await isOwnerOrSudo(senderId, sock, chatId);

    if (!message.key.fromMe && !isOwner) {
        await sock.sendMessage(chatId, { text: 'тебе нельзя' }, { quoted: message });
        return;
    }

    try {
        const sent = await sock.sendMessage(
            chatId,
            { text: 'обновляю...' },
            { quoted: message }
        );

        const statusKey = sent.key;
        const output = await run('git pull');

        let text;
        if (output.includes('Already up to date')) {
            text = 'обновлений нет';
        } else {
text = `Обновлено\n\n${output}`;
        }

        await sock.sendMessage(
            chatId,
            { text, edit: statusKey }
        );
    } catch (err) {
        await sock.sendMessage(
            chatId,
            { text: `❌ Ошибка git pull:\n${String(err)}` },
            { quoted: message }
        );
    }
}

module.exports = updateCommand;
