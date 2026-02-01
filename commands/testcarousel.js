// commands/testcarousel.js
const path = require('path');
const fs = require('fs');
const { sendCarousel } = require('../lib/sendCarousel');

module.exports = async function testcarousel(sock, chatId, message) {
    // Читаем картинку с диска
    let imgBuffer = null;
    try {
        imgBuffer = fs.readFileSync(path.join(process.cwd(), 'assets', 'котик.jpg'));
    } catch (e) {
        console.error('[testcarousel] Картинка не найдена');
    }

    const messages = [
        {
            text: '',
            footer: 'описание',
            header: 'каруселька',
            imageBuffer: imgBuffer,
            imageUrl: null,
            buttons: null,
            copy: null,
            urls: null,
            list: [
                [
                    'жмякай',
                    [
                        {
                            title: 'приветики',
                            rows: [
                                { title: 'как делишки', description: 'Новости', id: 'лялялля' },
                                { title: 'еще раз приветики', description: 'Шутки', id: 'шуточка' }
                            ]
                        }
                    ]
                ]
            ]
        },
        {
            text: '',
            footer: 'урааа привет',
            header: 'описание вроде тут',
            imageBuffer: imgBuffer,
            imageUrl: null,
            buttons: null,
            copy: null,
            urls: null,
            list: [
                [
                    'Команды',
                    [
                        {
                            title: 'котики',
                            rows: [
                                { title: 'собачки', description: 'не смотри сюда', id: 'лялялял' },
                                { title: 'енотики', description: 'Пинг бота', id: 'ping' }
                            ]
                        }
                    ]
                ]
            ]
        }
    ];

    // bodyText — текст над каруселью, footerText — футер над каруселью
    await sendCarousel(sock, chatId, messages, message, {
        bodyText: 'Выбери раздел',
        footerText: 'wildovsky'
    });
};