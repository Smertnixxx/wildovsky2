'use strict';

const TARGET_GROUP = '120363426543866558@g.us';

const SEARCH_MARKERS = [
    /\bищ[ую]\b/i,
    /\bя\s*ищ[ую]\b/i,
    /\blooking\s*for\b/i,
    /\blf\b/i,
    /\bfind\b/i
];

const CONTACT_MARKERS = [
    /\bмой\s*номер(ок)?\b/i,
    /\bmy\s*number\b/i,
    /\bномер(ок)?\s*:+/i,
    /\bwhatsapp\b/i,
    /\btg\b/i,
    /@\w{3,}/
];

const PHONE_REGEX = /\+?\d[\d\s\-()]{7,}/;

function match(text) {
    if (!text || typeof text !== 'string') return false;

    const hasSearch = SEARCH_MARKERS.some(r => r.test(text));

    const hasContact =
        CONTACT_MARKERS.some(r => r.test(text)) ||
        PHONE_REGEX.test(text);

    return hasSearch && hasContact;
}

async function forward(sock, message) {
    try {
        await sock.sendMessage(TARGET_GROUP, { forward: message });
    } catch (e) {
        console.error('[searchForward] forward error:', e.message);
    }
}

async function handle(sock, message, isGroup) {
    if (isGroup) return;
    if (message.key.fromMe) return;

    const text =
        message.message?.conversation?.trim() ||
        message.message?.extendedTextMessage?.text?.trim() ||
        message.message?.imageMessage?.caption?.trim() ||
        message.message?.videoMessage?.caption?.trim() ||
        '';

    if (!match(text)) return;

    await forward(sock, message);
}

module.exports = { handle };