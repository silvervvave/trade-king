require('dotenv').config();
console.log('[Server] 스크립트 시작');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const basicAuth = require('express-basic-auth');
const { countryConfig } = require('./config');
const { generateRoomId, createNewGameState } = require('./game-logic/rooms');
const supabase = require('./supabaseClient');
const { redisClient, initialize: initializeRedis } = require('./redisClient'); // Redis 클라이언트 및 초기화 함수 가져오기
const { 
    registerPlayer, 
    startPhase, 
    productionBatch, 
    tradeSelection, 
    makeInvestment, 
    playRPS, 
    rerollRPS, 
    drawEvent, 
    playFinalRPS, 
    rerollFinalRPS, 
    resetGame, 
    disconnect,
    endGame,
    resetTrade,
    resetInvestments,
    resetProduction,
    reconnectPlayer,
    loginOrRegister // <-- Add this
} = require('./game-logic/handlers');

const { validate } = require('./game-logic/validation');
const TimerManager = require('./game-logic/timer');

const app = express();
const server = http.createServer(app);

// 메모리 기반 roomStates 객체 제거

const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

const timerManager = new TimerManager(io);

// 주기적/일괄 저장 로직 (saveGameState, saveAllGameStates, setInterval) 제거

// 이벤트 큐 시스템은 유지 (동시성 문제 방지)
const roomQueues = {};

async function processQueue(roomId) {
    if (!roomQueues[roomId]) {
        roomQueues[roomId] = { queue: [], isProcessing: false };
    }
    if (roomQueues[roomId].isProcessing) return;

    const task = roomQueues[roomId].queue.shift();
    if (!task) return;

    roomQueues[roomId].isProcessing = true;
    try {
        await task();
    } catch (error) {
        console.error(`Error processing event for room ${roomId}:`, error);
    } finally {
        if (roomQueues[roomId]) {
            roomQueues[roomId].isProcessing = false;
            if (roomQueues[roomId].queue.length > 0) {
                processQueue(roomId);
            }
        }
    }
}

app.use('/super-admin', basicAuth({
    users: { 'superadmin': 'superadmin' },
    challenge: true,
    realm: 'Imb4T3st4pp',
}));

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// 라우트
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/super-admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'super-admin.html')));

// Socket.IO 연결 처리
let isShuttingDown = false;

io.on('connection', (socket) => {
  if (isShuttingDown) {
    socket.disconnect(true);
    return;
  }
  console.log(`새로운 연결: ${socket.id}`);

  // New login_or_register event handler
  socket.on('login_or_register', async (data) => {
    const validationResult = validate('login_or_register', data);
    if (!validationResult.success) {
        socket.emit('login_failure', { message: '유효하지 않은 학번 또는 이름 형식입니다.', errors: validationResult.error });
        return;
    }
    await loginOrRegister(socket, data, supabase, redisClient);
  });

  // Super Admin Key for authorization (for socket events)
  const SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_KEY;

  // Super Admin: Get Users List
  socket.on('get_users', async (data) => {
    if (data.superAdminKey !== SUPER_ADMIN_KEY) {
      socket.emit('error', { message: '권한이 없습니다.' });
      return;
    }
    const validationResult = validate('get_users', data);
    if (!validationResult.success) {
        socket.emit('error', { message: 'Invalid data', errors: validationResult.error });
        return;
    }
    await getUsers(socket, supabase);
  });

  // Super Admin: Delete User
  socket.on('delete_user', async (data) => {
    if (data.superAdminKey !== SUPER_ADMIN_KEY) {
      socket.emit('error', { message: '권한이 없습니다.' });
      return;
    }
    const validationResult = validate('delete_user', data);
    if (!validationResult.success) {
        socket.emit('error', { message: 'Invalid data', errors: validationResult.error });
        return;
    }
    await deleteUser(socket, data, supabase);
  });

  const safeHandler = (handler, eventName) => async (data, callback) => {
    const socket = this; // 'this' refers to the socket in socket.io event handlers
    if (isShuttingDown) {
      socket.emit('error', { message: '서버가 종료 중입니다.' });
      return;
    }

    // --- NEW TOKEN VALIDATION LOGIC ---
    const sessionToken = data?.token; // Assuming token is passed in data
    if (!sessionToken) {
        socket.emit('invalid_session', { message: '세션 토큰이 없습니다. 다시 로그인해주세요.' });
        return;
    }

    const sessionDataJSON = await redisClient.get(`session:${sessionToken}`);
    if (!sessionDataJSON) {
        socket.emit('invalid_session', { message: '유효하지 않거나 만료된 세션입니다. 다시 로그인해주세요.' });
        return;
    }
    const sessionData = JSON.parse(sessionDataJSON);
    // sessionData will contain { userId, studentId, name }
    // --- END NEW TOKEN VALIDATION LOGIC ---

    const validationResult = validate(eventName, data);
    if (!validationResult.success) {
        socket.emit('error', { message: 'Invalid data', errors: validationResult.error });
        return;
    }

    const roomId = data?.roomId || socket.roomId;
    if (!roomId) {
      socket.emit('error', { message: '요청에 방 ID가 포함되지 않았습니다.' });
      return;
    }

    if (!roomQueues[roomId]) {
        roomQueues[roomId] = { queue: [], isProcessing: false };
    }

    const task = async () => {
        try {
            // 1. Redis에서 현재 게임 상태를 가져옴
            const gameStateJSON = await redisClient.get(`room:${roomId}`);
            if (!gameStateJSON) {
                socket.emit('error', { message: '존재하지 않거나 종료된 방입니다. 다시 시작해주세요.', action: 'clear_session' });
                return;
            }
            let currentGameState = JSON.parse(gameStateJSON);

            // 2. 핸들러 실행 (게임 로직 처리)
            await handler(io, socket, data, currentGameState, roomId, sessionData); // <-- Pass sessionData
            
            // 3. 변경된 게임 상태를 다시 Redis에 저장
            // 타이머 객체는 순환 참조를 일으킬 수 있으므로 저장하지 않음
            if (currentGameState.timer) {
                delete currentGameState.timer.intervalId;
            }
            await redisClient.set(`room:${roomId}`, JSON.stringify(currentGameState));

        } catch (error) {
            console.error(`이벤트 처리 중 오류 (roomId: ${roomId}): ${error.message}`, error.stack);
            socket.emit('error', { message: '요청 처리 중 서버에서 오류가 발생했습니다.' });
        }
    };

    roomQueues[roomId].queue.push(task);
    if (!roomQueues[roomId].isProcessing) {
        processQueue(roomId);
    }
  };

  socket.on('create_room', async () => {
    try {
      const roomId = await generateRoomId(); // ID 중복 확인은 이제 Redis 사용
      const newGameState = createNewGameState();
      newGameState.adminSocketId = socket.id;

      // 2. Supabase에 방 정보와 초기 게임 상태 저장
      const { error } = await supabase.from('rooms').insert([
        { room_id: roomId, admin_socket_id: socket.id, game_state: newGameState }
      ]);

      if (error) {
        // Redis에 생성된 방 롤백
        await redisClient.del(`room:${roomId}`);
        throw new Error(`Supabase 오류: ${error.message}`);
      }

      socket.join(roomId);
      socket.roomId = roomId;
      console.log(`[방 생성] ${roomId} (관리자: ${socket.id}) - Redis에 저장됨`);
      socket.emit('room_created', { roomId });
    } catch (error) {
      console.error('방 생성 중 오류', error);
      socket.emit('error', { message: `방 생성 중 오류가 발생했습니다: ${error.message}` });
    }
  });

  socket.on('get_room_list', async () => {
    try {
      // Redis에서 모든 방 키를 가져옴
      const roomKeys = await redisClient.keys('room:*');
      if (roomKeys.length === 0) {
        socket.emit('room_list_update', []);
        return;
      }

      // 모든 방의 게임 상태를 한 번에 가져옴
      const gameStatesJSON = await redisClient.mGet(roomKeys);
      
      const roomList = gameStatesJSON.map((stateJSON, index) => {
        const gameState = JSON.parse(stateJSON);
        return {
          roomId: roomKeys[index].replace('room:', ''),
          playerCount: Object.keys(gameState.players).length,
          currentPhase: gameState.currentPhase,
          currentRound: gameState.currentRound,
          gameStarted: gameState.gameStarted
        };
      });

      socket.emit('room_list_update', roomList);
    } catch (error) {
      console.error('방 목록 가져오기 중 오류:', error);
      socket.emit('error', { message: '방 목록을 가져오는 중 오류가 발생했습니다.' });
    }
  });

  socket.on('force_close_room', async (data) => {
    const { roomId } = data;
    if (!roomId) return;

    try {
      io.to(roomId).emit('error', { message: '관리자에 의해 게임이 강제 종료되었습니다.' });

      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (socketsInRoom) {
        socketsInRoom.forEach(socketId => io.sockets.sockets.get(socketId)?.disconnect(true));
      }
      
      // Redis와 Supabase에서 방 삭제
      await redisClient.del(`room:${roomId}`);
      await supabase.from('rooms').delete().eq('room_id', roomId);
      
      delete roomQueues[roomId];
      console.warn(`[방 강제종료] ${roomId} 방이 슈퍼 관리자에 의해 삭제되었습니다.`);
    } catch (error) {
      console.error(`방 강제 종료 중 오류 (roomId: ${roomId}):`, error);
      socket.emit('error', { message: '방을 강제 종료하는 중 오류가 발생했습니다.' });
    }
  });

  socket.on('check_room', async (data) => {
    const { roomId, playerName } = data;
    try {
      const gameStateJSON = await redisClient.get(`room:${roomId}`);
      const roomExists = !!gameStateJSON;
      const teams = roomExists ? JSON.parse(gameStateJSON).teams : {};

      socket.emit('room_check_result', { exists: roomExists, roomId, playerName, countryConfig, teams });
    } catch (error) {
      console.error(`방 확인 중 오류 (roomId: ${roomId}):`, error);
      socket.emit('error', { message: '방 상태를 확인하는 중 오류가 발생했습니다.' });
    }
  });

  socket.on('reclaim_admin', async (data) => {
    const { roomId } = data;
    try {
        const gameStateJSON = await redisClient.get(`room:${roomId}`);
        if (!gameStateJSON) {
            socket.emit('admin_reclaimed', { success: false, message: '방이 존재하지 않습니다.' });
            return;
        }
        let gameState = JSON.parse(gameStateJSON);

        if (gameState.adminSocketId === null || !io.sockets.sockets.get(gameState.adminSocketId)) {
            gameState.adminSocketId = socket.id;

            await redisClient.set(`room:${roomId}`, JSON.stringify(gameState));
            await supabase.from('rooms').update({ admin_socket_id: socket.id }).eq('room_id', roomId);

            socket.join(roomId);
            socket.roomId = roomId;
            console.log(`[관리자 재확보] 방 ${roomId} (새 관리자: ${socket.id})`);
            socket.emit('admin_reclaimed', { success: true, roomId: roomId });
            socket.emit('game_state_update', gameState);
            io.to(roomId).emit('teams_update', { teams: gameState.teams });
        } else {
            socket.emit('admin_reclaimed', { success: false, message: '이미 다른 관리자가 이 방을 관리 중입니다.' });
        }
    } catch (error) {
        console.error(`관리자 재확보 중 오류 (roomId: ${roomId}):`, error);
        socket.emit('admin_reclaimed', { success: false, message: '오류가 발생했습니다.' });
    }
  });
  
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;

    if (!roomQueues[roomId]) {
        roomQueues[roomId] = { queue: [], isProcessing: false };
    }

    const task = async () => {
        try {
            const gameStateJSON = await redisClient.get(`room:${roomId}`);
            if (!gameStateJSON) {
                console.warn(`[연결 해제] Redis에 방 ${roomId}이(가) 없어 스킵합니다.`);
                delete roomQueues[roomId];
                return;
            }
            let gameState = JSON.parse(gameStateJSON);

            const roomWasDeleted = await disconnect(io, socket, gameState, roomId, supabase);

            if (roomWasDeleted) {
                timerManager.stop(roomId, gameState);
                await redisClient.del(`room:${roomId}`);
                await supabase.from('rooms').delete().eq('room_id', roomId);
                delete roomQueues[roomId];
                console.log(`[메모리 정리] 빈 방 ${roomId}의 상태를 Redis에서 삭제했습니다.`);
            } else {
                // 상태가 변경되었으므로 다시 저장
                await redisClient.set(`room:${roomId}`, JSON.stringify(gameState));
            }
            console.log(`[연결 해제] 소켓 ${socket.id} 처리 완료 (방: ${roomId})`);
        } catch (error) {
            console.error(`연결 해제 처리 중 오류 (roomId: ${roomId}):`, error);
        }
    };

    roomQueues[roomId].queue.push(task);
    if (!roomQueues[roomId].isProcessing) {
        processQueue(roomId);
    }
  });

  // 핸들러 등록
  socket.on('register_player', safeHandler(registerPlayer, 'register_player'));
  socket.on('start_phase', safeHandler(startPhase, 'start_phase'));
  socket.on('production_batch', safeHandler(productionBatch, 'production_batch'));
  socket.on('trade_selection', safeHandler(tradeSelection, 'trade_selection'));
  socket.on('make_investment', safeHandler(makeInvestment, 'make_investment'));
  socket.on('play_rps', safeHandler(playRPS, 'play_rps'));
  socket.on('reroll_rps', safeHandler(rerollRPS, 'reroll_rps'));
  socket.on('draw_event', safeHandler(drawEvent, 'draw_event'));
  socket.on('play_final_rps', safeHandler(playFinalRPS, 'play_final_rps'));
  socket.on('reroll_final_rps', safeHandler(rerollFinalRPS, 'reroll_final_rps'));
  socket.on('reset_game', safeHandler(resetGame, 'reset_game'));
  socket.on('end_game', safeHandler(endGame, 'end_game'));
  socket.on('reset_trade', safeHandler(resetTrade, 'reset_trade'));
  socket.on('reset_investments', safeHandler(resetInvestments, 'reset_investments'));
  socket.on('reset_production', safeHandler(resetProduction, 'reset_production'));
  socket.on('reconnect_player', safeHandler(reconnectPlayer, 'reconnect_player'));
  socket.on('start_timer', safeHandler((io, socket, data, gameState) => timerManager.start(socket.roomId, gameState, data.minutes, data.seconds), 'start_timer'));
  socket.on('stop_timer', safeHandler((io, socket, data, gameState) => timerManager.stop(socket.roomId, gameState), 'stop_timer'));
});

// 우아한 종료
async function handleShutdown(signal) {
  console.log(`
[서버 종료] ${signal} 신호 수신. 우아한 종료를 시작합니다.`);
  isShuttingDown = true;

  io.close(() => {
    console.log('[서버 종료] Socket.IO 연결이 모두 닫혔습니다.');
  });

  await redisClient.quit();
  console.log('[서버 종료] Redis 연결이 종료되었습니다.');
  
  console.log('[서버 종료] 모든 정리 작업이 완료되었습니다.');
  process.exit(0);
}

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

// 서버 시작 함수
async function startServer() {
  console.log('[Server] startServer 함수 진입');
  // Redis 연결을 먼저 기다림
  await initializeRedis();
  console.log('[Server] Redis 초기화 완료');

  server.listen(PORT, () => {
    console.log(`
========================================`);
    console.log(`나는 무역왕이 될거야! (Redis-powered)`);
    console.log(`========================================`);
    console.log(`포트: ${PORT}`);
    console.log(`학생용 주소: http://localhost:${PORT}`);
    console.log(`관리자용 주소: http://localhost:${PORT}/admin`);
    console.log(`========================================
`);
  });
}

// 서버 시작
console.log('[Server] 스크립트 마지막 줄, startServer 호출 직전');
startServer();