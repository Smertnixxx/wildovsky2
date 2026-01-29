const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');

const dbDir = path.join(process.cwd(), 'data');
const mutePath = path.join(dbDir, 'mutes.json');

function init() {
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    if (!fs.existsSync(mutePath)) {
        fs.writeFileSync(mutePath, JSON.stringify({}), 'utf8');
    }
}

async function unmuteCommandUser(sock, chatId, senderId, message) {
    try {
        init();

        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { 
                text: 'Эту команду можно использовать только в группах'
            });
            return;
        }

        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);
        
        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { 
                text: '❌ Дайте боту права администратора для использования этой команды'
            });
            return;
        }

        if (!isSenderAdmin && !message.key.fromMe) {
            await sock.sendMessage(chatId, { 
                text: '❌ Только администраторы группы могут использовать эту команду'
            });
            return;
        }

        let who = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
                  message.message?.extendedTextMessage?.contextInfo?.participant;

        if (!who) {
            await sock.sendMessage(chatId, { 
                text: '❕ Упомяните участника или ответьте на его сообщение\n\nПример: .анмут @user'
            });
            return;
        }

        const botId = sock.user.jid;

        if (who === botId) {
            await sock.sendMessage(chatId, { 
                text: '❌ Нельзя размутить бота',
                mentions: [who]
            });
            return;
        }

        if (who === senderId) {
            await sock.sendMessage(chatId, { 
                text: '❌ Нельзя размутить самого себя',
                mentions: [who]
            });
            return;
        }

        let mutes = {};
        try {
            mutes = JSON.parse(fs.readFileSync(mutePath, 'utf8'));
        } catch (e) {
            mutes = {};
        }

        // Ищем пользователя по разным форматам ID
        let foundId = null;
        const possibleIds = [
            who,
            who.split('@')[0] + '@s.whatsapp.net',
            who.split('@')[0] + '@lid'
        ];

        if (mutes[chatId]) {
            for (const id of possibleIds) {
                if (mutes[chatId][id]) {
                    foundId = id;
                    break;
                }
            }
        }

        if (!foundId) {
            const name = await sock.getName(who);
            await sock.sendMessage(chatId, { 
                text: `❕ Пользователь *${name}* не находится в муте`,
                mentions: [who]
            });
            return;
        }

        delete mutes[chatId][foundId];
        
        if (Object.keys(mutes[chatId]).length === 0) {
            delete mutes[chatId];
        }

        fs.writeFileSync(mutePath, JSON.stringify(mutes, null, 2));
        
        console.log(`Пользователь ${foundId} размучен`);

        const name = await sock.getName(who);
        await sock.sendMessage(chatId, {
            text: `✅ *${name}* был размучен и теперь может снова писать сообщения`,
            mentions: [who, senderId]
        });

    } catch (error) {
        console.error('Error in unmute command:', error);
        await sock.sendMessage(chatId, { 
            text: '❌ Не удалось размутить пользователя'
        });
    }
}

module.exports = unmuteCommandUser;