const axios = require('axios');
const path = require('path');
const GIFBufferToVideoBuffer = require('../lib/Gifbuffer');

const ANIMU_API = 'https://api.waifu.pics/sfw';

// Supported reaction types
const REACTION_TYPES = {
    'обнять': { endpoint: 'hug', text: 'обнял(а)' },
    'облизнуть': { endpoint: 'lick', text: 'облизнул(а)' },
    'погладить': { endpoint: 'pat', text: 'погладил(а)' },
    'убить': { endpoint: 'kill', text: 'убил(а)' },
    'кринж': { endpoint: 'cringe', text: 'кринжанул(а) с' },
    'укусить': { endpoint: 'bite', text: 'укусил(а)' },
    'поцеловать': { endpoint: 'kiss', text: 'поцеловал(а)' },
    'ударить': { endpoint: 'bonk', text: 'ударил(а)' },
    'nom': { endpoint: 'nom', text: 'nom nom' },
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

// User cooldowns to prevent spam
const userCooldowns = new Map();
const COOLDOWN_TIME = 15000; // 15 seconds

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
        
        // Get command from args
        const command = args[0]?.toLowerCase();
        
        if (!command) {
            const availableCommands = Object.keys(REACTION_TYPES).join(', ');
            await sock.sendMessage(chatId, {
                text: `🎌 *Anime Reactions*\n\nUsage: .animu <type> @user or reply to message\n\n*Available types:*\n${availableCommands}\n\n*Example:*\n.animu обнять @user\n.animu hug (reply to message)`,
            }, { quoted: message });
            return;
        }

        // Check if command exists
        const reaction = REACTION_TYPES[command];
        if (!reaction) {
            await sock.sendMessage(chatId, {
                text: `❌ Unknown reaction type: ${command}\n\nUse .animu to see available types`,
            }, { quoted: message });
            return;
        }

        // Check cooldown
        const cooldownKey = `${senderId}_${command}`;
        const now = Date.now();
        if (userCooldowns.has(cooldownKey)) {
            const cooldownEnd = userCooldowns.get(cooldownKey);
            if (now < cooldownEnd) {
                const timeLeft = msToTime(cooldownEnd - now);
                await sock.sendMessage(chatId, {
                    text: `⏳ Please wait *${timeLeft}* before using this reaction again`,
                }, { quoted: message });
                return;
            }
        }

        // Get target user
        let targetUser;
        if (isGroup) {
            // Check for mentioned user
            const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentionedJid && mentionedJid.length > 0) {
                targetUser = mentionedJid[0];
            } else if (message.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                // Check for quoted message
                targetUser = message.message.extendedTextMessage.contextInfo.participant;
            }
            
            if (!targetUser) {
                await sock.sendMessage(chatId, {
                    text: `[❗] Please mention someone or reply to their message\n\n> 📌 Example: .animu ${command} @user`,
                }, { quoted: message });
                return;
            }
        } else {
            targetUser = chatId;
        }

        // Set cooldown
        userCooldowns.set(cooldownKey, now + COOLDOWN_TIME);
        setTimeout(() => userCooldowns.delete(cooldownKey), COOLDOWN_TIME);

        // Fetch anime GIF from API
        const apiUrl = `${ANIMU_API}/${reaction.endpoint}`;
        const response = await axios.get(apiUrl);
        
        if (!response.data || !response.data.url) {
            throw new Error('Invalid API response');
        }

        const gifUrl = response.data.url;

        // Download GIF
        await sock.sendMessage(chatId, {
            text: '⏳ Loading reaction...',
        }, { quoted: message });

        const gifBuffer = await getBuffer(gifUrl);

        // Convert GIF to video
        const videoBuffer = await GIFBufferToVideoBuffer(gifBuffer);

        // Get additional user text if provided
        const userText = args.slice(1).join(' ');

        // Create caption
        let caption = `> *@${senderId.split("@")[0]}* ${reaction.text} *@${targetUser.split('@')[0]}*`;
        
        if (userText.trim().length > 0) {
            caption += `\n> 💬 Со словами: *${userText}*`;
        }

        // Send video with caption
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
            text: '❌ Failed to fetch anime reaction. Please try again later.',
        }, { quoted: message });
    }
}

module.exports = { animeCommand };