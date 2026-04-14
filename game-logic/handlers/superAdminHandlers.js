const logger = require('../utils/logger');
const { SUPER_ADMIN_ROOM, broadcastRoomListUpdate, broadcastUserListUpdate } = require('../superAdminUtils');

function joinSuperAdminRoom(socket) {
    socket.join(SUPER_ADMIN_ROOM);
    logger.info(`Super Admin joined room: ${socket.id}`);
}

async function getRoomList(io) {
    await broadcastRoomListUpdate(io);
}

async function getUsers(io) {
    await broadcastUserListUpdate(io);
}

async function deleteUser(io, socket, data, _supabase_ignored) {
    const { studentId, superAdminKey } = data;
    // Basic validation (In production, verify superAdminKey more robustly)
    if (!studentId) return;

    try {
        if (global.memoryUsers && global.memoryUsers[studentId]) {
            delete global.memoryUsers[studentId];
        }

        socket.emit('user_deleted_success', { studentId });
        await broadcastUserListUpdate(io);
        logger.info(`[Super Admin] User deleted: ${studentId}`);
    } catch (error) {
        logger.error(`Error deleting user ${studentId}:`, error);
        socket.emit('error', { message: 'Failed to delete user' });
    }
}

async function deleteMultipleUsers(io, socket, data) {
    const { studentIds, superAdminKey } = data;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) return;

    try {
        if (global.memoryUsers) {
            studentIds.forEach(id => {
                delete global.memoryUsers[id];
            });
        }

        socket.emit('user_deleted_success', { message: `${studentIds.length}명의 사용자가 삭제되었습니다.` });
        await broadcastUserListUpdate(io);
        logger.info(`[Super Admin] Multiple users deleted: ${studentIds.join(', ')}`);
    } catch (error) {
        logger.error(`Error deleting multiple users:`, error);
        socket.emit('error', { message: 'Failed to delete users' });
    }
}

module.exports = {
    joinSuperAdminRoom,
    getRoomList,
    getUsers,
    deleteUser,
    deleteMultipleUsers
};
