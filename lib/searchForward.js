// lib/searchForward.js
'use strict';

const TARGET_GROUP = '120363426543866558@g.us';

// обязательные маркеры
const SEARCH_MARKERS = [
    /я\s*ищу/i,
];

const PHONE_MARKERS = [
    /мой\s*номер(ок)?/i,
    /my\s*number/i,
    /номер\s*:/i,
];

function match(text) {
    if (!text || typeof text !== 'string') return false;

    const hasSearch = SEARCH_MARKERS.some(r => r.test(text));
    const hasPhone  = PHONE_MARKERS.some(r => r.test(text));

    return hasSearch && hasPhone;
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