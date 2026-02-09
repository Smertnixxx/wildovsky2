const fetch = require('node-fetch');
const {
    generateWAMessageFromContent,
    proto,
    prepareWAMessageMedia
} = require('@whiskeysockets/baileys');

async function findimage(query) {
    if (!query) return null;

    const url = new URL('https://api.baguss.xyz/api/search/gimage');
    url.searchParams.set('q', query);

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.result || !data.result.length) return null;

    const item = data.result[Math.floor(Math.random() * data.result.length)];
    return item.url || null;
}

async function sendImage(sock, chatId, quoted, query) {
    if (!quoted || !query) return;

    const senderId =
        quoted.key?.participant ||
        quoted.participant ||
        quoted.key?.remoteJid;

    if (!senderId) return;

    const imageUrl = await findimage(query);
    if (!imageUrl) return;

    const res = await fetch(imageUrl);
    const imgBuffer = await res.buffer();

    const media = await prepareWAMessageMedia(
        { image: imgBuffer },
        { upload: sock.waUploadToServer }
    );

    const msg = generateWAMessageFromContent(chatId, {
        viewOnceMessage: {
            message: {
                interactiveMessage: proto.Message.InteractiveMessage.create({
                    body: {
                        text: `результат по запросу: ${query}\n\n> Чтобы найти картинку в интернете напиши команду .поиск (запрос)`
                    },
                    header: {
                        hasMediaAttachment: true,
                        imageMessage: media.imageMessage
                    },
                    nativeFlowMessage: {
                        buttons: [
                            {
                                name: "quick_reply",
                                buttonParamsJson: JSON.stringify({
                                    display_text: "найти ещё",
                                    id: `.поиск ${query}`
                                })
                            }
                        ]
                    },
                    contextInfo: {
                        mentionedJid: [senderId]
                    }
                })
            }
        }
    }, {quoted});

    await sock.relayMessage(chatId, msg.message, {
        messageId: msg.key.id,
        quoted
    });
}

module.exports = sendImage;
