const gTTS = require('gtts')
const fs = require('fs')
const path = require('path')

function gettext(msg) {
    if (!msg) return null
    if (msg.conversation) return msg.conversation
    if (msg.extendedTextMessage) return msg.extendedTextMessage.text
    if (msg.imageMessage && msg.imageMessage.caption) return msg.imageMessage.caption
    if (msg.videoMessage && msg.videoMessage.caption) return msg.videoMessage.caption
    return null
}

async function ttsCommand(sock, chatId, text, replyMessage, message, language = 'ru') {
    let finalText = text

    if (!finalText && replyMessage) {
        finalText = gettext(replyMessage)
    }

    if (!finalText) {
        await sock.sendMessage(chatId, {
            text: 'Ответь на сообщение или напиши текст:\n.tts текст'
        }, { quoted: message })
        return
    }

    const fileName = `tts-${Date.now()}.mp3`
    const filePath = path.join(__dirname, '..', 'assets', fileName)

    const gtts = new gTTS(finalText, language)

    gtts.save(filePath, async err => {
        if (err) {
            await sock.sendMessage(chatId, { text: 'ошибка.' })
            return
        }

        await sock.sendMessage(chatId, {
            audio: { url: filePath },
            mimetype: 'audio/mpeg'
        }, { quoted: message })

        fs.unlinkSync(filePath)
    })
}

module.exports = ttsCommand