const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const basicAuth = require('express-basic-auth');
const { countryConfig } = require('./config');
const { rooms, generateRoomId, createNewGameState } = require('./game-logic/rooms');
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
    endGame
} = require('./game-logic/handlers');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Super-admin password protection
app.use('/super-admin', basicAuth({
    users: { 'superadmin': 'superadmin' },
    challenge: true,
    realm: 'Imb4T3st4pp',
}));

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// ============================================ 
// 라우트
// ============================================ 
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/super-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'super-admin.html'));
});

// ============================================ 
// Socket.IO 연결 처리
// ============================================ 
io.on('connection', (socket) => {
  console.log(`새로운 연결: ${socket.id}`);

  const safeHandler = (handler) => (data) => {
    try {
      const roomId = data?.roomId || socket.roomId;
      console.log(`[safeHandler] Checking for room: ${roomId}`);
      console.log(`[safeHandler] Room exists: ${!!rooms[roomId]}`);
      if (!roomId || !rooms[roomId]) {
        socket.emit('error', { message: '유효하지 않은 방입니다.' });
        return;
      }
      handler(io, socket, data, rooms[roomId], roomId);
    } catch (error) {
      console.error(`이벤트 처리 중 오류: ${error.message}`, error.stack);
      socket.emit('error', { message: '요청 처리 중 서버에서 오류가 발생했습니다.' });
    }
  };

  socket.on('create_room', (data) => {
    try {
      const roomId = generateRoomId();
      rooms[roomId] = createNewGameState();
      const room = rooms[roomId];
      room.adminSocketId = socket.id;
      socket.join(roomId);
      socket.roomId = roomId;
      console.log(`[방 생성] ${roomId} (관리자: ${socket.id})`);
      socket.emit('room_created', { roomId });
    } catch (error) {
      console.error('방 생성 중 오류', error);
    }
  });

  socket.on('get_room_list', () => {
    const roomList = Object.keys(rooms).map(roomId => {
      const room = rooms[roomId];
      return {
        roomId,
        playerCount: Object.keys(room.players).length,
        currentPhase: room.currentPhase,
        currentRound: room.currentRound,
        gameStarted: room.gameStarted
      };
    });
    socket.emit('room_list_update', roomList);
  });

  socket.on('force_close_room', (data) => {
    const { roomId } = data;
    const room = rooms[roomId];
    if (room) {
      io.to(roomId).emit('error', { message: '관리자에 의해 게임이 강제 종료되었습니다.' });
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (socketsInRoom) {
        socketsInRoom.forEach(socketId => {
          io.sockets.sockets.get(socketId).disconnect(true);
        });
      }
      delete rooms[roomId];
      console.warn(`[방 강제종료] ${roomId} 방이 슈퍼 관리자에 의해 종료되었습니다.`);
    }
  });

  socket.on('check_room', (data) => {
    const { roomId, playerName } = data;
    const roomExists = !!rooms[roomId];
    socket.emit('room_check_result', { exists: roomExists, roomId, playerName, countryConfig });
  });

  socket.on('reclaim_admin', (data) => {
    console.log(`[서버] 'reclaim_admin' 이벤트 수신: ${JSON.stringify(data)} (socket.id: ${socket.id})`);
    const { roomId } = data;
    const room = rooms[roomId];

    if (!room) {
      console.log(`[서버] 'reclaim_admin' 실패: 방 ${roomId} 존재하지 않음.`);
      socket.emit('admin_reclaimed', { success: false, message: '방이 존재하지 않습니다.' });
      return;
    }

    if (room.adminSocketId === null || !io.sockets.sockets.get(room.adminSocketId)) {
      room.adminSocketId = socket.id;
      socket.join(roomId);
      socket.roomId = roomId;
      console.log(`[관리자 재확보] 방 ${roomId} (새 관리자: ${socket.id})`);
      socket.emit('admin_reclaimed', { success: true, roomId: roomId });
      socket.emit('game_state_update', room.state);
      io.to(roomId).emit('teams_update', { teams: room.teams });
    } else {
      console.log(`[서버] 'reclaim_admin' 실패: 방 ${roomId}에 이미 관리자 ${room.adminSocketId} 있음.`);
      socket.emit('admin_reclaimed', { success: false, message: '이미 다른 관리자가 이 방을 관리 중입니다.' });
    }
  });

  // New event handler for transferring admin privileges
  socket.on('transfer_admin_privileges', (data) => {
    console.log(`[서버] 'transfer_admin_privileges' 이벤트 수신: ${JSON.stringify(data)} (socket.id: ${socket.id})`);
    const { roomId } = data;
    const room = rooms[roomId];

    if (!room) {
      console.log(`[서버] 'transfer_admin_privileges' 실패: 방 ${roomId} 존재하지 않음.`);
      socket.emit('admin_privileges_transferred', { success: false, message: '방이 존재하지 않습니다.' });
      return;
    }

    // Check if there's an active admin
    if (room.adminSocketId && io.sockets.sockets.get(room.adminSocketId)) {
      // Notify the old admin that their privileges are being transferred
      io.to(room.adminSocketId).emit('error', { message: '관리자 권한이 다른 기기로 인계되었습니다.' });
      console.log(`[관리자 권한 인계] 이전 관리자 ${room.adminSocketId}에게 알림.`);
    }

    room.adminSocketId = socket.id;
    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`[관리자 권한 인계] 방 ${roomId} (새 관리자: ${socket.id})`);
    socket.emit('admin_privileges_transferred', { success: true, roomId: roomId });
    // Send current game state to the new admin
    socket.emit('game_state_update', room.state);
    io.to(roomId).emit('teams_update', { teams: room.teams }); // Update all clients in the room
  });

  socket.on('register_player', safeHandler(registerPlayer));
  socket.on('start_phase', safeHandler(startPhase));
  socket.on('production_batch', safeHandler(productionBatch));
  socket.on('trade_selection', safeHandler(tradeSelection));
  socket.on('make_investment', safeHandler(makeInvestment));
  socket.on('play_rps', safeHandler(playRPS));
  socket.on('reroll_rps', safeHandler(rerollRPS));
  socket.on('draw_event', safeHandler(drawEvent));
  socket.on('play_final_rps', safeHandler(playFinalRPS));
  socket.on('reroll_final_rps', safeHandler(rerollFinalRPS));
  socket.on('reset_game', safeHandler(resetGame));
  socket.on('end_game', safeHandler(endGame));

  socket.on('start_timer', (data) => {
    const { roomId, minutes, seconds } = data;
    const room = rooms[roomId];
    if (!room || (socket.id !== room.adminSocketId)) return;

    if (room.timer.intervalId) {
        clearInterval(room.timer.intervalId);
    }

    room.timer.running = true;
    room.timer.minutes = minutes;
    room.timer.seconds = seconds;
    let totalSeconds = (minutes * 60) + seconds;

    room.timer.intervalId = setInterval(() => {
        if (totalSeconds <= 0) {
            clearInterval(room.timer.intervalId);
            room.timer.running = false;
            io.to(roomId).emit('timer_ended');
            return;
        }
        totalSeconds--;
        room.timer.minutes = Math.floor(totalSeconds / 60);
        room.timer.seconds = totalSeconds % 60;
        io.to(roomId).emit('timer_update', { 
            minutes: room.timer.minutes, 
            seconds: room.timer.seconds 
        });
    }, 1000);
  });

  socket.on('stop_timer', (data) => {
      const { roomId } = data;
      const room = rooms[roomId];
      if (!room || (socket.id !== room.adminSocketId)) return;

      if (room.timer.intervalId) {
          clearInterval(room.timer.intervalId);
          room.timer.intervalId = null;
          room.timer.running = false;
      }
  });

  socket.on('disconnect', () => disconnect(io, socket, rooms[socket.roomId], socket.roomId));
});

// ============================================ 
// 서버 시작
// ============================================ 
server.listen(PORT, () => {
  console.log(`
========================================`);
  console.log(`나는 무역왕이 될거야! 개선된 서버 실행 중`);
  console.log(`========================================`);
  console.log(`포트: ${PORT}`);
  console.log(`
학생용 주소: http://localhost:${PORT}`);
  console.log(`관리자용 주소: http://localhost:${PORT}/admin`);
  console.log(`슈퍼관리자용 주소: http://localhost:${PORT}/super-admin`);
  console.log(`
로컬 네트워크에서 접속하려면:`);
  console.log(`학생용: http://[서버IP]:${PORT}`);
  console.log(`관리자용: http://[서버IP]:${PORT}/admin`);
  console.log(`========================================
`);
});

// ============================================ 
// 에러 핸들링
// ============================================ 
process.on('uncaughtException', (err) => {
  console.error('예상치 못한 에러', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('처리되지 않은 Promise 거부', reason);
});