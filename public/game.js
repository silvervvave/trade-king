<<<<<<< HEAD
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
                maxProduct: 0, // Initialize maxProduct
                resetTokens: 0,
                mercantilismTokens: 0,
                investmentsMade: [],
                productionBoxClickCount: 0,
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
        this.sessionToken = localStorage.getItem('sessionToken');
        this.localPlayerName = null;
        this.clickBuffer = 0;
        this.selectedTradeDestination = null;
        this.teams = {};

        this.ui = new UIManager(this);
        this.socket = new SocketHandler(this);

        this.initializeUI();

        setInterval(() => {
            if (this.clickBuffer > 0) {
                this.socket.emit('production_batch', { roomId: this.playerRoomId, clicks: this.clickBuffer });
                this.clickBuffer = 0;
            }
        }, 100);
    }

    initializeUI() {
        // Initial screen
        const playerBtn = document.getElementById('playerBtn');
        playerBtn.addEventListener('click', () => this.ui.showScreen('nameInputScreen'));

        // Name input screen
        const submitNameBtn = document.getElementById('submitNameBtn');
        submitNameBtn.addEventListener('click', () => this.handleNameSubmit());

        // Room code input screen
        const submitRoomCodeBtn = document.getElementById('submitRoomCodeBtn');
        submitRoomCodeBtn.addEventListener('click', () => this.joinRoom());

        // Country description modal
        const modalCloseBtn = document.getElementById('modalCloseBtn');
        modalCloseBtn.addEventListener('click', () => this.ui.hideCountryDescription());

        const modalSelectBtn = document.getElementById('modalSelectBtn');
        modalSelectBtn.addEventListener('click', () => this.handleCountrySelect());

        // Top Banner - Game Info Button
        const gameInfoBtn = document.getElementById('gameInfoBtn');
        if (gameInfoBtn) {
            gameInfoBtn.addEventListener('click', () => this.ui.showGameInfoModal());
        }

        // Top Banner - Team Sidebar Toggle
        const teamSidebarToggle = document.getElementById('teamSidebarToggle');
        if (teamSidebarToggle) {
            teamSidebarToggle.addEventListener('click', () => {
                document.getElementById('teamSidebar').classList.toggle('open');
            });
        }

        // Top Banner - Logo click
        const bannerLeft = document.getElementById('bannerLeft');
        if (bannerLeft) {
            bannerLeft.addEventListener('click', () => {
                location.reload();
            });
        }

        // Game Navigation Buttons
        document.getElementById('navProduction').addEventListener('click', () => this.ui.showArea('productionArea'));
        document.getElementById('navCurrentPhase').addEventListener('click', (event) => {
            const targetArea = event.currentTarget.dataset.area;
            if (targetArea) {
                this.ui.showArea(targetArea);
            }
        });

        // Production Area
        const produceBtn = document.getElementById('produceBtn');
        if (produceBtn) {
            produceBtn.addEventListener('click', () => this.produce());
        }
        const rerollRPSBtn = document.getElementById('rerollRPSBtn');
        if (rerollRPSBtn) {
            rerollRPSBtn.addEventListener('click', () => this.rerollRPS());
        }

        // Trade Area
        const confirmTradeBtn = document.getElementById('confirmTradeBtn');
        if (confirmTradeBtn) {
            confirmTradeBtn.addEventListener('click', () => this.confirmTrade());
        }
        const cancelTradeBtn = document.getElementById('cancelTradeBtn');
        if (cancelTradeBtn) {
            cancelTradeBtn.addEventListener('click', () => this.ui.cancelTrade());
        }
        const skipTradeBtn = document.getElementById('skipTradeBtn');
        if (skipTradeBtn) {
            skipTradeBtn.addEventListener('click', () => this.confirmTrade('none'));
        }
        const resetTradeBtn = document.getElementById('resetTradeBtn');
        if (resetTradeBtn) {
            resetTradeBtn.addEventListener('click', () => this.resetTrade());
        }

        // Investment Area
        const resetInvestmentsBtn = document.getElementById('resetInvestmentsBtn');
        if (resetInvestmentsBtn) {
            resetInvestmentsBtn.addEventListener('click', () => this.resetInvestments());
        }

        // Arrival Area
        const drawEventBtn = document.getElementById('drawEventBtn');
        if (drawEventBtn) {
            drawEventBtn.addEventListener('click', () => this.drawEvent());
        }
        const rerollFinalRPSBtn = document.getElementById('rerollFinalRPSBtn');
        if (rerollFinalRPSBtn) {
            rerollFinalRPSBtn.addEventListener('click', () => this.rerollFinalRPS());
        }

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
        const nameInput = document.getElementById('playerNameInput');
        const name = nameInput.value.trim();

        if (!this.validatePlayerName(name)) {
            this.ui.showNotification('이름은 1~20자의 한글, 영문, 숫자만 가능합니다.');
            nameInput.focus();
            return;
        }

        this.localPlayerName = name;
        this.ui.showScreen('roomCodeInputScreen');
    }

    validatePlayerName(name) {
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
        this.socket.emit('check_room', { roomId, playerName: this.localPlayerName });
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
            playerName: this.gameState.player.name,
            roomId: this.playerRoomId
        });

        this.playerRegistered = true;

        this.ui.showScreen('waitingScreen');

        this.ui.showNotification(`${this.countryConfig[this.gameState.player.country].name} 팀에 참가했습니다!`);
    }

    updatePlayerStatsFromServer(teamData) {
        this.gameState.team = {
            totalPA: teamData.totalPA || 0,
            silk: teamData.silk || 0,
            pepper: teamData.pepper || 0,
            clickCount: teamData.clickCount || 0,
            maxProduct: teamData.maxProduct || 0, // Update maxProduct
            productionBoxClickCount: teamData.productionBoxClickCount || 0,
            resetTokens: teamData.resetTokens || 0,
            mercantilismTokens: teamData.mercantilismTokens || 0,
            investmentsMade: teamData.investmentsMade || [],
            tradeSelection: teamData.tradeSelection || null,
            eventDrawnThisRound: teamData.eventDrawnThisRound || false,
            finalRpsPlayedThisRound: teamData.finalRpsPlayedThisRound || false,
            eventText: teamData.eventText || '',
            eventResultClass: teamData.eventResultClass || '',
            finalRpsResult: teamData.finalRpsResult || '',
            rpsResult: teamData.rpsResult || null,
            eventResult: teamData.eventResult || null,
            finalRpsResultData: teamData.finalRpsResultData || null
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
        
        // Check against maxProduct (total PA) instead of maxClicks
        if (this.gameState.team.totalPA >= config.maxProduct) {
            return this.ui.showNotification('최대 생산량에 도달했습니다!');
        }
        
        this.clickBuffer++;
        this.gameState.team.productionBoxClickCount++;

        if (this.gameState.team.productionBoxClickCount >= 30) {
            this.gameState.team.productionBoxClickCount = 0; // Reset after filling
            this.socket.emit('production_box_filled', { roomId: this.playerRoomId });
        }
        this.ui.updatePlayerStats();
    }

    playRPS(choice) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('play_rps', {
            roomId: this.playerRoomId,
            choice: choice
        });

        // Store player's choice immediately
        if (!this.gameState.team.rpsResult) {
            this.gameState.team.rpsResult = {};
        }
        this.gameState.team.rpsResult.playerChoice = choice;

        this.ui.showNotification(`${this.ui.getRPSEmoji(choice)} 선택 완료!`);
        
        const rpsButtons = document.querySelectorAll('.rps-btn');
        rpsButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
    }

    rerollRPS() {
        if (!this.playerRoomId || !this.gameState.player.country) return;
        
        if (this.gameState.player.country !== 'england') {
            return this.ui.showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
        }
        
        if (this.gameState.team.resetTokens <= 0) {
            return this.ui.showNotification('리롤 토큰이 없습니다!');
        }

        if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${this.gameState.team.resetTokens}개`)) {
            this.socket.emit('reroll_rps', { roomId: this.playerRoomId });
            this.ui.showNotification('리롤 토큰을 사용했습니다!');
        }
    }

    confirmTrade(tradeTypeOverride) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

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

        this.ui.updateTradeSelectionDisplay();
        this.ui.updatePlayerStats();

        this.socket.emit('trade_selection', {
            roomId: this.playerRoomId,
            type: tradeType,
            amount: amount
        });
        
        this.ui.showNotification('출항 선택이 완료되었습니다!');
        document.getElementById('tradeConfirmation').classList.add('hidden');
        document.getElementById('tradeAmountValue').textContent = '20'; // Reset to default 20 PA
    }

    makeInvestment(targetCountry) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        const amountSpan = document.getElementById(`investAmountValue-${targetCountry}`);
        const amount = parseInt(amountSpan.textContent, 10);

        if (isNaN(amount) || amount < 10) { // Changed from 100
            return this.ui.showNotification('유효하지 않은 투자 금액입니다. (10 PA 이상)'); // Updated message
        }

        if (amount > this.gameState.team.totalPA) {
            return this.ui.showNotification('보유한 PA가 부족합니다.');
        }

        this.ui.updatePlayerStats();

        this.socket.emit('make_investment', {
            roomId: this.playerRoomId,
            targetCountry: targetCountry,
            amount: amount
        });

        const config = this.countryConfig[targetCountry];
        this.ui.showNotification(`${config.name}에 ${amount} PA 투자 완료!`);
        amountSpan.textContent = '10'; // Reset to default 10 PA
    }

    resetTrade() {
        if (!this.playerRoomId) return;

        if (this.gameState.team.tradeSelection) {
            this.ui.updateTradeSelectionDisplay();
            this.ui.updatePlayerStats();
        }

        this.socket.emit('reset_trade', { roomId: this.playerRoomId });
    }

    resetInvestments() {
        if (!this.playerRoomId) return;

        if (this.gameState.team.investmentsMade && this.gameState.team.investmentsMade.length > 0) {
            let totalRefund = 0;
            this.gameState.team.investmentsMade.forEach(investment => {
                totalRefund += investment.amount;
            });

            this.ui.updatePlayerStats();
        }

        this.socket.emit('reset_investments', { roomId: this.playerRoomId });
    }

    drawEvent() {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('draw_event', { roomId: this.playerRoomId });
        this.ui.showNotification('이벤트 카드를 뽑았습니다!');
    }

    playFinalRPS(choice) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('play_final_rps', {
            roomId: this.playerRoomId,
            choice: choice
        });

        this.ui.showNotification(`${this.ui.getRPSEmoji(choice)} 선택 완료!`);
        
        const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
        finalRpsButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
    }

    rerollFinalRPS() {
        if (!this.playerRoomId || !this.gameState.player.country) return;
        
        if (this.gameState.player.country !== 'england') {
            return this.ui.showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
        }
        
        if (this.gameState.team.resetTokens <= 0) {
            return alert('리롤 토큰이 없습니다!');
        }

        if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${this.gameState.team.resetTokens}개`)) {
            this.socket.emit('reroll_final_rps', { roomId: this.playerRoomId });
        }
    }

    clearSessionAndReset() {
        console.log("Clearing session and resetting UI...");
        // Clear local storage
        localStorage.removeItem('playerRoomId');
        localStorage.removeItem('sessionToken');

        // Reset internal state
        this.playerRoomId = null;
        this.sessionToken = null;
        this.playerRegistered = false;
        this.gameState = { /* ... re-initialize or reset gameState ... */ };

        // Reset UI to the very first screen
        this.ui.showScreen('startScreen');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameClient();
    window.game = game; 
=======
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
                maxProduct: 0, // Initialize maxProduct
                resetTokens: 0,
                mercantilismTokens: 0,
                investmentsMade: [],
                productionBoxClickCount: 0,
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
        this.sessionToken = localStorage.getItem('sessionToken');
        this.localPlayerName = null;
        this.clickBuffer = 0;
        this.selectedTradeDestination = null;
        this.teams = {};

        this.ui = new UIManager(this);
        this.socket = new SocketHandler(this);

        this.initializeUI();

        setInterval(() => {
            if (this.clickBuffer > 0) {
                this.socket.emit('production_batch', { roomId: this.playerRoomId, clicks: this.clickBuffer });
                this.clickBuffer = 0;
            }
        }, 100);
    }

    initializeUI() {
        // Initial screen
        const playerBtn = document.getElementById('playerBtn');
        playerBtn.addEventListener('click', () => this.ui.showScreen('nameInputScreen'));

        // Name input screen
        const submitNameBtn = document.getElementById('submitNameBtn');
        submitNameBtn.addEventListener('click', () => this.handleNameSubmit());

        // Room code input screen
        const submitRoomCodeBtn = document.getElementById('submitRoomCodeBtn');
        submitRoomCodeBtn.addEventListener('click', () => this.joinRoom());

        // Country description modal
        const modalCloseBtn = document.getElementById('modalCloseBtn');
        modalCloseBtn.addEventListener('click', () => this.ui.hideCountryDescription());

        const modalSelectBtn = document.getElementById('modalSelectBtn');
        modalSelectBtn.addEventListener('click', () => this.handleCountrySelect());

        // Top Banner - Game Info Button
        const gameInfoBtn = document.getElementById('gameInfoBtn');
        if (gameInfoBtn) {
            gameInfoBtn.addEventListener('click', () => this.ui.showGameInfoModal());
        }

        // Top Banner - Team Sidebar Toggle
        const teamSidebarToggle = document.getElementById('teamSidebarToggle');
        if (teamSidebarToggle) {
            teamSidebarToggle.addEventListener('click', () => {
                document.getElementById('teamSidebar').classList.toggle('open');
            });
        }

        // Top Banner - Logo click
        const bannerLeft = document.getElementById('bannerLeft');
        if (bannerLeft) {
            bannerLeft.addEventListener('click', () => {
                location.reload();
            });
        }

        // Game Navigation Buttons
        document.getElementById('navProduction').addEventListener('click', () => this.ui.showArea('productionArea'));
        document.getElementById('navCurrentPhase').addEventListener('click', (event) => {
            const targetArea = event.currentTarget.dataset.area;
            if (targetArea) {
                this.ui.showArea(targetArea);
            }
        });

        // Production Area
        const produceBtn = document.getElementById('produceBtn');
        if (produceBtn) {
            produceBtn.addEventListener('click', () => this.produce());
        }
        const rerollRPSBtn = document.getElementById('rerollRPSBtn');
        if (rerollRPSBtn) {
            rerollRPSBtn.addEventListener('click', () => this.rerollRPS());
        }

        // Trade Area
        const confirmTradeBtn = document.getElementById('confirmTradeBtn');
        if (confirmTradeBtn) {
            confirmTradeBtn.addEventListener('click', () => this.confirmTrade());
        }
        const cancelTradeBtn = document.getElementById('cancelTradeBtn');
        if (cancelTradeBtn) {
            cancelTradeBtn.addEventListener('click', () => this.ui.cancelTrade());
        }
        const skipTradeBtn = document.getElementById('skipTradeBtn');
        if (skipTradeBtn) {
            skipTradeBtn.addEventListener('click', () => this.confirmTrade('none'));
        }
        const resetTradeBtn = document.getElementById('resetTradeBtn');
        if (resetTradeBtn) {
            resetTradeBtn.addEventListener('click', () => this.resetTrade());
        }

        // Investment Area
        const resetInvestmentsBtn = document.getElementById('resetInvestmentsBtn');
        if (resetInvestmentsBtn) {
            resetInvestmentsBtn.addEventListener('click', () => this.resetInvestments());
        }

        // Arrival Area
        const drawEventBtn = document.getElementById('drawEventBtn');
        if (drawEventBtn) {
            drawEventBtn.addEventListener('click', () => this.drawEvent());
        }
        const rerollFinalRPSBtn = document.getElementById('rerollFinalRPSBtn');
        if (rerollFinalRPSBtn) {
            rerollFinalRPSBtn.addEventListener('click', () => this.rerollFinalRPS());
        }

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
        const nameInput = document.getElementById('playerNameInput');
        const name = nameInput.value.trim();

        if (!this.validatePlayerName(name)) {
            this.ui.showNotification('이름은 1~20자의 한글, 영문, 숫자만 가능합니다.');
            nameInput.focus();
            return;
        }

        this.localPlayerName = name;
        this.ui.showScreen('roomCodeInputScreen');
    }

    validatePlayerName(name) {
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
        this.socket.emit('check_room', { roomId, playerName: this.localPlayerName });
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
            playerName: this.gameState.player.name,
            roomId: this.playerRoomId
        });

        this.playerRegistered = true;

        this.ui.showScreen('waitingScreen');

        this.ui.showNotification(`${this.countryConfig[this.gameState.player.country].name} 팀에 참가했습니다!`);
    }

    updatePlayerStatsFromServer(teamData) {
        this.gameState.team = {
            totalPA: teamData.totalPA || 0,
            silk: teamData.silk || 0,
            pepper: teamData.pepper || 0,
            clickCount: teamData.clickCount || 0,
            maxProduct: teamData.maxProduct || 0, // Update maxProduct
            productionBoxClickCount: teamData.productionBoxClickCount || 0,
            resetTokens: teamData.resetTokens || 0,
            mercantilismTokens: teamData.mercantilismTokens || 0,
            investmentsMade: teamData.investmentsMade || [],
            tradeSelection: teamData.tradeSelection || null,
            eventDrawnThisRound: teamData.eventDrawnThisRound || false,
            finalRpsPlayedThisRound: teamData.finalRpsPlayedThisRound || false,
            eventText: teamData.eventText || '',
            eventResultClass: teamData.eventResultClass || '',
            finalRpsResult: teamData.finalRpsResult || '',
            rpsResult: teamData.rpsResult || null,
            eventResult: teamData.eventResult || null,
            finalRpsResultData: teamData.finalRpsResultData || null
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
        
        // Check against maxProduct (total PA) instead of maxClicks
        if (this.gameState.team.totalPA >= config.maxProduct) {
            return this.ui.showNotification('최대 생산량에 도달했습니다!');
        }
        
        this.clickBuffer++;
        this.gameState.team.productionBoxClickCount++;

        if (this.gameState.team.productionBoxClickCount >= 30) {
            this.gameState.team.productionBoxClickCount = 0; // Reset after filling
            this.socket.emit('production_box_filled', { roomId: this.playerRoomId });
        }
        this.ui.updatePlayerStats();
    }

    playRPS(choice) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('play_rps', {
            roomId: this.playerRoomId,
            choice: choice
        });

        // Store player's choice immediately
        if (!this.gameState.team.rpsResult) {
            this.gameState.team.rpsResult = {};
        }
        this.gameState.team.rpsResult.playerChoice = choice;

        this.ui.showNotification(`${this.ui.getRPSEmoji(choice)} 선택 완료!`);
        
        const rpsButtons = document.querySelectorAll('.rps-btn');
        rpsButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
    }

    rerollRPS() {
        if (!this.playerRoomId || !this.gameState.player.country) return;
        
        if (this.gameState.player.country !== 'england') {
            return this.ui.showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
        }
        
        if (this.gameState.team.resetTokens <= 0) {
            return this.ui.showNotification('리롤 토큰이 없습니다!');
        }

        if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${this.gameState.team.resetTokens}개`)) {
            this.socket.emit('reroll_rps', { roomId: this.playerRoomId });
            this.ui.showNotification('리롤 토큰을 사용했습니다!');
        }
    }

    confirmTrade(tradeTypeOverride) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

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

        this.ui.updateTradeSelectionDisplay();
        this.ui.updatePlayerStats();

        this.socket.emit('trade_selection', {
            roomId: this.playerRoomId,
            type: tradeType,
            amount: amount
        });
        
        this.ui.showNotification('출항 선택이 완료되었습니다!');
        document.getElementById('tradeConfirmation').classList.add('hidden');
        document.getElementById('tradeAmountValue').textContent = '20'; // Reset to default 20 PA
    }

    makeInvestment(targetCountry) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        const amountSpan = document.getElementById(`investAmountValue-${targetCountry}`);
        const amount = parseInt(amountSpan.textContent, 10);

        if (isNaN(amount) || amount < 10) { // Changed from 100
            return this.ui.showNotification('유효하지 않은 투자 금액입니다. (10 PA 이상)'); // Updated message
        }

        if (amount > this.gameState.team.totalPA) {
            return this.ui.showNotification('보유한 PA가 부족합니다.');
        }

        this.ui.updatePlayerStats();

        this.socket.emit('make_investment', {
            roomId: this.playerRoomId,
            targetCountry: targetCountry,
            amount: amount
        });

        const config = this.countryConfig[targetCountry];
        this.ui.showNotification(`${config.name}에 ${amount} PA 투자 완료!`);
        amountSpan.textContent = '10'; // Reset to default 10 PA
    }

    resetTrade() {
        if (!this.playerRoomId) return;

        if (this.gameState.team.tradeSelection) {
            this.ui.updateTradeSelectionDisplay();
            this.ui.updatePlayerStats();
        }

        this.socket.emit('reset_trade', { roomId: this.playerRoomId });
    }

    resetInvestments() {
        if (!this.playerRoomId) return;

        if (this.gameState.team.investmentsMade && this.gameState.team.investmentsMade.length > 0) {
            let totalRefund = 0;
            this.gameState.team.investmentsMade.forEach(investment => {
                totalRefund += investment.amount;
            });

            this.ui.updatePlayerStats();
        }

        this.socket.emit('reset_investments', { roomId: this.playerRoomId });
    }

    drawEvent() {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('draw_event', { roomId: this.playerRoomId });
        this.ui.showNotification('이벤트 카드를 뽑았습니다!');
    }

    playFinalRPS(choice) {
        if (!this.playerRoomId) {
            return this.ui.showNotification('게임에 참가하지 않았습니다.');
        }

        this.socket.emit('play_final_rps', {
            roomId: this.playerRoomId,
            choice: choice
        });

        this.ui.showNotification(`${this.ui.getRPSEmoji(choice)} 선택 완료!`);
        
        const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
        finalRpsButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
        });
    }

    rerollFinalRPS() {
        if (!this.playerRoomId || !this.gameState.player.country) return;
        
        if (this.gameState.player.country !== 'england') {
            return this.ui.showNotification('영국만 리롤 토큰을 사용할 수 있습니다!');
        }
        
        if (this.gameState.team.resetTokens <= 0) {
            return alert('리롤 토큰이 없습니다!');
        }

        if (confirm(`리롤 토큰을 사용하시겠습니까?\n\n남은 토큰: ${this.gameState.team.resetTokens}개`)) {
            this.socket.emit('reroll_final_rps', { roomId: this.playerRoomId });
        }
    }

    clearSessionAndReset() {
        console.log("Clearing session and resetting UI...");
        // Clear local storage
        localStorage.removeItem('playerRoomId');
        localStorage.removeItem('sessionToken');

        // Reset internal state
        this.playerRoomId = null;
        this.sessionToken = null;
        this.playerRegistered = false;
        this.gameState = { /* ... re-initialize or reset gameState ... */ };

        // Reset UI to the very first screen
        this.ui.showScreen('startScreen');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const game = new GameClient();
    window.game = game; 
>>>>>>> 8ebaef76b21359b17980d7eca9a0c44245c59ebf
});