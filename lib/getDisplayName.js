// lib/getDisplayName.js
async function getDisplayName(sock, jid = '') {
    if (!jid) return '';

    try {
        // Normalize jid if socket exposes decode/normalize helper
        const id = (typeof sock.decodeJid === 'function') ? sock.decodeJid(jid) : jid;

        // If this is a group, prefer stored subject or groupMetadata subject
        if (id && id.endsWith && id.endsWith('@g.us')) {
            // 1) Try store (faster, doesn't hit network)
            const storeContact = sock.store?.contacts?.[id] || sock.store?.contacts?.[id];
            if (storeContact) {
                const subject = storeContact.subject || storeContact.name || storeContact.notify || storeContact.vname;
                if (subject && subject.toString().trim()) return subject.toString();
            }

            // 2) Try groupMetadata (may hit network / raise rate limits)
            try {
                if (typeof sock.groupMetadata === 'function') {
                    const meta = await sock.groupMetadata(id);
                    if (meta && (meta.subject || meta.subject?.toString())) return meta.subject || String(meta.subject);
                }
            } catch (e) {
                // ignore groupMetadata errors (rate limits etc.)
            }

            // 3) Fallback to jid local part
            return id.split('@')[0];
        }

        // For individual contacts try sock.getName (will use getName implementation from index.js)
        let name = '';
        try {
            if (typeof sock.getName === 'function') {
                name = await sock.getName(jid);
            }
        } catch (e) {
            name = '';
        }

        // Prefer non-empty name; if it's purely numeric, try store lookup
        if (name && name.toString().trim()) {
            // If name is just digits (phone-like), try store to get a nicer display
            if (!/^\+?\d+$/.test(String(name))) return String(name);
        }

        // Try store contact info for non-group jid
        const contact = sock.store?.contacts?.[id] || sock.store?.contacts?.[jid];
        if (contact) {
            const candidate = contact.name || contact.notify || contact.vname || contact.verifiedName;
            if (candidate && candidate.toString().trim()) return String(candidate);
        }

        // Fallbacks: prefer name if present, otherwise jid local part
        if (name && name.toString().trim()) return String(name);
        return (id || jid).split('@')[0];
    } catch (e) {
        return (jid || '').split('@')[0];
    }
}

module.exports = getDisplayName;