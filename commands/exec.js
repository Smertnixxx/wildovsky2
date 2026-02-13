const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys')

function stringify(obj) {
    const cache = new Set()

    return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'function') return '[Function]'
        if (typeof value === 'undefined') return '[Undefined]'

        if (typeof value === 'object' && value !== null) {
            if (cache.has(value)) return '[Circular]'
            cache.add(value)
        }

        return value
    }, 2)
}

function getbody(msg) {
    return (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.videoMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        ''
    )
}

function gettype(msg) {
    if (!msg.message) return null
    return Object.keys(msg.message)[0]
}

function getquoted(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
    if (!quoted) return null

    return {
        mtype: Object.keys(quoted)[0],
        id: msg.message.extendedTextMessage.contextInfo.stanzaId,
        chat: msg.key.remoteJid,
        senderJid: msg.message.extendedTextMessage.contextInfo.participant,
        text:
            quoted.conversation ||
            quoted.extendedTextMessage?.text ||
            quoted.imageMessage?.caption ||
            ''
    }
}

async function exec(sock, chatId, message) {
    const senderId = message.key.participant || message.key.remoteJid || ''
    const isGroup = chatId.endsWith('@g.us')
    const senderJid = isGroup ? senderId : chatId
    const mtype = gettype(message)
    const body = getbody(message)
    const quoted = getquoted(message)

    const data = {
        key: message.key,
        messageTimestamp: message.messageTimestamp,
        pushName: message.pushName,
        broadcast: message.broadcast,
        message: message.message,
        id: message.key?.id,
        chat: chatId,
        fromMe: message.key?.fromMe,
        isGroup,
        sender: senderId,
        senderJid,
        participant: message.key?.participant,
        mtype,
        msg: message.message?.[mtype] || null,
        body,
        quoted,
        mentionedJid:
            message.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
            null
    }

    const parsed = stringify(data)

    const maxChunk = 4000
    const chunks = []

    for (let i = 0; i < parsed.length; i += maxChunk) {
        chunks.push(parsed.slice(i, i + maxChunk))
    }

    for (const chunk of chunks) {
        const msg = generateWAMessageFromContent(chatId, {
            extendedTextMessage: proto.Message.ExtendedTextMessage.create({
                text: chunk,
                contextInfo: {
                    mentionedJid: [senderId]
                }
            })
        }, { quoted: message })

        await sock.relayMessage(chatId, msg.message, {
            messageId: msg.key.id
        })
    }
}

module.exports = exec
