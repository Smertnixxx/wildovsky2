const { isAdmin } = require('../lib/isAdmin');

// Function to handle manual promotions via command
async function promoteCommand(sock, chatId, mentionedJids, message) {
    try {
        // First check if it's a group
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { 
                text: 'This command can only be used in groups!'
            });
            return;
        }

        // Check admin status first
        try {
            const adminStatus = await isAdmin(sock, chatId, message.key.participant || message.key.remoteJid);
            
            if (!adminStatus.isBotAdmin) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Error: Please make the bot an admin first to use this command.'
                });
                return;
            }

            if (!adminStatus.isSenderAdmin) {
                await sock.sendMessage(chatId, { 
                    text: '❌ Error: Only group admins can use the promote command.'
                });
                return;
            }
        } catch (adminError) {
            console.error('Error checking admin status:', adminError);
            await sock.sendMessage(chatId, { 
                text: '❌ Error: Please make sure the bot is an admin of this group.'
            });
            return;
        }

        let userToPromote = [];
        
        // Check for mentioned users
        if (mentionedJids && mentionedJids.length > 0) {
            userToPromote = mentionedJids;
        }
        // Check for replied message
        else if (message.message?.extendedTextMessage?.contextInfo?.participant) {
            userToPromote = [message.message.extendedTextMessage.contextInfo.participant];
        }
        
        // If no user found through either method
        if (userToPromote.length === 0) {
            await sock.sendMessage(chatId, { 
                text: '❌ Error: Please mention the user or reply to their message to promote!'
            });
            return;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        await sock.groupParticipantsUpdate(chatId, userToPromote, "promote");
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Simple format like in the example
        const senderJid = message.key.participant || message.key.remoteJid;
        const promotedJid = userToPromote[0];
        
        await sock.sendMessage(chatId, { 
            text: `🔼 *Повышение*\n👤 Админ @${senderJid.split('@')[0]}, повысил участника @${promotedJid.split('@')[0]}`,
            mentions: [senderJid, promotedJid]
        });
    } catch (error) {
        console.error('Error in promote command:', error);
        if (error.data === 429) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            try {
                await sock.sendMessage(chatId, { 
                    text: '❌ Rate limit reached. Please try again in a few seconds.'
                });
            } catch (retryError) {
                console.error('Error sending retry message:', retryError);
            }
        } else {
            try {
                await sock.sendMessage(chatId, { 
                    text: '❌ Failed to promote user(s). Make sure the bot is admin and has sufficient permissions.'
                });
            } catch (sendError) {
                console.error('Error sending error message:', sendError);
            }
        }
    }
}

// Function to handle automatic promotion detection
async function handlePromotionEvent(sock, groupId, participants, author) {
    try {
        // Safety check for participants
        if (!Array.isArray(participants) || participants.length === 0) {
            return;
        }

        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

        const botId = sock.user.jid;
        const promotedJid = typeof participants[0] === 'string' ? participants[0] : (participants[0].id || participants[0].toString());
        const authorJid = author && author.length > 0 ? (typeof author === 'string' ? author : (author.id || author.toString())) : null;

        // Check if bot was promoted
        if (promotedJid === botId) {
            await sock.sendMessage(groupId, {
                text: `🎉 Бот назначен администратором!\n👤 Назначил: @${authorJid ? authorJid.split('@')[0] : 'System'}`,
                mentions: authorJid ? [authorJid] : []
            });
        } else {
            // Regular user promotion
            await sock.sendMessage(groupId, {
                text: `🔼 *Повышение*\n👤 Админ @${authorJid ? authorJid.split('@')[0] : 'System'}, повысил участника @${promotedJid.split('@')[0]}`,
                mentions: authorJid ? [authorJid, promotedJid] : [promotedJid]
            });
        }
    } catch (error) {
        console.error('Error handling promotion event:', error);
        if (error.data === 429) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

module.exports = { promoteCommand, handlePromotionEvent };