const fetch = require('node-fetch');
const {
    generateWAMessageFromContent,
    proto,
    prepareWAMessageMedia
} = require('@whiskeysockets/baileys');

async function findimage(query) {
    const url = new URL('https://api.baguss.xyz/api/search/gimage');
    url.searchParams.set('q', query);

    const res = await fetch(url.toString());
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data.result) || !data.result.length) return null;

    return data.result;
}

async function loadimage(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;

    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;

    const buf = await res.buffer();
    if (!buf || buf.length < 10_000) return null;

    return buf;
}

async function sendImage(sock, chatId, quoted, query) {
    if (!quoted || !query) return;

    const senderId =
        quoted.key?.participant ||
        quoted.participant ||
        quoted.key?.remoteJid;

    if (!senderId) return;

    const list = await findimage(query);
    if (!list) {
        await sock.sendMessage(chatId, { text: 'не найдено' }, { quoted });
        return;
    }

    let buffer = null;

    for (let i = 0; i < 2; i++) {
        const item = list[Math.floor(Math.random() * list.length)];
        if (!item?.url) continue;

        buffer = await loadimage(item.url);
        if (buffer) break;
    }

    if (!buffer) {
        await sock.sendMessage(chatId, { text: 'не найдено' }, { quoted });
        return;
    }

    const media = await prepareWAMessageMedia(
        { image: buffer },
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
    }, { quoted });

    await sock.relayMessage(chatId, msg.message, {
        messageId: msg.key.id
    });
}

module.exports = sendImage;
