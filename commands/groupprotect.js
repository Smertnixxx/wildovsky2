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

// добавляем партнёра обратно в группу
// сначала прямой add, при 403 — invite message в ЛС
async function addPartner(sock, groupId, partnerJid) {
    try {
        await sock.groupParticipantsUpdate(groupId, [partnerJid], 'add');
        console.log(`[protect] прямой add успешен: ${partnerJid}`);
        return 'added';
    } catch (e) {
        const is403 = e?.output?.statusCode === 403
            || e?.message?.includes('403')
            || e?.data?.includes?.('403');

        if (!is403) {
            console.error(`[protect] add упал с неизвестной ошибкой:`, e.message);
            return 'error';
        }

        // fallback — invite message в ЛС партнёру
        console.log(`[protect] 403 при add, пробуем invite message → ${partnerJid}`);
        try {
            const inviteCode = await sock.groupInviteCode(groupId);
            const meta       = await getMeta(sock, groupId);
            const groupName  = meta.subject || 'группа';

            let jpegThumbnail = Buffer.alloc(0);
            try {
                const pp  = await sock.profilePictureUrl(groupId, 'image');
                const buf = await fetch(pp);
                jpegThumbnail = await buf.buffer();
            } catch {}

            const invite = generateWAMessageFromContent(partnerJid,
                proto.Message.fromObject({
                    groupInviteMessage: {
                        groupJid:         groupId,
                        inviteCode:       inviteCode,
                        inviteExpiration: Math.floor(Date.now() / 1000) + 86400,
                        groupName:        groupName,
                        caption:          '🔔 Тебя исключили из группы. Зайди обратно по этому приглашению.',
                        jpegThumbnail:    jpegThumbnail,
                    }
                }),
                { userJid: sock.user?.id }
            );

            await sock.relayMessage(partnerJid, invite.message, { messageId: invite.key.id });
            console.log(`[protect] invite message отправлен: ${partnerJid}`);
            return 'invited';
        } catch (invErr) {
            console.error(`[protect] invite message упал:`, invErr.message);
            return 'error';
        }
    }
}

// ждём появления партнёра в группе (макс waitMs)
async function waitForRejoin(sock, groupId, partnerJid, waitMs = 15000) {
    const step    = 1500;
    const maxTick = Math.floor(waitMs / step);
    const target  = norm(partnerJid);

    for (let i = 0; i < maxTick; i++) {
        await wait(step);
        try {
            const m = await getMeta(sock, groupId);
            const found = m.participants.find(p => norm(p.id) === target);
            if (found) return true;
        } catch {}
    }
    return false;
}

// ─── кик обычного участника (action === 'remove') ───────────────────────────
async function handle(sock, groupId, participants, author) {
    if (groupId !== PROTECTED_GROUP) return;
    if (!author) return;

    const me       = self(sock);
    const partner  = norm(settings.partnerJid || '');
    const role     = settings.botRole || 'biba';
    const authorN  = norm(author);

    // если кикнули партнёра — возвращаем его
    const kickedPartner = participants
        .map(p => norm(typeof p === 'string' ? p : (p?.id || '')))
        .includes(partner);

    if (kickedPartner) {
        // не реагируем на действия владельца — он мог кикнуть намеренно
        try {
            const m     = await getMeta(sock, groupId);
            const owner = norm(m.owner || '');
            if (authorN === owner) return;
        } catch {}

        // не реагируем если это мы сами кикнули
        if (authorN === me) return;

        await wait(role === 'biba' ? DELAY_BIBA : DELAY_BOBA);

        console.log(`[protect][${role}] партнёр кикнут, начинаем возврат`);

        // снимаем рейдера
        try {
            if (await isAdmin(sock, groupId, author)) {
                await sock.groupParticipantsUpdate(groupId, [author], 'demote');
                console.log(`[protect][${role}] рейдер снят: ${authorN}`);
            }
        } catch (e) {
            console.error(`[protect] demote рейдера упал:`, e.message);
        }

        // добавляем партнёра обратно
        const result = await addPartner(sock, groupId, partner);

        if (result === 'added') {
            // сразу повышаем
            try {
                await sock.groupParticipantsUpdate(groupId, [partner], 'promote');
                console.log(`[protect][${role}] партнёр возвращён и повышен`);
            } catch (e) {
                console.error(`[protect] promote партнёра упал:`, e.message);
            }


        } else if (result === 'invited') {
            const rejoined = await waitForRejoin(sock, groupId, partner);
            if (rejoined) {
                try {
                    await sock.groupParticipantsUpdate(groupId, [partner], 'promote');
                    console.log(`[protect][${role}] партнёр вернулся и повышен`);
                } catch (e) {
                    console.error(`[protect] promote после rejoin упал:`, e.message);
                }
            } else {
                console.log(`[protect][${role}] партнёр не вернулся за 15 сек`);
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