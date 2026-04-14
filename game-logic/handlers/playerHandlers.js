const { createInitialTeamState } = require('../rooms');
const { countryConfig } = require('../../config');
const logger = require('../utils/logger');
const { _getPlayerAndTeam, broadcastTeamsUpdate } = require('./common');

/**
 * Registers a player to a specific team in a room.
 * Handles team creation, member addition, and team switching logic.
 * 
 * @param {Object} io - Socket.io server instance
 * @param {Object} socket - Socket.io socket instance
 * @param {Object} data - Data containing country, studentId, and name
 * @param {Object} room - Current room state object
 * @param {string} roomId - ID of the room
 */
function registerPlayer(io, socket, data, room, roomId) {
    const { country, studentId, name } = data;

    if (!countryConfig[country]) {
        return socket.emit('error', { message: '유효하지 않은 국가입니다.' });
    }

    // 플레이어가 접속하려는 팀이 없으면 생성
    if (!room.teams[country]) {
        const config = countryConfig[country];
        room.teams[country] = createInitialTeamState(country, config);
    }

    // [수정된 로직] 플레이어가 팀을 변경하는 경우, 이전 팀에서 플레이어 정보를 정리합니다.
    // studentId를 고유 식별자로 사용합니다.
    for (const existingCountry in room.teams) {
        if (room.teams.hasOwnProperty(existingCountry) && existingCountry !== country) {
            const otherTeam = room.teams[existingCountry];
            const memberIndex = otherTeam.members.findIndex(m => m.studentId === studentId);

            if (memberIndex !== -1) {
                // 다른 팀에서 플레이어를 찾았으면 제거합니다.
                const oldSocketId = otherTeam.members[memberIndex].id;
                otherTeam.members.splice(memberIndex, 1); // 배열에서 제거

                // players 객체에서도 해당 소켓 ID 정보를 정리합니다.
                if (room.players[oldSocketId]) {
                    delete room.players[oldSocketId];
                }
                logger.info(`[팀 변경] ${name} (${studentId})님이 ${existingCountry} 팀에서 나와 ${country} 팀으로 이동합니다.`);
            }
        }
    }

    const team = room.teams[country];
    const existingMember = team.members.find(m => m.studentId === studentId);

    if (existingMember) {
        // 같은 팀에 재접속하거나, 팀 변경을 완료하는 경우: 소켓 ID와 접속 상태만 갱신합니다.
        // 이전 소켓 ID가 players 객체에 남아있을 수 있으므로 정리합니다.
        if (room.players[existingMember.id]) {
            delete room.players[existingMember.id];
        }
        existingMember.id = socket.id;
        existingMember.connected = true;
        existingMember.name = name; // 이름이 변경되었을 수 있으니 업데이트
    } else {
        // 이 팀에 처음으로 합류하는 경우: 새 멤버로 추가합니다.
        team.members.push({ id: socket.id, studentId, name, connected: true });
    }

    // 현재 소켓 ID로 players 객체를 업데이트합니다.
    room.players[socket.id] = { studentId, name, team: country };
    socket.join(roomId);
    socket.roomId = roomId;

    logger.info(`[플레이어 참가] ${name}(${studentId})님이 ${roomId} 방의 ${country} 팀에 참가`);

    const safeRoomState = {
        gameStarted: room.gameStarted,
        currentRound: room.currentRound,
        currentPhase: room.currentPhase,
        players: room.players,
        teams: room.teams,
        countryConfig: countryConfig
    };
    socket.emit('game_state_update', safeRoomState);
    socket.emit('team_update', team);
    broadcastTeamsUpdate(io, room, roomId);
}

/**
 * Handles a player joining a game room.
 * Manages both new player entry and reconnection logic.
 * 
 * @param {Object} io - Socket.io server instance
 * @param {Object} socket - Socket.io socket instance
 * @param {Object} data - Data containing roomId, studentId, name, and country
 * @param {Object} store - In-memory store for state management
 */
async function joinGame(io, socket, data, store, _supabase_ignored) {
    const { roomId, studentId, name, country } = data;
    // country는 재접속 시 null일 수 있음 (기존 팀으로 자동 복귀)

    try {
        const gameStateJSON = await store.get(`room:${roomId}`);
        if (!gameStateJSON) {
            socket.emit('room_not_found');
            logger.warn(`[Join Game] ${name} (${studentId}) tried to join non-existent room ${roomId}.`);
            return;
        }

        let gameState = JSON.parse(gameStateJSON);
        let foundPlayer = null;
        let playerTeam = null;
        let oldSocketId = null;

        // Cancel grace period if active
        if (gameState.gracePeriodTimeout) {
            clearTimeout(gameState.gracePeriodTimeout);
            gameState.gracePeriodTimeout = null;
            gameState.gracePeriodStartedAt = null;
            logger.info(`[유예 기간 취소] 방 ${roomId}에 플레이어가 재접속하여 삭제가 취소되었습니다.`);
        }

        // Check if player with studentId already exists in any team
        for (const team of Object.values(gameState.teams)) {
            const member = team.members.find(m => m.studentId === studentId);
            if (member) {
                foundPlayer = member;
                playerTeam = team;
                oldSocketId = member.id;
                break;
            }
        }

        if (foundPlayer && playerTeam) {
            // --- 기존 플레이어 발견: 재접속 또는 팀 변경 ---
            if (country && country !== playerTeam.country) {
                // --- TEAM SWITCH (country가 명시적으로 지정되고 현재 팀과 다를 때만) ---
                logger.info(`[팀 변경] ${name} (${studentId})님이 ${playerTeam.country} 팀에서 ${country} 팀으로 이동합니다.`);
                
                // 1. Remove from old team
                const memberIndex = playerTeam.members.findIndex(m => m.studentId === studentId);
                if (memberIndex !== -1) {
                    playerTeam.members.splice(memberIndex, 1);
                }
                if (oldSocketId && gameState.players[oldSocketId]) {
                    delete gameState.players[oldSocketId];
                }

                // 2. Add to new team
                if (!gameState.teams[country]) {
                    const config = countryConfig[country];
                    gameState.teams[country] = createInitialTeamState(country, config);
                }
                const newTeam = gameState.teams[country];
                newTeam.members.push({ id: socket.id, studentId, name, connected: true });
                gameState.players[socket.id] = { studentId, name, team: country };

            } else {
                // --- RECONNECTION (country가 null이거나 같은 팀) ---
                logger.info(`[재접속] ${name} (${studentId})님이 ${roomId} 방의 ${playerTeam.country} 팀에 재접속합니다.`);
                if (oldSocketId && gameState.players[oldSocketId]) {
                    delete gameState.players[oldSocketId];
                }
                foundPlayer.id = socket.id;
                foundPlayer.connected = true;
                foundPlayer.name = name;
                gameState.players[socket.id] = { studentId: foundPlayer.studentId, name: foundPlayer.name, team: playerTeam.country };
            }

            socket.join(roomId);
            socket.roomId = roomId;

            socket.emit('game_state_update', gameState);
            broadcastTeamsUpdate(io, gameState, roomId);

        } else if (!country) {
            // --- 기존 세션 없음 + 국가 미지정: 세션 만료 처리 ---
            logger.warn(`[세션 만료] ${name} (${studentId})의 세션이 방 ${roomId}에 없습니다.`);
            socket.emit('session_expired', { message: '기존 게임 세션을 찾을 수 없습니다. 새로 참가해주세요.' });
            return;

        } else {
            // --- NEW PLAYER JOIN ---
            logger.info(`[신규 참가] ${name}(${studentId})님이 ${roomId} 방의 ${country} 팀에 참가합니다.`);

            if (!countryConfig[country]) {
                socket.emit('error', { message: '유효하지 않은 국가입니다.' });
                return;
            }

            if (!gameState.teams[country]) {
                const config = countryConfig[country];
                gameState.teams[country] = createInitialTeamState(country, config);
            }

            const team = gameState.teams[country];
            const existingMember = team.members.find(m => m.studentId === studentId);

            if (existingMember) {
                logger.warn(`[신규 참가 경고] ${name}(${studentId})가 이미 ${country} 팀에 존재합니다. 정보를 업데이트합니다.`);
                if (gameState.players[existingMember.id]) {
                    delete gameState.players[existingMember.id];
                }
                existingMember.id = socket.id;
                existingMember.connected = true;
                existingMember.name = name;
            } else {
                team.members.push({ id: socket.id, studentId, name, connected: true });
            }

            gameState.players[socket.id] = { studentId, name, team: country };
            socket.join(roomId);
            socket.roomId = roomId;

            const safeRoomState = {
                gameStarted: gameState.gameStarted,
                currentRound: gameState.currentRound,
                currentPhase: gameState.currentPhase,
                players: gameState.players,
                teams: gameState.teams,
                countryConfig: countryConfig
            };
            socket.emit('game_state_update', safeRoomState);
            socket.emit('team_update', team);
            broadcastTeamsUpdate(io, gameState, roomId);
        }

        // Persist the updated state back to the store
        await store.set(`room:${roomId}`, JSON.stringify(gameState));

    } catch (error) {
        logger.error(`[Join Game 오류] Room: ${roomId}, User: ${name}`, error);
        socket.emit('error', { message: '게임에 참가하는 중 서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
    }
}

// reconnectPlayer는 joinGame으로 통합되어 제거되었습니다.
// join_game에 country: null을 전달하면 기존 팀으로 자동 재접속됩니다.

async function getRoomInfo(io, socket, data, store) {
    const { roomId, studentId, name } = data; // studentId and name are for logging

    try {
        const gameStateJSON = await store.get(`room:${roomId}`);
        if (!gameStateJSON) {
            socket.emit('room_not_found');
            logger.warn(`[Get Room Info] ${name} (${studentId}) requested info for non-existent room ${roomId}.`);
            return;
        }

        const gameState = JSON.parse(gameStateJSON);

        // This is a read-only request. We just provide the necessary info for team selection.
        logger.info(`[Get Room Info] ${name} (${studentId}) is checking room ${roomId}.`);

        const teams = gameState.teams || {};
        socket.emit('room_info', {
            exists: true,
            roomId,
            playerName: name,
            countryConfig,
            teams
        });

    } catch (error) {
        logger.error(`[Get Room Info 오류] Room: ${roomId}, User: ${name}`, error);
        socket.emit('error', { message: '방 정보를 가져오는 중 오류가 발생했습니다.' });
    }
}

/**
 * Handles user login or registration.
 * Verifies student ID and name against the database.
 * 
 * @param {Object} socket - Socket.io socket instance
 * @param {Object} data - Data containing studentId and name
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Object indicating if a new user was created
 */
async function loginOrRegister(socket, data, store) {
    const { studentId, name } = data;
    let newUserCreated = false;

    // Server-side validation
    const validInput = /^[a-zA-Z0-9가-힣]{1,20}$/;
    if (!studentId || !name || !validInput.test(studentId) || !validInput.test(name)) {
        socket.emit('login_failure', { message: '학번과 이름은 1~20자의 한글, 영문, 숫자만 가능합니다.' });
        return { newUserCreated: false };
    }

    try {
        let user;
        
        // 인메모리로 처리
        // 전역 인메모리 저장소 초기화 (한 번만)
        if (!global.memoryUsers) global.memoryUsers = {};
        
        if (global.memoryUsers[studentId]) {
            if (global.memoryUsers[studentId].name !== name) {
                socket.emit('login_failure', { message: '학번과 이름이 일치하지 않습니다.' });
                return { newUserCreated: false };
            }
            user = global.memoryUsers[studentId];
        } else {
            user = { student_id: studentId, name: name, country_stats: {} };
            global.memoryUsers[studentId] = user;
            newUserCreated = true;
        }

        const activeRoomId = null;

        // 5. Emit success to client
        const successPayload = {
            studentId: user.student_id,
            name: user.name,
            countryStats: user.country_stats || {}
        };

        if (activeRoomId) {
            successPayload.roomId = activeRoomId;
            logger.info(`[로그인 성공] 사용자 ${name} (${studentId})가 활성 방 ${activeRoomId}에서 발견되었습니다.`);
        }

        socket.emit('login_success', successPayload);
        logger.info(`[로그인 성공] 학번: ${studentId}, 이름: ${name}`);
        return { newUserCreated };

    } catch (error) {
        logger.error('Login or registration failed', error);
        socket.emit('login_failure', { message: '로그인 처리 중 서버 오류가 발생했습니다. 관리자에게 문의해주세요.' });
        return { newUserCreated: false };
    }
}

async function getUsers(socket) {
    try {
        socket.emit('users_list_update', Object.values(global.memoryUsers || {}));
    } catch (error) {
        logger.error('Failed to get users list', error);
        socket.emit('error', { message: '사용자 목록을 획득 실패' });
    }
}

async function deleteUser(socket, { studentId }) {
    try {
        if (global.memoryUsers) delete global.memoryUsers[studentId];
        socket.emit('user_deleted_success', { studentId, message: '사용자가 성공적으로 삭제되었습니다.' });
    } catch (error) {
        logger.error(`Failed to delete user ${studentId}`, error);
        socket.emit('user_deleted_failure', { studentId, message: '사용자 삭제에 실패했습니다.' });
    }
}

async function deleteMultipleUsers(socket, { studentIds }) {
    if (!studentIds?.length) {
        return socket.emit('user_deleted_failure', { message: '삭제할 사용자 ID가 없습니다.' });
    }
    
    try {
        if (global.memoryUsers) studentIds.forEach(id => delete global.memoryUsers[id]);
        socket.emit('user_deleted_success', { message: `${studentIds.length}명의 사용자가 성공적으로 삭제되었습니다.` });
    } catch (error) {
        logger.error('Failed to delete multiple users', error);
        socket.emit('user_deleted_failure', { message: '여러 사용자 삭제에 실패했습니다.' });
    }
}

async function disconnect(io, socket, room, roomId, _supabase_ignored) {
    try {
        if (!room) return false;

        const playerInfo = room.players[socket.id];

        if (playerInfo) {
            const team = room.teams[playerInfo.team];
            if (team) {
                const member = team.members.find(m => m.id === socket.id);
                if (member) {
                    member.connected = false;
                }
            }
            broadcastTeamsUpdate(io, room, roomId);
        }

        if (socket.id === room.adminSocketId) {
            logger.warn(`[관리자 퇴장] ${roomId} 방 관리자 퇴장`);
            room.adminSocketId = null;
        }

        // Check if the room is now empty and should be deleted
        let connectedPlayersInRoom = 0;
        for (const team of Object.values(room.teams)) {
            connectedPlayersInRoom += team.members.filter(m => m.connected).length;
        }

        if (connectedPlayersInRoom === 0 && !room.adminSocketId) {
            // Start grace period timer if not already started
            if (!room.gracePeriodTimeout) {
                const GRACE_PERIOD_MS = (process.env.ROOM_GRACE_PERIOD_SECONDS || 60) * 1000;
                room.gracePeriodStartedAt = new Date().toISOString();

                logger.info(`[유예 기간 시작] 방 ${roomId}이(가) 모든 플레이어가 나간 후 ${GRACE_PERIOD_MS / 1000}초 후 삭제됩니다.`);

                const timeoutId = setTimeout(async () => {
                    try {
                        const store = require('../store');
                        await store.del(`room:${roomId}`);
                        logger.info(`[유예 기간 만료 삭제] 방 ${roomId}이(가) 스토어에서 삭제되었습니다.`);
                    } catch (storeError) {
                        logger.error(`[유예 기간 만료 - 삭제 중 예외 발생] ${roomId}`, storeError);
                    }
                }, GRACE_PERIOD_MS);

                // Make timeout non-enumerable to avoid circular reference in JSON.stringify
                Object.defineProperty(room, 'gracePeriodTimeout', {
                    value: timeoutId,
                    enumerable: false,
                    configurable: true,
                    writable: true
                });
            }

            return false; // Don't delete immediately, timer will handle it
        }

        return false; // Signal that the room state should be updated, not deleted
    } catch (error) {
        logger.error('연결 해제 처리 중 오류', error);
        return false;
    }
}

module.exports = {
    registerPlayer,
    joinGame,
    getRoomInfo,
    loginOrRegister,
    getUsers,
    deleteUser,
    deleteMultipleUsers,
    disconnect
};
