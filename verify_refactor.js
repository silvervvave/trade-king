const io = require('socket.io-client');

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected to server');

    // 1. Create Room
    socket.emit('create_room', (response) => {
        if (response.success) {
            const roomId = response.roomId;
            console.log(`Room created: ${roomId}`);

            // 2. Join Game
            const joinData = {
                roomId: roomId,
                studentId: 'test1234',
                name: 'Tester',
                country: 'england'
            };

            socket.emit('join_game', joinData);
        } else {
            console.error('Failed to create room');
            process.exit(1);
        }
    });
});

socket.on('game_state_update', (state) => {
    console.log('Game state updated');
    if (state.teams && state.teams['england']) {
        console.log('Joined team England successfully');

        // 3. Test Trade Selection (uses withGameState)

        const tradeData = {
            type: 'none',
            amount: 0
        };

        console.log('Sending trade_selection...');
        socket.emit('trade_selection', tradeData);
    }
});

socket.on('team_update', (team) => {
    console.log('Team update received');
    if (team.tradeSelection) {
        console.log('Trade selection successful! withGameState is working.');
        console.log('Selection:', team.tradeSelection);
        socket.disconnect();
        process.exit(0);
    }
});

socket.on('error', (err) => {
    console.error('Socket error:', err);
});

setTimeout(() => {
    console.log('Timeout');
    process.exit(1);
}, 5000);
