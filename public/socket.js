class SocketHandler {
    constructor(game) {
        this.game = game;
        this.socket = io();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('서버에 연결되었습니다.');
            this.game.ui.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('서버 연결이 끊어졌습니다.');
            this.game.ui.updateConnectionStatus(false);
            this.game.ui.showNotification('서버 연결이 끊겼습니다. 재연결 중...');
        });

        this.socket.on('login_success', (data) => {
            console.log('Login successful', data);
            this.game.localPlayerName = data.name;
            this.game.localStudentId = data.studentId;
        
            localStorage.setItem('localStudentId', data.studentId);
            localStorage.setItem('localPlayerName', data.name);
        
            this.game.ui.showScreen('roomCodeInputScreen');
            
            const submitBtn = document.getElementById('submitNameBtn');
            if(submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '입력 완료';
            }
        });
        
        this.socket.on('login_failure', (data) => {
            this.game.ui.showNotification(`로그인 실패: ${data.message}`);
            const submitBtn = document.getElementById('submitNameBtn');
            if(submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '입력 완료';
            }
        });

        this.socket.on('error', (data) => {
            console.error('서버 오류:', data.message);
            this.game.ui.showNotification(`오류: ${data.message}`);
        });

        this.socket.on('trade_selection_error', (data) => {
            this.game.ui.showNotification(`오류: ${data.message}`);
            this.game.ui.cancelTrade();
        });

        this.socket.on('room_joined', (data) => {
            this.game.playerRoomId = data.roomId;
            this.game.countryConfig = data.countryConfig;
            localStorage.setItem('playerRoomId', data.roomId);
            // 재연결을 위해 학번과 이름도 저장
            localStorage.setItem('localStudentId', this.game.localStudentId);
            localStorage.setItem('localPlayerName', this.game.localPlayerName);

            this.game.ui.renderCountrySelection(data.countryConfig, data.playerCounts);
            this.game.ui.showScreen('countrySelection');
            const joinButton = document.getElementById('submitRoomCodeBtn');
            if (joinButton) {
                joinButton.disabled = false;
                joinButton.textContent = '준비 완료';
            }
        });

        this.socket.on('room_full', () => {
            this.game.ui.showNotification('방이 가득 찼습니다.');
            const joinButton = document.getElementById('submitRoomCodeBtn');
            if (joinButton) {
                joinButton.disabled = false;
                joinButton.textContent = '준비 완료';
            }
        });

        this.socket.on('room_not_found', () => {
            this.game.ui.showNotification('방을 찾을 수 없습니다.');
            const joinButton = document.getElementById('submitRoomCodeBtn');
            if (joinButton) {
                joinButton.disabled = false;
                joinButton.textContent = '준비 완료';
            }
        });

        this.socket.on('room_check_result', (data) => {
            if (data.exists) {
                this.game.playerRoomId = data.roomId;
                this.game.countryConfig = data.countryConfig;
                this.game.teams = data.teams;
                // 재연결을 위해 학번과 이름도 저장
                localStorage.setItem('playerRoomId', data.roomId);
                localStorage.setItem('localStudentId', this.game.localStudentId);
                localStorage.setItem('localPlayerName', this.game.localPlayerName);

                const playerCounts = {};
                for (const countryKey in data.countryConfig) {
                    playerCounts[countryKey] = data.teams[countryKey] ? data.teams[countryKey].members.length : 0;
                }

                this.game.ui.renderCountrySelection(data.countryConfig, playerCounts);
                this.game.ui.showScreen('countrySelection');
            } else {
                this.game.ui.showNotification('방을 찾을 수 없습니다.');
                const joinButton = document.getElementById('submitRoomCodeBtn');
                if (joinButton) {
                    joinButton.disabled = false;
                    joinButton.textContent = '준비 완료';
                }
            }
        });
        
        this.socket.on('invalid_session', (data) => {
            console.error('Invalid session:', data.message);
            if (confirm(data.message + '\n\n처음 화면으로 돌아가시겠습니까?')) {
                this.game.clearSessionAndReset();
            }
        });

        this.socket.on('game_state_update', (newState) => {
            if (!newState) {
                console.warn('game_state_update received with empty state. Ignoring.');
                return;
            }

            // 재연결 시 서버에서 받은 전체 상태로 gameState를 완전히 교체합니다.
            this.game.gameState = newState;
            this.game.teams = newState.teams; // 전체 팀 정보도 업데이트
            this.game.playerRegistered = true; // 재접속 플레이어는 항상 등록된 상태입니다.

            // 플레이어의 국가 정보를 기반으로 팀 정보를 찾아 UI를 업데이트합니다.
            const myCountry = this.game.gameState.player.country;
            if (myCountry && newState.teams[myCountry]) {
                this.game.updatePlayerStatsFromServer(newState.teams[myCountry]);
            }
            
            this.game.ui.showScreen('gameScreen'); // 메인 게임 화면으로 전환
            this.game.ui.updateAllTeamsStatus(newState.teams); // 전체 팀 사이드바 업데이트
            this.game.ui.updateGameState(this.game.gameState); // 나머지 전체 UI 업데이트
        });

        this.socket.on('team_update', (teamData) => {
            this.game.updatePlayerStatsFromServer(teamData);
            // If the team update happens during the arrival phase, it might contain
            // final RPS results, so we need to re-render the arrival screen.
            if (this.game.gameState.currentPhase === 'arrival') {
                this.game.ui.setupArrivalScreen();
            }
        });

        this.socket.on('teams_update', (data) => {
            this.game.teams = data.teams;

            // Update the player's own team state from the broadcast
            const myCountry = this.game.gameState.player.country;
            if (myCountry && data.teams[myCountry]) {
                this.game.updatePlayerStatsFromServer(data.teams[myCountry]);
            }

            this.game.ui.updateAllTeamsStatus(data.teams);
            this.game.ui.updateMyTeamStatus(data.teams);
            this.game.ui.updateInvestmentStatus();
            this.game.ui.updateArrivalStatus(data.teams);
        });

        this.socket.on('country_counts_update', (playerCounts) => {
            this.game.ui.renderCountrySelection(this.game.countryConfig, playerCounts);
        });

        this.socket.on('timer_update', (time) => {
            const timeString = `${String(time.minutes).padStart(2, '0')}:${String(time.seconds).padStart(2, '0')}`;
            const timeElement = document.getElementById('timeRemaining');
            if (timeElement) {
                timeElement.textContent = `남은 시간: ${timeString}`;
            }
        });

        this.socket.on('timer_ended', () => {
            this.game.ui.showNotification('시간 종료!');
        });

        this.socket.on('investment_info', (data) => {
            this.game.ui.setupInvestmentScreen(data.voyages);
        });

        this.socket.on('show_notification', (data) => {
            this.game.ui.showNotification(data.message);
        });

        this.socket.on('rps_result', (data) => {
            this.game.gameState.team.rpsResult = data;
            this.game.ui.renderProductionResults();
            this.game.ui.updateRerollButtons();
        });

        this.socket.on('final_rps_result', (data) => {
            this.game.gameState.team.finalRpsResultData = data;
            this.game.ui.setupArrivalScreen();
            this.game.ui.updateRerollButtons();
        });

        this.socket.on('event_result', (data) => {
            this.game.gameState.team.eventDrawnThisRound = true;
            this.game.gameState.team.eventText = data.text;
            this.game.gameState.team.eventResultClass = data.resultClass;
            this.game.ui.renderArrivalResults();
        });



        this.socket.on('game_ended', (data) => {
            this.game.ui.displayFinalResults(data);
        });

        this.socket.on('registration_success', (data) => {
            // playerRoomId is already set from the room_check_result
            localStorage.setItem('playerRoomId', this.game.playerRoomId);
        });
    }

    emit(eventName, data) {
        this.socket.emit(eventName, data);
    }
}
