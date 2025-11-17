const { redisClient } = require('../redisClient');
const supabase = require('../supabaseClient');

const SUPER_ADMIN_ROOM = 'super-admin-room';

async function broadcastRoomListUpdate(io) {
    try {
        const roomKeys = await redisClient.keys('room:*');
        if (roomKeys.length === 0) {
            io.to(SUPER_ADMIN_ROOM).emit('room_list_update', []);
            return;
        }
        const gameStatesJSON = await redisClient.mGet(roomKeys);
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
        const { data: users, error } = await supabase
            .from('users')
            .select('student_id, name, created_at')
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(`Supabase fetch users error for broadcast: ${error.message}`);
        }
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
