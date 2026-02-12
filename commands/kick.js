const isAdmin = require('../lib/isAdmin');

async function kickCommand(sock, chatId, senderId, mentionedJids, message) {
    const isOwner = message.key.fromMe;
    if (!isOwner) {
        const { isSenderAdmin, isBotAdmin } = await isAdmin(sock, chatId, senderId);

        if (!isBotAdmin) {
            await sock.sendMessage(chatId, { text: 'Дайте боту права администратора чтобы он мог удалять участников' }, { quoted: message });
            return;
        }

        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: 'Только администраторы группы могут пользоваться этой командой' }, { quoted: message });
            return;
        }
    }

    let usersToKick = [];
    
    if (mentionedJids && mentionedJids.length > 0) {
        usersToKick = mentionedJids;
    }
    else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
        usersToKick = [message.message.extendedTextMessage.contextInfo.participant];
    }
    
    if (usersToKick.length === 0) {
        await sock.sendMessage(chatId, { 
            text: 'Ответьте на сообщение того участника которого вы хотите исключить'
        }, { quoted: message });
        return;
    }

    const botId = sock.user?.id || '';
    const botLid = sock.user?.lid || '';
    const botPhoneNumber = botId.includes(':') ? botId.split(':')[0] : (botId.includes('@') ? botId.split('@')[0] : botId);
    const botIdFormatted = botPhoneNumber + '@s.whatsapp.net';
    
    // Extract numeric part from bot LID (remove session identifier like :4)
    const botLidNumeric = botLid.includes(':') ? botLid.split(':')[0] : (botLid.includes('@') ? botLid.split('@')[0] : botLid);
    const botLidWithoutSuffix = botLid.includes('@') ? botLid.split('@')[0] : botLid;

    const metadata = await sock.groupMetadata(chatId);
    const participants = metadata.participants || [];

    const isTryingToKickBot = usersToKick.some(userId => {
        const userPhoneNumber = userId.includes(':') ? userId.split(':')[0] : (userId.includes('@') ? userId.split('@')[0] : userId);
        const userLidNumeric = userId.includes('@lid') ? userId.split('@')[0].split(':')[0] : '';
        
        // Direct match checks
        const directMatch = (
            userId === botId ||
            userId === botLid ||
            userId === botIdFormatted ||
            userPhoneNumber === botPhoneNumber ||
            (userLidNumeric && botLidNumeric && userLidNumeric === botLidNumeric)
        );
        
        if (directMatch) {
            return true;
        }
        
        // Check against participants
        const participantMatch = participants.some(p => {
            const pPhoneNumber = p.phoneNumber ? p.phoneNumber.split('@')[0] : '';
            const pId = p.id ? p.id.split('@')[0] : '';
            const pLid = p.lid ? p.lid.split('@')[0] : '';
            const pFullId = p.id || '';
            const pFullLid = p.lid || '';
            
            // Extract numeric part from participant LID
            const pLidNumeric = pLid.includes(':') ? pLid.split(':')[0] : pLid;
            
            // Check if this participant is the bot
            const isThisParticipantBot = (
                pFullId === botId ||
                pFullLid === botLid ||
                pLidNumeric === botLidNumeric ||
                pPhoneNumber === botPhoneNumber ||
                pId === botPhoneNumber ||
                p.phoneNumber === botIdFormatted ||
                (botLid && pLid && botLidWithoutSuffix === pLid)
            );
            
            if (isThisParticipantBot) {
                // Check if the userId matches this bot participant
                return (
                    userId === pFullId ||
                    userId === pFullLid ||
                    userPhoneNumber === pPhoneNumber ||
                    userPhoneNumber === pId ||
                    userId === p.phoneNumber ||
                    (pLid && userLidNumeric && userLidNumeric === pLidNumeric) ||
                    (userLidNumeric && pLidNumeric && userLidNumeric === pLidNumeric)
                );
            }
            return false;
        });
        
        return participantMatch;
    });

    if (isTryingToKickBot) {
        await sock.sendMessage(chatId, { 
            text: "бота нельзя кикнуть из группы этой командой"
        }, { quoted: message });
        return;
    }

    try {
        await sock.groupParticipantsUpdate(chatId, usersToKick, "remove");
    
        
await sock.sendMessage(chatId, {
    react: {
        text: '✅',         
        key: message.key
    }
});

    } catch (error) {
        console.error('Error in kick command:', error);
        await sock.sendMessage(chatId, { 
            text: 'ошибка, не получилось удалить участника'
        });
    }
}

module.exports = kickCommand;
