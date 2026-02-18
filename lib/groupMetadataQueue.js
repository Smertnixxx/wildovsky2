// lib/groupMetadataQueue.js
// Единый контроллер запросов groupMetadata
// Все модули ДОЛЖНЫ использовать только этот файл для получения метаданных групп

'use strict';

// ─── Кэш ───
const cache = new Map();
const DEFAULT_TTL = 120 * 1000; // 2 минуты

// ─── Очередь запросов ───
const requestQueue = [];        // { jid, resolve, reject, addedAt }
const inflightRequests = new Map(); // jid -> Promise (дедупликация)
let queueProcessing = false;

// ─── Настройки ───
const CONFIG = {
    minDelay: 300,          // минимальная пауза между запросами (мс)
    maxDelay: 30000,        // максимальная пауза при backoff
    maxRetries: 4,          // максимум повторов на один запрос
    baseBackoff: 500,       // базовый backoff при 429
    cacheTTL: DEFAULT_TTL,  // время жизни кэша
    queueTimeout: 60000,    // таймаут ожидания в очереди
    burstLimit: 5,          // сколько запросов можно сделать подряд
    burstWindow: 10000,     // окно для burst (мс)
};

// ─── Rate limiter state ───
let lastRequestTime = 0;
let consecutiveRateLimits = 0;
let globalCooldownUntil = 0;
const recentRequests = [];  // timestamps для burst control

// ─── Статистика (для отладки) ───
const stats = {
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
    rateLimits: 0,
    errors: 0,
    deduplicated: 0,
};

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
    if (!err) return false;
    if (err.data === 429) return true;
    if (err.statusCode === 429) return true;
    if (err.output?.statusCode === 429) return true;
    if (err.message?.includes?.('rate') && err.message?.includes?.('limit')) return true;
    if (err.message?.includes?.('429')) return true;
    return false;
}

/**
 * Получить кэшированные метаданные (без запроса к API)
 */
function getCached(jid) {
    const entry = cache.get(jid);
    if (entry && entry.expires > Date.now()) {
        return entry.metadata;
    }
    return null;
}

/**
 * Положить метаданные в кэш вручную
 */
function setCache(jid, metadata, ttl = CONFIG.cacheTTL) {
    if (!jid || !metadata) return;
    cache.set(jid, {
        metadata,
        expires: Date.now() + ttl,
    });
}

/**
 * Инвалидировать кэш для группы
 */
function invalidateCache(jid) {
    cache.delete(jid);
}

/**
 * Очистить весь кэш
 */
function clearCache() {
    cache.clear();
}

/**
 * Подсчёт запросов в burst window
 */
function countRecentRequests() {
    const now = Date.now();
    // Удаляем старые
    while (recentRequests.length > 0 && recentRequests[0] < now - CONFIG.burstWindow) {
        recentRequests.shift();
    }
    return recentRequests.length;
}

/**
 * Выполнить один запрос к API с retry и backoff
 */
async function executeRequest(sock, jid) {
    for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
        // Проверка глобального cooldown
        const now = Date.now();
        if (globalCooldownUntil > now) {
            const waitTime = globalCooldownUntil - now;
            console.log(`⏳ [GroupQueue] Глобальный cooldown: ждём ${waitTime}мс`);
            await sleep(waitTime);
        }

        // Burst control
        while (countRecentRequests() >= CONFIG.burstLimit) {
            const oldestInWindow = recentRequests[0];
            const waitUntil = oldestInWindow + CONFIG.burstWindow - Date.now() + 50;
            if (waitUntil > 0) {
                await sleep(waitUntil);
            }
            countRecentRequests(); // очищаем старые
        }

        // Минимальная пауза между запросами
        const elapsed = Date.now() - lastRequestTime;
        const dynamicDelay = CONFIG.minDelay * (1 + consecutiveRateLimits);
        if (elapsed < dynamicDelay) {
            await sleep(dynamicDelay - elapsed);
        }

        try {
            lastRequestTime = Date.now();
            recentRequests.push(lastRequestTime);
            stats.apiCalls++;

            const metadata = await sock.groupMetadata(jid);

            // Успех — сбрасываем счётчик rate limit
            consecutiveRateLimits = Math.max(0, consecutiveRateLimits - 1);

            // Кэшируем
            setCache(jid, metadata);

            return metadata;
        } catch (err) {
            if (isRateLimitError(err)) {
                stats.rateLimits++;
                consecutiveRateLimits++;

                // Экспоненциальный backoff с jitter
                const backoff = Math.min(
                    CONFIG.baseBackoff * Math.pow(2, attempt) + Math.floor(Math.random() * 300),
                    CONFIG.maxDelay
                );

                // Если слишком много подряд — глобальный cooldown
                if (consecutiveRateLimits >= 3) {
                    const globalWait = CONFIG.baseBackoff * Math.pow(2, consecutiveRateLimits);
                    globalCooldownUntil = Date.now() + Math.min(globalWait, CONFIG.maxDelay);
                    console.warn(`🚨 [GroupQueue] ${consecutiveRateLimits} rate limits подряд! Глобальный cooldown: ${globalWait}мс`);
                }

                console.warn(`⚠️ [GroupQueue] Rate limit для ${jid}, попытка ${attempt + 1}/${CONFIG.maxRetries + 1}, ожидание ${backoff}мс`);
                await sleep(backoff);
                continue;
            }

            // Другие ошибки — не повторяем
            stats.errors++;
            throw err;
        }
    }

    // Все попытки исчерпаны
    stats.errors++;
    console.error(`❌ [GroupQueue] Не удалось получить метаданные для ${jid} после ${CONFIG.maxRetries + 1} попыток`);
    return null;
}

/**
 * Обработчик очереди
 */
async function processQueue(sock) {
    if (queueProcessing) return;
    queueProcessing = true;

    try {
        while (requestQueue.length > 0) {
            const item = requestQueue.shift();
            if (!item) continue;

            const { jid, resolve, reject, addedAt } = item;

            // Таймаут — если запрос слишком долго ждал в очереди
            if (Date.now() - addedAt > CONFIG.queueTimeout) {
                console.warn(`⏰ [GroupQueue] Запрос для ${jid} истёк по таймауту`);
                resolve(getCached(jid) || null); // отдаём кэш если есть
                continue;
            }

            // Проверяем кэш ещё раз (мог обновиться пока ждали)
            const cached = getCached(jid);
            if (cached) {
                stats.cacheHits++;
                resolve(cached);
                continue;
            }

            try {
                const metadata = await executeRequest(sock, jid);
                resolve(metadata);
            } catch (err) {
                console.error(`❌ [GroupQueue] Ошибка для ${jid}:`, err.message || err);
                // Возвращаем null вместо reject чтобы не ломать вызывающий код
                resolve(null);
            }
        }
    } finally {
        queueProcessing = false;
    }
}

/**
 * ГЛАВНАЯ ФУНКЦИЯ — получить метаданные группы
 * Все модули должны вызывать только её
 *
 * @param {object} sock - Baileys socket
 * @param {string} jid - Group JID (xxx@g.us)
 * @param {object} options - Опции
 * @param {number} options.ttl - Время жизни кэша (мс)
 * @param {boolean} options.forceRefresh - Принудительно обновить кэш
 * @param {boolean} options.cacheOnly - Только из кэша, не делать запрос
 * @returns {Promise<object|null>} metadata или null
 */
async function getGroupMetadata(sock, jid, options = {}) {
    const { ttl, forceRefresh = false, cacheOnly = false } = options;

    // Валидация
    if (!jid || !jid.endsWith('@g.us')) return null;
    if (!sock || typeof sock.groupMetadata !== 'function') return null;

    // Установить TTL если передан
    if (ttl && typeof ttl === 'number') {
        // будет использован при кэшировании
    }

    // Проверка кэша
    if (!forceRefresh) {
        const cached = getCached(jid);
        if (cached) {
            stats.cacheHits++;
            return cached;
        }
    } else {
        invalidateCache(jid);
    }

    if (cacheOnly) return null;

    stats.cacheMisses++;

    // Дедупликация: если уже есть inflight запрос для этого jid — ждём его
    if (inflightRequests.has(jid)) {
        stats.deduplicated++;
        try {
            return await inflightRequests.get(jid);
        } catch {
            return getCached(jid) || null;
        }
    }

    // Создаём promise и кладём в очередь
    const promise = new Promise((resolve, reject) => {
        requestQueue.push({
            jid,
            resolve,
            reject,
            addedAt: Date.now(),
        });
    });

    inflightRequests.set(jid, promise);

    // Запускаем обработку очереди
    processQueue(sock).catch(err => {
        console.error('❌ [GroupQueue] Ошибка обработки очереди:', err);
    });

    try {
        const result = await promise;
        return result;
    } finally {
        inflightRequests.delete(jid);
    }
}

/**
 * Предзагрузка метаданных для списка групп (например, при старте бота)
 */
async function preloadGroups(sock, jids) {
    if (!Array.isArray(jids) || jids.length === 0) return;

    console.log(`📦 [GroupQueue] Предзагрузка ${jids.length} групп...`);

    for (const jid of jids) {
        if (!jid.endsWith('@g.us')) continue;
        if (getCached(jid)) continue;

        // Добавляем с паузой чтобы не спамить
        await getGroupMetadata(sock, jid);
        await sleep(200); // маленькая пауза между предзагрузками
    }

    console.log(`✅ [GroupQueue] Предзагрузка завершена`);
}

/**
 * Получить статистику (для отладки)
 */
function getStats() {
    return {
        ...stats,
        cacheSize: cache.size,
        queueLength: requestQueue.length,
        inflightCount: inflightRequests.size,
        consecutiveRateLimits,
        globalCooldownActive: globalCooldownUntil > Date.now(),
    };
}

/**
 * Автоочистка просроченного кэша (запускать периодически)
 */
function cleanupCache() {
    const now = Date.now();
    let cleaned = 0;
    for (const [jid, entry] of cache) {
        if (entry.expires <= now) {
            cache.delete(jid);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`🧹 [GroupQueue] Очищено ${cleaned} просроченных записей кэша`);
    }
}

// Автоочистка каждые 5 минут
setInterval(cleanupCache, 5 * 60 * 1000);

// Логирование статистики каждые 10 минут
setInterval(() => {
    const s = getStats();
    if (s.apiCalls > 0) {
        console.log(`📊 [GroupQueue] Статистика: API=${s.apiCalls}, Cache=${s.cacheHits}, Miss=${s.cacheMisses}, RateLimit=${s.rateLimits}, Dedup=${s.deduplicated}, Errors=${s.errors}, CacheSize=${s.cacheSize}`);
    }
}, 10 * 60 * 1000);

module.exports = {
    getGroupMetadata,
    getCached,
    setCache,
    invalidateCache,
    clearCache,
    preloadGroups,
    getStats,
    CONFIG,
};