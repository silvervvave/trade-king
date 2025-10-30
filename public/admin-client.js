const socket = io();
let adminRoomId = null;

socket.on('connect', () => {
    console.log('관리자로 서버에 연결되었습니다.');
    updateConnectionStatus(true);
});

// 방 생성 요청
function createRoom() {
    socket.emit('create_room');
}

// 방 생성 완료 이벤트
socket.on('room_created', (data) => {
    adminRoomId = data.roomId;
    console.log(`방 ${adminRoomId} 생성 완료`);
    
    document.getElementById('roomCodeDisplay').textContent = adminRoomId;
    document.getElementById('roomCreationSection').classList.add('hidden');
    document.getElementById('mainDashboard').classList.remove('hidden');
    
    showNotification(`방 ${adminRoomId} 생성 완료! 학생들에게 코드를 공유하세요.`);
});

socket.on('disconnect', () => {
    console.log('서버 연결이 끊어졌습니다.');
    updateConnectionStatus(false);
    alert('서버와의 연결이 끊어졌습니다. 페이지를 새로고침 해주세요.');
});

socket.on('game_state_update', (state) => {
    console.log('게임 상태 업데이트:', state);
    updateAdminDashboard(state);
});

socket.on('teams_update', (data) => {
    updateTeamsDisplay(data.teams || {});
});

socket.on('player_trade_selection', (data) => {
    console.log(`${data.playerName}의 무역 선택:`, data.selection);
    addTradeLog(data);
});

// roomId가 필요한 요청을 위한 래퍼 함수
function withRoomId(func) {
    return (...args) => {
        if (!adminRoomId) {
            return alert('방이 생성되지 않았습니다.');
        }
        func(adminRoomId, ...args);
    };
}

// ============================================
// 🆕 헬퍼 함수
// ============================================

/**
 * Room ID 기반 액션 생성 헬퍼
 * @param {string} eventName - 발생시킬 이벤트 이름
 * @param {string|null} confirmMessage - 확인 메시지 (선택)
 * @param {Function|null} dataBuilder - 추가 데이터 생성 함수 (선택)
 */
function createRoomAction(eventName, confirmMessage = null, dataBuilder = null) {
  return withRoomId((roomId) => {
    // 확인 메시지가 있으면 먼저 물어봄
    if (confirmMessage && !confirm(confirmMessage)) {
      return;
    }

    // 기본 데이터
    const data = { roomId };

        // 추가 데이터가 필요한 경우
        if (dataBuilder) {
            try {
                Object.assign(data, dataBuilder());
            } catch (error) {
                showNotification('입력값을 확인해주세요.');
                return;
            }
        }

    // 이벤트 발생
    socket.emit(eventName, data);

    // 성공 알림
    const actionName = eventName.replace(/_/g, ' ');
    showNotification(`${actionName} 완료`);
  });
}


// 게임 시작 함수 - withRoomId 없이 직접 정의
function startPhase(phase) {
    if (!adminRoomId) {
        return alert('방이 생성되지 않았습니다.');
    }
    socket.emit('start_phase', { phase: phase, roomId: adminRoomId });
}

const endGame = createRoomAction(
  'end_game',
  '정말로 게임을 종료하시겠습니까?'
);

const startTimer = withRoomId((roomId) => {
    const minutes = parseInt(document.getElementById('timerMinutes').value) || 0;
    const seconds = parseInt(document.getElementById('timerSeconds').value) || 0;
    socket.emit('start_timer', { minutes, seconds, roomId: roomId });
    showNotification('타이머 시작!');
});

const stopTimer = createRoomAction('stop_timer');

const resetGame = createRoomAction(
  'reset_game',
  '게임을 리셋하시겠습니까? 모든 데이터가 초기화됩니다.'
);

const resetTimer = withRoomId((roomId) => {
    socket.emit('stop_timer', { roomId: roomId });
    document.getElementById('timerDisplay').textContent = '00:00';
    showNotification('타이머 리셋');
});

const resetProduction = withRoomId((roomId) => {
    if (confirm('모든 팀의 생산 및 가위바위보 상태를 초기화하시겠습니까?')) {
        socket.emit('reset_production', { roomId: roomId });
    showNotification('생산 상태가 초기화되었습니다.');
    }
});

socket.on('timer_update', (data) => {
    const timeString = `${String(data.minutes).padStart(2, '0')}:${String(data.seconds).padStart(2, '0')}`;
    document.getElementById('timerDisplay').textContent = timeString;
});

socket.on('timer_ended', () => {
    showNotification('타이머 종료!');
    playSound();
});

socket.on('player_disconnected', (data) => {
    showNotification(`${data.playerName}님이 연결을 종료했습니다.`);
});

// 관리자 대시보드 업데이트
function updateAdminDashboard(state) {
    document.getElementById('currentRound').textContent = state.currentRound > 0 ? `라운드 ${state.currentRound}` : '대기중';
    document.getElementById('currentPhase').textContent = getPhaseKorean(state.currentPhase);
    
    const gameStartSection = document.getElementById('gameStartSection');
    const tradeControlSection = document.getElementById('tradeControlSection');
    
    if (state.gameStarted) {
        gameStartSection.classList.add('hidden');
        tradeControlSection.classList.remove('hidden');
    } else {
        gameStartSection.classList.remove('hidden');
        tradeControlSection.classList.add('hidden');
    }
}

// 플레이어 목록 표시
function updateTeamsDisplay(teams) {
    const tradeStatusContainer = document.getElementById('tradeStatusContainer');
    const arrivalContainer = document.getElementById('playersContainer');

    if (Object.keys(teams).length === 0) {
        tradeStatusContainer.classList.add('hidden');
        arrivalContainer.classList.add('hidden');
        return;
    }

    const currentPhase = document.getElementById('currentPhase').textContent;

    if (currentPhase === '무역' || currentPhase === '투자') {
        tradeStatusContainer.classList.remove('hidden');
        arrivalContainer.classList.add('hidden');
        updateTradeStatus(teams);
    } else if (currentPhase === '입항') {
        tradeStatusContainer.classList.add('hidden');
        arrivalContainer.classList.remove('hidden');
        updateArrivalStatus(teams);
    } else {
        tradeStatusContainer.classList.add('hidden');
        arrivalContainer.classList.add('hidden');
    }
}

function updateTradeStatus(teams) {
    const container = document.querySelector('.trade-status-tower-container');
    container.innerHTML = '';

    const teamArray = Object.values(teams);
    teamArray.sort((a, b) => a.name.localeCompare(b.name));

    teamArray.forEach(team => {
        const card = document.createElement('div');
        card.className = 'team-trade-status-card';

        const tradeSelection = team.tradeSelection;
        const tradeStatus = tradeSelection ? `${tradeSelection.type === 'china' ? '중국' : '인도'} / ${tradeSelection.amount} PA` : '미정';
        const investmentStatus = team.investmentsMade.length > 0 ? `투자 ${team.investmentsMade.length}건` : '미정';

        card.innerHTML = `
            <h4>${team.name}</h4>
            <p><strong>무역:</strong> <span class="status-indicator-box ${tradeSelection ? 'completed' : ''}">${tradeStatus}</span></p>
            <p><strong>투자:</strong> <span class="status-indicator-box ${team.investmentsMade.length > 0 ? 'completed' : ''}">${investmentStatus}</span></p>
        `;
        container.appendChild(card);
    });
}

function updateArrivalStatus(teams) {
    const container = document.getElementById('playersList');
    container.innerHTML = '';

    const teamArray = Object.values(teams);
    teamArray.sort((a, b) => a.name.localeCompare(b.name));

    teamArray.forEach(team => {
        const card = document.createElement('div');
        card.className = 'arrival-status-container';

        const eventStatus = team.eventDrawnThisRound ? '오픈 완료' : '대기중';
        const rpsStatus = team.finalRpsPlayedThisRound ? '플레이 완료' : '대기중';

        card.innerHTML = `
            <div class="arrival-box">
                <h4>${team.name} - 이벤트</h4>
                <p class="status-indicator-box ${team.eventDrawnThisRound ? 'completed' : ''}">${eventStatus}</p>
            </div>
            <div class="arrival-box">
                <h4>${team.name} - 가위바위보</h4>
                <p class="status-indicator-box ${team.finalRpsPlayedThisRound ? 'completed' : ''}">${rpsStatus}</p>
            </div>
        `;
        container.appendChild(card);
    });
}


