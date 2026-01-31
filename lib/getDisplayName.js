const { getGroupMetadata } = require('./groupCache');

function shortJid(jid = '') {
    if (!jid) return '';
    return jid.split('@')[0];
}

async function getDisplayName(sock, jid) {
    if (!jid) return '';
    try {
        // Normalize internal '@lid' domain to standard WhatsApp JID
        if (typeof jid === 'string' && jid.endsWith('@lid')) {
            jid = jid.replace(/@lid$/, '@s.whatsapp.net');
        }
        if (typeof sock.getName === 'function') {
            const name = await sock.getName(jid).catch(() => null);
            if (name) {
                const stripped = String(name).replace(/\D/g, '');
                if (!/^\d+$/.test(stripped) || stripped.length < String(name).length) return name;
            }
        }
    } catch (e) {}

    try {
        if ((jid || '').endsWith('@g.us') && typeof sock.groupMetadata === 'function') {
            const meta = await getGroupMetadata(sock, jid).catch(() => null);
            if (meta && meta.subject) return meta.subject;
        }
    } catch (e) {}

    try {
        if (sock.contacts && sock.contacts[jid]) {
            const c = sock.contacts[jid];
            if (c.notify) return c.notify;
            if (c.name) return c.name;
            if (c.vname) return c.vname;
        }
    } catch (e) {}

    return shortJid(jid);
}

module.exports = getDisplayName;

