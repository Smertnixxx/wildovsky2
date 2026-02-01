const fetch = require('node-fetch');
let pkg;
try {
    pkg = require('@whiskeysockets/baileys');
} catch {
    pkg = require('baileys');
}
const { generateWAMessageFromContent, proto, prepareWAMessageMedia } = pkg;

/**
 * @param {object} conn     — балейс
 * @param {string} chatId   — JID чата
 * @param {Array}  messages — массив карточек (объектов)
 * @param {object} [quoted] — сообщение для reply
 * @param {object} [options]— доп опции { bodyText, footerText }
 *
 * кнопки
 * {
 *   text:        string       — текст body карточки
 *   footer:      string       — футер карточки
 *   header:      string       — заголовок header
 *   imageUrl:    string|null  — URL изображения
 *   imageBuffer: Buffer|null  — локальный файл как Buffer
 *   buttons:     Array|null   — quick_reply: [[displayText, id], ...]
 *   copy:        Array|null   — cta_copy: [[copyText], ...] или [copyText]
 *   urls:        Array|null   — cta_url: [[displayText, url], ...]
 *   list:        Array|null   — single_select: [[title, sections], ]
 * }
 */
async function sendCarousel(conn, chatId, messages, quoted = null, options = {}) {

    const cards = await Promise.all(messages.map(async (card) => {
        const {
            text = '',
            footer = '',
            header = '',
            imageUrl = null,
            imageBuffer = null,
            buttons = null,
            copy = null,
            urls = null,
            list = null
        } = card;

        let img = null;

        // ─── Изображение из Buffer (локальный файл) ─────────────────
        if (imageBuffer) {
            try {
                img = await prepareWAMessageMedia(
                    { image: imageBuffer },
                    { upload: conn.waUploadToServer }
                );
            } catch (err) {
                console.error('[sendCarousel] Ошибка подготовки Buffer:', err.message);
            }
        }
        // ─── Изображение по URL ──────────────────────────────────────
        else if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
            try {
                const response = await fetch(imageUrl);
                const contentType = response.headers.get('content-type');
                if (/^image\//i.test(contentType)) {
                    img = await prepareWAMessageMedia(
                        { image: { url: imageUrl } },
                        { upload: conn.waUploadToServer }
                    );
                } else {
                    console.warn(`[sendCarousel] Некорректный content-type: ${contentType} (${imageUrl})`);
                }
            } catch (err) {
                console.error(`[sendCarousel] Ошибка загрузки изображения: ${imageUrl}`, err.message);
            }
        }

        // ─── Формируем кнопки ────────────────────────────────────────
        const dynamicButtons = [];

        if (Array.isArray(buttons)) {
            buttons.forEach(btn => {
                dynamicButtons.push({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                        display_text: btn[0],
                        id: btn[1]
                    })
                });
            });
        }

        if (copy != null) {
            const copyArr = Array.isArray(copy[0]) ? copy : [copy];
            copyArr.forEach(c => {
                dynamicButtons.push({
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Copy',
                        copy_code: c[0]
                    })
                });
            });
        }

        if (Array.isArray(urls)) {
            urls.forEach(url => {
                dynamicButtons.push({
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: url[0],
                        url: url[1],
                        merchant_url: url[1]
                    })
                });
            });
        }

        if (Array.isArray(list)) {
            list.forEach(lister => {
                dynamicButtons.push({
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: lister[0],
                        sections: lister[1]
                    })
                });
            });
        }

        // ─── Собираем карточку ───────────────────────────────────────
        return {
            body: proto.Message.InteractiveMessage.Body.fromObject({
                text: text || ''
            }),
            footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: footer || ''
            }),
            header: proto.Message.InteractiveMessage.Header.fromObject({
                title: header || text || '',
                subtitle: text || '',
                hasMediaAttachment: img?.imageMessage ? true : false,
                imageMessage: img?.imageMessage || null
            }),
            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
                buttons: dynamicButtons.filter(Boolean),
                messageParamsJson: ''
            })
        };
    }));

    //обертка НАД каруселью а не в ней
    const interactiveMessage = proto.Message.InteractiveMessage.create({
        body: proto.Message.InteractiveMessage.Body.fromObject({
            text: options.bodyText || ''
        }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({
            text: options.footerText || ''
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
            title: 'null',
            subtitle: 'null',
            hasMediaAttachment: false
        }),
        carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
            cards
        })
    });

    //byppas whatsapp 
    const messageContent = proto.Message.fromObject({
        viewOnceMessage: {
            message: {
                messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                },
                interactiveMessage
            }
        }
    });

    //генерация и отправка
    const msgs = await generateWAMessageFromContent(chatId, messageContent, {
        userJid: conn.user.jid,
        quoted: quoted || undefined,
        upload: conn.waUploadToServer
    });

    await conn.relayMessage(chatId, msgs.message, {
        messageId: msgs.key.id
    });
}

module.exports = { sendCarousel };