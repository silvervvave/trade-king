const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const ADMIN_SOCKET = io(SERVER_URL);
const PLAYER_SOCKET = io(SERVER_URL);

let roomId = null;

console.log('Starting verification script...');

// 1. Admin creates a room
ADMIN_SOCKET.on('connect', () => {
    console.log('[Admin] Connected');
    ADMIN_SOCKET.emit('create_room');
});

ADMIN_SOCKET.on('room_created', (data) => {
    console.log(`[Admin] Room created: ${data.roomId}`);
    roomId = data.roomId;

    // 2. Player joins the room
    PLAYER_SOCKET.connect();
});

PLAYER_SOCKET.on('connect', () => {
    console.log('[Player] Connected');
    if (roomId) {
        joinGame();
    } else {
        // Wait for room creation if player connects first (unlikely due to flow)
        const checkInterval = setInterval(() => {
            if (roomId) {
                clearInterval(checkInterval);
                joinGame();
            }
        }, 100);
    }
});

function joinGame() {
    console.log(`[Player] Joining room ${roomId}...`);
    PLAYER_SOCKET.emit('join_game', {
        roomId: roomId,
        studentId: 'test_auto_01',
        name: 'AutoTester',
        country: 'england' // Add country here
    });
}

let playerJoined = false;

PLAYER_SOCKET.on('game_state_update', (state) => {
    console.log('[Player] Game state update received');

    if (!playerJoined) {
        // First game_state_update after joining
        playerJoined = true;
        console.log('[Player] Joined room successfully');

        // 3. Admin starts the game
        console.log('[Admin] Starting production phase...');
        ADMIN_SOCKET.emit('start_phase', {
            roomId: roomId,
            phase: 'production'
        });
    } else if (state.currentPhase === 'production') {
        // Game started, now play RPS
        console.log('[Player] Production phase active, playing RPS...');
        PLAYER_SOCKET.emit('play_rps', {
            roomId: roomId,
            choice: '✊'  // Use emoji instead of 'rock'
        });
    }
});

PLAYER_SOCKET.on('rps_result', (result) => {
    console.log('[Player] RPS Result received:', result);
    console.log('✅ VERIFICATION SUCCESSFUL: Game flow working!');
    process.exit(0);
});

PLAYER_SOCKET.on('error', (err) => {
    console.error('[Player] Error:', err);
    process.exit(1);
});

ADMIN_SOCKET.on('error', (err) => {
    console.error('[Admin] Error:', err);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.error('❌ VERIFICATION TIMEOUT');
    process.exit(1);
}, 10000);
