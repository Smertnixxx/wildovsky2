// commands/marriages.js
const getDisplayName = require('../lib/getDisplayName');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

async function marriagesCommand(sock, chatId, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'Команда доступна только в группах.' }, { quoted: message });
        return;
    }

    const meta = await sock.groupMetadata(chatId);
    const participants = meta.participants.map(p => p.id);

    const users = global.db?.data?.users || {};

    const seen = new Set();
    const rows = [];
    const mentions = [];

    for (const jid of participants) {
        const u = users[jid];
        if (!u || !u.pasangan) continue;

        const partner = u.pasangan;

        if (!participants.includes(partner)) continue;
        if (seen.has(jid) || seen.has(partner)) continue;

        seen.add(jid);
        seen.add(partner);

        const name1 = await getDisplayName(sock, jid);
        const name2 = await getDisplayName(sock, partner);

        mentions.push(jid, partner);

        rows.push({
            title: `${name1} ❤️ ${name2}`,
            description: ``,
            id: `marriage_${jid}`
        });
    }

    if (rows.length === 0) {
        await sock.sendMessage(
            chatId,
            { text: '💔 В этом чате нет активных браков.' },
            { quoted: message }
        );
        return;
    }

    const sections = [
        {
            title: '💞 Активные браки',
            rows
        }
    ];

    const msg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: 'Список активных браков в этом чате:'
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: 'Браки'
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                            {
                                name: 'single_select',
                                buttonParamsJson: JSON.stringify({
                                    title: 'Открыть список',
                                    sections
                                })
                            }
                        ]
                    }),
                    contextInfo: {
                        mentionedJid: mentions
                    }
                })
            }
        }
    }, { quoted: message });

    await sock.relayMessage(chatId, msg.message, {
        messageId: msg.key.id
    }, {quoted: message});
}

module.exports = marriagesCommand;
