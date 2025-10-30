class GameClient {
    constructor() {
        this.gameState = {
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
                mercantilismTokens: 0,
                investmentsMade: [],
                eventDrawnThisRound: false,
                finalRpsPlayedThisRound: false,
                eventText: '',
                eventResultClass: '',
                finalRpsResult: ''
            },
            currentRound: 0,
            currentPhase: 'waiting',
            gameStarted: false
        };
        this.countryConfig = {};
        this.socket = io();
        this.playerRegistered = false;
        this.playerRoomId = null;
        this.localPlayerName = null;
        this.currentVisibleArea = null;
        this.clickBuffer = 0;
        this.selectedTradeDestination = null;

        this.setupSocket();
        this.setupDOM();
    }

    setupSocket() {
        this.socket.on('connect', () => {
            console.log('서버에 연결되었습니다!', this.socket.id);
            this.updateConnectionStatus(true);
            
            if (this.gameState.player.country && this.playerRoomId && !this.playerRegistered) {
                this.registerPlayer();
            }
        });

        this.socket.on('disconnect', () => {
            console.log('서버 연결이 끊어졌습니다.');
            this.updateConnectionStatus(false);
        });

        this.socket.on('error', (data) => {
            console.error('서버 에러:', data.message);
            alert('오류: ' + data.message);
            
            if (data.message.includes('유효하지 않은 방')) {
                location.reload();
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('연결 오류:', error);
            this.updateConnectionStatus(false);
        });

        this.socket.on('game_state_update', (state) => {
            console.log('게임 상태 업데이트:', state);
            if (state.countryConfig) {
                this.countryConfig = state.countryConfig;
            }
            this.updateGameState(state);
        });

        this.socket.on('team_state_update', (teamData) => {
            console.log('팀 상태 업데이트:', teamData);
            this.updatePlayerStatsFromServer(teamData);
        });

        this.socket.on('teams_update', (data) => {
            console.log('전체 팀 업데이트:', data);
            if (this.gameState.player.country && data.teams) {
                const myTeam = data.teams[this.gameState.player.country];
                if (myTeam) {
                    this.updatePlayerStatsFromServer(myTeam);
                }
            }
            this.updateAllTeamsStatus(data.teams);
            this.updateMyTeamStatus(data.teams);

            if (this.gameState.currentPhase === 'arrival') {
                this.updateArrivalStatus(data.teams);
            }
        });

        this.socket.on('timer_update', (data) => {
            const timeString = `${String(data.minutes).padStart(2, '0')}:${String(data.seconds).padStart(2, '0')}`;
            const timeElement = document.getElementById('timeRemaining');
            if (timeElement) {
                timeElement.textContent = `시간: ${timeString}`;
            }
        });

        this.socket.on('timer_ended', () => {
            this.showNotification('시간 종료!');
        });

        this.socket.on('rps_result', (data) => {
            console.log('✊✋✌️ 결과:', data);
            const resultDiv = document.getElementById('rpsResult');
            if (resultDiv) {
                resultDiv.className = 'result-display ' + data.resultClass;
                resultDiv.innerHTML = data.html;
            }
            if (data.teamState) {
                this.updatePlayerStatsFromServer(data.teamState);
            }
        });

        this.socket.on('final_rps_result', (data) => {
            console.log('최종 ✊✋✌️ 결과:', data);
            const resultDiv = document.getElementById('finalRpsResult');
            if (resultDiv) {
                resultDiv.className = 'result-display ' + data.resultClass;
                resultDiv.innerHTML = data.html;
            }
            if (data.teamState) {
                this.updatePlayerStatsFromServer(data.teamState);
            }
        });

        this.socket.on('action_result', (data) => {
            console.log('액션 결과:', data);
            this.showNotification(data.message || '액션 완료!');
            if (data.teamState) {
                this.updatePlayerStatsFromServer(data.teamState);
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
            if (data.action === 'final_rps_reroll') {
                const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
                finalRpsButtons.forEach(btn => {
                    btn.disabled = false;
                    btn.style.opacity = '1';
                });

                const resultDiv = document.getElementById('finalRpsResult');
                if (resultDiv) {
                    resultDiv.innerHTML = '';
                    resultDiv.className = 'result-display';
                }
            }
        });

        this.socket.on('event_result', (data) => {
            console.log('이벤트 결과:', data);
            const resultDiv = document.getElementById('eventResult');
            if (resultDiv) {
                resultDiv.className = 'result-display ' + data.resultClass;
                resultDiv.innerHTML = data.html;
            }
            if (data.teamState) {
                this.updatePlayerStatsFromServer(data.teamState);
            }
        });

        this.socket.on('investment_info', (data) => {
            console.log('투자 정보:', data);
            this.setupInvestmentScreen(data.voyages);
        });

        this.socket.on('arrival_summary', (data) => {
            console.log('입항 요약:', data);
        });

        this.socket.on('game_ended', (data) => {
            console.log('게임 종료:', data);
            this.showNotification('게임이 종료되었습니다!');
            this.displayFinalResults(data);
        });

        this.socket.on('room_check_result', (data) => {
            const joinButton = document.querySelector('#joinRoomSection button');
            joinButton.disabled = false;
            joinButton.textContent = '게임 참가하기';

            if (data.exists) {
                this.localPlayerName = data.playerName;
                this.playerRoomId = data.roomId;
                this.gameState.player.name = data.playerName;

                if (data.countryConfig) {
                    this.countryConfig = data.countryConfig;
                    this.generateCountrySelection();
                }

                document.getElementById('joinRoomSection').classList.add('hidden');
                document.getElementById('countrySelection').classList.remove('hidden');
                this.showNotification(`안녕하세요, ${data.playerName}님! 이제 국가를 선택하세요.`);
            } else {
                this.showNotification('존재하지 않는 방 코드입니다. 다시 확인해주세요.');
                document.getElementById('roomCodeInput').focus();
            }
        });

        this.socket.on('game_reset', () => {
            console.log('게임 리셋');
            location.reload();
        });
    }

    setupDOM() {
        document.getElementById('joinRoomBtn').addEventListener('click', () => this.joinRoom());
        document.getElementById('produceBtn').addEventListener('click', () => this.produce());
        document.querySelectorAll('.rps-btn').forEach(btn => btn.addEventListener('click', (e) => this.playRPS(e.target.dataset.choice)));
        document.getElementById('rerollRPSBtn').addEventListener('click', () => this.rerollRPS());
        document.querySelectorAll('.destination-btn').forEach(btn => btn.addEventListener('click', (e) => this.selectTradeDestination(e.target.dataset.destination)));
        document.getElementById('confirmTradeBtn').addEventListener('click', () => this.confirmTrade());
        document.getElementById('cancelTradeBtn').addEventListener('click', () => this.cancelTrade());
        document.getElementById('drawEventBtn').addEventListener('click', () => this.drawEvent());
        document.querySelectorAll('.final-rps-btn').forEach(btn => btn.addEventListener('click', (e) => this.playFinalRPS(e.target.dataset.choice)));
        document.getElementById('rerollFinalRPSBtn').addEventListener('click', () => this.rerollFinalRPS());

        const navProduction = document.getElementById('navProduction');
        const navTrade = document.getElementById('navTrade');
        const navInvestment = document.getElementById('navInvestment');
        const navArrival = document.getElementById('navArrival');
        
        if (navProduction) navProduction.addEventListener('click', () => this.showArea('productionArea'));
        if (navTrade) navTrade.addEventListener('click', () => this.showArea('tradeArea'));
        if (navInvestment) navInvestment.addEventListener('click', () => this.showArea('investmentArea'));
        if (navArrival) navArrival.addEventListener('click', () => this.showArea('arrivalArea'));

        const sidebar = document.getElementById('teamSidebar');
        const sidebarToggle = document.getElementById('teamSidebarToggle');
        if (sidebar && sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        }

        setInterval(() => {
            if (this.clickBuffer > 0) {
                this.socket.emit('production_batch', { roomId: this.playerRoomId, clicks: this.clickBuffer });
                this.clickBuffer = 0;
            }
        }, 200);
    }

    updateConnectionStatus(connected) {
        const statusDiv = document.getElementById('connectionStatus');
        if (statusDiv) {
            statusDiv.textContent = connected ? '● 연결됨' : '◌ 연결 끊김';
            statusDiv.style.color = connected ? 'var(--color-success)' : 'var(--color-error)';
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    validatePlayerName(name) {
        return /^[a-zA-Z0-9가-힣]{1,20}$/.test(name);
    }

    validateRoomCode(code) {
        return /^[A-Z0-9]{4}$/.test(code);
    }

    generateCountrySelection() {
        const grid = document.querySelector('.country-grid');
        grid.innerHTML = '';
        for (const countryCode in this.countryConfig) {
            const config = this.countryConfig[countryCode];
            const card = document.createElement('div');
            card.className = 'country-card';
            card.onclick = () => this.selectCountry(countryCode);
            
            let statsHtml = `<li>클릭 수: ${config.maxClicks}회</li>`;
            if (config.paPerClick !== 1) {
                statsHtml += `<li>효율: ${config.paPerClick} PA/클릭</li>`;
            }
            if (config.resetTokens > 0) {
                statsHtml += `<li>리롤 토큰: ${config.resetTokens}개</li>`;
            }
            if (config.mercantilismTokens > 0) {
                statsHtml += `<li>중상주의</li>`;
            }

            card.innerHTML = `
                <div class="country-icon">${config.icon}</div>
                <h3>${config.name}</h3>
                <p class="country-trait">${this.getTrait(countryCode)}</p>
                <ul class="country-stats">
                    ${statsHtml}
                </ul>
            `;
            grid.appendChild(card);
        }
    }

    getTrait(countryCode) {
        switch(countryCode) {
            case 'spain': return '자원 부국';
            case 'netherlands': return '기술 국가';
            case 'england': return '무역 국가';
            case 'france': return '중상주의';
            default: return '';
        }
    }

    joinRoom() {
        const nameInput = document.getElementById('playerNameInput');
        const roomInput = document.getElementById('roomCodeInput');
        const joinButton = document.querySelector('#joinRoomSection button');

        const name = nameInput.value.trim();
        const roomId = roomInput.value.trim().toUpperCase();

        if (!this.validatePlayerName(name)) {
            this.showNotification('이름은 1~20자의 한글, 영문, 숫자만 가능합니다.');
            nameInput.focus();
            return;
        }

        if (!this.validateRoomCode(roomId)) {
            this.showNotification('방 코드는 정확히 4자리 영문 대문자 또는 숫자여야 합니다.');
            roomInput.focus();
            return;
        }

        joinButton.disabled = true;
        joinButton.textContent = '확인 중...';
        this.socket.emit('check_room', { roomId, playerName: name });
    }

    selectCountry(country) {
        if (!this.countryConfig[country]) {
            return alert('유효하지 않은 국가입니다.');
        }

        this.gameState.player.country = country;
        this.gameState.player.name = this.localPlayerName;
        
        if (!this.playerRoomId) {
            return alert('방 코드가 설정되지 않았습니다. 다시 시도해주세요.');
        }

        this.registerPlayer();
    }

    registerPlayer() {
        if (!this.gameState.player.country) {
            return alert('국가를 선택해주세요.');
        }
        if (!this.gameState.player.name || !this.localPlayerName) {
            return alert('플레이어 이름이 설정되지 않았습니다.');
        }
        if (!this.playerRoomId) {
            return alert('방 코드가 설정되지 않았습니다.');
        }

        console.log('플레이어 등록 시도:', {
            country: this.gameState.player.country,
            playerName: this.gameState.player.name,
            roomId: this.playerRoomId
        });

        this.socket.emit('register_player', {
            country: this.gameState.player.country,
            playerName: this.gameState.player.name,
            roomId: this.playerRoomId
        });

        this.playerRegistered = true;

        document.getElementById('countrySelection').classList.add('hidden');
        document.getElementById('waitingScreen').classList.remove('hidden');

        const config = this.countryConfig[this.gameState.player.country];
        this.showNotification(`${config.name} 팀에 참가했습니다!`);
    }

    updateGameState(state) {
        const wasStarted = this.gameState.gameStarted;
        const oldPhase = this.gameState.currentPhase; 
        
        this.gameState.currentRound = state.currentRound;
        this.gameState.currentPhase = state.currentPhase;
        this.gameState.gameStarted = state.gameStarted;

        const roundElement = document.getElementById('currentRound');
        if (roundElement) {
            roundElement.textContent = state.currentRound > 0 ? `라운드: ${state.currentRound}` : '대기중';
        }

        if (state.gameStarted && !wasStarted) {
            const waitingScreen = document.getElementById('waitingScreen');
            const gameScreen = document.getElementById('gameScreen');
            const gameNav = document.getElementById('gameNav');

            if (waitingScreen) waitingScreen.classList.add('hidden');
            if (gameScreen) gameScreen.classList.remove('hidden');
            if (gameNav) gameNav.classList.remove('hidden');

            this.showArea('productionArea');
            this.currentVisibleArea = 'productionArea';
        }

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
                this.showArea(newArea);
            }
        }

        if (state.gameStarted) {
            this.updateNav(state.currentPhase);
            this.setupPhaseScreen(state.currentPhase);
            
            this.showNotification(`${this.getPhaseKorean(state.currentPhase)} 단계가 시작되었습니다!`);
        }
    }

    updatePlayerStatsFromServer(teamData) {
        this.gameState.team = {
            totalPA: teamData.totalPA || 0,
            silk: teamData.silk || 0,
            pepper: teamData.pepper || 0,
            clickCount: teamData.clickCount || 0,
            maxClicks: teamData.maxClicks || 500,
            resetTokens: teamData.resetTokens || 0,
            mercantilismTokens: teamData.mercantilismTokens || 0,
            investmentsMade: teamData.investmentsMade || [],
            eventDrawnThisRound: teamData.eventDrawnThisRound || false,
            finalRpsPlayedThisRound: teamData.finalRpsPlayedThisRound || false,
            eventText: teamData.eventText || '',
            eventResultClass: teamData.eventResultClass || '',
            finalRpsResult: teamData.finalRpsResult || ''
        };

        this.updatePlayerStats();
        this.updateTokenDisplay();
    }

    updatePlayerStats() {
        const totalPAElement = document.getElementById('totalPA');
        const silkElement = document.getElementById('silkCount');
        const pepperElement = document.getElementById('pepperCount');

        if (totalPAElement) {
            totalPAElement.textContent = Math.floor(this.gameState.team.totalPA);
        }
        if (silkElement) {
            silkElement.textContent = this.gameState.team.silk;
        }
        if (pepperElement) {
            pepperElement.textContent = this.gameState.team.pepper;
        }

        const clickCountElement = document.getElementById('clickCount');
        const maxClicksElement = document.getElementById('maxClicks');
        const currentProdElement = document.getElementById('currentProduction');
        const progressFill = document.getElementById('progressFill');

        if (clickCountElement) {
            clickCountElement.textContent = this.gameState.team.clickCount;
        }
        if (maxClicksElement && this.gameState.player.country) {
            const config = this.countryConfig[this.gameState.player.country];
            maxClicksElement.textContent = config.maxClicks;
        }
        if (currentProdElement) {
            currentProdElement.textContent = Math.floor(this.gameState.team.totalPA);
        }
        if (progressFill && this.gameState.player.country) {
            const config = this.countryConfig[this.gameState.player.country];
            const percentage = (this.gameState.team.clickCount / config.maxClicks) * 100;
            progressFill.style.width = percentage + '%';
        }
    }

    updateTokenDisplay() {
        const rerollInfo = document.getElementById('rerollTokenInfo');
        if (rerollInfo) {
            if (this.gameState.player.country === 'england') {
                rerollInfo.style.display = 'block';
                rerollInfo.innerHTML = `
                    <div class="token-info">
                                <span class="token-icon"></span>
                                <span class="token-text">✊ ✋ ✌️ 리롤 토큰: ${this.gameState.team.resetTokens}개</span>
                    </div>
                `;
            } else {
                rerollInfo.style.display = 'none';
            }
        }
        
        const mercantilismInfo = document.getElementById('mercantilismTokenInfo');
        if (mercantilismInfo) {
            mercantilismInfo.style.display = 'none';
        }
    }

    showArea(areaId) {
        const phaseToArea = {
            'production': 'productionArea',
            'trade': 'tradeArea',
            'investment': 'investmentArea',
            'arrival': 'arrivalArea'
        };
        const currentPhaseArea = phaseToArea[this.gameState.currentPhase];
        const allowedAreas = ['productionArea', currentPhaseArea];

        if (!allowedAreas.includes(areaId) && this.gameState.gameStarted) {
            this.showNotification('지금은 해당 화면으로 이동할 수 없습니다.');
            return;
        }

        console.log('영역 전환:', areaId);
        
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
        
        this.currentVisibleArea = areaId;
        this.updateNavHighlight(areaId);
    }

    updateNavHighlight(areaId) {
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

    updateNav(phase) {
        const phaseMap = {
            'production': 'navProduction',
            'trade': 'navTrade',
            'investment': 'navInvestment',
            'arrival': 'navArrival'
        };

        Object.values(phaseMap).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = true;
                btn.classList.remove('current-phase');
                const indicator = btn.querySelector('.phase-indicator');
                if (indicator) indicator.remove();
            }
        });

        const productionBtn = document.getElementById(phaseMap.production);
        if (productionBtn) {
            productionBtn.disabled = false;
        }

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

    setupPhaseScreen(phase) {
        if (phase === 'production') {
            this.setupProductionScreen();
        } else if (phase === 'trade') {
            this.setupTradeScreen();
        } else if (phase === 'investment') {
            this.setupInvestmentScreen();
        } else if (phase === 'arrival') {
            this.setupArrivalScreen();
        }
    }

    setupProductionScreen() {
        const rpsButtons = document.querySelectorAll('.rps-btn');
        rpsButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '1';
        });

        const rpsResult = document.getElementById('rpsResult');
        if (rpsResult) {
            rpsResult.innerHTML = '';
            rpsResult.className = 'result-display';
        }

        this.updatePlayerStats();
        this.updateTokenDisplay();
    }

    produce() {
        if (!this.gameState.player.country || !this.playerRoomId) {
            return this.showNotification('게임에 참가하지 않았습니다.');
        }

        const config = this.countryConfig[this.gameState.player.country];
        
        if (this.gameState.team.clickCount >= config.maxClicks) {
            return this.showNotification('최대 클릭 수에 도달했습니다!');
        }
        
        this.clickBuffer++;
        this.gameState.team.clickCount++;
        this.gameState.team.totalPA += config.paPerClick;
        this.updatePlayerStats();
    }

    playRPS(choice) {
        if (!this.playerRoomId) {
            return this.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('play_rps', {
            roomId: this.playerRoomId,
            choice: choice
        });

        this.showNotification(`${this.getRPSEmoji(choice)} 선택 완료!`);
        
        const rpsButtons = document.querySelectorAll('.rps-btn');
        rpsButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
    }

    rerollRPS() {
        if (!this.playerRoomId || !this.gameState.player.country) return;
        
        if (this.gameState.player.country !== 'england') {
            return this.showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
        }
        
        if (this.gameState.team.resetTokens <= 0) {
            return alert('리롤 토큰이 없습니다!\n\n영국은 라운드당 2개의 리롤 토큰을 보유합니다.');
        }

        if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${this.gameState.team.resetTokens}개`)) {
            this.socket.emit('reroll_rps', { roomId: this.playerRoomId });
        }
    }

    getRPSEmoji(choice) {
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

    setupTradeScreen() {
        const selectionDiv = document.getElementById('tradeSelection');
        if (selectionDiv) {
            selectionDiv.innerHTML = '<p>선택 대기중...</p>';
        }
        document.getElementById('tradeConfirmation').classList.add('hidden');
        document.querySelector('.destination-grid').classList.remove('hidden');
    }

    selectTradeDestination(destination) {
        this.selectedTradeDestination = destination;
        document.getElementById('tradeDestinationTitle').textContent = `${destination === 'china' ? '중국' : '인도'}에 투자할 금액`;
        document.querySelector('.destination-grid').classList.add('hidden');
        document.getElementById('tradeConfirmation').classList.remove('hidden');
        document.getElementById('tradeAmount').focus();
    }

    confirmTrade() {
        if (!this.playerRoomId) {
            return this.showNotification('게임에 참가하지 않았습니다.');
        }

        let tradeType = this.selectedTradeDestination;
        let amount = parseInt(document.getElementById('tradeAmount').value);

        if (isNaN(amount) || amount < 200 || amount % 100 !== 0) {
            return this.showNotification('유효하지 않은 금액입니다. (200 PA 이상, 100 PA 단위로 입력)');
        }
        if (amount > this.gameState.team.totalPA) {
            return this.showNotification('보유한 PA가 부족합니다.');
        }

        this.socket.emit('trade_selection', {
            roomId: this.playerRoomId,
            type: tradeType,
            amount: amount
        });

        const destText = tradeType === 'china' ? '중국 (비단)' : '인도 (후추)';
        const selectionDiv = document.getElementById('tradeSelection');
        selectionDiv.innerHTML = `<p>선택: ${destText} / ${amount} PA</p>`;
        
        this.showNotification('무역 선택이 완료되었습니다!');
        document.getElementById('tradeConfirmation').classList.add('hidden');
    }

    cancelTrade() {
        document.getElementById('tradeConfirmation').classList.add('hidden');
        document.querySelector('.destination-grid').classList.remove('hidden');
        this.selectedTradeDestination = null;
    }

    setupInvestmentScreen(voyages) {
        const container = document.getElementById('investmentOptions');
        if (!container) return;

        container.innerHTML = '';

        if (!voyages || voyages.length === 0) {
            container.innerHTML = '<p class="info-text">현재 투자 가능한 항해가 없습니다.</p>';
            return;
        }

        voyages.forEach(voyage => {
            if (voyage.country !== this.gameState.player.country) {
                const card = this.createInvestmentCard(voyage);
                container.appendChild(card);
            }
        });
    }

    createInvestmentCard(voyage) {
        const card = document.createElement('div');
        card.className = 'investment-card';
        
        const config = this.countryConfig[voyage.country];
        const destinationText = voyage.destination === 'china' ? '중국' : '인도';

        card.innerHTML = `
            <h4>${config.name}</h4>
            <p>목적지: ${destinationText}</p>
            <p>기본 투자액: ${voyage.amount} PA</p>
            <div class="input-group">
                <input type="number" id="investAmount-${voyage.country}" placeholder="투자할 PA (100 이상)" min="100" step="100">
                <button class="game-btn" onclick="game.makeInvestment('${voyage.country}')">투자하기</button>
            </div>
        `;
        
        return card;
    }

    makeInvestment(targetCountry) {
        if (!this.playerRoomId) {
            return this.showNotification('게임에 참가하지 않았습니다.');
        }

        const amountInput = document.getElementById(`investAmount-${targetCountry}`);
        const amount = parseInt(amountInput.value);

        if (isNaN(amount) || amount < 100) {
            return this.showNotification('유효하지 않은 투자 금액입니다. (100 PA 이상)');
        }

        if (amount > this.gameState.team.totalPA) {
            return this.showNotification('보유한 PA가 부족합니다.');
        }

        this.socket.emit('make_investment', {
            roomId: this.playerRoomId,
            targetCountry: targetCountry,
            amount: amount
        });

        const config = this.countryConfig[targetCountry];
        this.showNotification(`${config.name}에 ${amount} PA 투자 완료!`);
        amountInput.value = '';
    }

    setupArrivalScreen() {
        const team = this.gameState.team;

        const drawEventBtn = document.querySelector('.event-section button');
        if(drawEventBtn) {
            drawEventBtn.disabled = team.eventDrawnThisRound;
        }

        const eventResult = document.getElementById('eventResult');
        if (eventResult) {
            if (team.eventDrawnThisRound && team.eventText) {
                eventResult.className = 'result-display ' + team.eventResultClass;
                eventResult.innerHTML = team.eventText;
            } else {
                eventResult.innerHTML = '';
                eventResult.className = 'result-display';
            }
        }

        const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
        finalRpsButtons.forEach(btn => {
            btn.disabled = team.finalRpsPlayedThisRound;
            btn.style.opacity = team.finalRpsPlayedThisRound ? '0.5' : '1';
        });

        const finalRpsResult = document.getElementById('finalRpsResult');
        if (finalRpsResult) {
            if (team.finalRpsPlayedThisRound && team.finalRpsResult) {
                const rpsGoodsChange = team.finalRpsResult === 'win' ? 2 : team.finalRpsResult === 'lose' ? -2 : 0;
                let html = `결과: ${this.getRPSResultKorean(team.finalRpsResult)}. 상품 ${rpsGoodsChange}개`;
                if (team.country === 'england' && team.rpsRerolls > 0 && team.finalRpsResult !== 'win') {
                  html += ` 재도전 (${team.rpsRerolls} 남음)`;
                }
                finalRpsResult.className = 'result-display ' + team.finalRpsResult;
                finalRpsResult.innerHTML = html;
            } else {
                finalRpsResult.innerHTML = '';
                finalRpsResult.className = 'result-display';
            }
        }

        const arrivalStatusContainer = document.getElementById('arrival-status-container');
        if (arrivalStatusContainer) {
            arrivalStatusContainer.innerHTML = '';
        }
        
        this.updateTokenDisplay();
    }

    drawEvent() {
        if (!this.playerRoomId) {
            return this.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('draw_event', { roomId: this.playerRoomId });
        this.showNotification('이벤트 카드를 뽑았습니다!');
    }

    playFinalRPS(choice) {
        if (!this.playerRoomId) {
            return this.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('play_final_rps', {
            roomId: this.playerRoomId,
            choice: choice
        });

        this.showNotification(`${this.getRPSEmoji(choice)} 선택 완료!`);
        
        const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
        finalRpsButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
    }

    rerollFinalRPS() {
        if (!this.playerRoomId || !this.gameState.player.country) return;
        
        if (this.gameState.player.country !== 'england') {
            return this.showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
        }
        
        if (this.gameState.team.resetTokens <= 0) {
            return alert('리롤 토큰이 없습니다!');
        }

        if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${this.gameState.team.resetTokens}개`)) {
            this.socket.emit('reroll_final_rps', { roomId: this.playerRoomId });
        }
    }

    getRPSResultKorean(result) {
        const map = {
            'win': '승리',
            'lose': '패배',
            'draw': '무승부'
        };
        return map[result] || result;
    }

    updateArrivalStatus(teams) {
        const container = document.getElementById('arrival-status-container');
        if (!container) return;

        container.innerHTML = '';

        const myCountry = this.gameState.player.country;
        const myInvestments = this.gameState.team.investmentsMade || [];

        const otherTeamsOnVoyage = Object.values(teams).filter(team => team.country !== myCountry && team.tradeSelection);

        if (otherTeamsOnVoyage.length === 0) {
            container.innerHTML = '<p class="info-text">다른 팀의 항해 정보가 없습니다.</p>';
            return;
        }

        const title = document.createElement('h3');
        title.textContent = '다른 팀 입항 현황';
        title.style.color = 'var(--color-primary)';
        title.style.marginBottom = 'var(--spacing-md)';
        title.style.textAlign = 'center';
        container.appendChild(title);

        otherTeamsOnVoyage.forEach(team => {
            const card = document.createElement('div');
            card.className = 'investment-card';

            const investment = myInvestments.find(inv => inv.toTeam === team.country);
            let investmentInfo = '';
            if (investment) {
                investmentInfo = `<p style="color: var(--color-primary); font-weight: bold; margin-top: 8px;">내가 투자한 금액: ${investment.amount} PA</p>`;
            }

            const eventStatus = team.eventDrawnThisRound ? team.eventText : '대기중';
            const rpsStatus = team.finalRpsPlayedThisRound ? this.getRPSResultKorean(team.finalRpsResult) : '대기중';

            card.innerHTML = `
                <h4>${this.countryConfig[team.country].name}</h4>
                <p>이벤트 카드: ${eventStatus}</p>
                <p>최종 가위바위보: ${rpsStatus}</p>
                ${investmentInfo}
            `;
            
            container.appendChild(card);
        });
    }

    getPhaseKorean(phase) {
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

    updateAllTeamsStatus(teams) {
        const container = document.getElementById('allTeamsStatusContainer');
        if (!container) return;

        container.innerHTML = '';

        const teamArray = Object.values(teams);

        teamArray.forEach(team => {
            const card = document.createElement('div');
            card.className = 'team-status-card';

            const isMyTeam = team.country === this.gameState.player.country;
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

    updateMyTeamStatus(teams) {
        const myTeam = teams[this.gameState.player.country];
        const container = document.getElementById('myTeamStatus');
        if (!myTeam || !container) return;

        container.innerHTML = '';

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

    displayFinalResults(data) {
        const resultsArea = document.getElementById('resultsArea');
        if (!resultsArea) return;

        this.showArea('resultsArea');
        
        const resultsPanel = resultsArea.querySelector('.results-panel');
        if (!resultsPanel) return;

        resultsPanel.innerHTML = '';

        const rankings = data.rankings;
        if (!rankings || rankings.length === 0) {
            resultsPanel.innerHTML = '<p>결과를 계산할 수 없습니다.</p>';
            return;
        }

        const title = document.createElement('h2');
        title.textContent = '최종 순위';
        resultsPanel.appendChild(title);

        const winner = rankings[0];
        if (winner) {
            const winnerCard = document.createElement('div');
            winnerCard.className = 'winner-card';
            winnerCard.innerHTML = `
                <h3>1등: ${winner.name}</h3>
                <p>총 자산: ${winner.totalAssets} PA</p>
            `;
            resultsPanel.appendChild(winnerCard);
        }

        const table = document.createElement('table');
        table.className = 'results-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>순위</th>
                    <th>팀</th>
                    <th>총 자산</th>
                    <th>PA</th>
                    <th>비단</th>
                    <th>후추</th>
                </tr>
            </thead>
            <tbody>
                ${rankings.map(team => `
                    <tr class="${team.rank === 1 ? 'winner-row' : ''}">
                        <td>${team.rank}</td>
                        <td>${team.name}</td>
                        <td>${team.totalAssets}</td>
                        <td>${team.totalPA}</td>
                        <td>${team.silk}</td>
                        <td>${team.pepper}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        resultsPanel.appendChild(table);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameClient();
    window.game = game; 
});