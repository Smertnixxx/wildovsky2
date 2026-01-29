const os = require('os');
const process = require('process');

async function botinfoCommand(sock, chatId, message) {
	try {
		if (!chatId) return;

		const uptime = process.uptime();
		const hours = Math.floor(uptime / 3600);
		const minutes = Math.floor((uptime % 3600) / 60);
		const seconds = Math.floor(uptime % 60);

		const memUsed = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
		const memTotal = (os.totalmem() / 1024 / 1024).toFixed(0);

		const text =
`Информация о боте

⏱ Аптайм: ${hours}ч ${minutes}м ${seconds}с
🧠 RAM: ${memUsed} MB / ${memTotal} MB
⚙️ Node: ${process.version}
💻 Платформа: ${os.platform()} ${os.arch()}`;

		await sock.sendMessage(
			chatId,
			{ text }
		);

	} catch (err) {
		console.error('botinfo error:', err);

		try {
			await sock.sendMessage(
				chatId,
				{ text: '❌ Ошибка получения информации о боте' }
			);
		} catch {}
	}
}

module.exports = botinfoCommand;
