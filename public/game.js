// ============================================
// 게임 상태 관리
// ============================================
const gameState = {
    player: {
        name: '',
        country: null
    },
    team: {
        totalPA: 0,
        silk: 0,
        pepper: 0,
        clickCount: 0,
        maxClicks: 500,
        resetTokens: 0,
        mercantilismTokens: 0
    },
    currentRound: 0,
    currentPhase: 'waiting',
    gameStarted: false
};

// 국가별 설정
const countryConfig = {
    spain: { name: '스페인', maxClicks: 1000, paPerClick: 1, icon: '' },
    netherlands: { name: '네덜란드', maxClicks: 500, paPerClick: 1.5, icon: '' },
    england: { name: '영국', maxClicks: 500, paPerClick: 1, resetTokens: 2, icon: '' },
    france: { name: '프랑스', maxClicks: 500, paPerClick: 1, mercantilismTokens: 1, icon: '' }
};

// ============================================
// Socket.IO 연결 및 전역 변수
// ============================================
const socket = io();
let playerRegistered = false;
let playerRoomId = null;
let localPlayerName = null;
let currentVisibleArea = null; // 현재 보고 있는 영역 추적

// ============================================
// Socket 이벤트 핸들러
// ============================================

socket.on('connect', () => {
    console.log('서버에 연결되었습니다!', socket.id);
    updateConnectionStatus(true);
    
    if (gameState.player.country && playerRoomId && !playerRegistered) {
        registerPlayer();
    }
});

socket.on('disconnect', () => {
    console.log('서버 연결이 끊어졌습니다.');
    updateConnectionStatus(false);
});

socket.on('error', (data) => {
    console.error('서버 에러:', data.message);
    alert('오류: ' + data.message);
    
    if (data.message.includes('유효하지 않은 방')) {
        location.reload();
    }
});

socket.on('connect_error', (error) => {
    console.error('연결 오류:', error);
    updateConnectionStatus(false);
});

socket.on('game_state_update', (state) => {
    console.log('게임 상태 업데이트:', state);
    updateGameState(state);
});

socket.on('team_state_update', (teamData) => {
    console.log('팀 상태 업데이트:', teamData);
    updatePlayerStatsFromServer(teamData);
});

socket.on('teams_update', (data) => {
    console.log('전체 팀 업데이트:', data);
    if (gameState.player.country && data.teams) {
        const myTeam = data.teams[gameState.player.country];
        if (myTeam) {
            updatePlayerStatsFromServer(myTeam);
        }
    }
    updateAllTeamsStatus(data.teams);
    updateMyTeamStatus(data.teams);
});

socket.on('timer_update', (data) => {
    const timeString = `${String(data.minutes).padStart(2, '0')}:${String(data.seconds).padStart(2, '0')}`;
    const timeElement = document.getElementById('timeRemaining');
    if (timeElement) {
        timeElement.textContent = `시간: ${timeString}`;
    }
});

socket.on('timer_ended', () => {
    showNotification('시간 종료!');
});

socket.on('rps_result', (data) => {
    console.log('✊✋✌️ 결과:', data);
    const resultDiv = document.getElementById('rpsResult');
    if (resultDiv) {
        resultDiv.className = 'result-display ' + data.resultClass;
        resultDiv.innerHTML = data.html;
    }
    if (data.teamState) {
        updatePlayerStatsFromServer(data.teamState);
    }
});

socket.on('final_rps_result', (data) => {
    console.log('최종 ✊✋✌️ 결과:', data);
    const resultDiv = document.getElementById('finalRpsResult');
    if (resultDiv) {
        resultDiv.className = 'result-display ' + data.resultClass;
        resultDiv.innerHTML = data.html;
    }
    if (data.teamState) {
        updatePlayerStatsFromServer(data.teamState);
    }
});

socket.on('action_result', (data) => {
    console.log('액션 결과:', data);
    showNotification(data.message || '액션 완료!');
    if (data.teamState) {
        updatePlayerStatsFromServer(data.teamState);
    }

    if (data.action === 'rps_reroll') {
        const rpsButtons = document.querySelectorAll('.rps-btn');
        rpsButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });

        const resultDiv = document.getElementById('rpsResult');
        if (resultDiv) {
            resultDiv.innerHTML = '';
            resultDiv.className = 'result-display';
        }
    }
});

socket.on('event_result', (data) => {
    console.log('이벤트 결과:', data);
    const resultDiv = document.getElementById('eventResult');
    if (resultDiv) {
        resultDiv.className = 'result-display ' + data.resultClass;
        resultDiv.innerHTML = data.html;
    }
    if (data.teamState) {
        updatePlayerStatsFromServer(data.teamState);
    }
});

socket.on('investment_info', (data) => {
    console.log('투자 정보:', data);
    setupInvestmentScreen(data.voyages);
});

socket.on('arrival_summary', (data) => {
    console.log('입항 요약:', data);
    setupArrivalScreen(data);
});

socket.on('game_ended', (data) => {
    console.log('게임 종료:', data);
    showNotification('게임이 종료되었습니다!');
    displayFinalResults(data);
});

socket.on('game_reset', () => {
    console.log('게임 리셋');
    location.reload();
});

// ============================================
// 방 참가 및 플레이어 등록
// ============================================

function joinRoom() {
    const nameInput = document.getElementById('playerNameInput');
    const roomInput = document.getElementById('roomCodeInput');

    const name = nameInput.value.trim();
    const roomId = roomInput.value.trim().toUpperCase();

    // 🆕 개선된 검증 로직
    if (!validatePlayerName(name)) {
        showNotification('이름은 1~20자의 한글, 영문, 숫자만 가능합니다.');
        nameInput.focus();
        return;
    }

    if (!validateRoomCode(roomId)) {
        showNotification('방 코드는 정확히 4자리 영문 대문자 또는 숫자여야 합니다.');
        roomInput.focus();
        return;
    }

    localPlayerName = name;
    playerRoomId = roomId;
    gameState.player.name = name;

    log('info', '방 참가 준비', { name, roomId });

    document.getElementById('joinRoomSection').classList.add('hidden');
    document.getElementById('countrySelection').classList.remove('hidden');
    showNotification(`안녕하세요, ${name}님! 이제 국가를 선택하세요.`);
}

function selectCountry(country) {
    if (!countryConfig[country]) {
        return alert('유효하지 않은 국가입니다.');
    }

    gameState.player.country = country;
    gameState.player.name = localPlayerName;
    
    if (!playerRoomId) {
        return alert('방 코드가 설정되지 않았습니다. 다시 시도해주세요.');
    }

    registerPlayer();
}

function registerPlayer() {
    if (!gameState.player.country) {
        return alert('국가를 선택해주세요.');
    }
    if (!gameState.player.name || !localPlayerName) {
        return alert('플레이어 이름이 설정되지 않았습니다.');
    }
    if (!playerRoomId) {
        return alert('방 코드가 설정되지 않았습니다.');
    }

    console.log('플레이어 등록 시도:', {
        country: gameState.player.country,
        playerName: gameState.player.name,
        roomId: playerRoomId
    });

    socket.emit('register_player', {
        country: gameState.player.country,
        playerName: gameState.player.name,
        roomId: playerRoomId
    });

    playerRegistered = true;

    document.getElementById('countrySelection').classList.add('hidden');
    document.getElementById('waitingScreen').classList.remove('hidden');

    const config = countryConfig[gameState.player.country];
    showNotification(`${config.name} 팀에 참가했습니다!`);
}

// ============================================
// 게임 상태 업데이트
// ============================================

function updateGameState(state) {
    const wasStarted = gameState.gameStarted;
    const oldPhase = gameState.currentPhase; // 이전 단계 저장
    
    gameState.currentRound = state.currentRound;
    gameState.currentPhase = state.currentPhase;
    gameState.gameStarted = state.gameStarted;

    const roundElement = document.getElementById('currentRound');
    if (roundElement) {
        roundElement.textContent = state.currentRound > 0 ? `라운드: ${state.currentRound}` : '대기중';
    }

    // 게임 시작 시 화면 전환
    if (state.gameStarted && !wasStarted) {
        const waitingScreen = document.getElementById('waitingScreen');
        const gameScreen = document.getElementById('gameScreen');
        const gameNav = document.getElementById('gameNav');

        if (waitingScreen) waitingScreen.classList.add('hidden');
        if (gameScreen) gameScreen.classList.remove('hidden');
        if (gameNav) gameNav.classList.remove('hidden');

        showArea('productionArea');
        currentVisibleArea = 'productionArea';
    }

    // 🆕 페이즈 변경 시 화면 자동 전환
    if (state.gameStarted && oldPhase !== state.currentPhase) {
        const phaseToArea = {
            'production': 'productionArea',
            'trade': 'tradeArea',
            'investment': 'investmentArea',
            'arrival': 'arrivalArea',
            'ended': 'resultsArea'
        };
        const newArea = phaseToArea[state.currentPhase];
        if (newArea) {
            showArea(newArea);
        }
    }

    // 페이즈 변경 시 네비게이션 업데이트
    if (state.gameStarted) {
        updateNav(state.currentPhase);
        setupPhaseScreen(state.currentPhase);
        
        // 현재 단계 알림
        showNotification(`${getPhaseKorean(state.currentPhase)} 단계가 시작되었습니다!`);
    }
}

function updatePlayerStatsFromServer(teamData) {
    gameState.team = {
        totalPA: teamData.totalPA || 0,
        silk: teamData.silk || 0,
        pepper: teamData.pepper || 0,
        clickCount: teamData.clickCount || 0,
        maxClicks: teamData.maxClicks || 500,
        resetTokens: teamData.resetTokens || 0,
        mercantilismTokens: teamData.mercantilismTokens || 0
    };

    updatePlayerStats();
    updateTokenDisplay();
}

function updatePlayerStats() {
    const totalPAElement = document.getElementById('totalPA');
    const silkElement = document.getElementById('silkCount');
    const pepperElement = document.getElementById('pepperCount');

    if (totalPAElement) {
        totalPAElement.textContent = Math.floor(gameState.team.totalPA);
    }
    if (silkElement) {
        silkElement.textContent = gameState.team.silk;
    }
    if (pepperElement) {
        pepperElement.textContent = gameState.team.pepper;
    }

    // 생산 화면 업데이트
    const clickCountElement = document.getElementById('clickCount');
    const maxClicksElement = document.getElementById('maxClicks');
    const currentProdElement = document.getElementById('currentProduction');
    const progressFill = document.getElementById('progressFill');

    if (clickCountElement) {
        clickCountElement.textContent = gameState.team.clickCount;
    }
    if (maxClicksElement && gameState.player.country) {
        const config = countryConfig[gameState.player.country];
        maxClicksElement.textContent = config.maxClicks;
    }
    if (currentProdElement) {
        currentProdElement.textContent = Math.floor(gameState.team.totalPA);
    }
    if (progressFill && gameState.player.country) {
        const config = countryConfig[gameState.player.country];
        const percentage = (gameState.team.clickCount / config.maxClicks) * 100;
        progressFill.style.width = percentage + '%';
    }
}

function updateTokenDisplay() {
    // 영국 리롤 토큰 표시
    const rerollInfo = document.getElementById('rerollTokenInfo');
    if (rerollInfo) {
        if (gameState.player.country === 'england') {
            rerollInfo.style.display = 'block';
            rerollInfo.innerHTML = `
                <div class="token-info">
                            <span class="token-icon"></span>
                            <span class="token-text">✊ ✋ ✌️ 리롤 토큰: ${gameState.team.resetTokens}개</span>
                </div>
            `;
        } else {
            rerollInfo.style.display = 'none';
        }
    }
    
    // 프랑스 중상주의 토큰 표시
    const mercantilismInfo = document.getElementById('mercantilismTokenInfo');
    if (mercantilismInfo) {
        if (gameState.player.country === 'france') {
            mercantilismInfo.style.display = 'block';
            mercantilismInfo.innerHTML = `
                <div class="token-info">
                    <span class="token-icon"></span>
                    <span class="token-text">중상주의 토큰: ${gameState.team.mercantilismTokens}개</span>
                </div>
            `;
        } else {
            mercantilismInfo.style.display = 'none';
        }
    }
}

function showArea(areaId) {
    // 네비게이션 제한 로직 (추가)
    const phaseToArea = {
        'production': 'productionArea',
        'trade': 'tradeArea',
        'investment': 'investmentArea',
        'arrival': 'arrivalArea'
    };
    const currentPhaseArea = phaseToArea[gameState.currentPhase];
    const allowedAreas = ['productionArea', currentPhaseArea];

    if (!allowedAreas.includes(areaId) && gameState.gameStarted) {
        showNotification('지금은 해당 화면으로 이동할 수 없습니다.');
        return;
    }

    console.log('영역 전환:', areaId);
    
    // 게임 영역들
    const gameAreas = ['productionArea', 'tradeArea', 'investmentArea', 'arrivalArea', 'resultsArea'];
    
    gameAreas.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (id === areaId) {
                element.classList.remove('hidden');
            } else {
                element.classList.add('hidden');
            }
        }
    });
    
    currentVisibleArea = areaId;
    updateNavHighlight(areaId);
}

function updateNavHighlight(areaId) {
    // 네비게이션 버튼 하이라이트
    const navMap = {
        'productionArea': 'navProduction',
        'tradeArea': 'navTrade',
        'investmentArea': 'navInvestment',
        'arrivalArea': 'navArrival'
    };
    
    Object.values(navMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById(navMap[areaId]);
    if (activeBtn) activeBtn.classList.add('active');
}

function updateNav(phase) {
    const phaseMap = {
        'production': 'navProduction',
        'trade': 'navTrade',
        'investment': 'navInvestment',
        'arrival': 'navArrival'
    };

    // 모든 버튼의 상태 초기화 (비활성화 및 표시 제거)
    Object.values(phaseMap).forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.disabled = true;
            btn.classList.remove('current-phase');
            const indicator = btn.querySelector('.phase-indicator');
            if (indicator) indicator.remove();
        }
    });

    // 생산 버튼은 항상 활성화
    const productionBtn = document.getElementById(phaseMap.production);
    if (productionBtn) {
        productionBtn.disabled = false;
    }

    // 현재 단계 버튼 활성화 및 표시
    const currentBtnId = phaseMap[phase];
    if (currentBtnId) {
        const currentBtn = document.getElementById(currentBtnId);
        if (currentBtn) {
            currentBtn.disabled = false;
            currentBtn.classList.add('current-phase');
            const indicator = document.createElement('span');
            indicator.className = 'phase-indicator';
            indicator.textContent = '● ';
            indicator.style.color = 'var(--color-success)';
            currentBtn.insertBefore(indicator, currentBtn.firstChild);
        }
    }
}

function setupPhaseScreen(phase) {
    if (phase === 'production') {
        setupProductionScreen();
    } else if (phase === 'trade') {
        setupTradeScreen();
    } else if (phase === 'investment') {
        setupInvestmentScreen();
    } else if (phase === 'arrival') {
        setupArrivalScreen();
    }
}



// ============================================
// 생산 단계
// ============================================

function setupProductionScreen() {
    // 가위바위보 버튼 초기화
    const rpsButtons = document.querySelectorAll('.rps-btn');
    rpsButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });

    // 결과 영역 초기화
    const rpsResult = document.getElementById('rpsResult');
    if (rpsResult) {
        rpsResult.innerHTML = '';
        rpsResult.className = 'result-display';
    }

    updatePlayerStats();
    updateTokenDisplay();
}

function produce() {
    if (!gameState.player.country || !playerRoomId) {
        return showNotification('게임에 참가하지 않았습니다.');
    }

    const config = countryConfig[gameState.player.country];
    
    if (gameState.team.clickCount >= config.maxClicks) {
        return showNotification('최대 클릭 수에 도달했습니다!');
    }
    
    socket.emit('production_click', { roomId: playerRoomId });
}

function playRPS(choice) {
    if (!playerRoomId) {
        return showNotification('게임에 참가하지 않았습니다.');
    }

    socket.emit('play_rps', {
        roomId: playerRoomId,
        choice: choice
    });

    showNotification(`${getRPSEmoji(choice)} 선택 완료!`);
    
    const rpsButtons = document.querySelectorAll('.rps-btn');
    rpsButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });
}

function rerollRPS() {
    if (!playerRoomId || !gameState.player.country) return;
    
    if (gameState.player.country !== 'england') {
        return showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
    }
    
    if (gameState.team.resetTokens <= 0) {
        return alert('리롤 토큰이 없습니다!\n\n영국은 라운드당 2개의 리롤 토큰을 보유합니다.');
    }

    if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${gameState.team.resetTokens}개`)) {
        socket.emit('reroll_rps', { roomId: playerRoomId });
    }
}

function getRPSEmoji(choice) {
    const map = {
        'rock': '✊',
        'paper': '✋',
        'scissors': '✌️',
        '가위': '✌️',
        '바위': '✊',
        '보': '✋',
        '✊': '✊',
        '✋': '✋',
        '✌️': '✌️'
    };
    return map[choice] || '';
}

// ============================================
// 무역 단계
// ============================================

function setupTradeScreen() {
    const selectionDiv = document.getElementById('tradeSelection');
    if (selectionDiv) {
        selectionDiv.innerHTML = '<p>선택 대기중...</p>';
    }
}

function setDestination(destination) {
    if (!playerRoomId) {
        return showNotification('게임에 참가하지 않았습니다.');
    }

    socket.emit('trade_selection', {
        roomId: playerRoomId,
        destination: destination
    });

    const selectionDiv = document.getElementById('tradeSelection');
    if (selectionDiv) {
        const destText = destination === 'china' ? '중국 (비단)' : 
                        destination === 'india' ? '인도 (후추)' : 
                        '출항하지 않음';
        selectionDiv.innerHTML = `<p>선택: ${destText}</p>`;
    }
    
    showNotification('무역 선택이 완료되었습니다!');
}

function selectTrade(type) {
    setDestination(type);
}

// ============================================
// 투자 단계
// ============================================

function setupInvestmentScreen(voyages) {
    const container = document.getElementById('investmentOptions');
    if (!container) return;

    container.innerHTML = '';

    if (!voyages || voyages.length === 0) {
        container.innerHTML = '<p class="info-text">현재 투자 가능한 항해가 없습니다.</p>';
        return;
    }

    voyages.forEach(voyage => {
        const card = createInvestmentCard(voyage);
        container.appendChild(card);
    });
}

function createInvestmentCard(voyage) {
    const card = document.createElement('div');
    card.className = 'investment-card';
    
    const config = countryConfig[voyage.country];
    card.innerHTML = `
        <h4>${config.name}</h4>
        <p>목적지: ${voyage.destination === 'china' ? '중국' : '인도'}</p>
        <p>투자 금액: ${voyage.amount} PA</p>
        <button class="game-btn" onclick="makeInvestment('${voyage.country}')">
            투자하기
        </button>
    `;
    
    return card;
}

function makeInvestment(targetCountry) {
    if (!playerRoomId) {
        return showNotification('게임에 참가하지 않았습니다.');
    }

    socket.emit('make_investment', {
        roomId: playerRoomId,
        targetCountry: targetCountry
    });

    const config = countryConfig[targetCountry];
    showNotification(`${config.name}에 투자했습니다!`);
}

// ============================================
// 입항 단계
// ============================================

function setupArrivalScreen(data) {
    // 이벤트 카드 영역 초기화
    const eventResult = document.getElementById('eventResult');
    if (eventResult) {
        eventResult.innerHTML = '';
        eventResult.className = 'result-display';
    }

    // 최종 가위바위보 버튼 초기화
    const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
    finalRpsButtons.forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
    });

    const finalRpsResult = document.getElementById('finalRpsResult');
    if (finalRpsResult) {
        finalRpsResult.innerHTML = '';
        finalRpsResult.className = 'result-display';
    }
    
    updateTokenDisplay();
}

function drawEvent() {
    if (!playerRoomId) {
        return showNotification('게임에 참가하지 않았습니다.');
    }

    socket.emit('draw_event', { roomId: playerRoomId });
    showNotification('이벤트 카드를 뽑았습니다!');
}

function playFinalRPS(choice) {
    if (!playerRoomId) {
        return showNotification('게임에 참가하지 않았습니다.');
    }

    socket.emit('play_final_rps', {
        roomId: playerRoomId,
        choice: choice
    });

    showNotification(`${getRPSEmoji(choice)} 선택 완료!`);
    
    const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
    finalRpsButtons.forEach(btn => {
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });
}

function rerollFinalRPS() {
    if (!playerRoomId || !gameState.player.country) return;
    
    if (gameState.player.country !== 'france') {
        return showNotification('프랑스만 중상주의 토큰을 사용할 수 있습니다!');
    }
    
    if (gameState.team.mercantilismTokens <= 0) {
        return alert('중상주의 토큰이 없습니다!\n\n프랑스는 라운드당 1개의 중상주의 토큰을 보유합니다.');
    }

    if (confirm(`중상주의 토큰을 사용하시겠습니까?\n\n남은 토큰: ${gameState.team.mercantilismTokens}개`)) {
        socket.emit('reroll_final_rps', { roomId: playerRoomId });
        
        const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
        finalRpsButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });
        
    showNotification('중상주의 토큰을 사용했습니다. 최종 가위바위보를 다시 선택하세요!');
    }
}

// ============================================
// 기타 UI 함수
// ============================================

function getPhaseKorean(phase) {
    const phaseMap = {
        'waiting': '대기',
        'production': '생산',
        'trade': '무역',
        'investment': '투자',
        'arrival': '입항',
        'ended': '종료'
    };
    return phaseMap[phase] || phase;
}

function updateAllTeamsStatus(teams) {
    const container = document.getElementById('allTeamsStatusContainer');
    if (!container) return;

    container.innerHTML = ''; // Clear previous content

    const teamArray = Object.values(teams);

    teamArray.forEach(team => {
        const card = document.createElement('div');
        card.className = 'team-status-card';

        const isMyTeam = team.country === gameState.player.country;
        if (isMyTeam) {
            card.style.borderColor = 'var(--color-primary)';
            card.style.borderWidth = '2px';
            card.style.borderStyle = 'solid';
        }

        card.innerHTML = `
            <h4>${team.icon} ${team.name}</h4>
            <div class="team-status-resources">
                <p>비단: ${team.silk}</p>
                <p>후추: ${team.pepper}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

function updateMyTeamStatus(teams) {
    const myTeam = teams[gameState.player.country];
    const container = document.getElementById('myTeamStatus');
    if (!myTeam || !container) return;

    container.innerHTML = ''; // Clear previous content

    myTeam.members.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'member-status';
        memberDiv.innerHTML = `
            <span class="status-indicator ${member.connected ? 'connected' : 'disconnected'}"></span>
            <span>${member.name}</span>
        `;
        container.appendChild(memberDiv);
    });
}

function updateGlobalTradeStatus(data) {
    // 전체 무역 현황 업데이트 (필요시 구현)
}

function displayFinalResults(data) {
    const resultsArea = document.getElementById('resultsArea');
    if (!resultsArea) return;

    showArea('resultsArea');
    
    // 최종 결과 표시 로직 (필요시 구현)
}



// ============================================
// 초기화
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('게임 클라이언트 초기화 완료');
    
    // 네비게이션 버튼에 항상 클릭 가능하도록 이벤트 리스너 추가
    const navProduction = document.getElementById('navProduction');
    const navTrade = document.getElementById('navTrade');
    const navInvestment = document.getElementById('navInvestment');
    const navArrival = document.getElementById('navArrival');
    
    if (navProduction) navProduction.addEventListener('click', () => showArea('productionArea'));
    if (navTrade) navTrade.addEventListener('click', () => showArea('tradeArea'));
    if (navInvestment) navInvestment.addEventListener('click', () => showArea('investmentArea'));
    if (navArrival) navArrival.addEventListener('click', () => showArea('arrivalArea'));

    // 팀 현황 사이드바 토글 (추가)
    const sidebar = document.getElementById('teamSidebar');
    const sidebarToggle = document.getElementById('teamSidebarToggle');
    if (sidebar && sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
});
