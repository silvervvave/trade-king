const { createClient } = require('redis');
const logger = require('./utils/logger');

let client;
let isConnected = false;
const memoryStore = {};

logger.info('Initializing Redis Client...');

// Create client but don't connect yet
client = createClient({
    url: process.env.REDIS_URL,
    socket: {
        connectTimeout: 5000, // 5 seconds timeout
        reconnectStrategy: false // Disable auto-reconnect for now to fail fast
    }
});

client.on('error', (err) => {
    // Suppress error logs if we are falling back to memory, or log as warning
    if (isConnected) {
        logger.error('Redis Client Error', err);
    } else {
        logger.warn('Redis connection failed (event): ' + err.message);
    }
    isConnected = false;
});

client.on('connect', () => {
    logger.info('Redis Client Connected');
    isConnected = true;
});

// Wrapper functions to support fallback
const redisClient = {
    connect: async () => {
        logger.info('Attempting to connect to Redis...');
        try {
            await client.connect();
            isConnected = true;
            logger.info('Redis connection established successfully.');
        } catch (err) {
            logger.warn('Failed to connect to Redis, using in-memory store. Error: ' + err.message);
            isConnected = false;
        }
    },
    get: async (key) => {
        if (isConnected && client.isOpen) {
            try {
                return await client.get(key);
            } catch (e) {
                logger.error('Redis get error', e);
                isConnected = false;
            }
        }
        return memoryStore[key] || null;
    },
    set: async (key, value) => {
        if (isConnected && client.isOpen) {
            try {
                return await client.set(key, value);
            } catch (e) {
                logger.error('Redis set error', e);
                isConnected = false;
            }
        }
        memoryStore[key] = value;
        return 'OK';
    },
    del: async (key) => {
        if (isConnected && client.isOpen) {
            try {
                return await client.del(key);
            } catch (e) {
                logger.error('Redis del error', e);
                isConnected = false;
            }
        }
        delete memoryStore[key];
        return 1;
    },
    exists: async (key) => {
        if (isConnected && client.isOpen) {
            try {
                return await client.exists(key);
            } catch (e) {
                logger.error('Redis exists error', e);
                isConnected = false;
            }
        }
        return memoryStore.hasOwnProperty(key) ? 1 : 0;
    },
    keys: async (pattern) => {
        if (isConnected && client.isOpen) {
            try {
                return await client.keys(pattern);
            } catch (e) {
                logger.error('Redis keys error', e);
                isConnected = false;
            }
        }
        // Simple memory store pattern matching (only supports 'prefix:*' or '*')
        if (pattern === '*') return Object.keys(memoryStore);
        if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1);
            return Object.keys(memoryStore).filter(k => k.startsWith(prefix));
        }
        return memoryStore.hasOwnProperty(pattern) ? [pattern] : [];
    },
    quit: async () => {
        if (isConnected && client.isOpen) await client.quit();
    }
};

module.exports = { redisClient };
