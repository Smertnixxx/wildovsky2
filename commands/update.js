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
        await sock.sendMessage(
            chatId,
            { text: 'тебе нельзя' },
            { quoted: message }
        );
        return;
    }

    try {
        await sock.sendMessage(
            chatId,
            { text: 'обновляю...' },
            { quoted: message }
        );

        const output = await run('git pull');

        let reply;
        if (output.includes('Already up to date')) {
            reply = 'обновлений нет';
        } else {
            reply = `✅ Обновлено:\n\n${output}`;
        }

        await sock.sendMessage(
            chatId,
            { text: reply },
            { quoted: message }
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
