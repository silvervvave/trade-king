class SocketHandler {
    constructor(game) {
        this.game = game;
        this.socket = io();
        this.setupSocket();
    }

    setupSocket() {
        this.socket.on('connect', () => {
            console.log('서버에 연결되었습니다!', this.socket.id);
            this.game.ui.updateConnectionStatus(true);

            const token = localStorage.getItem('sessionToken');
            const roomId = localStorage.getItem('playerRoomId');

            if (token && roomId) {
                console.log(`Attempting to reconnect to room ${roomId}...`);
                this.emit('reconnect_player', { roomId, token });
            } else if (this.game.gameState.player.country && this.game.playerRoomId && !this.game.playerRegistered && !this.game.gameState.gameStarted) {
                this.game.registerPlayer();
            }
        });

        this.socket.on('disconnect', () => {
            console.log('서버 연결이 끊어졌습니다.');
            this.game.ui.updateConnectionStatus(false);
        });

        this.socket.on('registration_success', (data) => {
            console.log('Registration successful, saving session data.');
            localStorage.setItem('sessionToken', data.token);
            localStorage.setItem('playerRoomId', this.game.playerRoomId);
            this.game.sessionToken = data.token;
        });

        this.socket.on('error', (data) => {
            console.error('서버 에러:', data.message);
            
            // 서버가 세션 초기화를 명시적으로 요구하는 경우
            if (data.action === 'clear_session') {
                alert(data.message); // 사용자에게 상황 알림
                this.game.clearSessionAndReset(); // 세션을 초기화하고 UI를 리셋
            } else {
                // 그 외 다른 모든 에러
                let errorMessage = '오류: ' + data.message;
                if (data.errors) {
                    errorMessage += '\n상세: ' + JSON.stringify(data.errors, null, 2);
                }
                alert(errorMessage);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('연결 오류:', error);
            this.game.ui.updateConnectionStatus(false);
        });

        this.socket.on('game_state_update', (state) => {
            console.log('전체 게임 상태 업데이트:', state);
            this.game.ui.updateGameState(state);
        });

        this.socket.on('phase_update', (data) => {
            console.log('Phase update:', data);
            this.game.gameState.currentPhase = data.currentPhase;
            this.game.gameState.currentRound = data.currentRound;
            this.game.gameState.gameStarted = data.gameStarted; // 게임 시작 상태 업데이트
            this.game.ui.updateGameState(this.game.gameState);
        });

        this.socket.on('team_state_update', (teamData) => {
            console.log('팀 상태 업데이트:', teamData);
            this.game.updatePlayerStatsFromServer(teamData);
        });

        this.socket.on('teams_update', (data) => {
            console.log('전체 팀 업데이트:', data);
            if (data.teams) {
                this.game.teams = data.teams;
            }

            if (this.game.gameState.player.country && this.game.teams[this.game.gameState.player.country]) {
                this.game.updatePlayerStatsFromServer(this.game.teams[this.game.gameState.player.country]);
            }
            
            this.game.ui.updateAllTeamsStatus(this.game.teams);
            this.game.ui.updateMyTeamStatus(this.game.teams);

            if (this.game.gameState.currentPhase === 'arrival') {
                this.game.ui.updateArrivalStatus(this.game.teams);
            }

            if (this.game.gameState.currentPhase === 'investment') {
                this.game.ui.updateInvestmentStatus();
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
            this.game.ui.showNotification('시간 종료!');
        });

        this.socket.on('timer_stopped', () => {
            const timeElement = document.getElementById('timeRemaining');
            if (timeElement) {
                timeElement.textContent = '시간: --:--';
            }
        });

        this.socket.on('action_result', (data) => {
            console.log('액션 결과:', data);
            this.game.ui.showNotification(data.message || '액션 완료!');
            if (data.teamState) {
                this.game.updatePlayerStatsFromServer(data.teamState);
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

            if (data.action === 'play_rps' && data.rpsResult) {
                const title = '가위바위보 결과';
                const content = `나: ${this.game.ui.getRPSEmoji(data.playerChoice)} vs 상대: ${this.game.ui.getRPSEmoji(data.opponentChoice)}\n\n결과: ${this.game.ui.getRPSResultKorean(data.rpsResult)}`;
                this.game.ui.showResultModal(title, content);
            }

            if (data.action === 'draw_event' && data.teamState) {
                const title = '이벤트 발생!';
                this.game.ui.showResultModal(title, data.teamState.eventText);
            }

            if (data.action === 'play_final_rps' && data.finalRpsResult) {
                const title = '최종 가위바위보 결과';
                const goodsChange = data.finalRpsResult.result === 'win' ? 2 : data.finalRpsResult.result === 'lose' ? -2 : 0;
                const content = `나: ${this.game.ui.getRPSEmoji(data.finalRpsResult.playerChoice)} vs 상대: ${this.game.ui.getRPSEmoji(data.finalRpsResult.opponentChoice)}\n\n결과: ${this.game.ui.getRPSResultKorean(data.finalRpsResult.result)}\n상품 ${goodsChange}개`;
                this.game.ui.showResultModal(title, content);
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

        this.socket.on('investment_info', (data) => {
            console.log('투자 정보:', data);
            this.game.ui.setupInvestmentScreen(data.voyages);
        });

        this.socket.on('arrival_summary', (data) => {
            console.log('입항 요약:', data);
            this.game.ui.addArrivalSummary(data);
        });

        this.socket.on('game_ended', (data) => {
            console.log('게임 종료:', data);
            this.game.ui.showNotification('게임이 종료되었습니다!');
            this.game.ui.displayFinalResults(data);
        });

        this.socket.on('room_check_result', (data) => {
            console.log('room_check_result 이벤트 수신:', data);
            const joinButton = document.getElementById('submitRoomCodeBtn');
            joinButton.disabled = false;
            joinButton.textContent = '준비 완료';

            if (data.exists) {
                this.game.playerRoomId = data.roomId;

                if (data.countryConfig) {
                    this.game.countryConfig = data.countryConfig;
                    if (data.teams) {
                        this.game.teams = data.teams;
                    }
                    this.game.ui.renderCountrySelection(this.game.countryConfig, data.playerCounts || {});
                }

                this.game.ui.showScreen('countrySelection');
                this.game.ui.showNotification(`안녕하세요, ${this.game.localPlayerName}님! 이제 국가를 선택하세요.`);
            } else {
                this.game.ui.showNotification('존재하지 않는 방 코드입니다. 다시 확인해주세요.');
                document.getElementById('roomCodeInput').focus();
            }
        });

        this.socket.on('game_reset', () => {
            console.log('게임 리셋');
            location.reload();
        });

        this.socket.on('notification', (data) => {
            this.game.ui.showNotification(data.message);
        });
    }

    emit(eventName, data) {
        this.socket.emit(eventName, data);
    }
}
