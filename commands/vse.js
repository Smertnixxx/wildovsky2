
const { proto } = require('@whiskeysockets/baileys');
const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');

async function vse(sock, chatId, msg, text) {
    const senderId = msg.key.participant || msg.key.remoteJid;

    const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
    const ownerAllowed = await isOwnerOrSudo(senderId, sock, chatId);

    if (!ownerAllowed && !isSenderAdmin && !msg.key.fromMe) {
        await sock.sendMessage(chatId, {
            text: '❌ Только админы могут использовать эту команду.'
        }, { quoted: msg });
        return;
    }

    try {
        await sock.sendMessage(chatId, { delete: msg.key });
    } catch (e) {
        console.error('[vse] delete error:', e?.message);
    }

    const built = proto.Message.fromObject({
        extendedTextMessage: proto.Message.ExtendedTextMessage.fromObject({
            text: text ? `@все ${text}` : '@все',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE,
            contextInfo: proto.ContextInfo.fromObject({
                nonJidMentions: 1
            }),
            inviteLinkGroupTypeV2: proto.Message.ExtendedTextMessage.InviteLinkGroupType.DEFAULT
        })
    });

    await sock.relayMessage(chatId, built, {});
}

module.exports = vse;