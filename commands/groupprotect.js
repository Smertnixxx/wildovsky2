// commands/groupprotect.js
const settings = require('../settings');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const fetch = require('node-fetch');

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

function tag(jid) {
    return `@${norm(jid).split('@')[0]}`;
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

function isBlocked(e) {
    const msg = (e?.message || e?.data || String(e)).toLowerCase();
    return msg.includes('forbidden') || msg.includes('403') || msg.includes('not-authorized');
}

async function addPartner(sock, groupId, partnerJid) {
    try {
        await sock.groupParticipantsUpdate(groupId, [partnerJid], 'add');
        console.log(`[protect] прямой add успешен: ${partnerJid}`);
        return 'added';
    } catch (e) {
        if (!isBlocked(e)) {
            console.error(`[protect] add упал:`, e.message);
            return 'error';
        }

        console.log(`[protect] add заблокирован, пробуем invite → ${partnerJid}`);
        try {
            const inviteCode = await sock.groupInviteCode(groupId);
            const meta       = await getMeta(sock, groupId);

            let jpegThumbnail = Buffer.alloc(0);
            try {
                const pp  = await sock.profilePictureUrl(groupId, 'image');
                const res = await fetch(pp);
                jpegThumbnail = await res.buffer();
            } catch {}

            const invite = generateWAMessageFromContent(
                partnerJid,
                proto.Message.fromObject({
                    groupInviteMessage: {
                        groupJid:         groupId,
                        inviteCode:       inviteCode,
                        inviteExpiration: Math.floor(Date.now() / 1000) + 86400,
                        groupName:        meta.subject || 'группа',
                        caption:          '🔔 Тебя исключили из группы. Зайди обратно по этому приглашению.',
                        jpegThumbnail:    jpegThumbnail,
                    }
                }),
                { userJid: sock.user?.id }
            );

            await sock.relayMessage(partnerJid, invite.message, { messageId: invite.key.id });
            console.log(`[protect] invite отправлен: ${partnerJid}`);
            return 'invited';
        } catch (invErr) {
            console.error(`[protect] invite упал:`, invErr.message);
            return 'error';
        }
    }
}

async function waitForRejoin(sock, groupId, partnerJid, waitMs = 20000) {
    const step   = 1500;
    const ticks  = Math.floor(waitMs / step);
    const target = norm(partnerJid);

    for (let i = 0; i < ticks; i++) {
        await wait(step);
        try {
            const m = await getMeta(sock, groupId);
            if (m.participants.find(p => norm(p.id) === target)) return true;
        } catch {}
    }
    return false;
}

// ─── кик (action === 'remove') ───────────────────────────────────────────────
async function handle(sock, groupId, participants, author) {
    if (groupId !== PROTECTED_GROUP) return;
    if (!author) return;

    const me      = self(sock);
    const partner = norm(settings.partnerJid || '');
    const role    = settings.botRole || 'biba';
    const authorN = norm(author);

    const kickedList = participants
        .map(p => norm(typeof p === 'string' ? p : (p?.id || '')))
        .filter(Boolean);

    // меня кикнули — я ничего не могу сделать, партнёр разберётся
    if (kickedList.includes(me)) return;

    // партнёра кикнули — я действую
    if (kickedList.includes(partner)) {
        if (authorN === me) return;

        try {
            const m     = await getMeta(sock, groupId);
            const owner = norm(m.owner || '');
            if (authorN === owner) return;
        } catch (e) {
            console.error(`[protect][handle] getMeta упал:`, e.message);
            return;
        }

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        // снимаем рейдера
        try {
            if (await isAdmin(sock, groupId, author)) {
                await sock.groupParticipantsUpdate(groupId, [author], 'demote');
                console.log(`[protect][${role}] рейдер снят: ${authorN}`);
            }
        } catch (e) {
            console.error(`[protect] demote рейдера:`, e.message);
        }

        const result = await addPartner(sock, groupId, partner);

        if (result === 'added') {
            await wait(2000);
            try {
                await sock.groupParticipantsUpdate(groupId, [partner], 'promote');
                console.log(`[protect][${role}] партнёр возвращён и повышен`);
            } catch (e) {
                console.error(`[protect] promote после add:`, e.message);
            }

        } else if (result === 'invited') {
            const rejoined = await waitForRejoin(sock, groupId, partner);
            if (rejoined) {
                await wait(2000);
                try {
                    await sock.groupParticipantsUpdate(groupId, [partner], 'promote');
                    console.log(`[protect][${role}] партнёр вернулся и повышен`);
                } catch (e) {
                    console.error(`[protect] promote после rejoin:`, e.message);
                }
            } 
        } 
        return;
    }

    // обычный кик не владельцем — снимаем рейдера
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
        if (authorN === owner) return;

        const raider = m.participants.find(p => norm(p.id) === authorN);
        if (!raider?.admin) return;

        const promoted = participants
            .map(p => norm(typeof p === 'string' ? p : (p?.id || '')))
            .filter(Boolean);

        if (promoted.length === 0) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        let toStrip = promoted;
        if (role === 'boba') {
            toStrip = [];
            for (const v of promoted) {
                if (await isAdmin(sock, groupId, v)) toStrip.push(v);
            }
            if (toStrip.length === 0) return;
        }

        if (await isAdmin(sock, groupId, author)) {
            await sock.groupParticipantsUpdate(groupId, [author], 'demote');
            console.log(`[protect][${role}] promote-рейдер снят: ${authorN}`);
        }

        for (const v of toStrip) {
            if (await isAdmin(sock, groupId, v)) {
                await sock.groupParticipantsUpdate(groupId, [v], 'demote');
                console.log(`[protect][${role}] незаконная админка снята: ${v}`);
            }
        }

    } catch (e) {
        console.error(`[protect][handlePromote]`, e.message);
    }
}

module.exports = { handle, handleDemote, handlePromote };