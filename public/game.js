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
                productPACount: 0,
                maxProduct: 0, // Initialize maxProduct
                resetTokens: 0,
                mercantilismTokens: 0,
                investmentsMade: [],
                clickCount: 0, // Tracks clicks within a batch
                batchCount: 0,
                eventDrawnThisRound: false,
                finalRpsPlayedThisRound: false,
                eventText: '',
                eventResultClass: '',
                finalRpsResult: '',
                rpsResult: null,
                eventResult: null,
                finalRpsResultData: null
            },
            currentRound: 0,
            currentPhase: 'waiting',
            gameStarted: false
        };
        this.countryConfig = {};
        this.playerRegistered = false;
        this.playerRoomId = localStorage.getItem('playerRoomId');
        this.localPlayerName = localStorage.getItem('localPlayerName'); // Load from localStorage
        this.localStudentId = localStorage.getItem('localStudentId');   // Load from localStorage
        this.selectedTradeDestination = null;
        this.teams = {};

        this.ui = new UIManager(this);
        this.socket = new SocketHandler(this);

        this.initializeUI();
        this.handleReconnect();
    }

    handleReconnect() {
        if (this.playerRoomId && this.localStudentId && this.localPlayerName) {
            console.log('재연결 시도:', {
                roomId: this.playerRoomId,
                studentId: this.localStudentId,
                name: this.localPlayerName
            });
            this.socket.emit('join_or_reconnect_room', {
                roomId: this.playerRoomId,
                studentId: this.localStudentId,
                name: this.localPlayerName
            });
        }
    }

    emitSocket(eventName, payload) {
        if (!this.playerRoomId) {
            this.ui.showNotification('게임에 참가하지 않았습니다.');
            return false;
        }
        const dataToSend = { ...payload, roomId: this.playerRoomId };
        this.socket.emit(eventName, dataToSend);
        return true;
    }

    initializeUI() {
        const addClick = (id, handler) => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('click', handler);
            }
        };

        // Initial screen
        addClick('playerBtn', () => this.ui.showScreen('nameInputScreen'));
        addClick('submitNameBtn', () => this.handleNameSubmit());
        addClick('submitRoomCodeBtn', () => this.joinRoom());
        addClick('modalCloseBtn', () => this.ui.hideCountryDescription());
        addClick('modalSelectBtn', () => this.handleCountrySelect());

        // Top Banner
        addClick('gameInfoBtn', () => this.ui.showGameInfoModal());
        addClick('teamSidebarToggle', () => document.getElementById('teamSidebar').classList.toggle('open'));
        addClick('bannerLeft', () => location.reload());

        // Game Navigation
        addClick('navProduction', () => this.ui.showArea('productionArea'));
        addClick('navCurrentPhase', (event) => {
            const targetArea = event.currentTarget.dataset.area;
            if (targetArea) {
                this.ui.showArea(targetArea);
            }
        });

        // Phase-specific Actions
        addClick('produceBtn', () => this.produce());
        addClick('rerollRPSBtn', () => this.rerollRPS());
        addClick('confirmTradeBtn', () => this.confirmTrade());
        addClick('cancelTradeBtn', () => this.ui.cancelTrade());
        addClick('skipTradeBtn', () => this.confirmTrade('none'));
        addClick('resetTradeBtn', () => this.resetTrade());
        addClick('resetInvestmentsBtn', () => this.resetInvestments());
        addClick('drawEventBtn', () => this.drawEvent());
        addClick('rerollFinalRPSBtn', () => this.rerollFinalRPS());

        // Event delegation for dynamically created elements or multiple elements
        document.body.addEventListener('click', (event) => {
            // RPS buttons (Production Phase)
            if (event.target.matches('.rps-btn')) {
                const choice = event.target.dataset.choice;
                this.playRPS(choice);
            }
            // Destination Cards (Trade Phase)
            if (event.target.matches('.destination-card')) {
                const destination = event.target.dataset.destination;
                if (destination) {
                    this.ui.selectTradeDestination(destination);
                }
            }
            // Investment Buttons (Investment Phase)
            if (event.target.matches('#investmentOptions .game-btn')) {
                const targetCountry = event.target.onclick.toString().match(/makeInvestment\('(.*?)'\)/)[1];
                if (targetCountry) {
                    this.makeInvestment(targetCountry);
                }
            }
            // Final RPS buttons (Arrival Phase)
            if (event.target.matches('.final-rps-btn')) {
                const choice = event.target.dataset.choice;
                this.playFinalRPS(choice);
            }
        });

        // Viewport scaling for small devices
        const handleViewportScaling = () => {
            const MIN_WIDTH = 360; // Minimum design width
            if (window.innerWidth < MIN_WIDTH) {
                const scale = window.innerWidth / MIN_WIDTH;
                document.body.style.transform = `scale(${scale})`;
                document.body.style.transformOrigin = 'top left';
                document.body.style.width = `${MIN_WIDTH}px`;
                document.body.style.height = `${window.innerHeight / scale}px`;
            } else {
                document.body.style.transform = 'none';
                document.body.style.width = '100%';
                document.body.style.height = 'auto';
            }
        };

        window.addEventListener('resize', handleViewportScaling);
        handleViewportScaling(); // Initial call
    }

    handleNameSubmit() {
        const studentIdInput = document.getElementById('studentIdInput');
        const nameInput = document.getElementById('playerNameInput');
        
        const studentId = studentIdInput.value.trim();
        const name = nameInput.value.trim();

        if (!this.validateInput(studentId)) {
            this.ui.showNotification('학번은 1~20자의 한글, 영문, 숫자만 가능합니다.');
            studentIdInput.focus();
            return;
        }
        if (!this.validateInput(name)) {
            this.ui.showNotification('이름은 1~20자의 한글, 영문, 숫자만 가능합니다.');
            nameInput.focus();
            return;
        }

        const submitBtn = document.getElementById('submitNameBtn');
        submitBtn.disabled = true;
        submitBtn.textContent = '로그인 중...';

        this.socket.emit('login_or_register', {
            studentId: studentId,
            name: name
        });
    }

    validateInput(name) {
        return /^[a-zA-Z0-9가-힣]{1,20}$/.test(name);
    }

    validateRoomCode(code) {
        return /^[A-Z0-9]{4}$/.test(code);
    }

    joinRoom() {
        const roomInput = document.getElementById('roomCodeInput');
        const roomId = roomInput.value.trim().toUpperCase();

        if (!this.validateRoomCode(roomId)) {
            this.ui.showNotification('방 코드는 정확히 4자리 영문 대문자 또는 숫자여야 합니다.');
            roomInput.focus();
            return;
        }

        const joinButton = document.getElementById('submitRoomCodeBtn');
        joinButton.disabled = true;
        joinButton.textContent = '확인 중...';
        this.socket.emit('join_or_reconnect_room', {
            roomId: roomId,
            studentId: this.localStudentId,
            name: this.localPlayerName
        });
    }

    handleCountryClick(country) {
        if (!this.countryConfig[country]) {
            return alert('유효하지 않은 국가입니다.');
        }
        this.selectedCountry = country;
        this.ui.showCountryDescription(country);
    }

    handleCountrySelect() {
        this.selectCountry(this.selectedCountry);
        this.ui.hideCountryDescription();
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

        this.socket.emit('register_player', {
            country: this.gameState.player.country,
            name: this.gameState.player.name,
            studentId: this.localStudentId, // Add studentId here
            roomId: this.playerRoomId
        });

        this.playerRegistered = true;

        this.ui.showScreen('waitingScreen');

        this.ui.showNotification(`${this.countryConfig[this.gameState.player.country].name} 팀에 참가했습니다!`);
    }

    updatePlayerStatsFromServer(teamData) {
        // Preserve the individual, client-side click progress
        const localClickCount = this.gameState.team.clickCount || 0;

        this.gameState.team = {
            ...teamData,
            clickCount: localClickCount, // Restore local click progress
        };
        
        this.ui.updatePlayerStats();
        this.ui.updateTokenDisplay();
        this.ui.updateTradeSelectionDisplay();
        this.ui.renderProductionResults();
        this.ui.renderArrivalResults();

        const resetTradeBtn = document.getElementById('resetTradeBtn');
        if (resetTradeBtn) {
            const tradeSelection = this.gameState.team.tradeSelection;
            resetTradeBtn.classList.toggle('hidden', !tradeSelection);
        }

        const resetInvestmentsBtn = document.getElementById('resetInvestmentsBtn');
        if (resetInvestmentsBtn) {
            const investmentsMade = this.gameState.team.investmentsMade || [];
            resetInvestmentsBtn.classList.toggle('hidden', investmentsMade.length === 0);
        }
    }

    produce() {
        if (!this.gameState.player.country || !this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        const config = this.countryConfig[this.gameState.player.country];
        if (!config) {
            return this.ui.showNotification('국가 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.');
        }
        
        // Check against maxBatchCount
        if (this.gameState.team.batchCount >= config.maxBatchCount) {
            return this.ui.showNotification('최대 생산 횟수에 도달했습니다!');
        }
        
        // Increment local click count
        this.gameState.team.clickCount++;

        // Update UI immediately for responsiveness
        this.ui.updatePlayerStats();

        // Check if a batch is completed
        if (this.gameState.team.clickCount >= config.clicksPerBatch) {
            // Send a single event for the completed batch
            this.emitSocket('complete_production_batch', {});
            // Reset local click counter
            this.gameState.team.clickCount = 0;
        }
    }

    playRPS(choice) {
        if (this.emitSocket('play_rps', { choice })) {
            // Store player's choice immediately
            if (!this.gameState.team.rpsResult) {
                this.gameState.team.rpsResult = {};
            }
            this.gameState.team.rpsResult.playerChoice = choice;

            this.ui.showNotification(`${this.ui.getRPSEmoji(choice)} 선택 완료!`);
            
            const rpsButtons = document.querySelectorAll('.rps-btn');
            rpsButtons.forEach(btn => {
                btn.disabled = true;
                if (btn.dataset.choice === choice) {
                    btn.classList.add('selected');
                } else {
                    btn.style.opacity = '0.5';
                }
            });
        }
    }

    reroll(type) {
        if (!this.gameState.player.country) return;

        if (this.gameState.player.country !== 'england') {
            return this.ui.showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
        }

        if (this.gameState.team.resetTokens <= 0) {
            return this.ui.showNotification('리롤 토큰이 없습니다!');
        }

        if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${this.gameState.team.resetTokens}개`)) {
            const eventName = type === 'final' ? 'reroll_final_rps' : 'reroll_rps';
            if (this.emitSocket(eventName)) {
                this.ui.showNotification('리롤 토큰을 사용했습니다!');
            }
        }
    }

    rerollRPS() {
        this.reroll('rps');
    }

    confirmTrade(tradeTypeOverride) {
        let tradeType = tradeTypeOverride || this.selectedTradeDestination;
        let amount = 0;

        if (tradeType !== 'none') {
            const previousAmount = this.gameState.team.tradeSelection ? this.gameState.team.tradeSelection.amount : 0;
            const availablePA = this.gameState.team.totalPA + previousAmount;
            amount = parseInt(document.getElementById('tradeAmountValue').textContent, 10);

            if (isNaN(amount) || amount < 20 || amount % 10 !== 0) { // Changed from 200, 100
                return this.ui.showNotification('유효하지 않은 금액입니다. (20 PA 이상, 10 PA 단위로 입력)'); // Updated message
            }
            if (amount > availablePA) {
                return this.ui.showNotification('보유한 PA가 부족합니다.');
            }
        }

        if (this.emitSocket('trade_selection', { type: tradeType, amount: amount })) {
            this.ui.updateTradeSelectionDisplay();
            this.ui.updatePlayerStats();
            this.ui.showNotification('출항 선택이 완료되었습니다!');
            document.getElementById('tradeConfirmation').classList.add('hidden');
            document.getElementById('tradeAmountValue').textContent = '20'; // Reset to default 20 PA
        }
    }

    makeInvestment(targetCountry) {
        const amountSpan = document.getElementById(`investAmountValue-${targetCountry}`);
        const amount = parseInt(amountSpan.textContent, 10);

        if (isNaN(amount) || amount < 10) { // Changed from 100
            return this.ui.showNotification('유효하지 않은 투자 금액입니다. (10 PA 이상)'); // Updated message
        }

        if (amount > this.gameState.team.totalPA) {
            return this.ui.showNotification('보유한 PA가 부족합니다.');
        }

        if (this.emitSocket('make_investment', { targetCountry: targetCountry, amount: amount })) {
            this.ui.updatePlayerStats();
            const config = this.countryConfig[targetCountry];
            this.ui.showNotification(`${config.name}에 ${amount} PA 투자 완료!`);
            amountSpan.textContent = '10'; // Reset to default 10 PA
        }
    }

    resetTrade() {
        if (this.emitSocket('reset_trade')) {
            if (this.gameState.team.tradeSelection) {
                this.ui.updateTradeSelectionDisplay();
                this.ui.updatePlayerStats();
            }
        }
    }

    resetInvestments() {
        if (this.emitSocket('reset_investments')) {
            if (this.gameState.team.investmentsMade && this.gameState.team.investmentsMade.length > 0) {
                let totalRefund = 0;
                this.gameState.team.investmentsMade.forEach(investment => {
                    totalRefund += investment.amount;
                });

                this.ui.updatePlayerStats();
            }
        }
    }

    drawEvent() {
        if (this.emitSocket('draw_event')) {
            this.ui.showNotification('이벤트 카드를 뽑았습니다!');
        }
    }

    playFinalRPS(choice) {
        if (this.emitSocket('play_final_rps', { choice })) {
            this.ui.showNotification(`${this.ui.getRPSEmoji(choice)} 선택 완료!`);
            
            const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
            finalRpsButtons.forEach(btn => {
                btn.disabled = true;
                if (btn.dataset.choice === choice) {
                    btn.classList.add('selected');
                } else {
                    btn.style.opacity = '0.5';
                }
            });
        }
    }

    rerollFinalRPS() {
        this.reroll('final');
    }

    clearSessionAndReset() {
        console.log("Clearing session and resetting UI...");
        // Clear local storage
        localStorage.removeItem('playerRoomId');
        localStorage.removeItem('localStudentId'); // Clear localStudentId from localStorage

        // Reload the page to ensure a completely clean state
        window.location.reload();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameClient();
    window.game = game; 
});
