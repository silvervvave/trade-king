const socket = io();
let adminRoomId = localStorage.getItem('adminRoomId') || null;
console.log(`[클라이언트] adminRoomId 초기값: ${adminRoomId}`);

document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('adminSidebar');
    const toggleButton = document.getElementById('adminSidebarToggle');
    const roomCodeModal = document.getElementById('roomCodeModal');
    const roomCodeInfoBox = document.getElementById('roomCodeInfoBox');
    const modalRoomCodeDisplay = document.getElementById('modalRoomCodeDisplay');

    // Set default timer values
    const timerMinutesInput = document.getElementById('timerMinutes');
    const timerSecondsInput = document.getElementById('timerSeconds');
    if (timerMinutesInput) timerMinutesInput.value = '1';
    if (timerSecondsInput) timerSecondsInput.value = '0';

    // Sidebar toggle
    toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('open') && !sidebar.contains(e.target)) {
            sidebar.classList.remove('open');
        }
    });

    // Room code modal toggle
    roomCodeInfoBox.addEventListener('click', () => {
        if (adminRoomId) {
            modalRoomCodeDisplay.textContent = adminRoomId;
            roomCodeModal.classList.remove('hidden');
        }
    });

    roomCodeModal.addEventListener('click', (e) => {
        if (e.target === roomCodeModal) {
            roomCodeModal.classList.add('hidden');
        }
    });

    const bannerLeft = document.getElementById('bannerLeft');
    if (bannerLeft) {
        bannerLeft.addEventListener('click', () => {
            window.location.reload();
        });
    }

    const reenterRoomBtn = document.getElementById('reenterRoomBtn');
    if (reenterRoomBtn) {
        reenterRoomBtn.addEventListener('click', () => {
            const roomIdInput = document.getElementById('reentryRoomCodeInput');
            const roomId = roomIdInput.value.trim().toUpperCase();

            if (!roomId) {
                showNotification('방 코드를 입력해주세요.');
                roomIdInput.focus();
                return;
            }
            if (!/^[A-Z0-9]{4}$/.test(roomId)) {
                showNotification('방 코드는 정확히 4자리 영문 대문자 또는 숫자여야 합니다.');
                roomIdInput.focus();
                return;
            }

            console.log(`[클라이언트] 'reclaim_admin' 이벤트 전송 시도: roomId=${roomId}`);
            socket.emit('reclaim_admin', { roomId: roomId });
        });
    }

    const createRoomBtn = document.getElementById('createRoomBtn');
    if (createRoomBtn) {
        createRoomBtn.addEventListener('click', () => {
            socket.emit('create_room', {});
        });
    }
});

// The generic 'connect' event is handled in socket.js.
// This handler is for admin-specific logic that runs on connection.
socket.on('connect', () => {
    console.log('관리자 클라이언트 연결됨. adminRoomId:', adminRoomId);
    if (adminRoomId) {
        console.log(`[클라이언트] 'reclaim_admin' 이벤트 전송 시도: roomId=${adminRoomId}`);
        socket.emit('reclaim_admin', { roomId: adminRoomId });
    } else {
        console.log('[클라이언트] 저장된 adminRoomId 없음. \'reclaim_admin\' 이벤트 전송 안 함.');
        document.getElementById('roomCreationSection').classList.remove('hidden');
        document.getElementById('roomReentrySection').classList.remove('hidden');
        document.getElementById('mainDashboard').classList.add('hidden');
    }
});

// 방 생성 완료 이벤트
socket.on('room_created', (data) => {
    adminRoomId = data.roomId;
    localStorage.setItem('adminRoomId', adminRoomId);
    console.log(`[클라이언트] 방 ${adminRoomId} 생성 완료 및 localStorage 저장.`);
    
    document.getElementById('bannerRoomCode').textContent = adminRoomId;
    document.getElementById('roomCreationSection').classList.add('hidden');
    document.getElementById('roomReentrySection').classList.add('hidden'); // Hide reentry section
    document.getElementById('mainDashboard').classList.remove('hidden');
    
    showNotification(`방 ${adminRoomId} 생성 완료! 학생들에게 코드를 공유하세요.`);
});

socket.on('admin_reclaimed', (data) => {
    console.log(`[클라이언트] 'admin_reclaimed' 이벤트 수신: ${JSON.stringify(data)}`);
    if (data.success) {
        adminRoomId = data.roomId;
        localStorage.setItem('adminRoomId', adminRoomId);
        console.log(`관리자 권한 재확보: 방 ${adminRoomId}`);
        showNotification(`관리자 권한을 재확보했습니다: 방 ${adminRoomId}`);
        document.getElementById('roomCreationSection').classList.add('hidden');
        document.getElementById('roomReentrySection').classList.add('hidden'); // Hide reentry section
        document.getElementById('mainDashboard').classList.remove('hidden');
        document.getElementById('bannerRoomCode').textContent = adminRoomId;
    } else {
        console.error('관리자 권한 재확보 실패:', data.message);
        showNotification(`관리자 권한 재확보 실패: ${data.message}`);
        localStorage.removeItem('adminRoomId');
        adminRoomId = null;
        // If reclaim fails, show room creation/reentry sections
        document.getElementById('roomCreationSection').classList.remove('hidden');
        document.getElementById('roomReentrySection').classList.remove('hidden');
        document.getElementById('mainDashboard').classList.add('hidden');
    }
});



socket.on('disconnect', () => {
    alert('서버와의 연결이 끊어졌습니다. 페이지를 새로고침 해주세요.');
});

socket.on('error', (data) => {
    console.error('서버 오류 수신:', data);
    showNotification(`오류: ${data.message || '알 수 없는 오류가 발생했습니다.'}`);
});

socket.on('game_state_update', (state) => {
    console.log('게임 상태 업데이트:', state);
    updateAdminDashboard(state);
});

socket.on('teams_update', (data) => {
    updateTeamsDisplay(data.teams || {});
});

socket.on('player_trade_selection', (data) => {
    console.log(`${data.playerName}의 출항 선택:`, data.selection);
    addTradeLog(data);
});

function addTradeLog(data) {
    const container = document.querySelector('.trade-status-tower-container');
    if (!container) return;

    const tradeType = data.selection.type === 'china' ? '중국' : (data.selection.type === 'india' ? '인도' : '출항 안 함');
    const amount = data.selection.amount ? `${data.selection.amount} PA` : '';

    const logEntry = document.createElement('div');
    logEntry.className = 'trade-log-entry';
    logEntry.innerHTML = `
        <p><strong>${data.playerName}</strong>: ${tradeType} ${amount}</p>
    `;
    container.prepend(logEntry); // Add to the top
}

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

socket.on('timer_stopped', () => {
    document.getElementById('timerDisplay').textContent = '00:00';
    showNotification('타이머가 정지되었습니다.');
});

socket.on('player_disconnected', (data) => {
    showNotification(`${data.playerName}님이 연결을 종료했습니다.`);
});

socket.on('arrival_summary', (data) => {
    const teamName = data.country; // In admin, we might not have the full config, so use the key
    let message = '';
    if (data.camusari) {
        message = `<strong>${teamName}:</strong> 카무사리 발생! (손실: ${data.profit} PA)`;
    } else {
        const goodsName = data.destination === 'china' ? '비단' : '후추';
        message = `<strong>${teamName}:</strong> ${goodsName} ${data.goodsAcquired}개 획득! (수익: ${data.profit} PA)`;
    }
    addGameLog(message);
});

function addGameLog(message) {
    const logContainerPanel = document.getElementById('gameLogContainer');
    if (!logContainerPanel) return;

    const logContainer = logContainerPanel.querySelector('.log-container');
    if (!logContainer) return;

    logContainerPanel.classList.remove('hidden');

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = message;

    logContainer.prepend(entry); // Add to the top
}

socket.on('game_ended', (data) => {
    if (data.rankings) {
        displayFinalResults(data);
    }
});

function displayFinalResults(data) {
    const modal = document.getElementById('finalResultsModal');
    if (!modal) return;

    const rankings = data.rankings || [];
    const premiumInfo = data.premiumInfo || {};

    const winner = rankings[0];
    let winnerCardHtml = '';
    if (winner) {
        winnerCardHtml = `
            <div class="winner-card">
                <h3>1등: ${winner.name}</h3>
                <p>총 자산: ${winner.totalAssets} PA</p>
            </div>
        `;
    }

    let premiumInfoHtml = '';
    if (premiumInfo.scarceGood) {
        premiumInfoHtml = `
            <div class="premium-info-card">
                <h4>프리미엄 정보</h4>
                <p>희귀 프리미엄: <strong>${premiumInfo.scarceGood}</strong> (가치: ${premiumInfo.scarceGood === '비단' ? premiumInfo.silkValue : premiumInfo.pepperValue} PA)</p>
                <p>독점 프리미엄: <strong>15 PA</strong> (한 종류의 무역품 50% 이상 보유 시)</p>
            </div>
        `;
    }

    const tableBodyHtml = rankings.map(team => `
        <tr class="${team.rank === 1 ? 'winner-row' : ''}">
            <td>${team.rank}</td>
            <td>${team.name}</td>
            <td>${team.totalAssets}</td>
            <td>${team.totalPA}</td>
            <td>${team.silk}</td>
            <td>${team.pepper}</td>
            <td>${(team.premiums || []).join(', ') || '-'}</td>
        </tr>
    `).join('');

    const resultsHtml = `
        <div class="results-panel">
            <span class="modal-close-btn">&times;</span>
            <h2>최종 순위</h2>
            ${winnerCardHtml}
            ${premiumInfoHtml}
            <table class="results-table">
                <thead>
                    <tr>
                        <th>순위</th>
                        <th>팀</th>
                        <th>총 자산</th>
                        <th>PA</th>
                        <th>비단</th>
                        <th>후추</th>
                        <th>프리미엄</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableBodyHtml}
                </tbody>
            </table>
        </div>
    `;

    modal.innerHTML = resultsHtml;
    modal.classList.remove('hidden');

    modal.querySelector('.modal-close-btn').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
}

// 관리자 대시보드 업데이트
function updateAdminDashboard(state) {
    document.getElementById('currentRound').textContent = state.currentRound > 0 ? `${state.currentRound}` : '대기중';
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
    const dashboardContainer = document.querySelector('#allTeamsStatusContainer .teams-grid-container');
    const sidebarContainer = document.getElementById('sidebarTeamsContainer');

    if (!dashboardContainer || !sidebarContainer) return;

    // Clear previous content
    dashboardContainer.innerHTML = '';
    sidebarContainer.innerHTML = '';

    const teamArray = Object.values(teams);
    teamArray.sort((a, b) => a.name.localeCompare(b.name));

    const allTeamsContainer = document.getElementById('allTeamsStatusContainer');
    if (teamArray.length === 0) {
        if(allTeamsContainer) allTeamsContainer.classList.add('hidden');
        return;
    } else {
        if(allTeamsContainer) allTeamsContainer.classList.remove('hidden');
    }

    teamArray.forEach(team => {
        // --- Simplified card for sidebar ---
        const playersHtmlSimple = team.members.map(member => `
            <div class="member-status">
                <span class="status-indicator ${member.connected ? 'connected' : 'disconnected'}"></span>
                ${member.name}
            </div>
        `).join('');

        const sidebarCard = document.createElement('div');
        sidebarCard.className = 'team-status-card-simple';
        sidebarCard.innerHTML = `
            <h4>${team.icon} ${team.name}</h4>
            <div class="player-list-vertical">
                ${playersHtmlSimple}
            </div>
        `;
        sidebarContainer.appendChild(sidebarCard);

        // --- Detailed card for dashboard ---
        const detailCard = document.createElement('div');
        detailCard.className = 'team-status-card';

        const leftSection = `
            <div class="team-card-left">
                <div class="team-flag">${team.icon}</div>
                <div class="team-name">${team.name}</div>
            </div>
        `;

        const playersHtmlDetail = team.members.map(member => `
            <div class="player-status-item">
                <span class="status-indicator ${member.connected ? 'connected' : 'disconnected'}"></span>
                ${member.name}
            </div>
        `).join('');

        const centerSection = `
            <div class="team-card-center">
                <div class="player-list-horizontal">
                    ${playersHtmlDetail}
                </div>
                <p>PA: <strong>${Math.floor(team.totalPA)}</strong> | 비단: <strong>${team.silk}</strong> | 후추: <strong>${team.pepper}</strong></p>
                <p>PA 생산: ${team.batchCount} / ${team.maxBatchCount}</p>
                ${team.resetTokens > 0 ? `<p>리롤 토큰: ${team.resetTokens}개</p>` : ''}
                ${team.mercantilismTokens > 0 ? `<p>중상주의 토큰: ${team.mercantilismTokens}개</p>` : ''}
            </div>
        `;

        const tradeStatus = team.tradeSelection ? 'completed' : '';
        const investmentStatus = team.investmentsMade.length > 0 ? 'completed' : '';
        const eventStatus = team.eventDrawnThisRound ? 'completed' : '';
        const rpsStatus = team.finalRpsPlayedThisRound ? 'completed' : '';

        const rightSection = `
            <div class="team-card-right">
                <div class="status-box-stack">
                    <div class="status-box ${tradeStatus}">출항</div>
                    <div class="status-box ${investmentStatus}">투자</div>
                    <div class="status-box-row">
                        <div class="status-box half-width ${eventStatus}">이벤트</div>
                        <div class="status-box half-width ${rpsStatus}">✌️</div>
                    </div>
                </div>
            </div>
        `;

        detailCard.innerHTML = leftSection + centerSection + rightSection;
        dashboardContainer.appendChild(detailCard);
    });
}

// 플레이어 목록 표시



