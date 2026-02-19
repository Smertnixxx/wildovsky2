const TARGET_GROUP = '120363402716312069@g.us';

const EMOJIS = ['🦆'];

const pick = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

async function react(sock, msg) {
    if (msg.key.remoteJid !== TARGET_GROUP) return;
    if (!msg.message) return;

    await sock.sendMessage(TARGET_GROUP, {
        react: { text: pick(), key: msg.key }
    });
}

module.exports = { react };