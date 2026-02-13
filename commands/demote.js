const isAdmin = require('../lib/isAdmin')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function demoteCommand(sock, chatId, mentionedJids, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, {
                text: 'Эта команда работает только в группах.'
            })
        }

        const sender = message.key.participant || message.key.remoteJid
        const adminStatus = await isAdmin(sock, chatId, sender)

        if (!adminStatus.isBotAdmin) {
            return sock.sendMessage(chatId, {
                text: '❌ Сначала нужно выдать боту права администратора.'
            })
        }

        if (!adminStatus.isSenderAdmin) {
            return sock.sendMessage(chatId, {
                text: '❌ Только администраторы группы могут использовать эту команду.'
            })
        }

        let users = []

        if (mentionedJids?.length) {
            users = mentionedJids
        } else {
            const replyUser = message.message?.extendedTextMessage?.contextInfo?.participant
            if (replyUser) users = [replyUser]
        }

        if (!users.length) {
            return sock.sendMessage(chatId, {
                text: '❌ Нужно отметить пользователя или ответить на его сообщение.'
            })
        }

        await sleep(1000)
        await sock.groupParticipantsUpdate(chatId, users, 'demote')
        await sleep(1000)

    } catch (e) {
        console.error('demote error:', e)

        if (e?.data === 429) {
            await sleep(2000)
            return sock.sendMessage(chatId, {
                text: '❌ Превышен лимит запросов. Попробуйте через несколько секунд.'
            })
        }

        return sock.sendMessage(chatId, {
            text: '❌ Не удалось снять администратора. Проверьте права бота.'
        })
    }
}

async function handleDemotionEvent(sock, groupId, participants, author) {
    try {
        if (!Array.isArray(participants) || !participants.length) return

        await sleep(1000)

        const botId = sock.user.jid
        const demoted = typeof participants[0] === 'string'
            ? participants[0]
            : participants[0].id || participants[0].toString()

        const authorJid = author
            ? typeof author === 'string'
                ? author
                : author.id || author.toString()
            : null

        const authorName = authorJid ? authorJid.split('@')[0] : 'Система'
        const demotedName = demoted.split('@')[0]

        if (demoted === botId) {
            return sock.sendMessage(groupId, {
                text: `⚠️ Бота лишили прав администратора.\n👤 Снял: @${authorName}`,
                mentions: authorJid ? [authorJid] : []
            })
        }

        return sock.sendMessage(groupId, {
            text: `🔽 Понижение\n👤 @${authorName} снял администратора @${demotedName}`,
            mentions: authorJid ? [authorJid, demoted] : [demoted]
        })

    } catch (e) {
        console.error('demotion event error:', e)
        if (e?.data === 429) await sleep(2000)
    }
}

module.exports = { demoteCommand, handleDemotionEvent }
