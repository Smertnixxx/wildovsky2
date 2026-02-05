const getDisplayName = require('../lib/getDisplayName');
const userDB = require('../lib/userdb');
const { sendCarousel } = require('../lib/sendCarousel');
const fs = require('fs');
const path = require('path');

// Keep pending requests in global so module reloads won't lose state
if (!global.pendingMarriageRequests) global.pendingMarriageRequests = {};
if (!global.pendingMarriageByUid) global.pendingMarriageByUid = {};
let pendingMarriageRequests = global.pendingMarriageRequests;
let pendingMarriageByUid = global.pendingMarriageByUid;

const validReactions = [
    '👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿',
    '👎', '👎🏻', '👎🏼', '👎🏽', '👎🏾', '👎🏿'
];

async function proposeCommand(sock, chatId, message) {
    try {
        const sender = message.key.participant || message.key.remoteJid;
        const senderName = await getDisplayName(sock, sender);

        const ctxInfo = message.message?.extendedTextMessage?.contextInfo || {};
        const mentioned = ctxInfo.mentionedJid || [];
        let user = mentioned[0] || ctxInfo.participant || (ctxInfo.quotedMessage && (ctxInfo.quotedMessage.key?.participant || ctxInfo.quotedMessage.key?.remoteJid)) || null;
        
        if (!user) {
            const conv = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
            const atMatch = conv.match(/@(\d{5,})/);
            if (atMatch) user = atMatch[1] + '@s.whatsapp.net';
        }

        if (!user) {
            return await sock.sendMessage(chatId, { text: 'Укажите пользователя, которому хотите отправить заявку на брак (упомяните его).' }, { quoted: message });
        }
        if (user === sender) {
            return await sock.sendMessage(chatId, { text: 'Вы не можете быть в браке с самим собой.' }, { quoted: message });
        }

        if (!global.db) global.db = { data: { users: {} } };
        if (!global.db.data) global.db.data = { users: {} };
        if (!global.db.data.users) global.db.data.users = {};
        const users = global.db.data.users;
        if (!users[sender]) users[sender] = {};
        if (!users[user]) users[user] = {};

        // проверка активных заявок от отправителя (исправлено)
        const existingOutgoing = Object.entries(pendingMarriageRequests).find(([id, r]) => r.from === sender);
        if (existingOutgoing) {
            const target = existingOutgoing[1].to;
            return await sock.sendMessage(chatId, {
                text: `Вы уже запросили у @${target.split('@')[0]} вступить с вами в брак, вы можете отправить повторный запрос через 5 минут.`,
                mentions: [target]
            }, { quoted: message });
        }

        if (users[sender].pasangan) {
            return await sock.sendMessage(chatId, { text: `Вы уже состоите в браке с *${await getDisplayName(sock, users[sender].pasangan)}*.` }, { quoted: message });
        }

        if (users[user].pasangan) {
            return await sock.sendMessage(chatId, { text: `*${await getDisplayName(sock, user)}* уже состоит в браке с *${await getDisplayName(sock, users[user].pasangan)}*.` }, { quoted: message });
        }

        if (sender === sock.user.id || sender === sock.user?.jid) return;

        const text = `
💍 *Предложение на брак*

> *${await getDisplayName(sock, user)}*, вам отправили предложение на брак от *${senderName}*.`.trim();

        // prepare image
        let imgBuffer = null;
        try {
            imgBuffer = fs.readFileSync(path.join(process.cwd(), 'assets', 'котик.jpg'));
        } catch (e) {}
        const uid = `mar${Date.now()}${Math.floor(Math.random() * 1000)}`;

        const cards = [
            {
                text: ``,
                footer: '',
                header: ``,
                imageBuffer: imgBuffer,
                buttons: [
                    ['Принять', `.marriage_accept ${uid}`]
                ]
            },
            {
                text: ``,
                footer: '',
                header: ``,
                imageBuffer: imgBuffer,
                buttons: [
                    ['Отклонить', `.marriage_reject ${uid}`]
                ]
            }
        ];

        const msgs = await sendCarousel(sock, chatId, cards, message, {
            bodyText: text,
            footerText: 'Выберите действие'
        });

        const sent = msgs;

        // replace TEMPID placeholders with real message id in pending structure
        const sentId = sent.key.id;

        const reqObj = {
            from: sender,
            to: user,
            messageObj: sent,
            uid,
            expiresAt: Date.now() + 5 * 60 * 1000
        };
        pendingMarriageRequests[sentId] = reqObj;
        pendingMarriageByUid[uid] = reqObj;
        console.log(`[marriage] created req uid=${uid} messageId=${sentId} from=${sender} to=${user}`);

        // update buttons ids - not editable after sent, but when user clicks selectedButtonId will be the id we set originally.
        // Unfortunately we had to set TEMPID earlier; however selectedButtonId will include TEMPID, so we'll also accept responses by matching any id containing the sentId.

        setTimeout(async () => {
            const p = pendingMarriageRequests[sentId];
            if (p) {
                try {
                    await sock.sendMessage(chatId, {
                        text: `Заявка на брак от *${senderName}* была отклонена из-за отсутствия ответа.`
                    }, { quoted: p.messageObj });
                } catch (e) {}
                // remove both mappings
                delete pendingMarriageRequests[sentId];
                if (p.uid) delete pendingMarriageByUid[p.uid];
            }
        }, 5 * 60 * 1000);

    } catch (e) {
        console.error('proposeCommand error', e);
        await sock.sendMessage(chatId, { text: 'Ошибка при отправке заявки на брак.' }, { quoted: message });
    }
}

async function divorceCommand(sock, chatId, message) {
    try {
        const sender = message.key.participant || message.key.remoteJid;
        const users = global.db.data.users;
        if (!users[sender] || !users[sender].pasangan) {
            return await sock.sendMessage(chatId, { text: `*@${sender.split('@')[0]}*, у тебя нет брака.` }, { quoted: message, contextInfo: { mentionedJid: [sender] } });
        }

        const partnerJid = users[sender].pasangan;

        try {
            if (users[sender]) {
                delete users[sender].pasangan;
                delete users[sender].pasanganName;
                if (Object.keys(users[sender]).length === 0) delete users[sender];
            }
            if (users[partnerJid]) {
                delete users[partnerJid].pasangan;
                delete users[partnerJid].pasanganName;
                if (Object.keys(users[partnerJid]).length === 0) delete users[partnerJid];
            }
            userDB.save(global.db.data.users);
        } catch (e) {
            console.error('Failed saving users db', e);
        }

        const senderName = await getDisplayName(sock, sender);
        const partnerName = await getDisplayName(sock, partnerJid);

        await sock.sendMessage(chatId, {
            text: `${senderName} 💔 расстался с ${partnerName}. Брак завершен.`,
            contextInfo: { mentionedJid: [sender, partnerJid] }
        }, { quoted: message });

    } catch (e) {
        console.error('divorceCommand error', e);
        await sock.sendMessage(chatId, { text: 'Ошибка при попытке развода.' }, { quoted: message });
    }
}

async function handleReaction(m, { conn }) {
    try {
        if (!m.isGroup || m.mtype !== 'reactionMessage') return;

        const messageID = m.message.reactionMessage?.key?.id;
        const reactionText = m.message.reactionMessage?.text || '';
        if (!messageID || !pendingMarriageRequests[messageID]) return;

        const marriageRequest = pendingMarriageRequests[messageID];
        const { from, to, messageObj, uid } = marriageRequest;

        const reactor = m.sender || m.key?.participant || m.key?.remoteJid;
        if (reactor === from) return;
        if (reactor !== to) return;
        if (!validReactions.includes(reactionText)) return;

        if (reactionText.startsWith('👍')) {
            if (!global.db.data.users[from]) global.db.data.users[from] = {};
            if (!global.db.data.users[to]) global.db.data.users[to] = {};
            global.db.data.users[from].pasangan = to;
            global.db.data.users[to].pasangan = from;
            const nameTo = await getDisplayName(conn, to);
            const nameFrom = await getDisplayName(conn, from);
            global.db.data.users[from].pasanganName = nameTo;
            global.db.data.users[to].pasanganName = nameFrom;
            try { userDB.save(global.db.data.users); } catch (e) { console.error('Failed saving users db', e); }

            await conn.sendMessage(m.key.remoteJid, { text: `*${nameFrom}* и *${nameTo}* теперь в браке! 🥳` }, { quoted: messageObj });
        }

        if (reactionText.startsWith('👎')) {
            await conn.sendMessage(m.key.remoteJid, {
                text: `@${(reactor||'').split('@')[0]} отклонил(а) заявку на брак от *${await getDisplayName(conn, from)}*`,
                mentions: [reactor]
            }, { quoted: messageObj });
        }

        // delete both mappings if exist
        delete pendingMarriageRequests[messageID];
        if (uid && pendingMarriageByUid[uid]) delete pendingMarriageByUid[uid];
    } catch (e) {
        console.error('handleReaction error', e);
    }
}

// Handle button-based accept/reject using uid from button id
async function acceptViaButton(sock, chatId, message, uid) {
    try {
        const reactor = message.key.participant || message.key.remoteJid;
        console.log(`[marriage] acceptViaButton uid=${uid} reactor=${reactor} keys=${Object.keys(pendingMarriageByUid).join(',')}`);
        const marriageRequest = pendingMarriageByUid[uid];
        if (!marriageRequest) {
            console.log(`[marriage] acceptViaButton NOT FOUND uid=${uid}`);
            return await sock.sendMessage(chatId, { text: 'Заявка не найдена или уже истекла.' }, { quoted: message });
        }
        const { from, to, messageObj, uid: reqUid } = marriageRequest;
        if (reactor !== to) {
            return await sock.sendMessage(chatId, { text: 'Только получатель заявки может принять её.' }, { quoted: message });
        }

        // accept
        if (!global.db.data.users[from]) global.db.data.users[from] = {};
        if (!global.db.data.users[to]) global.db.data.users[to] = {};
        global.db.data.users[from].pasangan = to;
        global.db.data.users[to].pasangan = from;
        const nameTo = await getDisplayName(sock, to);
        const nameFrom = await getDisplayName(sock, from);
        global.db.data.users[from].pasanganName = nameTo;
        global.db.data.users[to].pasanganName = nameFrom;
        try { userDB.save(global.db.data.users); } catch (e) { console.error('Failed saving users db', e); }

        await sock.sendMessage(chatId, { text: `*${nameFrom}* и *${nameTo}* теперь в браке! 🥳` }, { quoted: messageObj });
        // remove both mappings
        const messageID = messageObj.key?.id;
        if (messageID) delete pendingMarriageRequests[messageID];
        if (reqUid) delete pendingMarriageByUid[reqUid];
    } catch (e) {
        console.error('acceptViaButton error', e);
    }
}

async function rejectViaButton(sock, chatId, message, uid) {
    try {
        const reactor = message.key.participant || message.key.remoteJid;
        console.log(`[marriage] rejectViaButton uid=${uid} reactor=${reactor} keys=${Object.keys(pendingMarriageByUid).join(',')}`);
        const marriageRequest = pendingMarriageByUid[uid];
        if (!marriageRequest) {
            console.log(`[marriage] rejectViaButton NOT FOUND uid=${uid}`);
            return await sock.sendMessage(chatId, { text: 'Заявка не найдена или уже истекла.' }, { quoted: message });
        }
        const { from, to, messageObj, uid: reqUid } = marriageRequest;
        if (reactor !== to) {
            return await sock.sendMessage(chatId, { text: 'Только получатель заявки может отклонить её.' }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: `@${reactor.split('@')[0]} отклонил(а) заявку на брак от *${await getDisplayName(sock, from)}*`,
            mentions: [reactor]
        }, { quoted: messageObj });

        const messageID = messageObj.key?.id;
        if (messageID) delete pendingMarriageRequests[messageID];
        if (reqUid) delete pendingMarriageByUid[reqUid];
    } catch (e) {
        console.error('rejectViaButton error', e);
    }
}

module.exports = {
    proposeCommand,
    divorceCommand,
    handleReaction,
    acceptViaButton,
    rejectViaButton
};