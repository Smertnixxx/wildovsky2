/**
 * Knight Bot - WhatsApp Бот
 * Copyright (c) 2024 Professor
 * 
 * Лицензия MIT
 * 
 * Использованы библиотеки:
 * - Baileys Library by @adiwajshing
 * - Pair Code implementation inspired by TechGod143 & DGXEON
 */
require('./settings')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const FileType = require('file-type')
const path = require('path')
const axios = require('axios')
const { handleMessages, handleGroupParticipantUpdate, handleStatus } = require('./main');
const PhoneNumber = require('awesome-phonenumber')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('./lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetch, await, sleep, reSize } = require('./lib/myfunc')
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    generateForwardMessageContent,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    generateMessageID,
    downloadContentFromMessage,
    jidDecode,
    proto,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys")
const NodeCache = require("node-cache")
const pino = require("pino")
const readline = require("readline")
const { parsePhoneNumber } = require("libphonenumber-js")
const { PHONENUMBER_MCC } = require('@whiskeysockets/baileys/lib/Utils/generics')
const { rmSync, existsSync } = require('fs')
const { join } = require('path')

const store = require('./lib/lightweight_store')

// Инициализация хранилища
store.readFromFile()
// Load persistent users DB (for features like marriages)
try {
    const userDB = require('./lib/userdb');
    const users = userDB.load() || {};
    if (!global.db) global.db = { data: { users: {} } };
    if (!global.db.data) global.db.data = { users: {} };
    global.db.data.users = users;
    // Save automatically periodically in case of external changes
    setInterval(() => {
        try { userDB.save(global.db.data.users); } catch (e) {}
    }, 60 * 1000); // every minute
} catch (e) {
    console.error('Failed to initialize user DB:', e);
}
const settings = require('./settings')
setInterval(() => store.writeToFile(), settings.storeWriteInterval || 10000)

// Оптимизация памяти - принудительная сборка мусора
setInterval(() => {
    if (global.gc) {
        global.gc()
        console.log('🧹 Сборка мусора завершена')
    }
}, 60_000) // каждую минуту

let phoneNumber = "79292991077"
let owner = JSON.parse(fs.readFileSync('./data/owner.json'))

global.botname = "wildovsky"
global.themeemoji = "•"
const pairingCode = !!phoneNumber || process.argv.includes("--pairing-code")
const useMobile = process.argv.includes("--mobile")

// Создание readline интерфейса только в интерактивной среде
const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null
const question = (text) => {
    if (rl) {
        return new Promise((resolve) => rl.question(text, resolve))
    } else {
        // В неинтерактивной среде используем ownerNumber из настроек
        return Promise.resolve(settings.ownerNumber || phoneNumber)
    }
}


async function startXeonBotInc() {
    try {
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const { state, saveCreds } = await useMultiFileAuthState(`./session`)
        const msgRetryCounterCache = new NodeCache()

        const XeonBotInc = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: !pairingCode,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            getMessage: async (key) => {
                let jid = jidNormalizedUser(key.remoteJid)
                let msg = await store.loadMessage(jid, key.id)
                return msg?.message || ""
            },
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
        })

        // Сохранение учетных данных при обновлении
        XeonBotInc.ev.on('creds.update', saveCreds)

    store.bind(XeonBotInc.ev)

    // Обработка сообщений
    XeonBotInc.ev.on('messages.upsert', async chatUpdate => {
        try {
            const mek = chatUpdate.messages[0]
            if (!mek.message) return

            // Нормализуем возможные обёртки (ephemeral/viewOnce/...) в основной message
            mek.message = (Object.keys(mek.message)[0] === 'ephemeralMessage') ? mek.message.ephemeralMessage.message : mek.message

            // Если пришло только senderKeyDistributionMessage — игнорируем (не нужно)
            if (mek.message && mek.message.senderKeyDistributionMessage && Object.keys(mek.message).length === 1) {
                return
            }

            // Обработка нажатий кнопок шаблонов и быстрых кнопок — логирование и нормализация
            try {
                const inner = mek.message || {}
                const template = inner.templateButtonReplyMessage || (inner.ephemeralMessage && inner.ephemeralMessage.templateButtonReplyMessage) || (inner.viewOnceMessage && inner.viewOnceMessage.templateButtonReplyMessage)
                const buttonsResp = inner.buttonsResponseMessage || (inner.ephemeralMessage && inner.ephemeralMessage.buttonsResponseMessage) || (inner.viewOnceMessage && inner.viewOnceMessage.buttonsResponseMessage)

                if (template) {
                    const selected = template.selectedId || template.selectedDisplayText || template.selectedButtonId || ''
                    console.log('--- templateButtonReplyMessage detected ---')
                    console.log('remoteJid:', mek.key?.remoteJid, 'id:', mek.key?.id, 'participant:', mek.key?.participant)
                    console.log('selected:', selected)
                    console.log('Full message object:')
                    console.log(JSON.stringify(mek, null, 2))
                    // Подставим выбранный id/текст в conversation, чтобы существующая логика handleMessages увидела команду
                    mek.message.conversation = String(selected)
                } else if (buttonsResp) {
                    const selected = buttonsResp.selectedButtonId || buttonsResp.selectedDisplayText || ''
                    console.log('--- buttonsResponseMessage detected ---')
                    console.log('remoteJid:', mek.key?.remoteJid, 'id:', mek.key?.id, 'participant:', mek.key?.participant)
                    console.log('selected:', selected)
                    console.log('Full message object:')
                    console.log(JSON.stringify(mek, null, 2))
                    mek.message.conversation = String(selected)
                }
            } catch (e) {
                console.error('Error processing template/buttons response:', e)
            }
            if (mek.key && mek.key.remoteJid === 'status@broadcast') {
                await handleStatus(XeonBotInc, chatUpdate);
                return;
            }

            // Forward reaction messages to command-specific reaction handlers (e.g., tictactoe, marriage)
            if (mek.message?.reactionMessage) {
                try {
                    const reactionMsg = Object.assign({}, mek, { isGroup: (mek.key.remoteJid || '').endsWith('@g.us'), mtype: 'reactionMessage' });

                    // tictactoe reactions
                    try {
                        const ttt = require('./commands/tictactoe');
                        if (typeof ttt.handleReaction === 'function') {
                            await ttt.handleReaction(reactionMsg, { conn: XeonBotInc });
                        }
                    } catch (e) {
                        console.error('Error forwarding reaction to tictactoe handler:', e);
                    }

                    // marriage reactions
                    try {
                        const marriage = require('./commands/marriage');
                        if (typeof marriage.handleReaction === 'function') {
                            await marriage.handleReaction(reactionMsg, { conn: XeonBotInc });
                        }
                    } catch (e) {
                        console.error('Error forwarding reaction to marriage handler:', e);
                    }

                } catch (e) {
                    console.error('Error processing reaction message forwarding:', e);
                }
            }

            if (!XeonBotInc.public && !mek.key.fromMe && chatUpdate.type === 'notify') {
                const isGroup = mek.key?.remoteJid?.endsWith('@g.us')
                if (!isGroup) return // Блокировка личных сообщений в приватном режиме
            }
            if (mek.key.id.startsWith('BAE5') && mek.key.id.length === 16) return

            // Очистка кэша повторных попыток сообщений для предотвращения раздувания памяти
            if (XeonBotInc?.msgRetryCounterCache) {
                XeonBotInc.msgRetryCounterCache.clear()
            }

            try {
                await handleMessages(XeonBotInc, chatUpdate, true)
            } catch (err) {
                console.error("Ошибка в handleMessages:", err)
                // Отправка сообщения об ошибке только при наличии корректного chatId
                if (mek.key && mek.key.remoteJid) {
                    await XeonBotInc.sendMessage(mek.key.remoteJid, {
                        text: 'ошибка при выполнении команды',
                    }).catch(console.error);
                }
            }
        } catch (err) {
            console.error("Ошибка в messages.upsert:", err)
        }
    })

    // Обработчики событий для улучшенной функциональности
    XeonBotInc.decodeJid = (jid) => {
        if (!jid) return jid
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {}
            return decode.user && decode.server && decode.user + '@' + decode.server || jid
        } else return jid
    }


    XeonBotInc.getName = (jid, withoutContact = false) => {
        id = XeonBotInc.decodeJid(jid)
        withoutContact = XeonBotInc.withoutContact || withoutContact
        let v
        if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
            v = store.contacts[id] || {}
            if (!(v.name || v.subject)) v = XeonBotInc.groupMetadata(id) || {}
            resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
        })
        else v = id === '0@s.whatsapp.net' ? {
            id,
            name: 'WhatsApp'
        } : id === XeonBotInc.decodeJid(XeonBotInc.user.id) ?
            XeonBotInc.user :
            (store.contacts[id] || {})
        return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
    }

    XeonBotInc.public = true

    XeonBotInc.serializeM = (m) => smsg(XeonBotInc, m, store)

    // Обработка кода подключения
    if (pairingCode && !XeonBotInc.authState.creds.registered) {
        if (useMobile) throw new Error('Невозможно использовать код подключения с мобильным API')

        let phoneNumber
        if (!!global.phoneNumber) {
            phoneNumber = global.phoneNumber
        } else {
            phoneNumber = await question(chalk.bgBlack(chalk.greenBright(`Введите ваш номер WhatsApp\nФормат: 79123456789 (без + и пробелов): `)))
        }

        // Очистка номера телефона - удаление нецифровых символов
        phoneNumber = phoneNumber.replace(/[^0-9]/g, '')

        // Валидация номера телефона
        const pn = require('awesome-phonenumber');
        if (!pn('+' + phoneNumber).isValid()) {
            console.log(chalk.red('Неверный номер телефона. Введите полный международный номер (например, 79123456789 для России, 447911123456 для Великобритании) без + и пробелов.'));
            process.exit(1);
        }

        setTimeout(async () => {
            try {
                let code = await XeonBotInc.requestPairingCode(phoneNumber)
                code = code?.match(/.{1,4}/g)?.join("-") || code
                console.log(chalk.black(chalk.bgGreen(`Ваш код подключения: `)), chalk.black(chalk.white(code)))
                console.log(chalk.yellow(`\nВведите этот код в приложении WhatsApp:\n1. Откройте WhatsApp\n2. Перейдите в Настройки > Связанные устройства\n3. Нажмите "Привязать устройство"\n4. Введите код, показанный выше`))
            } catch (error) {
                console.error('Ошибка при запросе кода подключения:', error)
                console.log(chalk.red('Не удалось получить код подключения. Проверьте номер телефона и попробуйте снова.'))
            }
        }, 3000)
    }

    // Обработка подключения
    XeonBotInc.ev.on('connection.update', async (s) => {
        const { connection, lastDisconnect, qr } = s
        
        if (qr) {
            console.log(chalk.yellow('📱 QR-код сгенерирован. Отсканируйте в WhatsApp.'))
        }
        
        if (connection === 'connecting') {
            console.log(chalk.yellow('🔄 Подключение к WhatsApp...'))
        }
        
        if (connection == "open") {
            console.log(chalk.magenta(` `))
            console.log(chalk.yellow(`🌿Подключен к => ` + JSON.stringify(XeonBotInc.user, null, 2)))

            await delay(1999)
            console.log(chalk.green(`Бот подключен`))
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
            const statusCode = lastDisconnect?.error?.output?.statusCode
            
            console.log(chalk.red(`Соединение закрыто из-за ${lastDisconnect?.error}, переподключение ${shouldReconnect}`))
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try {
                    rmSync('./session', { recursive: true, force: true })
                    console.log(chalk.yellow('Папка сессии удалена. Требуется повторная авторизация.'))
                } catch (error) {
                    console.error('Ошибка при удалении сессии:', error)
                }
                console.log(chalk.red('Сессия завершена. Требуется повторная авторизация.'))
            }
            
            if (shouldReconnect) {
                console.log(chalk.yellow('Переподключение...'))
                await delay(5000)
                startXeonBotInc()
            }
        }
    })

    // Отслеживание недавно уведомленных звонящих для предотвращения спама
    const antiCallNotified = new Set();

    // Обработчик антизвонка: блокировка звонящих при включении
    XeonBotInc.ev.on('call', async (calls) => {
        try {
            const { readState: readAnticallState } = require('./commands/anticall');
            const state = readAnticallState();
            if (!state.enabled) return;
            for (const call of calls) {
                const callerJid = call.from || call.peerJid || call.chatId;
                if (!callerJid) continue;
                try {
                    // Сначала: попытка отклонить звонок, если поддерживается
                    try {
                        if (typeof XeonBotInc.rejectCall === 'function' && call.id) {
                            await XeonBotInc.rejectCall(call.id, callerJid);
                        } else if (typeof XeonBotInc.sendCallOfferAck === 'function' && call.id) {
                            await XeonBotInc.sendCallOfferAck(call.id, callerJid, 'reject');
                        }
                    } catch {}

                    // Уведомление звонящего только один раз в течение короткого периода
                    if (!antiCallNotified.has(callerJid)) {
                        antiCallNotified.add(callerJid);
                        setTimeout(() => antiCallNotified.delete(callerJid), 60000);
                        await XeonBotInc.sendMessage(callerJid, { text: '📵 Антизвонок включен. Ваш звонок был отклонен, и вы будете заблокированы.' });
                    }
                } catch {}
                // Затем: блокировка после небольшой задержки для обеспечения обработки отклонения и сообщения
                setTimeout(async () => {
                    try { await XeonBotInc.updateBlockStatus(callerJid, 'block'); } catch {}
                }, 800);
            }
        } catch (e) {
            // игнорировать
        }
    });

    XeonBotInc.ev.on('group-participants.update', async (update) => {
        await handleGroupParticipantUpdate(XeonBotInc, update);
    });

    XeonBotInc.ev.on('messages.upsert', async (m) => {
        if (m.messages[0].key && m.messages[0].key.remoteJid === 'status@broadcast') {
            await handleStatus(XeonBotInc, m);
        }
    });

    XeonBotInc.ev.on('status.update', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    XeonBotInc.ev.on('messages.reaction', async (status) => {
        await handleStatus(XeonBotInc, status);
    });

    return XeonBotInc
    } catch (error) {
        console.error('Ошибка в startXeonBotInc:', error)
        await delay(5000)
        startXeonBotInc()
    }
}


// Запуск бота с обработкой ошибок
startXeonBotInc().catch(error => {
    console.error('Критическая ошибка:', error)
    process.exit(1)
})
process.on('uncaughtException', (err) => {
    console.error('Неперехваченное исключение:', err)
})

process.on('unhandledRejection', (err) => {
    console.error('Необработанное отклонение промиса:', err)
})

let file = require.resolve(__filename)
fs.watchFile(file, () => {
    fs.unwatchFile(file)
    console.log(chalk.redBright(`Обновление ${__filename}`))
    delete require.cache[file]
    require(file)
})