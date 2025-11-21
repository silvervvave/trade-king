require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const basicAuth = require('express-basic-auth');
const logger = require('./game-logic/utils/logger');
const { countryConfig } = require('./config'); // may be used elsewhere
const { generateRoomId, createNewGameState } = require('./game-logic/rooms');
const { redisClient } = require('./game-logic/redisClient');
const playerHandlers = require('./game-logic/handlers/playerHandlers');
const tradeHandlers = require('./game-logic/handlers/tradeHandlers');
const productionHandlers = require('./game-logic/handlers/productionHandlers');
const eventHandlers = require('./game-logic/handlers/eventHandlers');
const adminHandlers = require('./game-logic/handlers/adminHandlers');
const rankingHandlers = require('./game-logic/handlers/rankingHandlers');
const { withGameState } = require('./game-logic/utils/gameStateUtil');

// Global error handling for unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Validate required environment variables (REDIS_URL optional)
function validateEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_KEY'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    logger.error('Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}
validateEnv();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createSupabaseClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Admin authentication
app.use('/super-admin', basicAuth({
  users: { 'admin': 'superadmin' },
  challenge: true,
  realm: 'Imb4T3st4pp',
}));

app.get('/super-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'super-admin.html'));
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
  socket.on('join_game', (data) => safeHandler(io, socket, playerHandlers.joinGame, data, redisClient, supabase));

  socket.on('reconnect_player', async (data) => {
    const { roomId } = data;
    const result = await withGameState(roomId, (gameState) => {
      playerHandlers.reconnectPlayer(io, socket, data, gameState, roomId);
    });
    if (result === null) socket.emit('room_not_found');
  });

  socket.on('check_room_exists', async (data, callback) => {
    try {
      const { roomId } = data;
      const exists = await redisClient.exists(`room:${roomId}`);
      if (callback) callback({ exists: !!exists });
      else socket.emit('room_check_result', { exists: !!exists, roomId });
    } catch (error) {
      logger.error('Error in check_room_exists:', error);
      if (callback) callback({ exists: false, error: 'Server error' });
    }
  });

  socket.on('get_room_info', (data) => safeHandler(io, socket, playerHandlers.getRoomInfo, data, redisClient));

  socket.on('login_or_register', async (data) => {
    await playerHandlers.loginOrRegister(socket, data, supabase);
  });

  socket.on('register_player', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      playerHandlers.registerPlayer(io, socket, data, gameState, roomId);
    });
  });

  // --- Admin Handlers ---
  socket.on('create_room', async (callback) => {
    try {
      const roomId = await generateRoomId();
      const gameState = createNewGameState();
      gameState.adminSocketId = socket.id;
      await redisClient.set(`room:${roomId}`, JSON.stringify(gameState));
      const { error } = await supabase.from('rooms').insert([{ room_id: roomId, game_state: gameState }]);
      if (error) {
        logger.error('DB Insert Error:', error);
        throw new Error('Supabase insert failed');
      }
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
      await adminHandlers.endGame(io, socket, data, gameState, roomId, redisClient, supabase);
    });
  });

  socket.on('reset_production', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      adminHandlers.resetProduction(io, socket, data, gameState, roomId);
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

  socket.on('reroll_rps', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      productionHandlers.rerollRPS(io, socket, data, gameState, roomId);
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

  socket.on('reroll_final_rps', async (data) => {
    const { roomId } = socket;
    if (!roomId) return;
    await withGameState(roomId, (gameState) => {
      eventHandlers.rerollFinalRPS(io, socket, data, gameState, roomId);
    });
  });

  // --- Super Admin Rankings ---
  socket.on('get_rankings', async () => {
    await rankingHandlers.getRankings(socket, supabase);
  });

  // --- Disconnect ---
  socket.on('disconnect', async () => {
    const roomId = socket.roomId;
    if (roomId) {
      try {
        const gameStateJSON = await redisClient.get(`room:${roomId}`);
        if (gameStateJSON) {
          const gameState = JSON.parse(gameStateJSON);
          const shouldDelete = await playerHandlers.disconnect(io, socket, gameState, roomId, supabase);

          // Only delete from Redis if explicitly told to (not when grace period is active)
          if (shouldDelete) {
            await redisClient.del(`room:${roomId}`);
            logger.info(`[즉시 삭제] ${roomId} 방이 Redis에서 삭제되었습니다.`);
          } else {
            // Update Redis state (grace period timer might be running)
            await redisClient.set(`room:${roomId}`, JSON.stringify(gameState));
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
    await redisClient.connect();
  } catch (err) {
    logger.error('Failed to connect to Redis (continuing without Redis):', err);
    // Continue without exiting; Redis-dependent features will fail gracefully.
  }
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

startServer();
