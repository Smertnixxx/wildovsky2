const fetch = require('node-fetch');
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = require('@whiskeysockets/baileys');

async function sendCat(sock, chatId, quoted) {
    if (!quoted) return;

    const senderId =
        quoted.key?.participant ||
        quoted.participant ||
        quoted.key?.remoteJid;

    if (!senderId) return;

    const userId = senderId.split('@')[0];

    const res = await fetch('https://cataas.com/cat');
    const imgBuffer = await res.buffer();

    const media = await prepareWAMessageMedia(
        { image: imgBuffer },
        { upload: sock.waUploadToServer }
    );

    const msg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: `это ты *@${userId}*`
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        hasMediaAttachment: true,
                        imageMessage: media.imageMessage
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                            {
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "еще котики",
                                    id: ".котик"
                                })
                            }
                        ]
                    }),
                    contextInfo: {
                        mentionedJid: [senderId]
                    }
                })
            }
        }
    }, {quoted});
//return sock.sendMessage(chatId, { text: `котики уехали на тех работы *@${userId}*` }, quoted);

    await sock.relayMessage(chatId, msg.message, {
        messageId: msg.key.id,
        quoted
    });
}

module.exports = sendCat;
