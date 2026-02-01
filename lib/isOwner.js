const settings = require('../settings');
const { isSudo } = require('./index');

// Simple in-memory cache for group metadata to avoid hitting rate limits
const groupCache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

async function fetchGroupMetadataWithRetry(sock, chatId, retries = 3) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await sock.groupMetadata(chatId);
        } catch (e) {
            // Baileys may surface rate limit as e.data === 429
            if (e?.data === 429) {
                const wait = 500 * Math.pow(2, i); // 500ms, 1000ms, 2000ms...
                await new Promise(r => setTimeout(r, wait));
                continue;
            }
            throw e;
        }
    }
    throw new Error('rate-overlimit after retries');
}

async function isOwnerOrSudo(senderId, sock = null, chatId = null) {
    const ownerJid = settings.ownerNumber + "@s.whatsapp.net";
    const ownerNumberClean = settings.ownerNumber.split(':')[0].split('@')[0];
    
    // Direct JID match
    if (senderId === ownerJid) {
        return true;
    }
    
    // Extract sender's numeric parts
    const senderIdClean = senderId.split(':')[0].split('@')[0];
    const senderLidNumeric = senderId.includes('@lid') ? senderId.split('@')[0].split(':')[0] : '';
    
    // Check if sender's phone number matches owner number
    if (senderIdClean === ownerNumberClean) {
        return true;
    }
    
    // In groups, check if sender's LID matches bot's LID (owner uses same account as bot)
    if (sock && chatId && chatId.endsWith('@g.us') && senderId.includes('@lid')) {
        try {
            // Get bot's LID numeric
            const botLid = sock.user?.lid || '';
            const botLidNumeric = botLid.includes(':') ? botLid.split(':')[0] : (botLid.includes('@') ? botLid.split('@')[0] : botLid);
            
            // Check if sender's LID numeric matches bot's LID numeric
            if (senderLidNumeric && botLidNumeric && senderLidNumeric === botLidNumeric) {
                return true;
            }

            // Use cached metadata if available, otherwise fetch with retries
            let metadata;
            const cached = groupCache.get(chatId);
            if (cached && cached.expires > Date.now()) {
                metadata = cached.metadata;
            } else {
                metadata = await fetchGroupMetadataWithRetry(sock, chatId);
                groupCache.set(chatId, { metadata, expires: Date.now() + CACHE_TTL });
            }

            const participants = metadata.participants || [];
            
            const participant = participants.find(p => {
                const pLid = p.lid || '';
                const pLidNumeric = pLid.includes(':') ? pLid.split(':')[0] : (pLid.includes('@') ? pLid.split('@')[0] : pLid);
                const pId = p.id || '';
                const pIdClean = pId.split(':')[0].split('@')[0];
                
                return (
                    p.lid === senderId || 
                    p.id === senderId ||
                    pLidNumeric === senderLidNumeric ||
                    pIdClean === senderIdClean ||
                    pIdClean === ownerNumberClean
                );
            });
            
            if (participant) {
                const participantId = participant.id || '';
                const participantLid = participant.lid || '';
                const participantIdClean = participantId.split(':')[0].split('@')[0];
                const participantLidNumeric = participantLid.includes(':') ? participantLid.split(':')[0] : (participantLid.includes('@') ? participantLid.split('@')[0] : participantLid);
                
                if (participantId === ownerJid || 
                    participantIdClean === ownerNumberClean ||
                    participantLidNumeric === botLidNumeric) {
                    return true;
                }
            }
        } catch (e) {
            console.error('❌ [isOwner] Error checking participant data:', e);
        }
    }
    
    // Check if sender ID contains owner number (fallback)
    if (senderId.includes(ownerNumberClean)) {
        return true;
    }
    
    // Check sudo status
    try {
        return await isSudo(senderId);
    } catch (e) {
        console.error('❌ [isOwner] Error checking sudo:', e);
        return false;
    }
}

module.exports = isOwnerOrSudo;