const TicTacToe = require('../lib/tictactoe');

let pendingGames = {};
const WAITING_TIMEOUT = 5 * 60 * 1000;   // 5 минут на поиск соперника
const PLAYING_TIMEOUT = 10 * 60 * 1000;  // 10 минут на всю игру
const MOVE_TIMEOUT = 3 * 60 * 1000;      // 3 минуты на один ход

const symbols = {
    X: '❎',
    O: '⭕',
    1: '1️⃣',
    2: '2️⃣',
    3: '3️⃣',
    4: '4️⃣',
    5: '5️⃣',
    6: '6️⃣',
    7: '7️⃣',
    8: '8️⃣',
    9: '9️⃣',
};

const parsemention = (text) => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
};

// ============================================
// 🧹 ОЧИСТКА ЗАВИСШИХ ИГР
// ============================================
function cleanupStaleGames(conn) {
    if (!conn.game) return;

    const now = Date.now();
    const toDelete = [];

    for (const [id, room] of Object.entries(conn.game)) {
        if (!room?.id?.startsWith('tictactoe')) continue;

        let isStale = false;

        // Игра в ожидании слишком долго
        if (room.state === 'WAITING' && now - room.createdAt > WAITING_TIMEOUT + 10000) {
            isStale = true;
        }

        // Активная игра висит слишком долго
        if (room.state === 'PLAYING' && now - room.createdAt > PLAYING_TIMEOUT) {
            isStale = true;
        }

        // Последний ход был слишком давно
        if (room.state === 'PLAYING' && room.lastMoveAt && now - room.lastMoveAt > MOVE_TIMEOUT) {
            isStale = true;
        }

        if (isStale) {
            toDelete.push(id);
        }
    }

    for (const id of toDelete) {
        const room = conn.game[id];
        // Чистим pendingGames тоже
        if (room?.x && pendingGames[room.x]) {
            delete pendingGames[room.x];
        }
        // Удаляем по messageId тоже
        for (const [key, val] of Object.entries(pendingGames)) {
            if (val === room) delete pendingGames[key];
        }
        delete conn.game[id];
        console.log(`🧹 Удалена зависшая игра: ${id}`);
    }
}

const generateGameText = (room) => {
    const arr = room.game.render().map(v => symbols[v] || v);

    return `
Игра началась! Ход: @${room.game.currentTurn.split('@')[0]}

${arr.slice(0, 3).join('')}
${arr.slice(3, 6).join('')}
${arr.slice(6).join('')}

*Правила игры в Крестики-нолики*
> Составьте 3 символа в ряд (по вертикали, горизонтали или диагонали), чтобы победить.
> Введите номер (1-9) чтобы сделать ход.
> Напишите *сдаться* или *.выйти* чтобы сдаться.
`.trim();
};

let handler = async (m, { conn, usedPrefix, command, text }) => {
    conn.game = conn.game || {};

    const now = Date.now();

    // 🧹 Чистим зависшие игры ПЕРЕД любой проверкой
    cleanupStaleGames(conn);

    if (pendingGames[m.chat]) {
        return m.reply(`❗ В этом чате уже ищут соперника для игры в Крестики-нолики. Подождите или присоединитесь к текущему вызову.`);
    }

    if (Object.values(conn.game).find(
        room => room?.id?.startsWith('tictactoe') && room.state === 'PLAYING' && [room.x, room.o].includes(m.chat)
    )) {
        return m.reply(`❗ В этом чате уже запущена игра. Дождитесь её завершения или напишите *сдаться*.`);
    }

    if (Object.values(conn.game).find(
        room => room?.id?.startsWith('tictactoe') && 
                room.state === 'PLAYING' &&
                [room.game.playerX, room.game.playerO].includes(m.sender)
    )) {
        return m.reply(`❗ Вы уже участвуете в игре. Напишите *сдаться* или *.выйти* чтобы завершить текущую игру.`);
    }

    if (!text) text = m.sender.split('@')[0];

    let room = Object.values(conn.game).find(
        room => room?.state === 'WAITING' && room.name === text
    );

    if (room) {
        if (!room.o) {
            room.o = m.chat;
            room.game.playerO = m.sender;
            room.state = 'PLAYING';
            room.lastMoveAt = now;

            const gameText = generateGameText(room);

            await conn.sendMessage(room.x, { text: gameText, mentions: parsemention(gameText) });
            if (room.x !== room.o) {
                await conn.sendMessage(room.o, { text: gameText, mentions: parsemention(gameText) });
            }
        } else {
            return m.reply(`❗ В этой комнате уже есть два игрока!`);
        }
    } else {
        room = {
            id: 'tictactoe-' + (+new Date),
            x: m.chat,
            o: '',
            game: new TicTacToe(m.sender, 'o'),
            state: 'WAITING',
            name: text,
            createdAt: now,
            lastMoveAt: now,
        };

        pendingGames[m.chat] = room;
        conn.game[room.id] = room;

        const waitingMessage = await conn.sendMessage(m.chat, {
            text: `Ищем партнера для игры в Крестики-нолики!\n\nЧтобы присоединиться, поставьте реакцию "👍" на это сообщение.`,
        });

        pendingGames[waitingMessage.key.id] = room;

        // Таймаут — чистим И из pendingGames, И из conn.game
        setTimeout(() => {
            if (room.state === 'WAITING') {
                delete pendingGames[m.chat];
                delete pendingGames[waitingMessage.key.id];
                delete conn.game[room.id];
                conn.sendMessage(m.chat, {
                    text: `⏳ Партнёр для игры не найден. Попробуйте позже.`,
                }).catch(() => {});
            }
        }, WAITING_TIMEOUT);
    }
};

const thumbsUpReactions = ['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿'];

let reactionHandler = async function (m, { conn }) {
    if (!m.isGroup || m.mtype !== 'reactionMessage') return;

    const messageID = m.message.reactionMessage?.key?.id;
    const reactionText = m.message.reactionMessage?.text || '';

    if (!thumbsUpReactions.includes(reactionText)) return;

    const room = pendingGames[messageID];
    if (!room || room.state !== 'WAITING') return;

    const chatId = m.key?.remoteJid || m.chat;
    const senderId = m.key?.participant || m.key?.remoteJid || m.sender;

    if (room.game.playerX === senderId) {
        await conn.sendMessage(chatId, { text: '❗ Вы не можете играть против самого себя!' });
        return;
    }

    room.o = chatId;
    room.game.playerO = senderId;
    room.state = 'PLAYING';
    room.lastMoveAt = Date.now();

    const gameText = generateGameText(room);

    await conn.sendMessage(room.o, { text: gameText, mentions: parsemention(gameText) });
    if (room.x !== room.o) {
        await conn.sendMessage(room.x, { text: gameText, mentions: parsemention(gameText) });
    }
    delete pendingGames[chatId];
    delete pendingGames[messageID];
};

handler.before = reactionHandler;

handler.command = ['тиктак', 'ttt', 'кн'];
handler.group = true;
handler.exp = 0;

// ============================================
// ОБРАБОТКА ХОДА
// ============================================
async function handleTicTacToeMove(sock, chatId, senderId, text) {
    try {
        const conn = sock;
        conn.game = conn.game || {};

        // 🧹 Чистим зависшие игры
        cleanupStaleGames(conn);

        const room = Object.values(conn.game).find(room =>
            room?.id?.startsWith('tictactoe') &&
            [room.game.playerX, room.game.playerO].includes(senderId) &&
            room.state === 'PLAYING'
        );

        if (!room) return;

        const isSurrender = /^(сдаться|сдаюсь|surrender|give\s*up)$/i.test(text);
        if (!isSurrender && !/^[1-9]$/.test(text)) return;

        if (senderId !== room.game.currentTurn && !isSurrender) {
            await conn.sendMessage(chatId, { text: '⏳ Сейчас не твой ход!' });
            return;
        }

        // Обновляем время последнего хода
        room.lastMoveAt = Date.now();

        if (isSurrender) {
            const winner = senderId === room.game.playerX ? room.game.playerO : room.game.playerX;
            await conn.sendMessage(chatId, {
                text: `🏳️ @${senderId.split('@')[0]} сдался! Победил @${winner.split('@')[0]}!`,
                mentions: [senderId, winner]
            });
            delete conn.game[room.id];
            return;
        }

        let ok = room.game.turn(
            senderId === room.game.playerO,
            parseInt(text) - 1
        );

        if (!ok) {
            await conn.sendMessage(chatId, { text: 'это занято уже' });
            return;
        }

        let winner = room.game.winner;
        let isTie = room.game.turns === 9;

        const arr = room.game.render().map(v => symbols[v] || v);

        let gameStatus;
        if (winner) {
            gameStatus = `🎉 @${winner.split('@')[0]} выигрывает!`;
        } else if (isTie) {
            gameStatus = `🤝 Ничья!`;
        } else {
            gameStatus = `🎲 Ход: @${room.game.currentTurn.split('@')[0]}`;
        }

        const str = `
*Крестики-нолики*

${gameStatus}

> ${arr.slice(0, 3).join('')}
> ${arr.slice(3, 6).join('')}
> ${arr.slice(6).join('')}

❎: @${room.game.playerX.split('@')[0]}
⭕: @${room.game.playerO.split('@')[0]}

${!winner && !isTie ? '• Введите номер (1-9), чтобы сделать ход\n• Напишите *сдаться* или *.выйти* чтобы сдаться' : ''}
`.trim();

        const mentions = [
            room.game.playerX,
            room.game.playerO,
            ...(winner ? [winner] : [room.game.currentTurn])
        ];

        await conn.sendMessage(room.x, { text: str, mentions });
        if (room.x !== room.o) {
            await conn.sendMessage(room.o, { text: str, mentions });
        }

        if (winner || isTie) {
            delete conn.game[room.id];
        }
    } catch (error) {
        console.error('Error in tictactoe move:', error);
    }
}

// ============================================
// ПРИНУДИТЕЛЬНЫЙ ВЫХОД ИЗ ИГРЫ
// ============================================
async function handleForceQuit(sock, chatId, senderId) {
    const conn = sock;
    conn.game = conn.game || {};

    // 🧹 Чистим зависшие игры
    cleanupStaleGames(conn);

    // Ищем любую игру где участвует этот игрок
    const room = Object.values(conn.game).find(room =>
        room?.id?.startsWith('tictactoe') &&
        [room.game?.playerX, room.game?.playerO].includes(senderId)
    );

    if (!room) {
        // Проверяем pendingGames тоже
        const pending = Object.entries(pendingGames).find(([key, val]) =>
            val?.game?.playerX === senderId && val.state === 'WAITING'
        );

        if (pending) {
            const [key, pendingRoom] = pending;
            // Удаляем из pendingGames
            for (const [k, v] of Object.entries(pendingGames)) {
                if (v === pendingRoom) delete pendingGames[k];
            }
            // Удаляем из conn.game
            if (pendingRoom.id && conn.game[pendingRoom.id]) {
                delete conn.game[pendingRoom.id];
            }
            await sock.sendMessage(chatId, { text: '✅ Поиск игры отменён.' });
            return;
        }

        await sock.sendMessage(chatId, { text: '❌ Вы не участвуете ни в какой игре.' });
        return;
    }

    if (room.state === 'PLAYING') {
        const winner = senderId === room.game.playerX ? room.game.playerO : room.game.playerX;
        const winnerIsReal = winner && winner !== 'o'; // 'o' — дефолтное значение до присоединения

        if (winnerIsReal) {
            await sock.sendMessage(chatId, {
                text: `🏳️ @${senderId.split('@')[0]} вышел из игры! Победил @${winner.split('@')[0]}!`,
                mentions: [senderId, winner]
            });
        } else {
            await sock.sendMessage(chatId, {
                text: `🏳️ @${senderId.split('@')[0]} вышел из игры.`,
                mentions: [senderId]
            });
        }
    } else {
        await sock.sendMessage(chatId, { text: '✅ Игра отменена.' });
    }

    // Чистим всё
    for (const [k, v] of Object.entries(pendingGames)) {
        if (v === room) delete pendingGames[k];
    }
    delete conn.game[room.id];
}

// ============================================
// СОВМЕСТИМОСТЬ С main.js
// ============================================
async function tictactoeCommand(sock, chatId, senderId, text) {
    const m = {
        chat: chatId,
        sender: senderId,
        isGroup: (chatId || '').endsWith('@g.us'),
        reply: async (txt) => { try { await sock.sendMessage(chatId, { text: txt }); } catch (e) {} },
        key: { remoteJid: chatId },
        message: {}
    };
    await handler(m, { conn: sock, usedPrefix: '.', command: 'ttt', text });
}

module.exports = {
    tictactoeCommand,
    handleTicTacToeMove,
    handleForceQuit,
    handleReaction: reactionHandler
};