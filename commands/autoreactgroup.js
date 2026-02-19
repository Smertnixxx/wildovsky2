const TARGET_GROUPS = [
    '120363402716312069@g.us',
    '120363405274652726@g.us'
];

const EMOJIS = ['🦆'];

const pick = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

const cooldowns = new Map();
const COOLDOWN_MS = 2000;

const normalize = (jid) =>
    jid?.includes('@lid')
        ? jid.replace('@lid', '@s.whatsapp.net')
        : jid;

const isOnCooldown = (key) => {
    const last = cooldowns.get(key);
    if (!last) return false;
    return Date.now() - last < COOLDOWN_MS;
};

const stamp = (key) => cooldowns.set(key, Date.now());

const getAdmins = async (sock, groupId) => {
    try {
        const meta = await sock.groupMetadata(groupId);

        const admins = meta.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => normalize(p.id));

        console.log('[autoreact] admins in', groupId, admins);

        return admins;
    } catch (e) {
        console.error('[autoreact] metadata error:', e?.message || e);
        return [];
    }
};

async function react(sock, msg) {
    const groupId = msg.key.remoteJid;

    if (!TARGET_GROUPS.includes(groupId)) return;
    if (!msg.message) return;
    if (msg.key.fromMe) return;

    const senderRaw = msg.key.participant || groupId;
    const senderId = normalize(senderRaw);

    console.log('[autoreact] message from:', senderRaw, 'normalized:', senderId);
    console.log('[autoreact] group:', groupId);

    const cooldownKey = groupId + ':' + senderId;

    if (isOnCooldown(cooldownKey)) {
        console.log('[autoreact] cooldown active for', cooldownKey);
        return;
    }

    try {
        const admins = await getAdmins(sock, groupId);

        if (!admins.includes(senderId)) {
            console.log('[autoreact] not admin:', senderId);
            return;
        }

        stamp(cooldownKey);

        console.log('[autoreact] reacting to message', msg.key.id);

        await sock.sendMessage(groupId, {
            react: { text: pick(), key: msg.key }
        });

    } catch (e) {
        console.error('[autoreact] error:', e?.message || e);
    }
}

module.exports = { react };
