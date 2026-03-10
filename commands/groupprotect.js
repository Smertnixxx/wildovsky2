// commands/groupprotect.js
const settings = require('../settings');

const PROTECTED_GROUP = '120363424761879922@g.us';
const DELAY_BIBA = 300;
const DELAY_BOBA = 2500;

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

function tag(jid) {
    return `@${norm(jid).split('@')[0]}`;
}

// ─── кик участника (action === 'remove') ────────────────────────────────────
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

// ─── снятие с админки (action === 'demote') ──────────────────────────────────
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

        const raider = m.participants.find(p => norm(p.id) === authorN);
        if (!raider?.admin) return;

        const victims = participants
            .map(p => norm(typeof p === 'string' ? p : (p?.id || '')))
            .filter(Boolean);

        if (victims.length === 0) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        // боба: действует только если биба не успел восстановить
        let toRestore = victims;
        if (role === 'boba') {
            toRestore = [];
            for (const v of victims) {
                if (!(await isAdmin(sock, groupId, v))) toRestore.push(v);
            }
            if (toRestore.length === 0) return;
        }

        if (await isAdmin(sock, groupId, author)) {
            await sock.groupParticipantsUpdate(groupId, [author], 'demote');
            console.log(`[protect][${role}] demote-рейдер снят: ${authorN}`);
        }

        for (const v of toRestore) {
            if (!(await isAdmin(sock, groupId, v))) {
                await sock.groupParticipantsUpdate(groupId, [v], 'promote');
                console.log(`[protect][${role}] восстановлен: ${v}`);
            }
        }

    } catch (e) {
        console.error(`[protect][handleDemote]`, e.message);
    }
}

// ─── выдача админки (action === 'promote') ───────────────────────────────────
async function handlePromote(sock, groupId, participants, author) {
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

        // владелец может выдавать права — это нормально
        if (authorN === owner) return;

        const raider = m.participants.find(p => norm(p.id) === authorN);
        if (!raider?.admin) return;

        const promoted = participants
            .map(p => norm(typeof p === 'string' ? p : (p?.id || '')))
            .filter(Boolean);

        if (promoted.length === 0) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        // боба: действует только если биба не успел снять
        let toStrip = promoted;
        if (role === 'boba') {
            toStrip = [];
            for (const v of promoted) {
                if (await isAdmin(sock, groupId, v)) toStrip.push(v);
            }
            if (toStrip.length === 0) return;
        }

        // снимаем рейдера
        if (await isAdmin(sock, groupId, author)) {
            await sock.groupParticipantsUpdate(groupId, [author], 'demote');
            console.log(`[protect][${role}] promote-рейдер снят: ${authorN}`);
        }

        // снимаем тех кому рейдер выдал права
        for (const v of toStrip) {
            if (await isAdmin(sock, groupId, v)) {
                await sock.groupParticipantsUpdate(groupId, [v], 'demote');
                console.log(`[protect][${role}] незаконно выданная админка снята: ${v}`);
            }
        }

    } catch (e) {
        console.error(`[protect][handlePromote]`, e.message);
    }
}

module.exports = { handle, handleDemote, handlePromote };