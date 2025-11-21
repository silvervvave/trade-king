const io = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
const ADMIN_SOCKET = io(SERVER_URL);

let roomId = null;

console.log('타이머 테스트 시작...\n');

ADMIN_SOCKET.on('connect', () => {
    console.log('[관리자] 연결됨');
    ADMIN_SOCKET.emit('create_room');
});

ADMIN_SOCKET.on('room_created', (data) => {
    console.log(`[관리자] 방 생성됨: ${data.roomId}\n`);
    roomId = data.roomId;

    // 5초 타이머 시작
    console.log('[관리자] 타이머 시작: 0분 5초\n');
    ADMIN_SOCKET.emit('start_timer', {
        roomId: roomId,
        minutes: 0,
        seconds: 5
    });
});

ADMIN_SOCKET.on('timer_update', (time) => {
    const timeString = `${String(time.minutes).padStart(2, '0')}:${String(time.seconds).padStart(2, '0')}`;
    console.log(`[타이머 업데이트] ${timeString}`);
});

ADMIN_SOCKET.on('timer_ended', () => {
    console.log('\n✅ [타이머 종료] 타이머가 정상적으로 종료되었습니다!');
    console.log('테스트 성공!\n');
    process.exit(0);
});

ADMIN_SOCKET.on('error', (err) => {
    console.error('[에러]', err);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.error('\n❌ 타이머 테스트 타임아웃 (10초)');
    process.exit(1);
}, 10000);
