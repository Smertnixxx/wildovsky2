// commands/font.js

const FONT1 = {
    'й':'ύ','ц':'ц','у':'ⲩ','к':'ⲕ','е':'ⲉ','н':'ⲏ','г':'ⲅ','ш':'ⲱ',
    'щ':'պ','з':'ⳅ','х':'ⲭ','ф':'ⲫ','ы':'ы','в':'ⲃ','а':'ⲁ','п':'ⲡ',
    'р':'ⲣ','о':'ⲟ','л':'ⲗ','д':'ⲇ','ж':'ⲿ','э':'э','я':'я','ч':'ⳡ',
    'с':'ⲥ','м':'ⲙ','и':'υ','т':'ⲧ','ь':'ь','б':'ⳝ','ю':'ю'
};

const FONT2 = {
    'й':'ᥔ','ц':'ц','у':'у','к':'κ','е':'ᥱ','н':'н','г':'ᴦ','ш':'ɯ',
    'щ':'щ','з':'ɜ','х':'х','ф':'ɸ','ы':'ы','в':'ʙ','а':'ᥲ','п':'ᥰ',
    'р':'ρ','о':'᧐','л':'᧘','д':'д','ж':'ж','э':'϶','я':'я','ч':'ч',
    'с':'ᥴ','м':'ʍ','и':'ᥙ','т':'ᴛ','ь':'ь','б':'δ','ю':'ю'
};

function convert(text, map) {
    return text
        .split('')
        .map(ch => {
            const lower = ch.toLowerCase();
            const mapped = map[lower];
            if (!mapped) return ch;
            return ch === ch.toUpperCase() ? mapped.toUpperCase?.() ?? mapped : mapped;
        })
        .join('');
}

async function fontCommand(sock, chatId, message, fontIndex) {
    const rawText =
        message.message?.extendedTextMessage?.text ||
        message.message?.conversation || '';

    const prefix = fontIndex === 1 ? '.шрифт1' : '.шрифт2';
    const input = rawText.slice(prefix.length).trim();

    if (!input) {
        await sock.sendMessage(chatId, {
            text: `Укажи текст.\nПример: ${prefix} привет`
        }, { quoted: message });
        return;
    }

    const map = fontIndex === 1 ? FONT1 : FONT2;
    const result = convert(input, map);

    await sock.sendMessage(chatId, { text: result }, { quoted: message });
}

module.exports = fontCommand;