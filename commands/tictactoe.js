const TicTacToe = require('../lib/tictactoe');

// Глобальное хранилище игр: chatId -> gameData
const activeGames = new Map();
const GAME_TIMEOUT = 3 * 60 * 1000; // 3 минуты

const symbols = {
    X: '❎',
    O: '⭕',
    1: '1️⃣', 2: '2️⃣', 3: '3️⃣',
    4: '4️⃣', 5: '5️⃣', 6: '6️⃣',
    7: '7️⃣', 8: '8️⃣', 9: '9️⃣',
};

const parseMention = (text) => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
};

const generateGameText = (game) => {
    const arr = game.game.render().map(v => symbols[v] || v);
    
    return `
🎲 *Крестики нолики*

Ход: @${game.game.currentTurn.split('@')[0]}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

❎: @${game.game.playerX.split('@')[0]}
⭕: @${game.game.playerO.split('@')[0]}

- Введите номер (1-9) для хода
- .разтиктак - завершить игру
`.trim();
};

/**
 * Завершить игру по таймауту
 */
function endGameByTimeout(sock, chatId) {
    const game = activeGames.get(chatId);
    if (!game) return;
    
    activeGames.delete(chatId);
    
    sock.sendMessage(chatId, {
        text: '⏱️ Время вышло! Игра завершена из-за неактивности.'
    }).catch(() => {});
}

/**
 * Обновить таймер игры
 */
function resetGameTimer(chatId) {
    const game = activeGames.get(chatId);
    if (!game) return;
    
    // Очищаем старый таймер
    if (game.timeoutId) {
        clearTimeout(game.timeoutId);
    }
    
    // Устанавливаем новый таймер
    game.timeoutId = setTimeout(() => {
        endGameByTimeout(game.sock, chatId);
    }, GAME_TIMEOUT);
    
    game.lastMoveAt = Date.now();
}

/**
 * Команда запуска игры: .тиктак или .ttt
 */
async function tictactoeCommand(sock, chatId, senderId, text) {
    try {
        // Проверка: игра уже активна в этом чате?
        if (activeGames.has(chatId)) {
            await sock.sendMessage(chatId, {
                text: '❗ В этом чате уже идёт игра в крестики-нолики!\n\nДождитесь завершения или используйте .разтиктак для отмены.'
            });
            return;
        }

        // Извлекаем упоминание второго игрока
        const mentionedJid = text.match(/@([0-9]{5,16})/);
        
        if (!mentionedJid) {
            await sock.sendMessage(chatId, {
                text: '❗ Упомяните второго игрока\n\nПример: .тиктак @79291234567'
            });
            return;
        }

        const playerO = mentionedJid[0].replace('@', '') + '@s.whatsapp.net';
        
        // Нельзя играть с самим собой
        if (senderId === playerO) {
            await sock.sendMessage(chatId, {
                text: '❗ Нельзя играть против самого себя!'
            });
            return;
        }

        // Создаём игру
        const game = {
            chatId: chatId,
            game: new TicTacToe(senderId, playerO),
            createdAt: Date.now(),
            lastMoveAt: Date.now(),
            timeoutId: null,
            sock: sock
        };

        activeGames.set(chatId, game);
        
        // Устанавливаем таймер
        resetGameTimer(chatId);

        // Отправляем начальное состояние
        const gameText = generateGameText(game);
        await sock.sendMessage(chatId, {
            text: gameText,
            mentions: parseMention(gameText)
        });

    } catch (error) {
        console.error('Error in tictactoeCommand:', error);
    }
}

/**
 * Обработка хода игрока
 */
async function handleTicTacToeMove(sock, chatId, senderId, text) {
    try {
        const game = activeGames.get(chatId);
        
        // Нет активной игры
        if (!game) return;

        // Проверка: это игрок этой игры?
        if (senderId !== game.game.playerX && senderId !== game.game.playerO) {
            return; // Молча игнорируем сторонних
        }

        // Проверка хода (1-9)
        if (!/^[1-9]$/.test(text)) return;

        // Не твой ход
        if (senderId !== game.game.currentTurn) {
            await sock.sendMessage(chatId, {
                text: '❌ Сейчас не ваш ход!'
            });
            return;
        }

        // Делаем ход
        const result = game.game.turn(senderId === game.game.playerO, parseInt(text) - 1);

        if (result === 0) {
            await sock.sendMessage(chatId, {
                text: '❌ Эта клетка уже занята!'
            });
            return;
        }

        if (result === -1) return;

        // Обновляем таймер после успешного хода
        resetGameTimer(chatId);

        const winner = game.game.winner;
        const isTie = game.game.turns === 9;

        const arr = game.game.render().map(v => symbols[v] || v);

        let gameStatus;
        if (winner) {
            gameStatus = `🎉 @${winner.split('@')[0]} выигрывает!`;
        } else if (isTie) {
            gameStatus = `🤝 Ничья!`;
        } else {
            gameStatus = `🎲 Ход: @${game.game.currentTurn.split('@')[0]}`;
        }

        const str = `
🎲 *Крестики нолики*

${gameStatus}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

❎: @${game.game.playerX.split('@')[0]}
⭕: @${game.game.playerO.split('@')[0]}

${!winner && !isTie ? '• Введите номер (1-9) для хода\n.разтиктак - завершить игру' : ''}
`.trim();

        const mentions = [
            game.game.playerX,
            game.game.playerO,
            ...(winner ? [winner] : [game.game.currentTurn])
        ];

        await sock.sendMessage(chatId, {
            text: str,
            mentions
        });

        // Завершаем игру при победе или ничьей
        if (winner || isTie) {
            if (game.timeoutId) {
                clearTimeout(game.timeoutId);
            }
            activeGames.delete(chatId);
        }

    } catch (error) {
        console.error('Error in handleTicTacToeMove:', error);
    }
}

/**
 * Команда .разтиктак - завершить игру
 */
async function endTicTacToeCommand(sock, chatId, senderId) {
    try {
        const game = activeGames.get(chatId);
        
        if (!game) {
            await sock.sendMessage(chatId, {
                text: '❗ В этом чате нет активной игры'
            });
            return;
        }

        // Только игроки могут завершить игру
        if (senderId !== game.game.playerX && senderId !== game.game.playerO) {
            await sock.sendMessage(chatId, {
                text: '❌ Только игроки могут завершить игру'
            });
            return;
        }

        // Очищаем таймер
        if (game.timeoutId) {
            clearTimeout(game.timeoutId);
        }

        activeGames.delete(chatId);

        await sock.sendMessage(chatId, {
            text: `@${senderId.split('@')[0]} завершил игру`,
            mentions: [senderId]
        });

    } catch (error) {
        console.error('Error in endTicTacToeCommand:', error);
    }
}

module.exports = {
    tictactoeCommand,
    handleTicTacToeMove,
    endTicTacToeCommand
};