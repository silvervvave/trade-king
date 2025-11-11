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

            // Re-register if we have a session
            if (this.game.sessionToken && this.game.playerRoomId) {
                this.emit('reconnect_player', {
                    roomId: this.game.playerRoomId,
                    sessionToken: this.game.sessionToken
                });
            }
        });

        this.socket.on('disconnect', () => {
            console.log('서버 연결이 끊어졌습니다.');
            this.game.ui.updateConnectionStatus(false);
            this.game.ui.showNotification('서버 연결이 끊겼습니다. 재연결 중...');
        });

        this.socket.on('error', (data) => {
            console.error('서버 오류:', data.message);
            this.game.ui.showNotification(`오류: ${data.message}`);
        });

        this.socket.on('room_joined', (data) => {
            this.game.playerRoomId = data.roomId;
            this.game.sessionToken = data.sessionToken;
            this.game.countryConfig = data.countryConfig;
            localStorage.setItem('playerRoomId', data.roomId);
            localStorage.setItem('sessionToken', data.sessionToken);

            this.game.ui.renderCountrySelection(data.countryConfig, data.playerCounts);
            this.game.ui.showScreen('countrySelection');
            const joinButton = document.getElementById('submitRoomCodeBtn');
            joinButton.disabled = false;
            joinButton.textContent = '준비 완료';
        });

        this.socket.on('room_full', () => {
            this.game.ui.showNotification('방이 가득 찼습니다.');
            const joinButton = document.getElementById('submitRoomCodeBtn');
            joinButton.disabled = false;
            joinButton.textContent = '준비 완료';
        });

        this.socket.on('room_not_found', () => {
            this.game.ui.showNotification('방을 찾을 수 없습니다.');
            const joinButton = document.getElementById('submitRoomCodeBtn');
            joinButton.disabled = false;
            joinButton.textContent = '준비 완료';
        });
        
        this.socket.on('invalid_session', (data) => {
            console.log(data.message);
            this.game.clearSessionAndReset();
        });

        this.socket.on('game_state_update', (newState) => {
            this.game.gameState = { ...this.game.gameState, ...newState };
            this.game.ui.updateGameState(this.game.gameState);
        });

        this.socket.on('team_update', (teamData) => {
            this.game.updatePlayerStatsFromServer(teamData);
        });

        this.socket.on('teams_update', (data) => {
            this.game.teams = data.teams;
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

        this.socket.on('investment_options', (data) => {
            this.game.ui.setupInvestmentScreen(data.voyages);
        });

        this.socket.on('show_notification', (data) => {
            this.game.ui.showNotification(data.message);
        });

        this.socket.on('rps_result', (data) => {
            this.game.gameState.team.rpsResult = data;
            this.game.ui.renderProductionResults();
        });

        this.socket.on('final_rps_result', (data) => {
            this.game.gameState.team.finalRpsResultData = data;
            this.game.ui.renderArrivalResults();
        });

        this.socket.on('event_result', (data) => {
            this.game.gameState.team.eventDrawnThisRound = true;
            this.game.gameState.team.eventText = data.text;
            this.game.gameState.team.eventResultClass = data.resultClass;
            this.game.ui.renderArrivalResults();
        });

        this.socket.on('arrival_summary', (data) => {
            this.game.ui.addArrivalSummary(data);
        });

        this.socket.on('game_ended', (data) => {
            this.game.ui.displayFinalResults(data);
        });
    }

    emit(eventName, data) {
        this.socket.emit(eventName, data);
    }
}
