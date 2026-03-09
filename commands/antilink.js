const { bots } = require('../lib/antilink');
const { setAntilink, getAntilink, removeAntilink } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');

const actionMap = {
    'удалять': 'delete',
    'кикать': 'kick',
    'предупреждать': 'warn'
};

const actionMapReverse = {
    'delete': 'удалять',
    'kick': 'кикать',
    'warn': 'предупреждать'
};

async function handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: 'эта команда предназначена только для админов группы' }, { quoted: message });
            return;
        }

        const prefix = '.';
        const command = userMessage.split(' ')[0];
        
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
            case 'вкл': {
                const existingConfig = await getAntilink(chatId, 'on');
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: 'Антиссылка и так включена' }, { quoted: message });
                    return;
                }
                const result = await setAntilink(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, { 
                    text: result ? 'антиссылка включена (действие по умолчанию: удалять)' : 'не удалось включить антиссылку' 
                }, { quoted: message });
                break;
            }

            case 'выкл': {
                await removeAntilink(chatId, 'on');
                await sock.sendMessage(chatId, { text: 'антиссылка выключена' }, { quoted: message });
                break;
            }

            case 'условие': {
                if (args.length < 2) {
                    await sock.sendMessage(chatId, { 
                        text: `Пожалуйста, укажите действие: ${prefix}антиссылка условие удалять | кикать | предупреждать` 
                    }, { quoted: message });
                    return;
                }

                const russianAction = args[1];
                const englishAction = actionMap[russianAction];

                if (!englishAction) {
                    await sock.sendMessage(chatId, { 
                        text: 'Вы не правильно набрали команду, выберите либо удалять либо кикать либо предупреждать.' 
                    }, { quoted: message });
                    return;
                }

                const setResult = await setAntilink(chatId, 'on', englishAction);
                await sock.sendMessage(chatId, { 
                    text: setResult 
                        ? `Действие антиссылки установлено на: ${russianAction}` 
                        : 'Не удалось установить действие антиссылки. Сначала включите антиссылку командой .антиссылка вкл' 
                }, { quoted: message });
                break;
            }

            case 'статус':
            case 'get': {
                const config = await getAntilink(chatId, 'on');
                if (!config) {
                    await sock.sendMessage(chatId, { 
                        text: 'Антиссылка выключена' 
                    }, { quoted: message });
                    return;
                }
                const readableAction = actionMapReverse[config.action] || config.action;
                await sock.sendMessage(chatId, { 
                    text: `Конфиг антиссылки:\nСтатус: ${config.enabled ? 'включена ✅' : 'выключена ❌'}\nДействие: ${readableAction}` 
                }, { quoted: message });
                break;
            }

            default:
                await sock.sendMessage(chatId, { 
                    text: `Используйте ${prefix}антиссылка для справки\n\nДоступные команды:\n${prefix}антиссылка вкл\n${prefix}антиссылка выкл\n${prefix}антиссылка условие удалять | кикать | предупреждать\n${prefix}антиссылка статус` 
                }, { quoted: message });
        }
    } catch (error) {
        console.error('Ошибка в handleAntilinkCommand:', error);
        await sock.sendMessage(chatId, { text: 'Ошибка обработки команды антиссылки' });
    }
}

async function handleLinkDetection(sock, chatId, message, userMessage, senderId) {
    const antilinkSetting = getAntilinkSetting(chatId);
    if (antilinkSetting === 'off') return;

    let shouldDelete = false;

    const linkPatterns = {
        whatsappGroup: /chat\.whatsapp\.com\/[A-Za-z0-9]{20,}/i,
        whatsappChannel: /wa\.me\/channel\/[A-Za-z0-9]{20,}/i,
        telegram: /t\.me\/[A-Za-z0-9_]+/i,
        allLinks: /https?:\/\/\S+|www\.\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i,
    };

    if (antilinkSetting === 'whatsappGroup') {
        if (linkPatterns.whatsappGroup.test(userMessage)) shouldDelete = true;
    } else if (antilinkSetting === 'whatsappChannel' && linkPatterns.whatsappChannel.test(userMessage)) {
        shouldDelete = true;
    } else if (antilinkSetting === 'telegram' && linkPatterns.telegram.test(userMessage)) {
        shouldDelete = true;
    } else if (antilinkSetting === 'allLinks' && linkPatterns.allLinks.test(userMessage)) {
        shouldDelete = true;
    }

    if (shouldDelete) {
        const quotedMessageId = message.key.id;
        const quotedParticipant = message.key.participant || senderId;

        try {
            await sock.sendMessage(chatId, {
                delete: { remoteJid: chatId, fromMe: false, id: quotedMessageId, participant: quotedParticipant },
            });
        } catch (error) {
            console.error('Не удалось удалить сообщение:', error);
        }

        const mentionedJidList = [senderId];
        await sock.sendMessage(chatId, { 
            text: `Предупреждение! @${senderId.split('@')[0]}, публикация ссылок запрещена.`, 
            mentions: mentionedJidList 
        });
    }
}

module.exports = {
    handleAntilinkCommand,
    handleLinkDetection,
};