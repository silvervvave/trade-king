const memoryStore = {};

const store = {
    connect: async () => {
        // No-op for purely in-memory
    },
    get: async (key) => {
        return memoryStore[key] || null;
    },
    set: async (key, value) => {
        memoryStore[key] = value;
        return 'OK';
    },
    del: async (key) => {
        delete memoryStore[key];
        return 1;
    },
    exists: async (key) => {
        return memoryStore.hasOwnProperty(key) ? 1 : 0;
    },
    keys: async (pattern) => {
        if (pattern === '*') return Object.keys(memoryStore);
        if (pattern.endsWith('*')) {
            const prefix = pattern.slice(0, -1);
            return Object.keys(memoryStore).filter(k => k.startsWith(prefix));
        }
        return memoryStore.hasOwnProperty(pattern) ? [pattern] : [];
    },
    quit: async () => {
        // No-op
    }
};

module.exports = store;
