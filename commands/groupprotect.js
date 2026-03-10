// commands/groupprotect.js
const settings = require('../settings');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const fetch = require('node-fetch');

const PROTECTED_GROUP = '120363424761879922@g.us';
const DELAY_BIBA = 300;
const DELAY_BOBA = 2500;

// убираем device-суффикс (:0, :1 и т.д.)
function norm(jid = '') {
    return jid.replace(/:\d+@/, '@').trim();
}

// только числовая часть — работает и для @lid и для @s.whatsapp.net
function numId(jid = '') {
    return norm(jid).split('@')[0];
}

// сравниваем по числовой части чтобы не зависеть от домена
function sameId(a, b) {
    return numId(a) === numId(b);
}

function self(sock) {
    return norm(sock.user?.id || '');
}

function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function tag(jid) {
    return `@${numId(jid)}`;
}

async function getMeta(sock, groupId) {
    return sock.groupMetadata(groupId);
}

async function isAdmin(sock, groupId, jid) {
    try {
        const m = await getMeta(sock, groupId);
        return m.participants
            .filter(p => p.admin)
            .some(p => sameId(p.id, jid));
    } catch {
        return false;
    }
}

async function sendInviteToPartner(sock, groupId, partnerJid) {
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
                    caption:          '⚙️ auto-rejoin',
                    jpegThumbnail:    jpegThumbnail,
                }
            }),
            { userJid: sock.user?.id }
        );

        await sock.relayMessage(partnerJid, invite.message, { messageId: invite.key.id });
        console.log(`[protect] invite отправлен: ${partnerJid}`);
        return true;
    } catch (e) {
        console.error(`[protect] sendInviteToPartner:`, e.message);
        return false;
    }
}

// кикнутый бот получает invite от партнёра → сам заходит
async function handleInviteMessage(sock, message) {
    try {
        const partner  = norm(settings.partnerJid || '');
        const senderRaw = message.key.participant || message.key.remoteJid || '';

        // принимаем только от нашего партнёра (сравниваем по числу)
        if (!sameId(senderRaw, partner)) return;

        const inviteMsg = message.message?.groupInviteMessage;
        if (!inviteMsg) return;

        if (inviteMsg.groupJid !== PROTECTED_GROUP) return;
        if (inviteMsg.caption !== '⚙️ auto-rejoin') return;

        console.log(`[protect] авто-принятие invite от партнёра`);
        await sock.groupAcceptInviteV4(message.key.remoteJid, inviteMsg);
        console.log(`[protect] успешно зашёл в группу`);
    } catch (e) {
        console.error(`[protect][handleInviteMessage]`, e.message);
    }
}

async function waitForRejoin(sock, groupId, partnerJid, waitMs = 20000) {
    const step  = 1500;
    const ticks = Math.floor(waitMs / step);

    for (let i = 0; i < ticks; i++) {
        await wait(step);
        try {
            const m = await getMeta(sock, groupId);
            if (m.participants.some(p => sameId(p.id, partnerJid))) return true;
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

    const kickedList = participants
        .map(p => norm(typeof p === 'string' ? p : (p?.id || '')))
        .filter(Boolean);

    // меня кикнули — сравниваем по числу, не по домену
    const iMeKicked = kickedList.some(k => sameId(k, me));
    if (iMeKicked) return;

    // партнёра кикнули
    const isPartnerKicked = kickedList.some(k => sameId(k, partner));
    if (isPartnerKicked) {
        if (sameId(author, me)) return;

        let owner = '';
        try {
            const m = await getMeta(sock, groupId);
            owner   = norm(m.owner || '');
        } catch (e) {
            console.error(`[protect][handle] getMeta:`, e.message);
            return;
        }

        if (sameId(author, owner)) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        try {
            if (await isAdmin(sock, groupId, author)) {
                await sock.groupParticipantsUpdate(groupId, [author], 'demote');
                console.log(`[protect][${role}] рейдер снят: ${numId(author)}`);
            }
        } catch (e) {
            console.error(`[protect] demote рейдера:`, e.message);
        }

        const sent = await sendInviteToPartner(sock, groupId, partner);

        if (sent) {


            const rejoined = await waitForRejoin(sock, groupId, partner);
            if (rejoined) {
                await wait(1500);
                try {
                    await sock.groupParticipantsUpdate(groupId, [partner], 'promote');
                    console.log(`[protect][${role}] партнёр вернулся и повышен`);
                } catch (e) {
                    console.error(`[protect] promote партнёра:`, e.message);
                }
            }
        } else 
        return;
    }

    // обычный кик не владельцем
    if (sameId(author, me))      return;
    if (sameId(author, partner)) return;

    try {
        const m     = await getMeta(sock, groupId);
        const owner = norm(m.owner || '');
        if (sameId(author, owner)) return;

        const raider = m.participants.find(p => sameId(p.id, author));
        if (!raider?.admin) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        if (await isAdmin(sock, groupId, author)) {
            await sock.groupParticipantsUpdate(groupId, [author], 'demote');
            console.log(`[protect][${role}] кик-рейдер снят: ${numId(author)}`);
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

    if (sameId(author, me))      return;
    if (sameId(author, partner)) return;

    try {
        const m     = await getMeta(sock, groupId);
        const owner = norm(m.owner || '');
        if (sameId(author, owner)) return;

        const raider = m.participants.find(p => sameId(p.id, author));
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
            console.log(`[protect][${role}] demote-рейдер снят: ${numId(author)}`);
        }

        for (const v of toRestore) {
            if (!(await isAdmin(sock, groupId, v))) {
                await sock.groupParticipantsUpdate(groupId, [v], 'promote');
                console.log(`[protect][${role}] восстановлен: ${numId(v)}`);
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

    if (sameId(author, me))      return;
    if (sameId(author, partner)) return;

    try {
        const m     = await getMeta(sock, groupId);
        const owner = norm(m.owner || '');
        if (sameId(author, owner)) return;

        const raider = m.participants.find(p => sameId(p.id, author));
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
            console.log(`[protect][${role}] promote-рейдер снят: ${numId(author)}`);
        }

        for (const v of toStrip) {
            if (await isAdmin(sock, groupId, v)) {
                await sock.groupParticipantsUpdate(groupId, [v], 'demote');
                console.log(`[protect][${role}] незаконная админка снята: ${numId(v)}`);
            }
        }

    } catch (e) {
        console.error(`[protect][handlePromote]`, e.message);
    }
}

module.exports = { handle, handleDemote, handlePromote, handleInviteMessage };