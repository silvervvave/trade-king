class UIManager {
    constructor(game) {
        this.game = game;
        this.initializeUI();
    }

    setupCarousel(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) return;

        const slides = Array.from(container.querySelectorAll('.carousel-slide'));
        const nextBtn = container.querySelector('.carousel-next');
        const prevBtn = container.querySelector('.carousel-prev');
        let currentIndex = 0;

        if (slides.length === 0) {
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            return;
        };

        const showSlide = (index) => {
            slides.forEach((slide, i) => {
                slide.style.display = i === index ? 'block' : 'none';
            });

            if (prevBtn) {
                prevBtn.style.display = index > 0 ? 'block' : 'none';
            }
            if (nextBtn) {
                nextBtn.style.display = index < slides.length - 1 ? 'block' : 'none';
            }
        };

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (currentIndex < slides.length - 1) {
                    currentIndex++;
                    showSlide(currentIndex);
                }
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentIndex > 0) {
                    currentIndex--;
                    showSlide(currentIndex);
                }
            });
        }

        // Add a method to reset to the first slide, can be called from outside
        container.resetCarousel = () => {
            currentIndex = 0;
            showSlide(0);
        };

        showSlide(0); // Initial setup
    }

    initializeUI() {
        const bannerLeft = document.getElementById('bannerLeft');
        if (bannerLeft) {
            bannerLeft.addEventListener('click', () => {
                if (confirm('진행 상황이 초기화됩니다. 정말 처음으로 돌아가시겠습니까?')) {
                    // Clear session data for a fresh start
                    localStorage.removeItem('playerRoomId');
                    window.location.reload();
                }
            });
        }

        const gameInfoBtn = document.getElementById('gameInfoBtn');
        if (gameInfoBtn) {
            gameInfoBtn.addEventListener('click', () => this.showGameInfoModal());
        }

        const modalCloseBtn = document.querySelector('#gameInfoModal .modal-close-btn');
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', () => this.hideGameInfoModal());
        }

        const allTeamsStatusToggle = document.getElementById('allTeamsStatusToggle');
        const allTeamsStatusContainer = document.getElementById('allTeamsStatusContainer');
        if (allTeamsStatusToggle && allTeamsStatusContainer) {
            const setStatusContainerOpen = (isOpen) => {
                allTeamsStatusContainer.classList.toggle('open', isOpen);
                localStorage.setItem('allTeamsStatusOpen', isOpen);

                if (isOpen) {
                    // Use a small timeout to allow the container to start rendering and transitioning
                    setTimeout(() => {
                        const containerHeight = allTeamsStatusContainer.offsetHeight;
                        allTeamsStatusToggle.style.bottom = `${containerHeight}px`;
                    }, 50);
                } else {
                    allTeamsStatusToggle.style.bottom = '10px'; // Back to initial position
                }
            };

            allTeamsStatusToggle.addEventListener('click', () => {
                const isOpen = allTeamsStatusContainer.classList.contains('open');
                setStatusContainerOpen(!isOpen);
            });

            // Load initial state from localStorage
            const savedState = localStorage.getItem('allTeamsStatusOpen');
            if (savedState === 'true') {
                // Use a timeout to ensure the UI is ready before opening
                setTimeout(() => setStatusContainerOpen(true), 100);
            } else {
                // Ensure the container is closed initially, removing the .hidden class if it exists
                allTeamsStatusContainer.classList.remove('hidden');
            }
        }

        // Event delegation for toggle buttons
        document.body.addEventListener('click', (event) => {
            if (event.target.matches('.btn-toggle')) {
                this.handleToggleClick(event.target);
            }
        });

        // Result Modal
        document.body.addEventListener('click', (event) => {
            if (event.target.matches('#resultModal .modal-close-btn')) {
                this.hideResultModal();
            }
        });

        this.setupCarousel('#productionArea .carousel-container');
        this.setupCarousel('#investmentArea .carousel-container');
        this.setupCarousel('#arrivalArea .carousel-container');
    }

    showResultModal(title, content) {
        const modal = document.getElementById('resultModal');
        if (!modal) return;

        modal.innerHTML = templates.resultModal(title, content);
        modal.classList.remove('hidden');
    }

    hideResultModal() {
        const modal = document.getElementById('resultModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.innerHTML = '';
        }
    }

    handleToggleClick(button) {
        const toggleInput = button.closest('.toggle-input');
        const valueSpan = toggleInput.querySelector('.toggle-value');
        const step = parseInt(toggleInput.dataset.step, 10);
        const min = parseInt(toggleInput.dataset.min, 10);

        let currentValue = parseInt(valueSpan.textContent, 10);

        if (button.classList.contains('plus')) {
            currentValue += step;
        } else if (button.classList.contains('minus')) {
            currentValue -= step;
        }

        if (currentValue < min) {
            currentValue = min;
        }

        valueSpan.textContent = currentValue;
    }

    showScreen(screenId) {
        const screens = document.querySelectorAll('.screen');
        screens.forEach(screen => {
            if (!screen.classList.contains('hidden')) {
                screen.classList.add('hidden');
            }
        });
        document.getElementById(screenId).classList.remove('hidden');
    }

    renderCountrySelection(countries, playerCounts) {
        const countryGrid = document.querySelector('.country-grid');
        countryGrid.innerHTML = '';

        for (const countryKey in countries) {
            const country = countries[countryKey];
            const card = this.createCountryCard(country, playerCounts[countryKey] || 0);
            card.addEventListener('click', () => this.game.handleCountryClick(countryKey));
            countryGrid.appendChild(card);
        }
    }

    createCountryCard(country, playerCount) {
        const card = document.createElement('div');
        card.className = 'country-card';
        card.innerHTML = `
            <div class="country-icon">${country.icon}</div>
            <h3>${country.name}</h3>
            <p class="country-trait">참여: ${playerCount}명</p>
        `;
        return card;
    }

    showCountryDescription(countryKey) {
        const country = this.game.countryConfig[countryKey];
        document.getElementById('modalCountryName').textContent = country.name;
        const descriptionEl = document.getElementById('modalCountryDescription');
        descriptionEl.innerHTML = `
            <p>${country.trait}</p>
            <ul class="country-stats">
                <li>클릭 ${country.clicksPerBatch}회당 생산량: ${country.paPerBatch} PA</li>
                <li>최대 생산량: ${country.maxBatchCount * country.paPerBatch} PA</li>
            </ul>
        `;
        document.getElementById('countryDescriptionModal').classList.remove('hidden');
    }

    hideCountryDescription() {
        document.getElementById('countryDescriptionModal').classList.add('hidden');
    }

    updatePlayerStats() {
        // [FIX] More robust guard for player and country
        if (!this.game.gameState || !this.game.gameState.player || !this.game.gameState.player.country) {
            return;
        }

        const teamState = this.game.gameState.team;
        // [FIX] Add a guard for teamState itself, as it might be null during state transitions.
        if (!teamState) {
            // If there's no team state, we can't update stats, so we should clear them or return.
            // Returning is safer to avoid clearing stats during a temporary state update.
            return;
        }
        const config = this.game.countryConfig[this.game.gameState.player.country];

        // Helper to update text content safely
        const updateText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };

        // Update main stats
        updateText('totalPA', teamState.totalPA);
        updateText('silkCount', teamState.silk);
        updateText('pepperCount', teamState.pepper);
        updateText('productPACount', teamState.productPACount);
        updateText('currentProduction', teamState.productPACount);

        // Update click reward info text
        updateText('click-reward-info', `${config.clicksPerBatch}클릭 보상: ${config.paPerBatch} PA`);
    }

    updateTradeSelectionDisplay() {
        const tradeSelectionDiv = document.getElementById('tradeSelection');
        if (!tradeSelectionDiv) return;

        const tradeSelection = this.game.gameState.team.tradeSelection;
        if (tradeSelection) {
            const destinationText = tradeSelection.type === 'china' ? '중국' : '인도';
            tradeSelectionDiv.innerHTML = `
                <p>선택 완료: ${destinationText} (${tradeSelection.amount} PA)</p>
                <p>결정 플레이어: ${tradeSelection.playerName}</p>
            `;
        } else {
            tradeSelectionDiv.innerHTML = '<p>선택 대기중...</p>';
        }
    }

    showGameInfoModal() {
        document.getElementById('modalRoomCode').textContent = this.game.playerRoomId || '-';
        document.getElementById('modalTeamName').textContent = this.game.gameState.player.country ? this.game.countryConfig[this.game.gameState.player.country].name : '-';
        document.getElementById('modalPlayerName').textContent = this.game.localPlayerName || '-';
        document.getElementById('gameInfoModal').classList.remove('hidden');
    }

    hideGameInfoModal() {
        document.getElementById('gameInfoModal').classList.add('hidden');
    }

    updateGameState(gameState) {
        // Ensure all panels are hidden before showing the correct one to prevent overlap
        document.querySelectorAll('.game-area-panel').forEach(panel => {
            panel.classList.add('hidden');
        });

        console.log('UI: updateGameState - gameState.gameStarted:', gameState.gameStarted, 'currentPhase:', gameState.currentPhase);
        if (gameState.gameStarted) {
            this.showScreen('gameScreen');
            document.getElementById('gameNav').classList.remove('hidden');
            this.updateNav(gameState.currentPhase);
            this.showArea(this.getPhaseAreaId(gameState.currentPhase));
        } else {
            // If game is not started, ensure we are on a pre-game screen
            if (!document.getElementById('initialChoiceScreen').classList.contains('hidden') ||
                !document.getElementById('nameInputScreen').classList.contains('hidden') ||
                !document.getElementById('roomCodeInputScreen').classList.contains('hidden') ||
                !document.getElementById('countrySelection').classList.contains('hidden') ||
                !document.getElementById('waitingScreen').classList.contains('hidden')) {
                // Do nothing, stay on current pre-game screen
            } else {
                // Fallback to initial choice screen if somehow on gameScreen without gameStarted
                this.showScreen('initialChoiceScreen');
            }
        }
        this.updatePlayerStats();
        this.updateTokenDisplay();
        this.updateRerollButtons();
        this.updateAllTeamsStatus(this.game.teams);
        this.updateMyTeamStatus(this.game.teams);
        this.setupPhaseScreen(gameState.currentPhase);
    }

    getPhaseAreaId(phase) {
        const phaseToArea = {
            'production': 'productionArea',
            'trade': 'tradeArea',
            'investment': 'investmentArea',
            'arrival': 'arrivalArea',
            'ended': 'resultsArea'
        };
        return phaseToArea[phase] || 'productionArea'; // Default to production area
    }

    updateConnectionStatus(isConnected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = isConnected ? '온라인' : '오프라인';
            statusElement.className = isConnected ? 'connected' : 'disconnected'; // Add class for styling
        }
    }

    updateTokenDisplay() {
        const rerollInfo = document.getElementById('rerollTokenInfo');
        if (rerollInfo) {
            if (this.game.gameState && this.game.gameState.player && this.game.gameState.player.country === 'england') {
                rerollInfo.style.display = 'block';
                rerollInfo.innerHTML = `
                    <div class="token-info">
                                <span class="token-icon"></span>
                                <span class="token-text">절대권력: ${this.game.gameState.team.rpsRerolls}개</span>
                    </div>
                `;
            } else {
                rerollInfo.style.display = 'none';
            }
        }
        
        const mercantilismInfo = document.getElementById('mercantilismTokenInfo');
        if (mercantilismInfo) {
            if (this.game.gameState && this.game.gameState.player && this.game.gameState.player.country === 'france') {
                mercantilismInfo.style.display = 'block';
                const remainingUses = 10 - (this.game.gameState.team.mercantilismUses || 0);
                mercantilismInfo.innerHTML = `
                    <div class="token-info">
                        <span class="token-icon"></span>
                        <span class="token-text">중상주의: ${remainingUses}회</span>
                    </div>
                `;
            } else {
                mercantilismInfo.style.display = 'none';
            }
        }
    }

    updateRerollButtons() {
        if (!this.game.gameState || !this.game.gameState.team || !this.game.gameState.player) {
            return;
        }

        const team = this.game.gameState.team;
        const player = this.game.gameState.player;

        const isEngland = player.country === 'england';
        const hasTokens = team.rpsRerolls > 0;
        const alreadyUsed = team.rerollUsedThisRound;
        const canReroll = isEngland && hasTokens && !alreadyUsed;

        // Production Reroll Button
        const rerollBtn = document.getElementById('rerollRPSBtn');
        if (rerollBtn) {
            // Show the button only if the player can reroll AND the initial RPS has been played.
            const show = canReroll && team.rpsPlayedThisRound;
            rerollBtn.classList.toggle('hidden', !show);
        }

        // Final Reroll Button
        const finalRerollBtn = document.getElementById('rerollFinalRPSBtn');
        if (finalRerollBtn) {
            // Show the button only if the player can reroll AND the final RPS has been played.
            const show = canReroll && team.finalRpsPlayedThisRound;
            finalRerollBtn.classList.toggle('hidden', !show);
        }
    }

    showArea(areaId) {
        const phaseToArea = {
            'production': 'productionArea',
            'trade': 'tradeArea',
            'investment': 'investmentArea',
            'arrival': 'arrivalArea',
            'ended': 'resultsArea'
        };
        const currentPhaseArea = phaseToArea[this.game.gameState.currentPhase];
        const allowedAreas = ['productionArea', currentPhaseArea];

        if (!allowedAreas.includes(areaId) && this.game.gameState.gameStarted) {
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
        const productionBtn = document.getElementById('navProduction');
        const currentPhaseBtn = document.getElementById('navCurrentPhase');

        // Reset both buttons
        if (productionBtn) productionBtn.classList.remove('active');
        if (currentPhaseBtn) currentPhaseBtn.classList.remove('active');

        // Highlight the correct button
        if (areaId === 'productionArea') {
            if (productionBtn) productionBtn.classList.add('active');
        } else {
            // For trade, investment, or arrival, the currentPhaseBtn is the one to highlight
            if (currentPhaseBtn) currentPhaseBtn.classList.add('active');
        }
    }

    updateNav(phase) {
        const phaseConfig = {
            'trade': { text: '출항', area: 'tradeArea' },
            'investment': { text: '투자', area: 'investmentArea' },
            'arrival': { text: '입항', area: 'arrivalArea' }
        };

        const productionBtn = document.getElementById('navProduction');
        const currentPhaseBtn = document.getElementById('navCurrentPhase');

        // Remove existing indicators from all nav buttons
        document.querySelectorAll('.nav-btn .phase-indicator').forEach(ind => ind.remove());

        if (phaseConfig[phase]) {
            const config = phaseConfig[phase];
            currentPhaseBtn.textContent = config.text;
            currentPhaseBtn.dataset.area = config.area;
            currentPhaseBtn.classList.remove('hidden');

            // Add indicator to the current phase button
            const indicator = document.createElement('span');
            indicator.className = 'phase-indicator';
            indicator.textContent = '● ';
            currentPhaseBtn.insertBefore(indicator, currentPhaseBtn.firstChild);
        } else {
            // Hide dynamic phase button if phase is production, waiting, etc.
            currentPhaseBtn.classList.add('hidden');

            // Optionally, highlight production if it's the current phase
            if (phase === 'production') {
                const indicator = document.createElement('span');
                indicator.className = 'phase-indicator';
                indicator.textContent = '● ';
                productionBtn.insertBefore(indicator, productionBtn.firstChild);
            }
        }
    }

    setupPhaseScreen(phase) {
        this.renderProductionResults();
        this.renderArrivalResults();

        if (phase === 'production') {
            this.setupProductionScreen();
        } else if (phase === 'trade') {
            this.setupTradeScreen();
        } else if (phase === 'investment') {
            // this.setupInvestmentScreen(); // This call is removed to prevent a race condition
        } else if (phase === 'arrival') {
            this.setupArrivalScreen();
        }
    }

    renderProductionResults() {
        const rpsResultData = this.game.gameState.team.rpsResult;
        const rpsResultDiv = document.getElementById('rpsResult');
        const rpsButtons = document.querySelectorAll('.rps-btn');

        if (rpsResultData && rpsResultData.result && rpsResultDiv) {
            rpsResultDiv.className = 'result-display ' + rpsResultData.result;
            rpsResultDiv.innerHTML = `<p>나: ${this.getRPSEmoji(rpsResultData.playerChoice)} vs 상대: ${this.getRPSEmoji(rpsResultData.opponentChoice)}</p><p>결과: ${this.getRPSResultKorean(rpsResultData.result)}</p>`;
            
            rpsButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.opacity = '0.5';
            });
        } else if (rpsResultDiv) {
            rpsResultDiv.innerHTML = '';
            rpsResultDiv.className = 'result-display';
            rpsButtons.forEach(btn => {
                btn.disabled = false;
                btn.style.opacity = '1';
            });
        }
    }

    renderArrivalResults() {
        const team = this.game.gameState.team;
        const eventResultDiv = document.getElementById('eventResult');
        const finalRpsResultDiv = document.getElementById('finalRpsResult');

        if (team.eventDrawnThisRound && team.eventText && eventResultDiv) {
            eventResultDiv.className = 'result-display ' + team.eventResultClass;
            eventResultDiv.innerHTML = team.eventText;
        } else if (eventResultDiv) {
            eventResultDiv.innerHTML = '';
            eventResultDiv.className = 'result-display';
        }

        if (team.finalRpsResultData && team.finalRpsResultData.result && finalRpsResultDiv) {
            const resultData = team.finalRpsResultData;
            const goodsChange = resultData.result === 'win' ? 1 : resultData.result === 'lose' ? -1 : 0;
            finalRpsResultDiv.className = 'result-display ' + resultData.result;
            finalRpsResultDiv.innerHTML = `<p>나: ${this.getRPSEmoji(resultData.playerChoice)} vs 상대: ${this.getRPSEmoji(resultData.opponentChoice)}</p><p>결과: ${this.getRPSResultKorean(resultData.result)} (상품 ${goodsChange}개)</p>`;
        } else if (finalRpsResultDiv) {
            finalRpsResultDiv.innerHTML = '';
            finalRpsResultDiv.className = 'result-display';
        }
    }

    setupProductionScreen() {
        this.updatePlayerStats();
        this.updateTokenDisplay();
        this.renderProductionResults();
    }

    setupTradeScreen() {
        document.querySelector('.destination-grid').classList.remove('hidden');
        document.getElementById('tradeConfirmation').classList.add('hidden');
        this.game.selectedTradeDestination = null;
        document.getElementById('tradeAmountValue').textContent = '20'; // Reset to default
        this.game.ui.updateTradeSelectionDisplay();
    }

    selectTradeDestination(destination) {
        this.game.selectedTradeDestination = destination;
        document.getElementById('tradeDestinationTitle').textContent = `${destination === 'china' ? '중국' : '인도'}에 투자할 금액`;
        document.querySelector('.destination-grid').classList.add('hidden');
        document.getElementById('tradeConfirmation').classList.remove('hidden');

        // Add temporary active class for visual feedback
        const clickedCard = document.querySelector(`.destination-card[data-destination="${destination}"]`);
        if (clickedCard) {
            clickedCard.classList.add('active-feedback');
            setTimeout(() => {
                clickedCard.classList.remove('active-feedback');
            }, 200); // Remove after 200ms
        }
    }

    cancelTrade() {
        document.getElementById('tradeConfirmation').classList.add('hidden');
        document.querySelector('.destination-grid').classList.remove('hidden');
        this.game.selectedTradeDestination = null;
    }

    setupInvestmentScreen(voyages) {
        const container = document.getElementById('investmentOptions');
        if (!container) return;

        container.innerHTML = '';

        const validVoyages = voyages ? voyages.filter(v => v.country !== this.game.gameState.player.country) : [];

        if (validVoyages.length === 0) {
            container.innerHTML = '<p class="info-text" style="text-align: center;">현재 투자 가능한 항해가 없습니다.</p>';
            // Need to re-run setupCarousel to hide arrows
            this.setupCarousel('#investmentArea .carousel-container');
            return;
        }

        validVoyages.forEach(voyage => {
            const slide = document.createElement('div');
            slide.className = 'carousel-slide';
            
            const card = this.createInvestmentCard(voyage);
            slide.appendChild(card);
            container.appendChild(slide);
        });

        // Re-initialize the carousel for this area now that slides are populated
        this.setupCarousel('#investmentArea .carousel-container');
    }

    createInvestmentCard(voyage) {
        const card = document.createElement('div');
        card.className = 'investment-card';
        card.innerHTML = templates.investmentCard(voyage, this.game.countryConfig[voyage.country], voyage.investments || []);
        return card;
    }

    updateInvestmentStatus() {
        if (!this.game.teams) return;

        Object.values(this.game.teams).forEach(targetTeam => {
            const statusDiv = document.getElementById(`investment-status-${targetTeam.country}`);
            if (!statusDiv) return;

            statusDiv.innerHTML = ''; // Clear previous status

            if (targetTeam.investmentsReceived && targetTeam.investmentsReceived.length > 0) {
                const list = document.createElement('ul');
                list.className = 'investment-status-list';

                targetTeam.investmentsReceived.forEach(investment => {
                    const item = document.createElement('li');
                    item.textContent = `${investment.teamName} ${investment.playerName}: ${investment.amount} PA`;
                    list.appendChild(item);
                });

                statusDiv.appendChild(list);
            }
        });
    }

    setupArrivalScreen() {
        const team = this.game.gameState.team;

        const drawEventBtn = document.querySelector('.event-section button');
        if(drawEventBtn) {
            drawEventBtn.disabled = team.eventDrawnThisRound;
        }

        const finalRpsButtons = document.querySelectorAll('.final-rps-btn');
        finalRpsButtons.forEach(btn => {
            btn.disabled = team.finalRpsPlayedThisRound;
            btn.style.opacity = team.finalRpsPlayedThisRound ? '0.5' : '1';
        });

        const arrivalStatusContainer = document.getElementById('arrival-status-container');
        if (arrivalStatusContainer) {
            arrivalStatusContainer.innerHTML = '';
        }
        
        this.updateTokenDisplay();
        this.renderArrivalResults();
        this.renderMyArrivalSummary();
        this.renderInvestmentResults();

        // Reset carousel to the first slide
        const carousel = document.querySelector('#arrivalArea .carousel-container');
        if (carousel && carousel.resetCarousel) {
            carousel.resetCarousel();
        }
    }

    renderMyArrivalSummary() {
        const container = document.getElementById('myArrivalResult');
        if (!container) return;

        const teamState = this.game.gameState.team;
        const tradeSelection = teamState.tradeSelection;
        if (!tradeSelection) {
            container.innerHTML = '<h3>우리 팀 입항 결과</h3><p>이번 라운드에 출항하지 않았습니다.</p>';
            return;
        }

        const destination = tradeSelection.type === 'china' ? '중국' : '인도';
        const goodsName = tradeSelection.type === 'china' ? '비단' : '후추';
        const eventText = teamState.eventText || '이벤트 결과 대기중...';
        const rpsResultText = teamState.finalRpsPlayedThisRound ? this.getRPSResultKorean(teamState.finalRpsResult) : '가위바위보 결과 대기중...';

        let summaryHtml = '';

        if (teamState.eventDrawnThisRound) {
            if (teamState.camusariHappened) {
                summaryHtml = `<div class="result-preview lose"><p>카무사리 발생! 모든 것을 잃었지만, 항해비 ${tradeSelection.amount} PA는 보전됩니다.</p></div>`;
            } else {
                const baseAmount = tradeSelection.amount;
                const goodsMultiplier = teamState.eventMultipliers?.goodsMultiplier ?? 1;
                const paMultiplier = teamState.eventMultipliers?.paMultiplier ?? 1;
                
                let goodsAcquired = Math.floor((baseAmount / 10) * goodsMultiplier);
                const paReturn = baseAmount * paMultiplier;

                let rpsBonusText = '';
                if (teamState.finalRpsPlayedThisRound) {
                    const rpsGoodsChange = teamState.rpsGoodsChange || 0;
                    goodsAcquired = Math.max(0, goodsAcquired + rpsGoodsChange);
                    rpsBonusText = ` (가위바위보 ${rpsGoodsChange >= 0 ? '+' : ''}${rpsGoodsChange})`;
                }
                
                summaryHtml = `
                    <div class="result-preview">
                        <p>예상 수익: <strong>${goodsName} ${goodsAcquired}개${rpsBonusText}</strong></p>
                        <p>돌려받을 항해비: <strong>${paReturn} PA</strong></p>
                    </div>
                `;
            }
        }

        container.innerHTML = `
            <h3>우리 팀 입항 결과</h3>
            <div class="arrival-summary-details">
                <p><strong>목적지:</strong> ${destination}</p>
                <p><strong>투자 금액:</strong> ${tradeSelection.amount} PA</p>
                <p><strong>이벤트:</strong> ${eventText}</p>
                <p><strong>최종 가위바위보:</strong> ${rpsResultText}</p>
            </div>
            ${summaryHtml}
            <p class="final-tally-notice"><em>서버에서 최종 집계 후 정산됩니다.</em></p>
        `;
    }

    renderInvestmentResults() {
        const container = document.getElementById('investmentReturnResult');
        if (!container) return;

        const myInvestments = this.game.gameState.team.investmentsMade || [];
        if (myInvestments.length === 0) {
            container.innerHTML = '<h3>투자 수익</h3><p>이번 라운드에 투자하지 않았습니다.</p>';
            return;
        }

        let resultsHtml = '<h3>투자 수익</h3>';
        myInvestments.forEach(investment => {
            const targetTeam = this.game.teams[investment.toTeam];
            if (targetTeam && targetTeam.tradeSelection) {
                const teamName = this.game.countryConfig[targetTeam.country].name;
                const goodsName = targetTeam.tradeSelection.type === 'china' ? '비단' : '후추';
                let expectedGoods = 0;
                let statusMessage = '이벤트 결과 대기중...';

                if (targetTeam.eventDrawnThisRound) {
                    if (targetTeam.camusariHappened) {
                        statusMessage = '카무사리 발생! 투자금은 보전됩니다.';
                        expectedGoods = 0;
                    } else {
                        const goodsMultiplier = targetTeam.eventMultipliers?.goodsMultiplier ?? 1;
                        expectedGoods = Math.floor(investment.amount / 10) * goodsMultiplier;
                        statusMessage = `이벤트: ${targetTeam.eventText}`;
                    }
                }

                resultsHtml += `
                    <div class="investment-card" style="margin-top: 10px;">
                        <h4>${teamName} (${goodsName})</h4>
                        <p><strong>투자 금액:</strong> ${investment.amount} PA</p>
                        <div class="result-preview">
                            <p>예상 수익: <strong>${goodsName} ${expectedGoods}개</strong></p>
                        </div>
                        <p><em>${statusMessage}</em></p>
                    </div>
                `;
            }
        });
        container.innerHTML = resultsHtml;
    }

    updateArrivalStatus(teams) {
        const container = document.getElementById('arrival-status-container');
        if (!container) return;
        container.innerHTML = ''; // Remove the cards below the carousel as requested
    }

    getPhaseKorean(phase) {
        const phaseMap = {
            'waiting': '대기',
            'production': '생산',
            'trade': '출항',
            'investment': '투자',
            'arrival': '입항',
            'ended': '종료'
        };
        return phaseMap[phase] || phase;
    }

    updateAllTeamsStatus(teams) {
        const container = document.getElementById('allTeamsStatusContainer');
        if (!container || !teams) return; // Also check for teams object

        container.innerHTML = '';

        const teamArray = Object.values(teams).filter(Boolean); // Filter out any falsy values
        if (teamArray.length === 0) return; // Nothing to display

        // Duplicate the teamArray to create a seamless loop effect for manual scrolling
        const duplicatedTeamArray = [...teamArray, ...teamArray, ...teamArray]; // Duplicate twice for smoother loop

        const playerCountry = this.game.gameState.player ? this.game.gameState.player.country : null;

        duplicatedTeamArray.forEach(team => {
            const card = document.createElement('div');
            card.className = 'team-status-card';

            const isMyTeam = team.country === playerCountry;
            if (isMyTeam) {
                card.classList.add('my-team-card');
            }

            card.innerHTML = `
                <div class="team-info-left">
                    <span class="team-icon-display">${team.icon}</span>
                    <span class="team-name-display">${team.name}</span>
                </div>
                <div class="team-status-resources">
                    <p>비단: ${team.silk}</p>
                    <p>후추: ${team.pepper}</p>
                </div>
            `;
            container.appendChild(card);
        });

        const cardWidth = 180 + 16; // card width + gap (var(--spacing-md) = 16px)
        const totalOriginalWidth = teamArray.length * cardWidth;

        // Set initial scroll position to the middle of the duplicated content
        container.scrollLeft = totalOriginalWidth;

        // Add manual infinite scroll logic
        container.addEventListener('scroll', () => {
            // Check if container has been cleared
            if (container.children.length === 0) return;
            
            if (container.scrollLeft >= totalOriginalWidth * 2) {
                container.scrollLeft -= totalOriginalWidth;
            } else if (container.scrollLeft <= 0) {
                container.scrollLeft += totalOriginalWidth;
            }
        });
    }

    updateMyTeamStatus(teams) {
        const myTeam = teams[this.game.gameState.player.country];
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

    updateProductionClickProgress() {
        if (!this.game.gameState || !this.game.gameState.player || !this.game.gameState.player.country || !this.game.gameState.team) {
            return;
        }
        const teamState = this.game.gameState.team;
        const config = this.game.countryConfig[this.game.gameState.player.country];
        if (!config) return; // Config might not be ready yet

        const productionClickArea = document.getElementById('produceBtn');
        if (!productionClickArea) return;

        const productionFill = productionClickArea.querySelector('.production-fill');
        const productionClickText = productionClickArea.querySelector('.production-click-text');

        // Handle UI state when max production is reached
        if (teamState.batchCount >= config.maxBatchCount) {
            productionClickArea.classList.add('production-box-filled');
            if (productionClickText) productionClickText.textContent = '생산 종료';
            if (productionFill) productionFill.style.height = '100%';
            return;
        } else {
            productionClickArea.classList.remove('production-box-filled');
            if (productionClickText) productionClickText.textContent = 'CLICK';
        }
        
        // Handle fill effect based on click count
        if (productionFill) {
            const clickCount = teamState.clickCount;
            const maxClicks = config.clicksPerBatch;
            const progress = Math.min(clickCount / maxClicks, 1);
            productionFill.style.height = `${progress * 100}%`;

            if (productionClickText) {
                productionClickText.style.backgroundPosition = `0% ${progress * 100}%`;
            }
        }
    }

    displayFinalResults(data) {
        const resultsArea = document.getElementById('resultsArea');
        if (!resultsArea) return;

        this.showArea('resultsArea');
        
        const resultsPanel = resultsArea.querySelector('.results-panel');
        if (!resultsPanel) return;

        resultsPanel.innerHTML = templates.finalResults(data.rankings);
    }
    
    getRPSResultKorean(result) {
        const map = {
            'win': '승리',
            'lose': '패배',
            'draw': '무승부'
        };
        return map[result] || result;
    }

    showNotification(message) {
        const notificationDiv = document.createElement('div');
        notificationDiv.className = 'notification';
        notificationDiv.textContent = message;
        document.body.appendChild(notificationDiv);

        setTimeout(() => {
            notificationDiv.remove();
        }, 3000); // 3초 후 제거
    }

    getRPSEmoji(choice) {
        return choice;
    }



}