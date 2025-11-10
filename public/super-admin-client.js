const socket = io();

socket.on('connect', () => {
    console.log('Super Admin으로 서버에 연결되었습니다.');
    updateConnectionStatus(true);
    
    // 3초마다 방 목록 요청
    setInterval(() => {
        socket.emit('get_room_list');
    }, 3000);
    socket.emit('get_room_list'); // 즉시 1회 실행
});

socket.on('disconnect', () => {
    console.log('서버 연결이 끊어졌습니다.');
    updateConnectionStatus(false);
});

socket.on('room_list_update', (roomList) => {
    const container = document.getElementById('roomListContainer');
    const countEl = document.getElementById('roomCount');
    container.innerHTML = '';
    countEl.textContent = roomList.length;

    if (roomList.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--color-text-light);">활성 룸이 없습니다.</p>';
        return;
    }

    roomList.forEach(room => {
        const card = document.createElement('div');
        card.className = 'room-card';
        
        const statusText = room.gameStarted ? `Round ${room.currentRound} - ${getPhaseKorean(room.currentPhase)}` : '대기중';

        card.innerHTML = `
            <div class="room-info">
                <span>ID: <strong>${room.roomId}</strong></span>
                <span>참가자: <strong>${room.playerCount}</strong>명</span>
                <span>상태: <strong>${statusText}</strong></span>
            </div>
            <div>
                <button class="admin-btn close-btn" onclick="forceCloseRoom('${room.roomId}')">강제 종료</button>
            </div>
        `;
        container.appendChild(card);
    });
});

function forceCloseRoom(roomId) {
    if (confirm(`정말로 ${roomId} 방을 강제 종료하시겠습니까? 방에 있는 모든 플레이어의 연결이 끊어집니다.`)) {
        socket.emit('force_close_room', { roomId });
    }
}
