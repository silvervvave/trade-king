const supabase = require('../supabaseClient');

class TimerManager {
    constructor(io) {
        this.io = io;
        this.activeTimers = {}; // { roomId: intervalId }
    }

    start(roomId, gameState, initialMinutes, initialSeconds) {
        // Stop any existing timer for this room first
        this.stop(roomId, gameState);

        let totalSeconds = (initialMinutes * 60) + initialSeconds;
        if (totalSeconds <= 0) return;

        gameState.timer = {
            running: true,
            minutes: initialMinutes,
            seconds: initialSeconds,
        };

        // Emit initial timer state immediately
        this.io.to(roomId).emit('timer_update', {
            minutes: initialMinutes,
            seconds: initialSeconds
        });

        const intervalId = setInterval(() => {
            // Decrease first
            totalSeconds--;

            // Then check if timer ended
            if (totalSeconds <= 0) {
                this.stop(roomId, gameState);
                this.io.to(roomId).emit('timer_ended');
                return;
            }

            // Update state
            gameState.timer.minutes = Math.floor(totalSeconds / 60);
            gameState.timer.seconds = totalSeconds % 60;

            // Emit update
            this.io.to(roomId).emit('timer_update', {
                minutes: gameState.timer.minutes,
                seconds: gameState.timer.seconds
            });

        }, 1000);

        this.activeTimers[roomId] = intervalId;
        console.log(`[TimerManager] 방 ${roomId} 타이머 시작: ${initialMinutes}분 ${initialSeconds}초`);
    }

    stop(roomId, gameState) {
        const intervalId = this.activeTimers[roomId];
        if (intervalId) {
            clearInterval(intervalId);
            delete this.activeTimers[roomId];
            console.log(`[TimerManager] 방 ${roomId} 타이머 정지.`);
        }

        if (gameState && gameState.timer) {
            gameState.timer.running = false;
        }

        this.io.to(roomId).emit('timer_stopped');
    }
}

module.exports = TimerManager;
