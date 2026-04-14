require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
// @supabase/supabase-js 제거됨
const basicAuth = require('express-basic-auth');
const logger = require('./game-logic/utils/logger');
const { countryConfig } = require('./config'); // may be used elsewhere
const { generateRoomId, createNewGameState } = require('./game-logic/rooms');
const store = require('./game-logic/store');
const playerHandlers = require('./game-logic/handlers/playerHandlers');
const tradeHandlers = require('./game-logic/handlers/tradeHandlers');
const productionHandlers = require('./game-logic/handlers/productionHandlers');
const eventHandlers = require('./game-logic/handlers/eventHandlers');
const adminHandlers = require('./game-logic/handlers/adminHandlers');
// 랭킹 시스템 삭제됨
const superAdminHandlers = require('./game-logic/handlers/superAdminHandlers');
const TimerManager = require('./game-logic/timer');
const { withGameState } = require('./game-logic/utils/gameStateUtil');

// Global error handling for unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// validateEnv 제거됨

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for development/testing
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Timer manager
const timerManager = new TimerManager(io);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication
app.use('/super-admin', basicAuth({
  users: { 'superadmin': 'superadmin' },
  challenge: true,
  realm: 'Imb4T3st4pp',
}));

app.get('/super-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'super-admin.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API endpoint to get the country configuration
app.get('/api/config', (req, res) => {
  res.json(countryConfig);
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper to safely invoke handlers
const safeHandler = (io, socket, handler, ...args) => {
  try {
    handler(io, socket, ...args);
  } catch (error) {
    logger.error(`Error in handler for ${socket.id}:`, error);
    socket.emit('error', { message: 'Server error processing request' });
  }
};

io.on('connection', (socket) => {
  logger.info(`New client connected: ${socket.id}`);

  // --- Player Handlers ---
  socket.on('join_game', (data) => safeHandler(io, socket, playerHandlers.joinGame, data, store));

  // reconnect_player, register_player는 join_game으로 통합되어 제거되었습니다.
  // 재접속 시 join_game에 country: null을 전달하면 기존 팀으로 자동 복귀합니다.

  socket.on('check_room_exists', async (data, callback) => {
    try {
      const { roomId } = data;
      const exists = await store.exists(`room:${roomId}`);
      const response = { exists: !!exists, roomId };

      if (typeof callback === 'function') {
        callback(response);
      } else {
        socket.emit('room_check_result', response);
      }
    } catch (error) {
      logger.error('Error in check_room_exists:', error);
      const errorResponse = { exists: false, error: 'Server error checking room' };

      if (typeof callback === 'function') {
        callback(errorResponse);
      } else {
        socket.emit('room_check_result', errorResponse);
      }
    }
  });

  socket.on('get_room_info', (data) => safeHandler(io, socket, playerHandlers.getRoomInfo, data, store));

  socket.on('login_or_register', async (data) => {
    await playerHandlers.loginOrRegister(socket, data, store);
  });

  // --- Admin Handlers ---
  socket.on('create_room', async (callback) => {
    try {
      const roomId = await generateRoomId();
      const gameState = createNewGameState();
      gameState.adminSocketId = socket.id;
      await store.set(`room:${roomId}`, JSON.stringify(gameState));
      socket.join(roomId);
      socket.roomId = roomId;
      if (typeof callback === 'function') callback({ success: true, roomId });
      else socket.emit('room_created', { roomId });
      logger.info(`[Room Created] ${roomId}`);
    } catch (error) {
      logger.error('Error creating room:', error);
      if (typeof callback === 'function') callback({ success: false, message: error.message || 'Failed to create room' });
    }
  });

  socket.on('start_game', async () => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      if (gameState.adminSocketId === socket.id) {
        gameState.gameStarted = true;
        gameState.currentRound = 1;
        gameState.currentPhase = 'production';
        adminHandlers.startPhase(io, socket, { phase: 'production' }, gameState, roomId);
        io.to(roomId).emit('game_started');
      }
    });
  });

  socket.on('start_phase', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      adminHandlers.startPhase(io, socket, data, gameState, roomId);
    });
  });

  socket.on('reset_game', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      adminHandlers.resetGame(io, socket, data, gameState, roomId);
    });
  });

  socket.on('end_game', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, async (gameState) => {
      await adminHandlers.endGame(io, socket, data, gameState, roomId, store, null);
    });
  });

  socket.on('reset_production', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      adminHandlers.resetProduction(io, socket, data, gameState, roomId);
    });
  });

  socket.on('force_close_room', async (data) => {
    try {
      const { roomId } = data;
      if (!roomId) {
        socket.emit('error', { message: 'Room ID is required' });
        return;
      }

      // Delete from Memory
      await store.del(`room:${roomId}`);

      // Notify all clients in the room
      io.to(roomId).emit('room_closed_success', { roomId });

      // Disconnect all sockets in the room
      const socketsInRoom = await io.in(roomId).fetchSockets();
      for (const s of socketsInRoom) {
        s.leave(roomId);
        if (s.roomId === roomId) {
          s.roomId = null;
        }
      }

      logger.info(`[Room Deleted] ${roomId} by admin`);
    } catch (error) {
      logger.error('Error in force_close_room:', error);
      socket.emit('error', { message: 'Failed to close room' });
    }
  });

  socket.on('reclaim_admin', async (data) => {
    try {
      const { roomId } = data;
      if (!roomId) {
        socket.emit('admin_reclaimed', { success: false, message: 'Room ID is required' });
        return;
      }

      const gameStateJSON = await store.get(`room:${roomId}`);
      if (!gameStateJSON) {
        socket.emit('admin_reclaimed', { success: false, message: 'Room not found' });
        return;
      }

      const gameState = JSON.parse(gameStateJSON);
      gameState.adminSocketId = socket.id;
      await store.set(`room:${roomId}`, JSON.stringify(gameState));

      socket.join(roomId);
      socket.roomId = roomId;

      socket.emit('admin_reclaimed', { success: true, roomId });
      socket.emit('game_state_update', gameState);
      socket.emit('teams_update', { teams: gameState.teams });

      logger.info(`[Admin Reclaimed] ${roomId} by socket ${socket.id}`);
    } catch (error) {
      logger.error('Error in reclaim_admin:', error);
      socket.emit('admin_reclaimed', { success: false, message: 'Server error' });
    }
  });

  socket.on('start_timer', async (data) => {
    const { roomId, minutes, seconds } = data;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      timerManager.start(roomId, gameState, minutes, seconds);
    });
  });

  socket.on('stop_timer', async (data) => {
    const { roomId } = data;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      timerManager.stop(roomId, gameState);
    });
  });

  // --- Trade Handlers ---
  socket.on('trade_selection', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      tradeHandlers.tradeSelection(io, socket, data, gameState, roomId);
    });
  });

  socket.on('make_investment', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      tradeHandlers.makeInvestment(io, socket, data, gameState, roomId);
    });
  });

  socket.on('reset_trade', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      tradeHandlers.resetTrade(io, socket, data, gameState, roomId);
    });
  });

  socket.on('reset_investments', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      tradeHandlers.resetInvestments(io, socket, data, gameState, roomId);
    });
  });

  // --- Production Handlers ---
  socket.on('play_rps', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      productionHandlers.playRPS(io, socket, data, gameState, roomId);
    });
  });

  socket.on('complete_production_batch', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      productionHandlers.completeProductionBatch(io, socket, data, gameState, roomId);
    });
  });

  // --- Event Handlers (Arrival) ---
  socket.on('draw_event', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      eventHandlers.drawEvent(io, socket, data, gameState, roomId);
    });
  });

  socket.on('play_final_rps', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      eventHandlers.playFinalRPS(io, socket, data, gameState, roomId);
    });
  });

  // 랭킹 시스템 삭제됨

  // --- Super Admin Handlers ---
  socket.on('join_super_admin_room', () => {
    superAdminHandlers.joinSuperAdminRoom(socket);
  });

  socket.on('get_room_list', async () => {
    await superAdminHandlers.getRoomList(io);
  });

  socket.on('get_users', async () => {
    await superAdminHandlers.getUsers(io);
  });

  socket.on('delete_user', async (data) => {
    await superAdminHandlers.deleteUser(io, socket, data, null);
  });

  socket.on('delete_multiple_users', async (data) => {
    await superAdminHandlers.deleteMultipleUsers(io, socket, data, null);
  });

  // --- Disconnect ---
  socket.on('disconnect', async () => {
    const roomId = socket.roomId;
    if (roomId) {
      try {
        const gameStateJSON = await store.get(`room:${roomId}`);
        if (gameStateJSON) {
          const gameState = JSON.parse(gameStateJSON);
          const shouldDelete = await playerHandlers.disconnect(io, socket, gameState, roomId, null);

          // Only delete from store if explicitly told to (not when grace period is active)
          if (shouldDelete) {
            await store.del(`room:${roomId}`);
            logger.info(`[즉시 삭제] ${roomId} 방이 삭제되었습니다.`);
          } else {
            // Update store state (grace period timer might be running)
            await store.set(`room:${roomId}`, JSON.stringify(gameState));
          }
        }
      } catch (error) {
        logger.error('Error handling disconnect:', error);
      }
    }
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

async function startServer() {
  try {
    await store.connect();
  } catch (err) {
    logger.error('Failed to initialize memory store:', err);
  }
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

startServer();
