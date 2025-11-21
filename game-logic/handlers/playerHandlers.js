const { createInitialTeamState } = require('../rooms');
const { countryConfig } = require('../../config');
const logger = require('../utils/logger');
const { _getPlayerAndTeam, broadcastTeamsUpdate } = require('./common');

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

async function joinGame(io, socket, data, redisClient, supabase) {
    const { roomId, studentId, name, country } = data;

    if (!country) {
        socket.emit('error', { message: '국가를 선택해야 합니다.' });
        return;
    }

    try {
        const gameStateJSON = await redisClient.get(`room:${roomId}`);
        if (!gameStateJSON) {
            socket.emit('room_not_found');
            logger.warn(`[Join Game] ${name} (${studentId}) tried to join non-existent room ${roomId}.`);
            return;
        }

        let gameState = JSON.parse(gameStateJSON);
        let foundPlayer = null;
        let playerTeam = null;
        let oldSocketId = null;

        // Check if player with studentId already exists in any team for reconnection
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
            // --- RECONNECTION LOGIC ---
            logger.info(`[재접속 - joinGame] ${name} (${studentId})님이 ${roomId} 방에 다시 연결합니다. (팀: ${playerTeam.country})`);

            if (oldSocketId && gameState.players[oldSocketId]) {
                delete gameState.players[oldSocketId];
            }

            foundPlayer.id = socket.id;
            foundPlayer.connected = true;
            foundPlayer.name = name; // Update name in case it changed
            gameState.players[socket.id] = { studentId: foundPlayer.studentId, name: foundPlayer.name, team: playerTeam.country };

            socket.join(roomId);
            socket.roomId = roomId;

            socket.emit('game_state_update', gameState);
            broadcastTeamsUpdate(io, gameState, roomId);
        } else {
            // --- NEW PLAYER JOIN LOGIC ---
            logger.info(`[신규 참가 - joinGame] ${name}(${studentId})님이 ${roomId} 방의 ${country} 팀에 참가합니다.`);

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
                // This case should not happen if the reconnection logic above is correct,
                // but as a safeguard, we handle it. It's more of a team change scenario.
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

        // Persist the updated state back to Redis
        await redisClient.set(`room:${roomId}`, JSON.stringify(gameState));

    } catch (error) {
        logger.error(`[Join Game 오류] Room: ${roomId}, User: ${name}`, error);
        socket.emit('error', { message: '게임에 참가하는 중 오류가 발생했습니다.' });
    }
}

function reconnectPlayer(io, socket, data, gameState, roomId) {
    // The studentId and name are now expected to be in the data object directly
    const { studentId, name } = data;

    let foundPlayer = null;
    let playerTeam = null;
    let oldSocketId = null;

    // Find the player and their old socket ID by studentId
    for (const team of Object.values(gameState.teams)) {
        const member = team.members.find(m => m.studentId === studentId); // Use studentId for identification
        if (member) {
            foundPlayer = member;
            playerTeam = team;
            oldSocketId = member.id; // The ID stored in the member object is the old socket ID
            break;
        }
    }

    if (foundPlayer && playerTeam) {
        // Clean up old player entry if it exists
        if (oldSocketId && gameState.players[oldSocketId]) {
            delete gameState.players[oldSocketId];
        }

        // Update player data with new socket ID
        foundPlayer.id = socket.id;
        foundPlayer.connected = true;
        gameState.players[socket.id] = { studentId: foundPlayer.studentId, name: foundPlayer.name, team: playerTeam.country }; // Store studentId

        socket.join(roomId);
        socket.roomId = roomId;

        logger.info(`[재접속] ${foundPlayer.name}님이 ${roomId} 방에 다시 연결되었습니다.`);

        // Send full state to reconnected client
        socket.emit('game_state_update', gameState);

        // Notify others
        io.to(roomId).emit('teams_update', { teams: gameState.teams });

    } else {
        // This case should ideally not be reached if safeHandler already validated the token
        // and the user is expected to be in a room.
        // However, if the user is authenticated but not in this specific room,
        // or if their team member entry was somehow removed, this handles it.
        socket.emit('error', { message: '인증된 사용자이지만, 이 방에서 플레이어 정보를 찾을 수 없습니다.' });
    }
}

async function getRoomInfo(io, socket, data, redisClient) {
    const { roomId, studentId, name } = data; // studentId and name are for logging

    try {
        const gameStateJSON = await redisClient.get(`room:${roomId}`);
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

async function loginOrRegister(socket, data, supabase) {
    const { studentId, name } = data;
    let newUserCreated = false;

    // Server-side validation
    const validInput = /^[a-zA-Z0-9가-힣]{1,20}$/;
    if (!studentId || !name || !validInput.test(studentId) || !validInput.test(name)) {
        socket.emit('login_failure', { message: '학번과 이름은 1~20자의 한글, 영문, 숫자만 가능합니다.' });
        return { newUserCreated: false };
    }

    try {
        // 1. Check if user exists
        const { data: existingUser, error: selectError } = await supabase
            .from('users')
            .select('id, student_id, name, country_stats')
            .eq('student_id', studentId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') { // PGRST116: row not found
            throw new Error(`Supabase select error: ${selectError.message}`);
        }

        let user = existingUser;

        if (user) {
            // 2. User exists, verify name
            if (user.name !== name) {
                socket.emit('login_failure', { message: '학번과 이름이 일치하지 않습니다.' });
                return { newUserCreated: false };
            }
        } else {
            // 3. User does not exist, create new user
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({ student_id: studentId, name: name })
                .select('id, student_id, name, country_stats')
                .single();

            if (insertError) {
                // Handle potential race condition where user was created between select and insert
                if (insertError.code === '23505') { // Unique violation
                    socket.emit('login_failure', { message: '이미 등록된 학번입니다. 이름이 정확한지 확인 후 다시 시도해주세요.' });
                    return { newUserCreated: false };
                }
                throw new Error(`Supabase insert error: ${insertError.message}`);
            }
            user = newUser;
            newUserCreated = true;
        }

        // 4. Emit success to client without token
        socket.emit('login_success', {
            studentId: user.student_id,
            name: user.name,
            countryStats: user.country_stats || {}
        });
        logger.info(`[로그인 성공] 학번: ${studentId}, 이름: ${name}`);
        return { newUserCreated };

    } catch (error) {
        logger.error('Login or registration failed', error);
        socket.emit('login_failure', { message: '서버 오류가 발생했습니다. 다시 시도해주세요.' });
        return { newUserCreated: false };
    }
}

async function getUsers(socket, supabase) {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('student_id, name, created_at')
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(`Supabase fetch users error: ${error.message}`);
        }

        socket.emit('users_list_update', users);
    } catch (error) {
        logger.error('Failed to get users list', error);
        socket.emit('error', { message: '사용자 목록을 가져오는 데 실패했습니다.' });
    }
}

async function deleteUser(socket, data, supabase) {
    const { studentId } = data;
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('student_id', studentId);

        if (error) {
            throw new Error(`Supabase delete user error: ${error.message}`);
        }

        socket.emit('user_deleted_success', { studentId, message: '사용자가 성공적으로 삭제되었습니다.' });
        logger.info(`[사용자 삭제] 학번: ${studentId}`);
    } catch (error) {
        logger.error(`Failed to delete user ${studentId}`, error);
        socket.emit('user_deleted_failure', { studentId, message: '사용자 삭제에 실패했습니다.' });
    }
}

async function deleteMultipleUsers(socket, data, supabase) {
    const { studentIds } = data;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return socket.emit('user_deleted_failure', { message: '삭제할 사용자 ID가 없습니다.' });
    }

    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .in('student_id', studentIds);

        if (error) {
            throw new Error(`Supabase multi-delete user error: ${error.message}`);
        }

        const successMsg = `${studentIds.length}명의 사용자가 성공적으로 삭제되었습니다.`;
        socket.emit('user_deleted_success', { message: successMsg });
        logger.info(`[다중 사용자 삭제] 학번: ${studentIds.join(', ')}`);
    } catch (error) {
        logger.error(`Failed to delete multiple users`, error);
        socket.emit('user_deleted_failure', { message: '여러 사용자 삭제에 실패했습니다.' });
    }
}

async function disconnect(io, socket, room, roomId, supabase) {
    try {
        if (!room) return false;

        const playerInfo = room.players[socket.id];

        if (playerInfo) {
            const team = room.teams[playerInfo.team];
            if (team) {
                const member = team.members.find(m => m.id === socket.id);
                if (member) {
                    member.connected = false;
                    // Do NOT delete from room.players immediately. Reconnect will update it.
                    // delete room.players[socket.id]; // Removed this line
                }
            }
            // The player entry in room.players will be updated by reconnectPlayer or cleaned up if the room is deleted.
            // io.to(roomId).emit('player_disconnected', { playerName: playerInfo.name }); // This emit might need adjustment if player is not fully gone
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
            try {
                const { error } = await supabase.from('rooms').delete().eq('room_id', roomId);
                if (error) {
                    logger.error(`[DB 삭제 실패] ${roomId}`, error);
                } else {
                    logger.info(`[DB 삭제] ${roomId} 방이 비어서 데이터베이스에서 삭제됨`);
                }
            } catch (dbError) {
                logger.error(`[DB 삭제 중 예외 발생] ${roomId}`, dbError);
            }
            return true; // Always signal for memory cleanup if room is empty
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
    reconnectPlayer,
    getRoomInfo,
    loginOrRegister,
    getUsers,
    deleteUser,
    deleteMultipleUsers,
    disconnect
};
