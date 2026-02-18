// lib/groupCache.js
// Обёртка для обратной совместимости — все вызовы идут через единую очередь
'use strict';

const { getGroupMetadata, getCached, setCache, invalidateCache } = require('./groupMetadataQueue');

module.exports = { getGroupMetadata, getCached, setCache, invalidateCache };