// commands/groupprotect.js
const settings = require('../settings');

const PROTECTED_GROUP = '120363424761879922@g.us';
const DELAY_BIBA = 800;
const DELAY_BOBA = 4500;

function norm(jid = '') {
    return jid.replace(/:\d+@/, '@').trim();
}

function self(sock) {
    return norm(sock.user?.id || '');
}

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function getMeta(sock, groupId) {
    return sock.groupMetadata(groupId);
}

async function isAdmin(sock, groupId, jid) {
    try {
        const m = await getMeta(sock, groupId);
        return m.participants
            .filter(p => p.admin)
            .map(p => norm(p.id))
            .includes(norm(jid));
    } catch {
        return false;
    }
}

// кик участника (action === 'remove')
async function handle(sock, groupId, participants, author) {
    if (groupId !== PROTECTED_GROUP) return;
    if (!author) return;

    const me      = self(sock);
    const partner = norm(settings.partnerJid || '');
    const role    = settings.botRole || 'biba';
    const authorN = norm(author);

    if (authorN === me)      return;
    if (authorN === partner) return;

    try {
        const m     = await getMeta(sock, groupId);
        const owner = norm(m.owner || '');

        if (authorN === owner) return;

        const raider = m.participants.find(p => norm(p.id) === authorN);
        if (!raider?.admin) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        if (await isAdmin(sock, groupId, author)) {
            await sock.groupParticipantsUpdate(groupId, [author], 'demote');
            console.log(`[protect][${role}] кик-рейдер снят: ${authorN}`);
        }
    } catch (e) {
        console.error(`[protect][handle]`, e.message);
    }
}

// снятие с админки (action === 'demote')
async function handleDemote(sock, groupId, participants, author) {
    if (groupId !== PROTECTED_GROUP) return;
    if (!author) return;

    const me      = self(sock);
    const partner = norm(settings.partnerJid || '');
    const role    = settings.botRole || 'biba';
    const authorN = norm(author);

    if (authorN === me)      return;
    if (authorN === partner) return;

    try {
        const m     = await getMeta(sock, groupId);
        const owner = norm(m.owner || '');

        if (authorN === owner) return;

        // проверяем что рейдер реально админ (не обычный участник)
        const raider = m.participants.find(p => norm(p.id) === authorN);
        if (!raider?.admin) return;

        const victims = participants
            .map(p => norm(typeof p === 'string' ? p : (p?.id || '')))
            .filter(Boolean);

        if (victims.length === 0) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        // боба: берём только тех кого биба не успел восстановить
        let toRestore = victims;
        if (role === 'boba') {
            toRestore = [];
            for (const v of victims) {
                if (!(await isAdmin(sock, groupId, v))) toRestore.push(v);
            }
            if (toRestore.length === 0) return;
        }

        // снимаем рейдера
        if (await isAdmin(sock, groupId, author)) {
            await sock.groupParticipantsUpdate(groupId, [author], 'demote');
            console.log(`[protect][${role}] рейдер снят: ${authorN}`);
        }

        // возвращаем права жертвам
        for (const v of toRestore) {
            if (!(await isAdmin(sock, groupId, v))) {
                await sock.groupParticipantsUpdate(groupId, [v], 'promote');
                console.log(`[protect][${role}] восстановлен: ${v}`);
            }
        }

        const raiderTag  = `@${authorN.split('@')[0]}`;
        const victimTags = toRestore.map(v => `@${v.split('@')[0]}`).join(', ');

    } catch (e) {
        console.error(`[protect][handleDemote]`, e.message);
    }
}

module.exports = { handle, handleDemote };