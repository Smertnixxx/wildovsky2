const { bots } = require('../lib/antilink');
const { setAntilink, getAntilink, removeAntilink } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

async function handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: 'эта команда предназначена только для админов группы' }, { quoted: message });
            return;
        }

        const prefix = '.';
        const command = userMessage.split(' ')[0]; // Получаем команду (например, ".антиссылка" или ".antilink")
        
        // Определяем сколько символов нужно срезать в зависимости от команды
        const sliceLength = command === '.антиссылка' ? 11 : 9;
        
        const args = userMessage.slice(sliceLength).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage = `настройка антиссылки\n\n${prefix}антиссылка вкл\n${prefix}антиссылка выкл\n${prefix}антиссылка условие удалять | кикать | предупреждать`;
            await sock.sendMessage(chatId, { text: usage }, { quoted: message });
            return;
        }

        switch (action) {
            case 'вкл':
                const existingConfig = await getAntilink(chatId, 'вкл');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: 'Антиссылка и так включена' }, { quoted: message });
                    return;
                }
                const result = await setAntilink(chatId, 'вкл', 'удалять');
                await sock.sendMessage(chatId, { 
                    text: result ? 'антиссылка включена' : 'не удалось включить антиссылку' 
                },{ quoted: message });
                break;

            case 'выкл':
                await removeAntilink(chatId, 'вкл');
                await sock.sendMessage(chatId, { text: 'антиссылка выключена' }, { quoted: message });
                break;

            case 'условие':
                if (args.length < 2) {
                    await sock.sendMessage(chatId, { 
                        text: `Пожалуйста, укажите действие: ${prefix}антиссылка условие удалять | кикать | предупреждать` 
                    }, { quoted: message });
                    return;
                }
                const setAction = args[1];
                if (!['удалять', 'кикать', 'предупреждать'].includes(setAction)) {
                    await sock.sendMessage(chatId, { 
                        text: 'Вы не правильно набрали команду, выберите либо удалять либо кикать либо предупреждать.' 
                    }, { quoted: message });
                    return;
                }
                const setResult = await setAntilink(chatId, 'вкл', setAction);
                await sock.sendMessage(chatId, { 
                    text: setResult ? `Действие антиссылки установлено на ${setAction}` : 'Не удалось установить действие антиссылки' 
                }, { quoted: message });
                break;

            case 'get':
                const status = await getAntilink(chatId, 'вкл');
                const actionConfig = await getAntilink(chatId, 'вкл');
                await sock.sendMessage(chatId, { 
                    text: `Конфиг антиссылки:\nСтатус: ${status ? 'вкл' : 'выкл'}\nДействие: ${actionConfig ? actionConfig.action : 'Не установлено'}` 
                }, { quoted: message });
                break;

            default:
                await sock.sendMessage(chatId, { text: `Используйте ${prefix}антиссылка\nдля справки` });
        }
    } catch (error) {
        console.error('Ошибка:', error);
        await sock.sendMessage(chatId, { text: 'Ошибка обработки команды антиссылки' });
    }
}

async function handleLinkDetection(sock, chatId, message, userMessage, senderId) {
    const antilinkSetting = getAntilinkSetting(chatId);
    if (antilinkSetting === 'off') return;

    console.log(`Настройка антиссылки для ${chatId}: ${antilinkSetting}`);
    console.log(`Проверка сообщения на ссылки: ${userMessage}`);
    
    // Логируем полный объект сообщения для диагностики структуры
    console.log("Полный объект сообщения: ", JSON.stringify(message, null, 2));

    let shouldDelete = false;

    const linkPatterns = {
        whatsappGroup: /chat\.whatsapp\.com\/[A-Za-z0-9]{20,}/i,
        whatsappChannel: /wa\.me\/channel\/[A-Za-z0-9]{20,}/i,
        telegram: /t\.me\/[A-Za-z0-9_]+/i,
        allLinks: /https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i,
    };

    // Обнаружение ссылок на группы WhatsApp
    if (antilinkSetting === 'whatsappGroup') {
        console.log('Защита от ссылок на групп WhatsApp включена.');
        if (linkPatterns.whatsappGroup.test(userMessage)) {
            console.log('Обнаружена ссылка на группу WhatsApp!');
            shouldDelete = true;
        }
    } else if (antilinkSetting === 'whatsappChannel' && linkPatterns.whatsappChannel.test(userMessage)) {
        shouldDelete = true;
    } else if (antilinkSetting === 'telegram' && linkPatterns.telegram.test(userMessage)) {
        shouldDelete = true;
    } else if (antilinkSetting === 'allLinks' && linkPatterns.allLinks.test(userMessage)) {
        shouldDelete = true;
    }

    if (shouldDelete) {
        const quotedMessageId = message.key.id; // Получаем ID сообщения для удаления
        const quotedParticipant = message.key.participant || senderId; // Получаем ID участника

        console.log(`Попытка удалить сообщение с id: ${quotedMessageId} от участника: ${quotedParticipant}`);

        try {
            await sock.sendMessage(chatId, {
                delete: { remoteJid: chatId, fromMe: false, id: quotedMessageId, participant: quotedParticipant },
            });
            console.log(`Сообщение с ID ${quotedMessageId} успешно удалено.`);
        } catch (error) {
            console.error('Не удалось удалить сообщение:', error);
        }

        const mentionedJidList = [senderId];
        await sock.sendMessage(chatId, { text: `Предупреждение! @${senderId.split('@')[0]}, публикация ссылок запрещена.`, mentions: mentionedJidList });
    } else {
        console.log('Ссылка не обнаружена или защита не включена для этого типа ссылок.');
    }
}

module.exports = {
    handleAntilinkCommand,
    handleLinkDetection,
};