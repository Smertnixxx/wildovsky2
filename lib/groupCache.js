// Simple in-memory cache and retry/backoff for groupMetadata calls
const cache = new Map();

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

/**
 * Get group metadata with caching and exponential backoff on rate limits.
 * @param {object} sock - Baileys socket
 * @param {string} jid - Group JID
 * @param {number} ttl - Cache TTL in ms (default 60s)
 */
async function getGroupMetadata(sock, jid, ttl = 60 * 1000) {
    if (!jid || !jid.endsWith('@g.us')) return null;
    const now = Date.now();
    const cached = cache.get(jid);
    if (cached && cached.expires > now) return cached.meta;

    if (!sock || typeof sock.groupMetadata !== 'function') return null;

    // Try with exponential backoff on rate-limit errors
    const maxAttempts = 4;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const meta = await sock.groupMetadata(jid);
            cache.set(jid, { meta, expires: now + ttl });
            return meta;
        } catch (err) {
            // Baileys may expose a data field with 429 on rate limit
            const isRateLimit = err && (err.data === 429 || err.statusCode === 429 || (err.output && err.output.statusCode === 429));
            if (!isRateLimit) throw err;
            // Wait: exponential backoff with jitter
            const base = 500; // ms
            const wait = Math.pow(2, attempt) * base + Math.floor(Math.random() * 200);
            await sleep(wait);
        }
    }
    // last attempt failed, return null so callers can handle gracefully
    return null;
}

module.exports = { getGroupMetadata };

