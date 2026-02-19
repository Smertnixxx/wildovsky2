// commands/autoreactgroup.js
const TARGET_GROUPS = [
    '120363402716312069@g.us',
    '120363405274652726@g.us'
];

const EMOJIS = ['🦆'];
const pick = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

const cooldowns = new Map();
const COOLDOWN_MS = 2000;

const isOnCooldown = (key) => {
    const last = cooldowns.get(key);
    return last ? Date.now() - last < COOLDOWN_MS : false;
};

const stamp = (key) => cooldowns.set(key, Date.now());

const isAdminParticipant = (p, senderId) => {
    if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
    return p.id === senderId || p.lid === senderId;
};

const getAdmins = async (sock, groupId) => {
    try {
        const meta = await sock.groupMetadata(groupId);
        return meta.participants.filter(p =>
            p.admin === 'admin' || p.admin === 'superadmin'
        );
    } catch (e) {
        console.error('[autoreact] metadata error:', e?.message);
        return [];
    }
};

async function react(sock, msg) {
    const groupId = msg.key.remoteJid;
    if (!TARGET_GROUPS.includes(groupId)) return;
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const senderId = msg.key.participant || groupId;

    const cooldownKey = groupId + ':' + senderId;
    if (isOnCooldown(cooldownKey)) return;

    try {
        const admins = await getAdmins(sock, groupId);
        const isAdmin = admins.some(p => isAdminParticipant(p, senderId));

        if (!isAdmin) {
            console.log('[autoreact] not admin:', senderId);
            return;
        }

        stamp(cooldownKey);
        await sock.sendMessage(groupId, {
            react: { text: pick(), key: msg.key }
        });
    } catch (e) {
        console.error('[autoreact] error:', e?.message);
    }
}

module.exports = { react };