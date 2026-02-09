const axios = require('axios');
const _gifMod = require('../lib/gifbuffer');
const GIFBufferToVideoBuffer = _gifMod && _gifMod.default ? _gifMod.default : _gifMod;

const ANIMU_API = 'https://api.waifu.pics/sfw';

const reactionstype = {
    'обнять': { endpoint: 'hug', text: 'обнял(а)' },
    'облизнуть': { endpoint: 'lick', text: 'облизнул(а)' },
    'погладить': { endpoint: 'pat', text: 'погладил(а)' },
    'убить': { endpoint: 'kill', text: 'убил(а)' },
    'кринж': { endpoint: 'cringe', text: 'кринжанул(а) с' },
    'укусить': { endpoint: 'bite', text: 'укусил(а)' },
    'поцеловать': { endpoint: 'kiss', text: 'поцеловал(а)' },
    'ударить': { endpoint: 'bonk', text: 'ударил(а)' },
    'скушать': { endpoint: 'nom', text: 'скушал(а)' },
    'poke': { endpoint: 'poke', text: 'poked' },
    'cry': { endpoint: 'cry', text: 'is crying' },
    'wink': { endpoint: 'wink', text: 'winked at' },
    'smile': { endpoint: 'smile', text: 'smiled at' },
    'wave': { endpoint: 'wave', text: 'waved at' },
    'blush': { endpoint: 'blush', text: 'is blushing' },
    'dance': { endpoint: 'dance', text: 'is dancing' },
    'cuddle': { endpoint: 'cuddle', text: 'cuddled' },
    'slap': { endpoint: 'slap', text: 'slapped' },
    'kick': { endpoint: 'kick', text: 'kicked' },
    'yeet': { endpoint: 'yeet', text: 'yeeted' },
    'bully': { endpoint: 'bully', text: 'bullied' },
    'happy': { endpoint: 'happy', text: 'is happy' },
    'highfive': { endpoint: 'highfive', text: 'high-fived' },
    'handhold': { endpoint: 'handhold', text: 'is holding hands with' },
};

const userCooldowns = new Map();
const COOLDOWN_TIME = 15000;

async function getBuffer(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return Buffer.from(response.data);
    } catch (error) {
        console.error("Failed to get buffer:", error.message);
        throw new Error("Failed to download image");
    }
}

function msToTime(duration) {
    const seconds = Math.floor((duration / 1000) % 60);
    return `${seconds} секунд`;
}

async function animeCommand(sock, chatId, message, args) {
    try {
        const senderId = message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        
        const command = args[0]?.toLowerCase();
        
        if (!command) {
            const availableCommands = Object.keys(reactionstype).join(', ');
            await sock.sendMessage(chatId, {
                text: `ляляляляля`,
            }, { quoted: message });
            return;
        }

        const reaction = reactionstype[command];
        if (!reaction) {
            await sock.sendMessage(chatId, {
                text: `не корректная команда: ${command}`,
            }, { quoted: message });
            return;
        }

        const cooldownKey = `${senderId}_${command}`;
        const now = Date.now();
        if (userCooldowns.has(cooldownKey)) {
            const cooldownEnd = userCooldowns.get(cooldownKey);
            if (now < cooldownEnd) {
                const timeLeft = msToTime(cooldownEnd - now);
                await sock.sendMessage(chatId, {
                    text: `⏳ Подождите *${timeLeft}* перед повторным использованием команды`,
                }, { quoted: message });
                return;
            }
        }

        let targetUser;
        if (isGroup) {
            const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentionedJid && mentionedJid.length > 0) {
                targetUser = mentionedJid[0];
            } else if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            }
            
            if (!targetUser) {
                await sock.sendMessage(chatId, {
                    text: `Ответь на сообщение или воспользуйся примером\n\n> 📌 Пример: .${command} @пользователь`,
                }, { quoted: message });
                return;
            }
        } else {
            targetUser = chatId;
        }

        userCooldowns.set(cooldownKey, now + COOLDOWN_TIME);
        setTimeout(() => userCooldowns.delete(cooldownKey), COOLDOWN_TIME);

        const apiUrl = `${ANIMU_API}/${reaction.endpoint}`;
        const response = await axios.get(apiUrl);
        
        if (!response.data || !response.data.url) {
            throw new Error('Invalid API response');
        }

        const gifUrl = response.data.url;
        const gifBuffer = await getBuffer(gifUrl);
        const videoBuffer = await GIFBufferToVideoBuffer(gifBuffer);

        const userText = args.slice(1).join(' ');
        let caption = `> *@${senderId.split("@")[0]}* ${reaction.text} *@${targetUser.split('@')[0]}*`;
        
        if (userText.trim().length > 0) {
            caption += `\n> 💬 Со словами: *${userText}*`;
        }

        await sock.sendMessage(chatId, {
            video: videoBuffer,
            caption: caption,
            gifPlayback: true,
            gifAttribution: 0,
            mentions: [targetUser, senderId]
        }, { quoted: message });

    } catch (error) {
        console.error('Error in anime command:', error);
        await sock.sendMessage(chatId, {
            text: 'ошибка при выполнении команды.',
        }, { quoted: message });
    }
}

// Экспорт как объекта с методом animeCommand
module.exports = {
    animeCommand: animeCommand
};