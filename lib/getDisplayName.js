// lib/getDisplayName.js
const { getGroupMetadata, getCached } = require('./groupMetadataQueue');

async function getDisplayName(sock, jid = '') {
    if (!jid) return '';

    try {
        const id = (typeof sock.decodeJid === 'function') ? sock.decodeJid(jid) : jid;

        // Группа
        if (id && id.endsWith && id.endsWith('@g.us')) {
            // 1) Store contacts (быстро)
            const storeContact = sock.store?.contacts?.[id];
            if (storeContact) {
                const subject = storeContact.subject || storeContact.name || storeContact.notify || storeContact.vname;
                if (subject && subject.toString().trim()) return subject.toString();
            }

            // 2) Сначала пробуем кэш (вообще без запроса)
            const cached = getCached(id);
            if (cached && cached.subject) return cached.subject;

            // 3) Через очередь (НЕ напрямую sock.groupMetadata!)
            try {
                const meta = await getGroupMetadata(sock, id);
                if (meta && meta.subject) return meta.subject;
            } catch (e) {
                // ignore
            }

            return id.split('@')[0];
        }

        // Личный контакт
        let name = '';
        try {
            if (typeof sock.getName === 'function') {
                name = await sock.getName(jid);
            }
        } catch (e) {
            name = '';
        }

        if (name && name.toString().trim()) {
            if (!/^\+?\d+$/.test(String(name))) return String(name);
        }

        const contact = sock.store?.contacts?.[id] || sock.store?.contacts?.[jid];
        if (contact) {
            const candidate = contact.name || contact.notify || contact.vname || contact.verifiedName;
            if (candidate && candidate.toString().trim()) return String(candidate);
        }

        if (name && name.toString().trim()) return String(name);
        return (id || jid).split('@')[0];
    } catch (e) {
        return (jid || '').split('@')[0];
    }
}

module.exports = getDisplayName;