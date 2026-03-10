// 🧹 Fix for ENOSPC / temp overflow in hosted panels
const fs = require('fs');
const path = require('path');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
// Redirect temp storage away from system /tmp
const customTemp = path.join(process.cwd(), 'temp');
if (!fs.existsSync(customTemp)) fs.mkdirSync(customTemp, { recursive: true });
process.env.TMPDIR = customTemp;
process.env.TEMP = customTemp;
process.env.TMP = customTemp;

// Auto-cleaner every 3 hours
setInterval(() => {
    fs.readdir(customTemp, (err, files) => {
        if (err) return;
        for (const file of files) {
            const filePath = path.join(customTemp, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && Date.now() - stats.mtimeMs > 3 * 60 * 60 * 1000) {
                    fs.unlink(filePath, () => { });
                }
            });
        }
    });
    console.log('🧹 Temp folder auto-cleaned');
}, 3 * 60 * 60 * 1000);

const settings = require('./settings');
require('./config.js');
const { isBanned } = require('./lib/isBanned');
const yts = require('yt-search');
const { fetchBuffer } = require('./lib/myfunc');
const fetch = require('node-fetch');
const ytdl = require('ytdl-core');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { isSudo } = require('./lib/index');
const isOwnerOrSudo = require('./lib/isOwner');
const isAdmin = require('./lib/isAdmin');
const { Antilink } = require('./lib/antilink');
const getDisplayName = require('./lib/getDisplayName');

// ============================================
// 🔥 СИСТЕМА ДИНАМИЧЕСКОЙ ЗАГРУЗКИ КОМАНД
// ============================================
const chalk = require('chalk');
chalk.level = 1;

const commandsPath = path.join(__dirname, 'commands');
const commandCache = new Map();

// Функция для очистки кэша модуля и его зависимостей
function clearModuleCache(modulePath) {
    try {
        const resolvedPath = require.resolve(modulePath);
        if (require.cache[resolvedPath]) {
            const mod = require.cache[resolvedPath];
            
            // Очистка зависимостей
            if (mod && mod.children) {
                mod.children.forEach(child => {
                    if (child.id.includes('commands/')) {
                        delete require.cache[child.id];
                    }
                });
            }
            
            delete require.cache[resolvedPath];
        }
    } catch (e) {
        // Игнорируем ошибки разрешения путей
    }
}

// Загрузка команды с обработкой ошибок
function loadCommand(commandName) {
    const commandPath = path.join(commandsPath, `${commandName}.js`);
    
    if (!fs.existsSync(commandPath)) {
        return null;
    }
    
    try {
        // Очищаем кэш
        clearModuleCache(commandPath);
        
        // Загружаем заново
        const command = require(commandPath);
        commandCache.set(commandName, {
            module: command,
            loadedAt: Date.now()
        });
        
        return command;
    } catch (error) {
        console.error(chalk.red(`❌ Ошибка загрузки команды ${commandName}:`), error.message);
        return null;
    }
}

// Функция для получения команды (всегда свежая версия)
function getCommand(commandName) {
    const cached = commandCache.get(commandName);
    if (cached) return cached.module;
    return loadCommand(commandName);
}

// Наблюдатель за изменениями файлов
fs.watch(commandsPath, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
        const commandName = filename.replace('.js', '');
        console.log(chalk.cyan(`🔄 Обнаружено изменение: ${filename}`));
        

        setTimeout(() => {
            const loaded = loadCommand(commandName);
            if (loaded) {
                console.log(chalk.green(`✅ Команда ${commandName} перезагружена`));
            }
        }, 500);
    }
});

// Предзагрузка всех команд при старте
console.log(chalk.yellow('📦 Загрузка команд...'));
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
commandFiles.forEach(file => {
    const commandName = file.replace('.js', '');
    loadCommand(commandName);
});
console.log(chalk.green(`✅ Загружено ${commandCache.size} команд\n`));


// Global settings
global.packname = settings.packname;
global.author = settings.author;
global.channelLink = "https://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A";
global.ytch = "RSecktor";

// Enhanced logging
function getEkaterinburgTime() {
    const date = new Date();
    const offsetMinutes = 5 * 60; // UTC+5
    const ekb = new Date(date.getTime() + offsetMinutes * 60 * 1000);
    const hh = String(ekb.getUTCHours()).padStart(2, '0');
    const mm = String(ekb.getUTCMinutes()).padStart(2, '0');
    const ss = String(ekb.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function shortJid(jid = '') {
    if (!jid) return '';
    return jid.split('@')[0];
}
function limit(str = '', max = 20) {
    if (!str) return '';
    return str.length > max ? str.slice(0, max) + '…' : str;
}

function logDetailed({ isCommand = false, text = '', sender = '', senderName = '', chat = '', chatName = '', chatIsGroup = false, botName = 'Bot', isBanned = false, isBotSender = false }) {
    const time = getEkaterinburgTime();
    const tag = isBanned ? chalk.bold.red(`[${botName}]`) : chalk.bold.cyan(`[${botName}]`);
    const nameDisplay = isBotSender ? chalk.bold.yellow(`[${botName}]`) : tag;
    const kind = isCommand ? chalk.redBright('Command') : chalk.cyan('Message');
    const fromLabel = chalk.green('from');
    const inLabel = chalk.green('in');
    const senderLabel = chalk.yellow(senderName || shortJid(sender));
    const safeChatName = limit(chatName, 20);

const chatLabel = chalk.blue(
    safeChatName
        ? `${safeChatName}${chatIsGroup ? ' (group)' : ' (private)'}`
        : (chatIsGroup ? `${shortJid(chat)} (group)` : `${shortJid(chat)} (private)`)
);


    console.log(
        nameDisplay,
        chalk.gray(`[${time}]`),
        kind,
        chalk.white(text || '-'),
        fromLabel,
        senderLabel,
        inLabel,
        chatLabel
    );
}

function formatMessageType(message) {
    const type = Object.keys(message || {})[0] || 'unknown';
    switch (type) {
        case 'conversation': return 'Conversation';
        case 'extendedTextMessage': return 'Text';
        case 'imageMessage': return 'Image';
        case 'videoMessage': return 'Video';
        case 'audioMessage': return 'Audio';
        case 'stickerMessage': return 'Sticker';
        case 'contactMessage': return 'Contact';
        case 'locationMessage': return 'Location';
        case 'documentMessage': return 'Document';
        case 'buttonsResponseMessage': return 'Button response';
        case 'templateButtonReplyMessage': return 'Template button reply';
        case 'protocolMessage': return 'Protocol';
        case 'ephemeralMessage': return 'Ephemeral';
        default: return type || 'Unknown';
    }
}


async function handleMessages(sock, messageUpdate, printLog) {
    try {
        const { messages, type } = messageUpdate;
        if (type !== 'notify') return;

        const message = messages[0];
        if (!message?.message) return;
        const chatId = message.key.remoteJid;
        const senderId = message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const { autoreadCommand, isAutoreadEnabled, handleAutoread } = getCommand('autoread') || {};
        if (handleAutoread) await handleAutoread(sock, message);

        // Store message for antidelete feature
        if (message.message) {
            const { storeMessage } = getCommand('antidelete') || {};
            if (storeMessage) storeMessage(sock, message);
        }

        // Handle message revocation
        if (message.message?.protocolMessage?.type === 0) {
            try {
                const who = message.key.participant || message.key.remoteJid;
                const [senderName, chatName] = await Promise.all([
                    getDisplayName(sock, who),
                    getDisplayName(sock, message.key.remoteJid)
                ]);
                logDetailed({
                    isCommand: false,
                    text: `Message revoked (key: ${message.key.id || 'unknown'})`,
                    sender: who,
                    senderName,
                    chat: message.key.remoteJid,
                    chatName,
                    chatIsGroup: (message.key.remoteJid || '').endsWith('@g.us'),
                    botName: global.ytch || 'KnightBot',
                    isBanned: isBanned(who),
                    isBotSender: message.key.fromMe
                });
            } catch (e) {}
            const { handleMessageRevocation } = getCommand('antidelete') || {};
            if (handleMessageRevocation) await handleMessageRevocation(sock, message);
            return;
        }

if (message.message?.reactionMessage) {
    const clanCmd = getCommand('clancommands');
    if (clanCmd?.handleReaction) {
        await clanCmd.handleReaction(sock, message);
    }
}

        // УДАЛИТЕ эти строки - они уже объявлены выше
        // const chatId = message.key.remoteJid;
        // const senderId = message.key.participant || message.key.remoteJid;
        // const isGroup = chatId.endsWith('@g.us');
        
        const senderIsSudo = await isSudo(senderId);
        const senderIsOwnerOrSudo = await isOwnerOrSudo(senderId, sock, chatId);

        // Handle button responses
        if (message.message?.buttonsResponseMessage) {
            const buttonId = message.message.buttonsResponseMessage.selectedButtonId;
            // УДАЛИТЕ эту строку - chatId уже объявлен
            // const chatId = message.key.remoteJid;
            
            try {
                const [senderName, chatName] = await Promise.all([
                    getDisplayName(sock, senderId),
                    getDisplayName(sock, chatId)
                ]);
                logDetailed({
                    isCommand: false,
                    text: `ButtonResponse: ${buttonId}`,
                    sender: senderId,
                    senderName,
                    chat: chatId,
                    chatName,
                    chatIsGroup: isGroup,
                    botName: global.ytch || 'KnightBot',
                    isBanned: isBanned(senderId),
                    isBotSender: message.key.fromMe
                });
            } catch (e) {}

            if (buttonId === 'channel') {
                await sock.sendMessage(chatId, {
                    text: '📢 *Join our Channel:*\nhttps://whatsapp.com/channel/0029Va90zAnIHphOuO8Msp3A'
                }, { quoted: message });
                return;
            } else if (buttonId === 'owner') {
                const ownerCommand = getCommand('owner');
                if (ownerCommand) await ownerCommand(sock, chatId);
                return;
            } else if (buttonId === 'support') {
                await sock.sendMessage(chatId, {
                    text: `🔗 *Support*\n\nhttps://chat.whatsapp.com/GA4WrOFythU6g3BFVubYM7?mode=wwt`
                }, { quoted: message });
                return;
            }
        }

        const userMessage = (
            message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            message.message?.buttonsResponseMessage?.selectedButtonId?.trim() ||
            ''
        ).toLowerCase().replace(/\.\s+/g, '.').trim();

        const rawText = message.message?.conversation?.trim() ||
            message.message?.extendedTextMessage?.text?.trim() ||
            message.message?.imageMessage?.caption?.trim() ||
            message.message?.videoMessage?.caption?.trim() ||
            '';

        // Detailed logging
        try {
            const isCmd = userMessage.startsWith('.');
            const messageType = Object.keys(message.message || {})[0] || 'unknown';
            const textForLog = isCmd ? userMessage : (rawText || messageType);
            const [senderName, chatName] = await Promise.all([
                getDisplayName(sock, senderId),
                getDisplayName(sock, chatId)
            ]);
            
            logDetailed({
                isCommand: isCmd,
                text: textForLog,
                sender: senderId,
                senderName,
                chat: chatId,
                chatName,
                chatIsGroup: isGroup,
                botName: global.ytch || 'KnightBot',
                isBanned: isBanned(senderId),
                isBotSender: message.key.fromMe
            });
        } catch (logError) {
            console.error('Logging error:', logError);
        }

        // Read bot mode
        let isPublic = true;
        try {
            const data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (typeof data.isPublic === 'boolean') isPublic = data.isPublic;
        } catch (error) {
            console.error('Error checking access mode:', error);
        }
        
        const isOwnerOrSudoCheck = message.key.fromMe || senderIsOwnerOrSudo;
        
        // Check if user is banned
        if (isBanned(senderId) && !userMessage.startsWith('.unban')) {
            if (Math.random() < 0.1) {
                await sock.sendMessage(chatId, {
                    text: '❌ You are banned from using the bot. Contact an admin to get unbanned.',
                });
            }
            return;
        }

// Handle game moves AND surrender
if (/^[1-9]$/.test(userMessage) || /^(сдаться|сдаюсь|surrender|give\s*up)$/i.test(userMessage)) {
    const tttCmd = getCommand('tictactoe');
    if (tttCmd?.handleTicTacToeMove) {
        await tttCmd.handleTicTacToeMove(sock, chatId, senderId, userMessage);
    }
    // Не делаем return для "сдаться", если игра не найдена — пусть идёт дальше
    if (/^[1-9]$/.test(userMessage)) return;
}

if (!message.key.fromMe) {
    const antispam = require('./lib/antispam');
    const msgText = rawText || '';
    const spamResult = antispam.check(chatId, senderId, msgText); // ← добавить msgText


    if (!spamResult.spam) {
        const topMembersCmd = getCommand('topmembers');
        if (topMembersCmd?.incrementMessageCount) {
            topMembersCmd.incrementMessageCount(chatId, senderId);
        }
        const clanCmd = getCommand('clancommands');
        if (clanCmd?.trackMsg) clanCmd.trackMsg(chatId, senderId);
    }
}
        // Уведомление о новом уровне клана
if (global._clanLevelUp?.[chatId]) {
    const { clan, newLvl } = global._clanLevelUp[chatId];
    delete global._clanLevelUp[chatId];
    await sock.sendMessage(chatId, {
        text: `🎉 Клан *[${clan.tag}] ${clan.name}* достиг *${newLvl} уровня*!`
    });
}

        // Check mute
        if (isGroup) {
            const muteUserCmd = getCommand('muteuser');
            if (muteUserCmd?.check) {
                await muteUserCmd.check(sock, chatId, senderId, message);
            }
        }

        

        // Moderation - always run in groups
        if (isGroup) {
            if (userMessage) {
                const { handleBadwordDetection } = getCommand('antibadword') || {};
                if (handleBadwordDetection) {
                    await handleBadwordDetection(sock, chatId, message, userMessage, senderId);
                }
            }
            await Antilink(message, sock);
        }

        // PM blocker
        if (!isGroup && !message.key.fromMe && !senderIsSudo) {
            try {
                const pmBlockerCmd = getCommand('pmblocker');
                if (pmBlockerCmd?.readState) {
                    const pmState = pmBlockerCmd.readState();
                    if (pmState.enabled) {
                        await sock.sendMessage(chatId, { 
                            text: pmState.message || 'Private messages are blocked. Please contact the owner in groups only.' 
                        });
                        await new Promise(r => setTimeout(r, 1500));
                        try { await sock.updateBlockStatus(chatId, 'block'); } catch (e) { }
                        return;
                    }
                }
            } catch (e) { }
        }
// ОБРАБОТКА КОМАНД БЕЗ ПРЕФИКСОВ ================================
if (userMessage === 'давай вп' && !isGroup) {
    const testmessage = getCommand('testmessage');
    if (testmessage) {
        await testmessage(sock, chatId, message, senderId, true, isGroup);
    }
    return; 
}



if (userMessage.startsWith('бот кто')) {
    if (!isGroup) return; // Только в группах
    
    const inputText = rawText.slice('бот кто'.length).trim();
    if (!inputText) {
        await sock.sendMessage(chatId, { 
            text: 'Укажи текст после команды\nПример: бот кто красавчик?' 
        }, { quoted: message });
        return;
    }
    
    try {
        const groupMeta = await sock.groupMetadata(chatId);
        const participants = groupMeta.participants || [];
        
        if (participants.length < 2) {
            await sock.sendMessage(chatId, { 
                text: 'В группе слишком мало участников' 
            }, { quoted: message });
            return;
        }
        

        let randomUser;
        do {
            randomUser = participants[Math.floor(Math.random() * participants.length)];
        } while (randomUser.id === senderId && participants.length > 1);
        
        const userName = await getDisplayName(sock, randomUser.id);
        
        // Случайные фразы
        const phrases = [
            '🤔 Я думаю, что',
            '🔭 Звезды говорят, что',
            '☝ Я уверен, что',
            '🔮 Ясно вижу, что',
            '💡 Мне кажется, что',
            '🎯 Точно знаю, что',
            '🌟 Очевидно, что',
            '🎲 Выпало, что'
        ];
        
        const phrase = phrases[Math.floor(Math.random() * phrases.length)];
        
        // Отправляем с упоминанием
        await sock.sendMessage(chatId, {
            text: `${phrase} @${randomUser.id.split('@')[0]} ${inputText}`,
            mentions: [randomUser.id]
        }, { quoted: message });
        
    } catch (e) {
        console.error('Ошибка в "бот кто":', e);
        await sock.sendMessage(chatId, { 
            text: 'Произошла ошибка' 
        }, { quoted: message });
    }
    
    return; 
}
// ==================================================================
if (userMessage === '+чат') {
    if (isGroup) {
        const muteCmd = getCommand('mute');
        if (muteCmd?.muteCommand) await muteCmd.muteCommand(sock, chatId, senderId, message);
    }
    return;
}

if (userMessage === '-чат') {
    if (isGroup) {
        const muteCmd = getCommand('mute');
        if (muteCmd?.unmuteCommand) await muteCmd.unmuteCommand(sock, chatId, senderId, message);
    }
    return;
}
//=======Закрытие и открытие группы======================
        if (!userMessage.startsWith('.')) {
            const autotypingCmd = getCommand('autotyping');
            if (autotypingCmd?.handleAutotypingForMessage) {
                await autotypingCmd.handleAutotypingForMessage(sock, chatId, userMessage);
            }

            if (isGroup) {
                const antitagCmd = getCommand('antitag');
                const mentionCmd = getCommand('mention');
                const chatbotCmd = getCommand('chatbot');

                if (antitagCmd?.handleTagDetection) {
                    await antitagCmd.handleTagDetection(sock, chatId, message, senderId);
                }
                if (mentionCmd?.handleMentionDetection) {
                    await mentionCmd.handleMentionDetection(sock, chatId, message);
                }
                if ((isPublic || isOwnerOrSudoCheck) && chatbotCmd?.handleChatbotResponse) {
                    await chatbotCmd.handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                }
            }
            return;
        }

        // In private mode, only owner/sudo can run commands
        if (!isPublic && !isOwnerOrSudoCheck) {
            return;
        }

        // Admin and owner command lists
        const adminCommands = ['.mute', '.unmute', '.ban', '.unban', '.promote', '.demote', '.kick', '.tagall', '.tagnotadmin', '.antilink', '.antitag', '.setgdesc', '.setgname', '.setgpp'];
        const isAdminCommand = adminCommands.some(cmd => userMessage.startsWith(cmd));

        const ownerCommands = ['.mode', '.autostatus', '.antidelete', '.cleartmp', '.setpp', '.clearsession', '.areact', '.autoreact', '.autotyping', '.autoread', '.pmblocker'];
        const isOwnerCommand = ownerCommands.some(cmd => userMessage.startsWith(cmd));

        let isSenderAdmin = false;
        let isBotAdmin = false;

        // Check admin status for admin commands in groups
        if (isGroup && isAdminCommand) {
            const adminStatus = await isAdmin(sock, chatId, senderId);
            isSenderAdmin = adminStatus.isSenderAdmin;
            isBotAdmin = adminStatus.isBotAdmin;

            if (!isBotAdmin) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Дайте боту права администратора для использования этой команды' 
                }, { quoted: message });
                return;
            }

            if (
                userMessage.startsWith('.mute') ||
                userMessage === '.unmute' ||
                userMessage.startsWith('.ban') ||
                userMessage.startsWith('.unban') ||
                userMessage.startsWith('.promote') ||
                userMessage.startsWith('.demote')
            ) {
                if (!isSenderAdmin && !message.key.fromMe) {
                    await sock.sendMessage(chatId, {
                        text: '👥 Эту команду можно использовать только в группе.',
                    }, { quoted: message });
                    return;
                }
            }
        }

        // Check owner status for owner commands
        if (isOwnerCommand) {
            if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Эту команду может использовать только разработчик' 
                }, { quoted: message });
                return;
            }
        }

        // Command execution
        let commandExecuted = false;
if (message.key.fromMe && ['.setxp','.addxp','.delxp','.setlvl','.setmsgs','.addmsgs','.delmsgs','.clanunban','.clankick','.clanowner','.clandel','.clanlist','.clanwho'].some(c => userMessage.startsWith(c))) {
    const clanAdminCmd = getCommand('clanAdmin');
    if (clanAdminCmd?.handle) await clanAdminCmd.handle(sock, chatId, senderId, rawText, message);
    return;
}
        switch (true) {
            case userMessage.startsWith('.kick'):
            case userMessage.startsWith('.кик'): {
                const mentionedJidListKick = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const kickCommand = getCommand('kick');
                if (kickCommand) await kickCommand(sock, chatId, senderId, mentionedJidListKick, message);
                break;
            }

            case userMessage === '.клан' || userMessage.startsWith('.клан '): {
    const clanCmd = getCommand('clancommands');
    if (clanCmd?.handle) await clanCmd.handle(sock, chatId, senderId, rawText, message);
    break;
}

case userMessage === '.журнал':
case userMessage === '.audit': {
    const auditlogCmd = getCommand('auditlog');
    if (auditlogCmd?.cmd) await auditlogCmd.cmd(sock, chatId, senderId, message);
    break;
}

case userMessage.startsWith('.шрифт1'): {
    const fontCmd = getCommand('font');
    if (fontCmd) await fontCmd(sock, chatId, message, 1);
    break;
}

case userMessage.startsWith('.шрифт2'): {
    const fontCmd = getCommand('font');
    if (fontCmd) await fontCmd(sock, chatId, message, 2);
    break;
}


        case userMessage.startsWith('.mute'):
            case userMessage.startsWith('+чат'): {
                const parts = userMessage.trim().split(/\s+/);
                const muteArg = parts[1];
                const muteDuration = muteArg !== undefined ? parseInt(muteArg, 10) : undefined;
                if (muteArg !== undefined && (isNaN(muteDuration) || muteDuration <= 0)) {
                    await sock.sendMessage(chatId, { 
                        text: 'Please provide a valid number of minutes or use .mute with no number to mute immediately.' 
                    }, { quoted: message });
                } else {
                    const muteCommand = getCommand('mute');
                    if (muteCommand) await muteCommand(sock, chatId, senderId, message, muteDuration);
                }
                break;
            }

            

            case userMessage === '.unmute':
            case userMessage === '-чат': {
                const unmuteCommand = getCommand('unmute');
                if (unmuteCommand) await unmuteCommand(sock, chatId, senderId);
                break;
            }
            

            case userMessage.startsWith('.ссылка'): {
          const linkCmd = getCommand('linkgroup');
            if (linkCmd) await linkCmd(sock, chatId, senderId, message);
              break;
            }

            case userMessage.startsWith('.ban'): {
                if (!isGroup) {
                    if (!message.key.fromMe && !senderIsSudo) {
                        await sock.sendMessage(chatId, { 
                            text: 'Only owner/sudo can use .ban in private chat.' 
                        }, { quoted: message });
                        break;
                    }
                }
                const banCommand = getCommand('ban');
                if (banCommand) await banCommand(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.unban'): {
                if (!isGroup) {
                    if (!message.key.fromMe && !senderIsSudo) {
                        await sock.sendMessage(chatId, { 
                            text: 'Only owner/sudo can use .unban in private chat.' 
                        }, { quoted: message });
                        break;
                    }
                }
                const unbanCommand = getCommand('unban');
                if (unbanCommand) await unbanCommand(sock, chatId, message);
                break;
            }

            case userMessage === '.help':
            case userMessage === '.menu':
            case userMessage === '.меню':
            case userMessage === '.команды': {
                const helpCommand = getCommand('help');
                if (helpCommand) await helpCommand(sock, chatId, message, global.channelLink);
                commandExecuted = true;
                break;
            }

case userMessage.startsWith('.sticker'):
case userMessage.startsWith('.стикер'): {
    const stickerCommand = getCommand('sticker');
    if (stickerCommand) await stickerCommand(sock, chatId, message);
    commandExecuted = true;
    break;
}



case userMessage === '.exec': {
    const isOwner = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
    
    if (!isOwner) {
        await sock.sendMessage(chatId, { 
            text: '❌ Эту команду может использовать только разработчик' 
        }, { quoted: message });
        return;
    }
    const exec = getCommand('exec');
    if (exec) await exec(sock, chatId, message);
    break;
}


                        case userMessage === '.repeat': {
                const repeatMessage = getCommand('repeatMessage');
                if (repeatMessage) await repeatMessage(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.warnings'): {
                const mentionedJidListWarnings = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const warningsCommand = getCommand('warnings');
                if (warningsCommand) await warningsCommand(sock, chatId, mentionedJidListWarnings);
                break;
            }

            case userMessage.startsWith('.warn'): {
                const mentionedJidListWarn = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const warnCommand = getCommand('warn');
                if (warnCommand) await warnCommand(sock, chatId, senderId, mentionedJidListWarn, message);
                break;
            }

case userMessage.startsWith('.tts'): {
    const text = userMessage.slice(4).trim();
    const ttsCommand = getCommand('tts');
    if (ttsCommand) await ttsCommand(sock, chatId, message, text);
    break;
}


            case userMessage.startsWith('.delete'):
            case userMessage.startsWith('.del'): {
                const deleteCommand = getCommand('delete');
                if (deleteCommand) await deleteCommand(sock, chatId, message, senderId);
                break;
            }

            case userMessage.startsWith('.attp'): {
                const attpCommand = getCommand('attp');
                if (attpCommand) await attpCommand(sock, chatId, message);
                break;
            }

            case userMessage === '.settings': {
                const settingsCommand = getCommand('settings');
                if (settingsCommand) await settingsCommand(sock, chatId, message);
                break;
            }
//======================СИСТЕМА МУТОВ (на данный момент убрана из-за неэффективности)========================
            case userMessage === '.муты': {
                const mutelist = getCommand('mutelist');
                if (mutelist) await mutelist(sock, chatId, senderId, message);
                break;
            }

            case userMessage.startsWith('.мут'): {
                const muteUserCmd = getCommand('muteuser');
                if (muteUserCmd?.muteCommand2) {
                    await muteUserCmd.muteCommand2(sock, chatId, senderId, message);
                }
                break;
            }
             case userMessage.startsWith('.размут'):
            case userMessage.startsWith('.анмут'): {
                const unmuteCommandUser = getCommand('unmuteuser');
                if (unmuteCommandUser) await unmuteCommandUser(sock, chatId, senderId, message);
                break;
            }
//=======================================================================

case userMessage === '.пред' || userMessage.startsWith('.пред '): {
    const warnCmd = getCommand('warnuser');
    if (warnCmd) await warnCmd(sock, chatId, senderId, message);
    break;
}
case userMessage === '.разпред' || userMessage.startsWith('.разпред '):
case userMessage === '.анпред' || userMessage.startsWith('.анпред '): {
    const unwarnCmd = getCommand('unwarnuser');
    if (unwarnCmd) await unwarnCmd(sock, chatId, senderId, message);
    break;
}
case userMessage === '.преды': {
    const warnlistCmd = getCommand('warnlist');
    if (warnlistCmd) await warnlistCmd(sock, chatId);
    break;
}
            case userMessage.startsWith('.mode'): {
                if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, { 
                        text: 'Only bot owner can use this command!' 
                    }, { quoted: message });
                    return;
                }
                
                let data;
                try {
                    data = JSON.parse(fs.readFileSync('./data/messageCount.json'));
                } catch (error) {
                    console.error('Error reading access mode:', error);
                    await sock.sendMessage(chatId, { text: 'Failed to read bot mode status' });
                    return;
                }

                const action = userMessage.split(' ')[1]?.toLowerCase();
                
                if (!action) {
                    const currentMode = data.isPublic ? 'public' : 'private';
                    await sock.sendMessage(chatId, {
                        text: `Current bot mode: *${currentMode}*\n\nUsage: .mode public/private\n\nExample:\n.mode public - Allow everyone to use bot\n.mode private - Restrict to owner only`,
                    }, { quoted: message });
                    return;
                }

                if (action !== 'public' && action !== 'private') {
                    await sock.sendMessage(chatId, {
                        text: 'Usage: .mode public/private\n\nExample:\n.mode public - Allow everyone to use bot\n.mode private - Restrict to owner only',
                    }, { quoted: message });
                    return;
                }

                try {
                    data.isPublic = action === 'public';
                    fs.writeFileSync('./data/messageCount.json', JSON.stringify(data, null, 2));
                    await sock.sendMessage(chatId, { text: `Bot is now in *${action}* mode` });
                } catch (error) {
                    console.error('Error updating access mode:', error);
                    await sock.sendMessage(chatId, { text: 'Failed to update bot access mode' });
                }
                break;
            }

            case userMessage.startsWith('.anticall'): {
                if (!message.key.fromMe && !senderIsOwnerOrSudo) {
                    await sock.sendMessage(chatId, { 
                        text: 'Only owner/sudo can use anticall.' 
                    }, { quoted: message });
                    break;
                }
                const args = userMessage.split(' ').slice(1).join(' ');
                const anticallCommand = getCommand('anticall');
                if (anticallCommand) await anticallCommand(sock, chatId, message, args);
                break;
            }

            case userMessage.startsWith('.pmblocker'): {
                const args = userMessage.split(' ').slice(1).join(' ');
                const pmblockerCommand = getCommand('pmblocker');
                if (pmblockerCommand) await pmblockerCommand(sock, chatId, message, args);
                commandExecuted = true;
                break;
            }

            case userMessage === '.карусель': {
    const testcarousel = getCommand('testcarousel');
    if (testcarousel) await testcarousel(sock, chatId, message);
    break;
}

            case userMessage === '.owner':
            case userMessage.startsWith('.разработчик'): {
                const ownerCommand = getCommand('owner');
                if (ownerCommand) await ownerCommand(sock, chatId);
                break;
            }

            case userMessage === '.tagall': {
                const tagAllCommand = getCommand('tagall');
                if (tagAllCommand) await tagAllCommand(sock, chatId, senderId, message);
                break;
            }

            case userMessage === '.tagnotadmin': {
                const tagNotAdminCommand = getCommand('tagnotadmin');
                if (tagNotAdminCommand) await tagNotAdminCommand(sock, chatId, senderId, message);
                break;
            }

            case userMessage === '.ботинфо':
            case userMessage === '.botinfo': {
                const botinfoCommand = getCommand('botinfo');
                if (botinfoCommand) await botinfoCommand(sock, chatId, senderId, message);
                break;
            }
            case userMessage.startsWith('.vse'): {
    if (!isGroup) {
        await sock.sendMessage(chatId, {
            text: 'Эту команду можно использовать только в группах.',
        }, { quoted: message });
        return;
    }
    const text = rawText.split(' ').slice(1).join(' ').trim();
    const vseCmd = getCommand('vse');
    if (vseCmd) await vseCmd(sock, chatId, message, text);
    break;
}
             case userMessage.startsWith('.все'):
            case userMessage.startsWith('#вызов'):
            case userMessage.startsWith('#все'):
            case userMessage.startsWith('.вызов'): {
                                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'Эту команду можно использовать только в группах.',
                    }, { quoted: message });
                    return;
                }
                const messageText = rawText.split(' ').slice(1).join(' ').trim(); // text after command
                const replyMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
                const tagCommand = getCommand('tag');
                if (tagCommand) await tagCommand(sock, chatId, senderId, messageText, replyMessage, message);
                break;
            }

case userMessage.startsWith('.антиссылка'):
case userMessage.startsWith('.antilink'): {
    if (!isGroup) {
        await sock.sendMessage(chatId, {
            text: 'Эту команду можно использовать только в группах.',
        }, { quoted: message });
        return;
    }
    
    const adminStatus = await isAdmin(sock, chatId, senderId);
    const isBotAdmin = adminStatus.isBotAdmin;
    const isSenderAdmin = adminStatus.isSenderAdmin;
    
    if (!isBotAdmin) {
        await sock.sendMessage(chatId, {
            text: 'Дайте бота админку для того чтобы он мог удалять ссылки.',
        }, { quoted: message });
        return;
    }
    
    const antilinkCmd = getCommand('antilink');
    if (antilinkCmd?.handleAntilinkCommand) {
        await antilinkCmd.handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
    }
    break;
}

            case userMessage.startsWith('.antitag'): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, {
                        text: 'This command can only be used in groups.',
                    }, { quoted: message });
                    return;
                }
                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, {
                        text: 'Please make the bot an admin first.',
                    }, { quoted: message });
                    return;
                }
                const antitagCmd = getCommand('antitag');
                if (antitagCmd?.handleAntitagCommand) {
                    await antitagCmd.handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message);
                }
                break;
            }

            case userMessage === '.quote': {
                const quoteCommand = getCommand('quote');
                if (quoteCommand) await quoteCommand(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.weather'): {
                const city = userMessage.slice(9).trim();
                if (city) {
                    const weatherCommand = getCommand('weather');
                    if (weatherCommand) await weatherCommand(sock, chatId, message, city);
                } else {
                    await sock.sendMessage(chatId, { 
                        text: 'Please specify a city, e.g., .weather London' 
                    }, { quoted: message });
                }
                break;
            }

case userMessage.startsWith('.тиктак'):
case userMessage.startsWith('.ttt'):
case userMessage.startsWith('.кн'): {
    const tttText = rawText.split(' ').slice(1).join(' ');
    const tictactoeCmd = getCommand('tictactoe');
    if (tictactoeCmd?.tictactoeCommand) {
        await tictactoeCmd.tictactoeCommand(sock, chatId, senderId, tttText);
    }
    break;
}

            case userMessage === '.topmembers':
            case userMessage.startsWith('.сообщения'): {
                const topMembersCmd = getCommand('topmembers');
                if (topMembersCmd?.topMembers) {
                    topMembersCmd.topMembers(sock, chatId, isGroup);
                }
                break;
            }

            case userMessage === '.ptv': {
    const ptvCmd = getCommand('ptv');
    if (ptvCmd?.ptvCommand) {
        await ptvCmd.ptvCommand(sock, chatId, message);
    }
    break;
}

            case userMessage === '.clear': {
                if (isGroup) {
                    const clearCmd = getCommand('clear');
                    if (clearCmd?.clearCommand) {
                        await clearCmd.clearCommand(sock, chatId);
                    }
                }
                break;
            }

            case userMessage.startsWith('.promote'):
            case userMessage.startsWith('.повысить'): {
                const mentionedJidListPromote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const promoteCmd = getCommand('promote');
                if (promoteCmd?.promoteCommand) {
                    await promoteCmd.promoteCommand(sock, chatId, mentionedJidListPromote, message);
                }
                break;
            }

            case userMessage.startsWith('.demote'):
            case userMessage.startsWith('.понизить'): {
                const mentionedJidListDemote = message.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
                const demoteCmd = getCommand('demote');
                if (demoteCmd?.demoteCommand) {
                    await demoteCmd.demoteCommand(sock, chatId, mentionedJidListDemote, message);
                }
                break;
            }

            case userMessage === '.ping':
            case userMessage.startsWith('.пинг'): {
                const pingCommand = getCommand('ping');
                if (pingCommand) await pingCommand(sock, chatId, message);
                break;
            }

            


case userMessage.startsWith('.поиск'): {
    const sendImage = getCommand('sendImage');
    if (!sendImage) break;

    const query = userMessage
        .replace('.поиск', '')
        .trim();

    if (!query) break;

    await sendImage(sock, chatId, message, query);
    break;
}



case userMessage.startsWith('.котик'): {
    const sendCat = getCommand('sendCat');
    if (!sendCat) break;

    // УДАЛИТЕ: const chatId = message.key.remoteJid;
    await sendCat(sock, chatId, message); // используйте уже объявленную chatId
    break;
}

            case userMessage.startsWith('.стата'): {
                const profileCommand = getCommand('profile');
                if (profileCommand) await profileCommand(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.сердечко'): {
                const heartAnimation = getCommand('heartAnimation');
                if (heartAnimation) await heartAnimation(sock, chatId, message);
                break;
            }

            case userMessage === '.карусель': {
            const testcarousel = getCommand('testcarousel');
                if (testcarousel) await testcarousel(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.mention '): {
                const args = userMessage.split(' ').slice(1).join(' ');
                const isOwner = message.key.fromMe || senderIsSudo;
                const mentionCmd = getCommand('mention');
                if (mentionCmd?.mentionToggleCommand) {
                    await mentionCmd.mentionToggleCommand(sock, chatId, message, args, isOwner);
                }
                break;
            }

            case userMessage === '.setmention': {
                const isOwner = message.key.fromMe || senderIsSudo;
                const mentionCmd = getCommand('mention');
                if (mentionCmd?.setMentionCommand) {
                    await mentionCmd.setMentionCommand(sock, chatId, message, isOwner);
                }
                break;
            }

            case userMessage.startsWith('.blur'): {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const blurCommand = getCommand('img-blur');
                if (blurCommand) await blurCommand(sock, chatId, message, quotedMessage);
                break;
            }

            case userMessage.startsWith('.приветствие'): {
                if (isGroup) {
                    if (!isSenderAdmin) {
                        const adminStatus = await isAdmin(sock, chatId, senderId);
                        isSenderAdmin = adminStatus.isSenderAdmin;
                    }

                    if (isSenderAdmin || message.key.fromMe) {
                        const welcomeCmd = getCommand('welcome');
                        if (welcomeCmd?.welcomeCommand) {
                            await welcomeCmd.welcomeCommand(sock, chatId, message);
                        }
                    } else {
                        await sock.sendMessage(chatId, { 
                            text: 'Только админы могут использовать эту команду.' 
                        }, { quoted: message });
                    }
                } else {
                    await sock.sendMessage(chatId, { 
                        text: 'Эту команду можно использовать только в группах.' 
                    }, { quoted: message });
                }
                break;
            }

            case userMessage.startsWith('.antibadword'): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { 
                        text: 'This command can only be used in groups.' 
                    }, { quoted: message });
                    return;
                }

                const adminStatus = await isAdmin(sock, chatId, senderId);
                isSenderAdmin = adminStatus.isSenderAdmin;
                isBotAdmin = adminStatus.isBotAdmin;

                if (!isBotAdmin) {
                    await sock.sendMessage(chatId, { 
                        text: '*Bot must be admin to use this feature*' 
                    }, { quoted: message });
                    return;
                }

                const antibadwordCommand = getCommand('antibadword');
                if (antibadwordCommand) {
                    await antibadwordCommand(sock, chatId, message, senderId, isSenderAdmin);
                }
                break;
            }

            case userMessage.startsWith('.chatbot'): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { 
                        text: 'This command can only be used in groups.' 
                    }, { quoted: message });
                    return;
                }

                const chatbotAdminStatus = await isAdmin(sock, chatId, senderId);
                if (!chatbotAdminStatus.isSenderAdmin && !message.key.fromMe) {
                    await sock.sendMessage(chatId, { 
                        text: '*Only admins or bot owner can use this command*' 
                    }, { quoted: message });
                    return;
                }

                const match = userMessage.slice(8).trim();
                const chatbotCmd = getCommand('chatbot');
                if (chatbotCmd?.handleChatbotCommand) {
                    await chatbotCmd.handleChatbotCommand(sock, chatId, message, match);
                }
                break;
            }

            case userMessage.startsWith('.character'): {
                const characterCommand = getCommand('character');
                if (characterCommand) await characterCommand(sock, chatId, message);
                break;
            }

            case userMessage === '.ship': {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { 
                        text: 'This command can only be used in groups!' 
                    }, { quoted: message });
                    return;
                }
                const shipCommand = getCommand('ship');
                if (shipCommand) await shipCommand(sock, chatId, message);
                break;
            }
            
            case userMessage.startsWith('.marriage_accept'): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах.' }, { quoted: message });
                    return;
                }
                const uidMatch = userMessage.match(/mar\d+/i);
                const uid = uidMatch ? uidMatch[0] : null;
                const marriageCmd = getCommand('marriage');
                if (marriageCmd?.acceptViaButton) await marriageCmd.acceptViaButton(sock, chatId, message, uid);
                break;
            }

            case userMessage.startsWith('.marriage_reject'): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах.' }, { quoted: message });
                    return;
                }
                const uidMatchR = userMessage.match(/mar\d+/i);
                const uidR = uidMatchR ? uidMatchR[0] : null;
                const marriageCmdR = getCommand('marriage');
                if (marriageCmdR?.rejectViaButton) await marriageCmdR.rejectViaButton(sock, chatId, message, uidR);
                break;
            }
case userMessage === '.брак' || userMessage.startsWith('.брак '): {
    if (!isGroup) {
        await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах.' }, { quoted: message });
        return;
    }
    const marriageCmd = getCommand('marriage');
    if (marriageCmd?.proposeCommand) await marriageCmd.proposeCommand(sock, chatId, message);
    break;
}


case userMessage === '.браки': {
    const marriagesCommand = getCommand('marriages');
    if (typeof marriagesCommand === 'function') {
        await marriagesCommand(sock, chatId, message);
    }
    break;
}

case userMessage.startsWith('.getgroupid'):
case userMessage.startsWith('.groupid'):
case userMessage.startsWith('.gid'):
case userMessage.startsWith('.гид'): {
    const getGroupIdCmd = getCommand('getgroupid');
    if (getGroupIdCmd) await getGroupIdCmd(sock, chatId, message);
    break;
}


            case userMessage.startsWith('.развод'):
            case userMessage.startsWith('.расстаться'):
            case userMessage.startsWith('.divorce'): {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { text: 'Эту команду можно использовать только в группах.' }, { quoted: message });
                    return;
                }
                const marriageCmd2 = getCommand('marriage');
                if (marriageCmd2?.divorceCommand) await marriageCmd2.divorceCommand(sock, chatId, message);
                break;
            }

            case userMessage === '.groupinfo':
            case userMessage === '.инфогруппа':
            case userMessage === '.infogrupo': {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { 
                        text: 'Эту команду можно использовать только в группах' 
                    }, { quoted: message });
                    return;
                }
                const groupInfoCommand = getCommand('groupinfo');
                if (groupInfoCommand) await groupInfoCommand(sock, chatId, message);
                break;
            }

            case userMessage === '.resetlink':
            case userMessage === '.revoke':
            case userMessage === '.anularlink': {
                if (!isGroup) {
                    await sock.sendMessage(chatId, { 
                        text: 'This command can only be used in groups!' 
                    }, { quoted: message });
                    return;
                }
                const resetlinkCommand = getCommand('resetlink');
                if (resetlinkCommand) await resetlinkCommand(sock, chatId, senderId);
                break;
            }

            case userMessage.startsWith('.emojimix'):
            case userMessage.startsWith('.emix'): {
                const emojimixCommand = getCommand('emojimix');
                if (emojimixCommand) await emojimixCommand(sock, chatId, message);
                break;
            }


            case userMessage === '.vv': {
                const viewOnceCommand = getCommand('viewonce');
                if (viewOnceCommand) await viewOnceCommand(sock, chatId, message);
                break;
            }

            case userMessage === '.clearsession':
            case userMessage === '.clearsesi': {
                const clearSessionCommand = getCommand('clearsession');
                if (clearSessionCommand) await clearSessionCommand(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.autostatus'): {
                const autoStatusArgs = userMessage.split(' ').slice(1);
                const autoStatusCmd = getCommand('autostatus');
                if (autoStatusCmd?.autoStatusCommand) {
                    await autoStatusCmd.autoStatusCommand(sock, chatId, message, autoStatusArgs);
                }
                break;
            }

            case userMessage.startsWith('.antidelete'): {
                const antideleteMatch = userMessage.slice(11).trim();
                const antideleteCmd = getCommand('antidelete');
                if (antideleteCmd?.handleAntideleteCommand) {
                    await antideleteCmd.handleAntideleteCommand(sock, chatId, message, antideleteMatch);
                }
                break;
            }

            case userMessage === '.cleartmp': {
                const clearTmpCommand = getCommand('cleartmp');
                if (clearTmpCommand) await clearTmpCommand(sock, chatId, message);
                break;
            }

            case userMessage === '.setpp': {
                const setProfilePicture = getCommand('setpp');
                if (setProfilePicture) await setProfilePicture(sock, chatId, message);
                break;
            }
            

            case userMessage.startsWith('.setgdesc'): {
                const text = rawText.slice(9).trim();
                const groupmanageCmd = getCommand('groupmanage');
                if (groupmanageCmd?.setGroupDescription) {
                    await groupmanageCmd.setGroupDescription(sock, chatId, senderId, text, message);
                }
                break;
            }

            case userMessage.startsWith('.setgname'): {
                const text = rawText.slice(9).trim();
                const groupmanageCmd = getCommand('groupmanage');
                if (groupmanageCmd?.setGroupName) {
                    await groupmanageCmd.setGroupName(sock, chatId, senderId, text, message);
                }
                break;
            }

            case userMessage.startsWith('.setgpp'): {
                const groupmanageCmd = getCommand('groupmanage');
                if (groupmanageCmd?.setGroupPhoto) {
                    await groupmanageCmd.setGroupPhoto(sock, chatId, senderId, message);
                }
                break;
            }

            case userMessage.startsWith('.instagram'):
            case userMessage.startsWith('.insta'):
            case (userMessage === '.ig' || userMessage.startsWith('.ig ')): {
                const instagramCommand = getCommand('instagram');
                if (instagramCommand) await instagramCommand(sock, chatId, message);
                break;
            }


            case userMessage.startsWith('.music'): {
                const playCommand = getCommand('play');
                if (playCommand) await playCommand(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.play'):
            case userMessage.startsWith('.mp3'):
            case userMessage.startsWith('.ytmp3'):
            case userMessage.startsWith('.song'): {
                const songCommand = getCommand('song');
                if (songCommand) await songCommand(sock, chatId, message);
                break;
            }

            case userMessage.startsWith('.translate'):
            case userMessage.startsWith('.trt'): {
                const commandLength = userMessage.startsWith('.translate') ? 10 : 4;
                const translateCmd = getCommand('translate');
                if (translateCmd?.handleTranslateCommand) {
                    await translateCmd.handleTranslateCommand(sock, chatId, message, userMessage.slice(commandLength));
                }
                return;
            }

            case userMessage.startsWith('.areact'):
            case userMessage.startsWith('.autoreact'):
            case userMessage.startsWith('.autoreaction'): {
                const reactionsLib = require('./lib/reactions');
                if (reactionsLib?.handleAreactCommand) {
                    await reactionsLib.handleAreactCommand(sock, chatId, message, isOwnerOrSudoCheck);
                }
                break;
            }

            case userMessage.startsWith('.sudo'): {
                const sudoCommand = getCommand('sudo');
                if (sudoCommand) await sudoCommand(sock, chatId, message);
                break;
            }


            case userMessage.startsWith('.autotyping'): {
                const autotypingCmd = getCommand('autotyping');
                if (autotypingCmd?.autotypingCommand) {
                    await autotypingCmd.autotypingCommand(sock, chatId, message);
                }
                commandExecuted = true;
                break;
            }

            case userMessage.startsWith('.autoread'): {
                const autoreadCmd = getCommand('autoread');
                if (autoreadCmd?.autoreadCommand) {
                    await autoreadCmd.autoreadCommand(sock, chatId, message);
                }
                commandExecuted = true;
                break;
            }
            case userMessage.startsWith('.animu'):
            case userMessage.startsWith('.nom'):
            case userMessage.startsWith('.poke'):
            case userMessage.startsWith('.cry'):
            case userMessage.startsWith('.kiss'):
            case userMessage.startsWith('.pat'):
            case userMessage.startsWith('.hug'):
            case userMessage.startsWith('.wink'):
            case userMessage.startsWith('.smile'):
            case userMessage.startsWith('.wave'):
            case userMessage.startsWith('.blush'):
            case userMessage.startsWith('.dance'):
            case userMessage.startsWith('.cuddle'):
            case userMessage.startsWith('.slap'):
            case userMessage.startsWith('.kick'):
            case userMessage.startsWith('.yeet'):
            case userMessage.startsWith('.bully'):
            case userMessage.startsWith('.happy'):
            case userMessage.startsWith('.highfive'):
            case userMessage.startsWith('.handhold'):
            case userMessage.startsWith('.скушать'):
            case userMessage.startsWith('.обнять'):
            case userMessage.startsWith('.облизнуть'):
            case userMessage.startsWith('.погладить'):
            case userMessage.startsWith('.убить'):
            case userMessage.startsWith('.кринж'):
            case userMessage.startsWith('.укусить'):
            case userMessage.startsWith('.танцевать'):
            case userMessage.startsWith('.тык'):
            case userMessage.startsWith('.пнуть'):
            case userMessage.startsWith('.шлепнуть'):
            case userMessage.startsWith('.подмигнуть'):
            case userMessage.startsWith('.поцеловать'):
            case userMessage.startsWith('.ударить'):
            case userMessage.startsWith('.facepalm'):
            case userMessage.startsWith('.face-palm'):
            case userMessage.startsWith('.animuquote'):
            case userMessage.startsWith('.loli'): {
                const parts = userMessage.trim().split(/\s+/);
                let sub = parts[0].slice(1);
                
                // Нормализация команд
                if (sub === 'facepalm') sub = 'face-palm';
                if (sub === 'quote' || sub === 'animuquote') sub = 'quote';
                
                const args = sub === 'animu' ? parts.slice(1) : [sub];
                
                const animeCmd = getCommand('anime');
                if (animeCmd?.animeCommand) {
                    await animeCmd.animeCommand(sock, chatId, message, args);
                }
                
                commandExecuted = true;
                break;
            }

            case userMessage.startsWith('.update'): {
                const parts = rawText.trim().split(/\s+/);
                const zipArg = parts[1] && parts[1].startsWith('http') ? parts[1] : '';
                const updateCommand = getCommand('update');
                if (updateCommand) await updateCommand(sock, chatId, message, zipArg);
                commandExecuted = true;
                break;
            }

            default: {
                if (isGroup) {
                    const chatbotCmd = getCommand('chatbot');
                    const antitagCmd = getCommand('antitag');
                    const mentionCmd = getCommand('mention');

                    if (userMessage && chatbotCmd?.handleChatbotResponse) {
                        await chatbotCmd.handleChatbotResponse(sock, chatId, message, userMessage, senderId);
                    }
                    if (antitagCmd?.handleTagDetection) {
                        await antitagCmd.handleTagDetection(sock, chatId, message, senderId);
                    }
                    if (mentionCmd?.handleMentionDetection) {
                        await mentionCmd.handleMentionDetection(sock, chatId, message);
                    }
                }
                commandExecuted = false;
                break;
            }
        }

        // Show typing status after command execution
        if (commandExecuted !== false) {
            const autotypingCmd = getCommand('autotyping');
            if (autotypingCmd?.showTypingAfterCommand) {
                await autotypingCmd.showTypingAfterCommand(sock, chatId);
            }
        }


        if (userMessage.startsWith('.')) {
            const reactionsLib = require('./lib/reactions');
            if (reactionsLib?.addCommandReaction) {
                await reactionsLib.addCommandReaction(sock, message);
            }
        }
   } catch (error) {
        if (error instanceof Error) {
            console.error(`Error Name: ${error.name}`);
            console.error(`Error Message: ${error.message}`);
            console.error(`Stack Trace:`);
            console.error(error.stack);
        } else {
            console.error(`Unknown Error Type:`, error);
        }
        
        try {
            const errorContext = {
                hasMessageUpdate: !!messageUpdate,
                hasMessages: !!messageUpdate?.messages,
                messageCount: messageUpdate?.messages?.length || 0,
                updateType: messageUpdate?.type,
                chatId: messageUpdate?.messages?.[0]?.key?.remoteJid || message?.key?.remoteJid || 'unknown',
                sender: messageUpdate?.messages?.[0]?.key?.participant || 
                        messageUpdate?.messages?.[0]?.key?.remoteJid || 
                        message?.key?.participant || 
                        message?.key?.remoteJid || 
                        'unknown',
                isGroup: (messageUpdate?.messages?.[0]?.key?.remoteJid || message?.key?.remoteJid || '').endsWith('@g.us'),
                messageType: message?.message ? Object.keys(message.message)[0] : 'unknown',
                command: userMessage || 'no command',
                timestamp: new Date().toISOString()
            };
            
            console.error('\nContext:');
            console.error(JSON.stringify(errorContext, null, 2));
        } catch (contextError) {
            console.error('Failed to gather error context:', contextError.message);
        }

        let errorChatId;
        
        try {
            if (messageUpdate?.messages?.[0]?.key?.remoteJid) {
                errorChatId = messageUpdate.messages[0].key.remoteJid;
            } else if (message?.key?.remoteJid) {
                errorChatId = message.key.remoteJid;
            }
        } catch (e) {
            console.error('Failed to extract chat ID:', e.message);
        }
        
        if (errorChatId && sock) {
            try {
                let errorMessage = '😭 Произошла ошибка при выполнении команды\n> обратитесь в поддержку wa.me/79292991077 и подробно опишите проблему.';
                
                if (error instanceof Error) {
                    errorMessage += `\n\n> ${error.name}: ${error.message}`;
                } else if (typeof error === 'string') {
                    errorMessage = error;
                }
                
                await sock.sendMessage(errorChatId, {
                    text: errorMessage,
                });
            } catch (sendError) {
                console.error(`Error: ${sendError.message}`);
                console.error(`Chat ID: ${errorChatId}`);
            }
        } else {
            console.error('⚠️ Cannot send error message: Chat ID or socket not available');
        }
    }
}

async function handleGroupParticipantUpdate(sock, update) {
    try {
        const { id, participants, action, author } = update;

        if (!id.endsWith('@g.us')) return;

        // объявляем здесь — доступны везде в функции
        let normalizedParticipants = [];
        let participantNames = [];
        let authorName = null;
        let groupName = '';

        try {
            normalizedParticipants = Array.isArray(participants)
                ? participants.map(p => typeof p === 'string' ? p : (p?.id || p?.jid || String(p)))
                : [];

            participantNames = await Promise.all(
                normalizedParticipants.map(async (participant) => {
                    try {
                        const name = await getDisplayName(sock, participant);
                        return name || participant.split('@')[0];
                    } catch (e) {
                        return participant.split('@')[0];
                    }
                })
            );

            authorName = author
                ? await getDisplayName(sock, author).catch(() => author.split('@')[0])
                : null;

            try {
                const groupMetadata = await sock.groupMetadata(id);
                groupName = groupMetadata.subject || id.split('@')[0];
            } catch (e) {
                groupName = await getDisplayName(sock, id).catch(() => id.split('@')[0]);
            }

            const colors = {
                reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m',
                yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
                white: '\x1b[37m', gray: '\x1b[90m'
            };

            let logMessage = '';
            let icon = '';
            let iconColor = '';

            switch (action) {
                case 'add':
                    icon = '[+]'; iconColor = colors.green;
                    logMessage = author
                        ? `\n\n${iconColor}${icon}${colors.reset} ${participantNames.join(', ')} ${colors.gray}added by${colors.reset} ${authorName}\n\n`
                        : `\n\n${iconColor}${icon}${colors.reset} ${participantNames.join(', ')} ${colors.gray}joined via link${colors.reset}\n\n`;
                    break;
                case 'remove':
                    icon = '[-]'; iconColor = colors.red;
                    if (author && normalizedParticipants.includes(author)) {
                        logMessage = `\n\n${iconColor}${icon}${colors.reset} ${participantNames.join(', ')} ${colors.gray}left${colors.reset}\n\n`;
                    } else if (author) {
                        logMessage = `\n\n${iconColor}${icon}${colors.reset} ${participantNames.join(', ')} ${colors.gray}removed by${colors.reset} ${authorName}\n\n`;
                    } else {
                        logMessage = `\n\n${iconColor}${icon}${colors.reset} ${participantNames.join(', ')} ${colors.gray}left${colors.reset}\n\n`;
                    }
                    break;
                case 'promote':
                    icon = '[^]'; iconColor = colors.cyan;
                    logMessage = `\n\n${iconColor}${icon}${colors.reset} ${participantNames.join(', ')} ${colors.gray}promoted by${colors.reset} ${authorName}\n\n`;
                    break;
                case 'demote':
                    icon = '[v]'; iconColor = colors.yellow;
                    logMessage = `\n\n${iconColor}${icon}${colors.reset} ${participantNames.join(', ')} ${colors.gray}demoted by${colors.reset} ${authorName}\n\n`;
                    break;
                default:
                    icon = '[?]'; iconColor = colors.blue;
                    logMessage = `\n\n${iconColor}${icon}${colors.reset} ${action}: ${participantNames.join(', ')}\n\n`;
            }

            console.log(logMessage);

            logDetailed({
                isCommand: false,
                text: '',
                sender: author || '',
                senderName: authorName || '',
                chat: id,
                chatName: groupName,
                chatIsGroup: true,
                botName: global.ytch || 'KnightBot',
                isBanned: false,
                isBotSender: false
            });

        } catch (e) {
            console.error('Error in logging group event:', e);
        }

        const who = author ? (authorName || author.split('@')[0]) : 'неизвестно';
        const names = participantNames.length ? participantNames.join(', ') : normalizedParticipants.map(p => p.split('@')[0]).join(', ');

        let isPublic = true;
        try {
            const modeData = JSON.parse(fs.readFileSync('./data/messageCount.json'));
            if (typeof modeData.isPublic === 'boolean') isPublic = modeData.isPublic;
        } catch (e) {}

        if (action === 'demote') {
            const auditlog = getCommand('auditlog');
            if (auditlog?.log) auditlog.log(id, '⬇️', 'Снят с админки', who, names);

            const groupprotect = getCommand('groupprotect');
            if (groupprotect?.handleDemote) await groupprotect.handleDemote(sock, id, participants, author);

            if (!isPublic) return;
            const demoteCmd = getCommand('demote');
            if (demoteCmd?.handleDemotionEvent) await demoteCmd.handleDemotionEvent(sock, id, participants, author);
            return;
        }

        if (action === 'promote') {
            const auditlog = getCommand('auditlog');
            if (auditlog?.log) auditlog.log(id, '⬆️', 'Повышен до админа', who, names);
        }

        if (action === 'add') {
            const auditlog = getCommand('auditlog');
            if (auditlog?.log) {
                if (author) {
                    auditlog.log(id, '➕', 'Добавлен в группу', who, names);
                } else {
                    auditlog.log(id, '🔗', 'Вступил по ссылке', names);
                }
            }
            const welcomeCmd = getCommand('welcome');
            if (welcomeCmd?.handleJoinEvent) await welcomeCmd.handleJoinEvent(sock, id, participants);
        }

        if (action === 'remove') {
            const auditlog = getCommand('auditlog');
            if (auditlog?.log) {
                const isSelf = normalizedParticipants.includes(author);
                if (isSelf || !author) {
                    auditlog.log(id, '🚪', 'Вышел из группы', names);
                } else {
                    auditlog.log(id, '🚫', 'Кик участника', who, names);
                }
            }

            const groupprotect = getCommand('groupprotect');
            if (groupprotect?.handle) await groupprotect.handle(sock, id, participants, author);

            const goodbyeCmd = getCommand('goodbye');
            if (goodbyeCmd?.handleLeaveEvent) await goodbyeCmd.handleLeaveEvent(sock, id, participants);
        }

    } catch (error) {
        console.error('Error in handleGroupParticipantUpdate:', error);
    }
}

module.exports = {
    handleMessages,
    handleGroupParticipantUpdate,
    handleStatus: async (sock, status) => {
        const autoStatusCmd = getCommand('autostatus');
        if (autoStatusCmd?.handleStatusUpdate) {
            await autoStatusCmd.handleStatusUpdate(sock, status);
        }
    }
};