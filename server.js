const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const basicAuth = require('express-basic-auth');
const { rooms, generateRoomId, createNewGameState } = require('./game-logic/rooms');
const { 
    registerPlayer, 
    startPhase, 
    productionClick, 
    tradeSelection, 
    makeInvestment, 
    playRPS, 
    rerollRPS, 
    drawEvent, 
    playFinalRPS, 
    resetGame, 
    disconnect 
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
    users: { 'superadmin': process.env.SUPER_ADMIN_PASSWORD || 'superking' },
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

  socket.on('register_player', safeHandler(registerPlayer));
  socket.on('start_phase', safeHandler(startPhase));
  socket.on('production_click', safeHandler(productionClick));
  socket.on('trade_selection', safeHandler(tradeSelection));
  socket.on('make_investment', safeHandler(makeInvestment));
  socket.on('play_rps', safeHandler(playRPS));
  socket.on('reroll_rps', safeHandler(rerollRPS));
  socket.on('draw_event', safeHandler(drawEvent));
  socket.on('play_final_rps', safeHandler(playFinalRPS));
  socket.on('reset_game', safeHandler(resetGame));
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