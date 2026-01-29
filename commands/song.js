const axios = require('axios');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const { toAudio } = require('../lib/converter');

const AXIOS_DEFAULTS = {
	timeout: 60000,
	headers: {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
		'Accept': 'application/json, text/plain, */*'
	}
};

async function tryRequest(getter, attempts = 3) {
	let lastError;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await getter();
		} catch (err) {
			lastError = err;
			if (attempt < attempts) {
				await new Promise(r => setTimeout(r, 1000 * attempt));
			}
		}
	}
	throw lastError;
}

async function getYupraDownloadByUrl(youtubeUrl) {
	const apiUrl = `https://api.yupra.my.id/api/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
	const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
	if (res?.data?.success && res?.data?.data?.download_url) {
		return {
			download: res.data.data.download_url,
			title: res.data.data.title,
			thumbnail: res.data.data.thumbnail
		};
	}
	throw new Error('Yupra returned no download');
}

async function getOkatsuDownloadByUrl(youtubeUrl) {
	const apiUrl = `https://okatsu-rolezapiiz.vercel.app/downloader/ytmp3?url=${encodeURIComponent(youtubeUrl)}`;
	const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
	if (res?.data?.dl) {
		return {
			download: res.data.dl,
			title: res.data.title,
			thumbnail: res.data.thumb
		};
	}
	throw new Error('Okatsu ytmp3 returned no download');
}

async function updatestatus(sock, chatId, key, text) {
	try {
		await sock.sendMessage(chatId, { text, edit: key });
	} catch (e) {
		// игнорируем ошибки редактирования
	}
}

async function songCommand(sock, chatId, message) {
    let statusKey;
    try {
        const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
        if (!text) {
            await sock.sendMessage(chatId, { text: 'Usage: .song <song name or YouTube link>' }, { quoted: message });
            return;
        }

        const start = Date.now();

        // Этап 1: Поиск
        const { key } = await sock.sendMessage(chatId, { 
            text: '🔍 *Поиск трека...*\n⏳ Ищу в YouTube' 
        }, { quoted: message });
        statusKey = key;

        let video;
        if (text.includes('youtube.com') || text.includes('youtu.be')) {
			video = { url: text };
        } else {
			const search = await yts(text);
			if (!search || !search.videos.length) {
                await updatestatus(sock, chatId, statusKey, '❌ *Ошибка*\nТрек не найден');
                return;
            }
			video = search.videos[0];
        }

        // Этап 2: Получение ссылки
        await updatestatus(sock, chatId, statusKey, 
            `🎵 *${video.title}*\n⏳ Получаю ссылку для скачивания...`
        );

		let audioData;
		try {
			audioData = await getYupraDownloadByUrl(video.url);
		} catch (e1) {
			audioData = await getOkatsuDownloadByUrl(video.url);
		}

		const audioUrl = audioData.download || audioData.dl || audioData.url;

        // Этап 3: Скачивание
        await updatestatus(sock, chatId, statusKey, 
            `🎵 *${video.title}*\n📥 Скачиваю аудио...`
        );

		let audioBuffer;
		try {
			const audioResponse = await axios.get(audioUrl, {
				responseType: 'arraybuffer',
				timeout: 90000,
				maxContentLength: Infinity,
				maxBodyLength: Infinity,
				decompress: true,
				validateStatus: s => s >= 200 && s < 400,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Accept': '*/*',
					'Accept-Encoding': 'identity'
				}
			});
			audioBuffer = Buffer.from(audioResponse.data);
		} catch (e1) {
			const audioResponse = await axios.get(audioUrl, {
				responseType: 'stream',
				timeout: 90000,
				maxContentLength: Infinity,
				maxBodyLength: Infinity,
				validateStatus: s => s >= 200 && s < 400,
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Accept': '*/*',
					'Accept-Encoding': 'identity'
				}
			});
			const chunks = [];
			await new Promise((resolve, reject) => {
				audioResponse.data.on('data', c => chunks.push(c));
				audioResponse.data.on('end', resolve);
				audioResponse.data.on('error', reject);
			});
			audioBuffer = Buffer.concat(chunks);
		}

		if (!audioBuffer || audioBuffer.length === 0) {
			throw new Error('Downloaded audio buffer is empty');
		}

		const firstBytes = audioBuffer.slice(0, 12);
		const hexSignature = firstBytes.toString('hex');
		const asciiSignature = firstBytes.toString('ascii', 4, 8);

		let actualMimetype = 'audio/mpeg';
		let fileExtension = 'mp3';

		if (asciiSignature === 'ftyp' || hexSignature.startsWith('000000')) {
			const ftypBox = audioBuffer.slice(4, 8).toString('ascii');
			if (ftypBox === 'ftyp') {
				actualMimetype = 'audio/mp4';
				fileExtension = 'm4a';
			}
		} else if (audioBuffer.toString('ascii', 0, 3) === 'ID3' || 
		         (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0)) {
			actualMimetype = 'audio/mpeg';
			fileExtension = 'mp3';
		} else if (audioBuffer.toString('ascii', 0, 4) === 'OggS') {
			actualMimetype = 'audio/ogg; codecs=opus';
			fileExtension = 'ogg';
		} else if (audioBuffer.toString('ascii', 0, 4) === 'RIFF') {
			actualMimetype = 'audio/wav';
			fileExtension = 'wav';
		} else {
			actualMimetype = 'audio/mp4';
			fileExtension = 'm4a';
		}

		let finalBuffer = audioBuffer;
		let finalMimetype = 'audio/mpeg';
		let finalExtension = 'mp3';

		if (fileExtension !== 'mp3') {
            // Этап 4: Конвертация
            await updatestatus(sock, chatId, statusKey, 
                `🎵 *${video.title}*\n🔄 Конвертирую в MP3...`
            );

			try {
				finalBuffer = await toAudio(audioBuffer, fileExtension);
				if (!finalBuffer || finalBuffer.length === 0) {
					throw new Error('Conversion returned empty buffer');
				}
				finalMimetype = 'audio/mpeg';
				finalExtension = 'mp3';
			} catch (convErr) {
				throw new Error(`Failed to convert to MP3: ${convErr.message}`);
			}
		}

        // Этап 5: Отправка
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        await updatestatus(sock, chatId, statusKey, 
            `🎵 *${video.title}*\n✅ Отправляю... (${elapsed}сек)`
        );

		await sock.sendMessage(chatId, {
			audio: finalBuffer,
			mimetype: finalMimetype,
			fileName: `${(audioData.title || video.title || 'song')}.${finalExtension}`,
			ptt: false
		}, { quoted: message });

		try {
			const tempDir = path.join(__dirname, '../temp');
			if (fs.existsSync(tempDir)) {
				const files = fs.readdirSync(tempDir);
				const now = Date.now();
				files.forEach(file => {
					const filePath = path.join(tempDir, file);
					try {
						const stats = fs.statSync(filePath);
						if (now - stats.mtimeMs > 10000) {
							if (file.endsWith('.mp3') || file.endsWith('.m4a') || /^\d+\.(mp3|m4a)$/.test(file)) {
								fs.unlinkSync(filePath);
							}
						}
					} catch (e) {}
				});
			}
		} catch (cleanupErr) {}

    } catch (err) {
        console.error('Song command error:', err);
        if (statusKey) {
            await updatestatus(sock, chatId, statusKey, '❌ *Ошибка*\nНе удалось загрузить трек');
        } else {
            await sock.sendMessage(chatId, { text: '❌ Не удалось загрузить трек' }, { quoted: message });
        }
    }
}

module.exports = songCommand;