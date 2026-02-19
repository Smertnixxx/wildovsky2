// commands/autoreactgroup.js
const TARGET_GROUP = '120363402716312069@g.us';
const EMOJIS = ['🦆'];

const pick = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

// rate limit: 1 реакция в 3 секунды на каждого админа
const cooldowns = new Map();
const COOLDOWN_MS = 2000;

const isOnCooldown = (jid) => {
    const last = cooldowns.get(jid);
    if (!last) return false;
    return Date.now() - last < COOLDOWN_MS;
};

const stamp = (jid) => cooldowns.set(jid, Date.now());

const getAdmins = async (sock, groupId) => {
    try {
        const meta = await sock.groupMetadata(groupId);
        return meta.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
    } catch {
        return [];
    }
};

async function react(sock, msg) {
    if (msg.key.remoteJid !== TARGET_GROUP) return;
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const senderId = msg.key.participant || msg.key.remoteJid;

    if (isOnCooldown(senderId)) return;

    try {
        const admins = await getAdmins(sock, TARGET_GROUP);
        if (!admins.includes(senderId)) return;

        stamp(senderId);

        await sock.sendMessage(TARGET_GROUP, {
            react: { text: pick(), key: msg.key }
        });
    } catch (e) {
        console.error('[autoreactgroup] error:', e?.message || e);
    }
}

module.exports = { react };