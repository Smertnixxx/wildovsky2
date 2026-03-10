const gTTS = require('gtts')
const fs = require('fs')
const path = require('path')

function extracttext(msg) {
    if (!msg) return null

    if (typeof msg === 'string') return msg

    if (msg.conversation) return msg.conversation

    if (msg.extendedTextMessage?.text)
        return msg.extendedTextMessage.text

    if (msg.imageMessage?.caption)
        return msg.imageMessage.caption

    if (msg.videoMessage?.caption)
        return msg.videoMessage.caption

    if (msg.documentMessage?.caption)
        return msg.documentMessage.caption

    return null
}

async function ttsCommand(sock, chatId, message, text, language = 'ru') {

    const ctx = message.message?.extendedTextMessage?.contextInfo

    let srcText = text

    if (!srcText && ctx?.quotedMessage) {
        srcText = extracttext(ctx.quotedMessage)
    }

    if (typeof srcText !== 'string' || !srcText.trim()) {
        await sock.sendMessage(chatId, {
            text: 'Ответь на сообщение с текстом или напиши:\n.tts текст'
        }, { quoted: message })
        return
    }

    const fileName = `tts-${Date.now()}.mp3`
    const filePath = path.join(__dirname, '..', 'assets', fileName)

    const tts = new gTTS(srcText, language)

    tts.save(filePath, async err => {

        if (err) {
            await sock.sendMessage(chatId, { text: 'ошибка генерации tts' }, { quoted: message })
            return
        }

        await sock.sendMessage(chatId, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg'
        }, { quoted: message })

        try {
            fs.unlinkSync(filePath)
        } catch {}
    })
}

module.exports = ttsCommand