const store = require('./store');

const SUPER_ADMIN_ROOM = 'super-admin-room';

async function broadcastRoomListUpdate(io) {
    try {
        const roomKeys = await store.keys('room:*');
        if (roomKeys.length === 0) {
            io.to(SUPER_ADMIN_ROOM).emit('room_list_update', []);
            return;
        }
        const gameStatesJSON = await Promise.all(roomKeys.map(key => store.get(key)));
        const roomList = gameStatesJSON
            .filter(stateJSON => stateJSON) // Filter out null/deleted states
            .map((stateJSON, index) => {
                const gameState = JSON.parse(stateJSON);
                const originalKey = roomKeys[index];
                return {
                    roomId: originalKey.replace('room:', ''),
                    playerCount: Object.keys(gameState.players).length,
                    currentPhase: gameState.currentPhase,
                    currentRound: gameState.currentRound,
                    gameStarted: gameState.gameStarted
                };
            });
        io.to(SUPER_ADMIN_ROOM).emit('room_list_update', roomList);
    } catch (error) {
        console.error('Error broadcasting room list update:', error);
    }
}

async function broadcastUserListUpdate(io) {
    try {
        let users = [];
        // 인메모리 유저 사용 (global.memoryUsers)
        users = Object.values(global.memoryUsers || {}).map(u => ({
            student_id: u.student_id,
            name: u.name,
            created_at: new Date().toISOString()
        }));
        io.to(SUPER_ADMIN_ROOM).emit('users_list_update', users);
    } catch (error) {
        console.error('Error broadcasting user list update:', error);
    }
}

module.exports = {
    SUPER_ADMIN_ROOM,
    broadcastRoomListUpdate,
    broadcastUserListUpdate
};
