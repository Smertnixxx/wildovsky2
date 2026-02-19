const TARGET_GROUPS = [
    '120363402716312069@g.us',
    '120363405274652726@g.us'
];

const EMOJIS = ['🦆'];

const pick = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

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
    const groupId = msg.key.remoteJid;

    if (!TARGET_GROUPS.includes(groupId)) return;
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const senderId = msg.key.participant || groupId;

    if (isOnCooldown(senderId)) return;

    try {
        const admins = await getAdmins(sock, groupId);
        if (!admins.includes(senderId)) return;

        stamp(senderId);

        await sock.sendMessage(groupId, {
            react: { text: pick(), key: msg.key }
        });
    } catch (e) {
        console.error('[autoreactgroup] error:', e?.message || e);
    }
}

module.exports = { react };
