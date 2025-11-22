

const socket = io();

// The generic 'connect' event is handled in socket.js.
// This handler is for super-admin-specific logic that runs on connection.

// TODO: For production, this key should be securely fetched or managed, not hardcoded.
const SUPER_ADMIN_KEY = 'superadmin';

socket.on('connect', () => {
    console.log('Super Admin 클라이언트 연결됨.');

    // 서버의 전용 룸에 참가하여 실시간 업데이트를 구독
    socket.emit('join_super_admin_room');

    // 초기 데이터 로드를 위해 한 번만 요청
    socket.emit('get_room_list');
    socket.emit('get_users', { superAdminKey: SUPER_ADMIN_KEY });
});

// The generic 'disconnect' event is handled in socket.js.

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

socket.on('users_list_update', (users) => {
    const container = document.getElementById('userListContainer');
    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--color-text-light);">등록된 사용자가 없습니다.</p>';
        return;
    }

    users.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card'; // Use new user-card class

        const createdAt = new Date(user.created_at).toLocaleString();

        card.innerHTML = `
            <div class="user-info">
                <input type="checkbox" class="user-checkbox" data-studentid="${user.student_id}">
                <span>학번: <strong>${user.student_id}</strong></span>
                <span>이름: <strong>${user.name}</strong></span>
                <span>등록일: <strong>${createdAt}</strong></span>
            </div>
            <div>
                <button class="admin-btn close-btn" onclick="deleteUser('${user.student_id}')">삭제</button>
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

function deleteUser(studentId) {
    if (confirm(`정말로 학번 ${studentId} 사용자를 삭제하시겠습니까?`)) {
        socket.emit('delete_user', { studentId, superAdminKey: SUPER_ADMIN_KEY }); // Include key
    }
}

// 방 강제 종료 성공 시 목록 즉시 갱신
socket.on('room_closed_success', (data) => {
    console.log(`[클라이언트] ${data.roomId} 방 강제 종료 완료. 목록을 새로고침합니다.`);
    showNotification(`${data.roomId} 방이 종료되었습니다.`);
    socket.emit('get_room_list');
});

// 단일 또는 다중 사용자 삭제 성공 시 목록 즉시 갱신
socket.on('user_deleted_success', (data) => {
    const message = data.message || `${data.studentId} 사용자가 삭제되었습니다.`;
    console.log(`[클라이언트] 사용자 삭제 완료. 메시지: ${message}`);
    showNotification(message);
    socket.emit('get_users', { superAdminKey: SUPER_ADMIN_KEY });
});


document.addEventListener('DOMContentLoaded', () => {
    const deleteSelectedBtn = document.getElementById('deleteSelectedUsersBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            const selectedCheckboxes = document.querySelectorAll('.user-checkbox:checked');
            const studentIdsToDelete = Array.from(selectedCheckboxes).map(cb => cb.dataset.studentid);

            if (studentIdsToDelete.length === 0) {
                showNotification('삭제할 사용자를 선택해주세요.');
                return;
            }

            if (confirm(`정말로 선택된 ${studentIdsToDelete.length}명의 사용자를 삭제하시겠습니까?`)) {
                socket.emit('delete_multiple_users', { studentIds: studentIdsToDelete, superAdminKey: SUPER_ADMIN_KEY });
            }
        });
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('click', (event) => {
            const allCheckboxes = document.querySelectorAll('.user-checkbox');
            allCheckboxes.forEach(checkbox => {
                checkbox.checked = event.target.checked;
            });
        });
    }
});


