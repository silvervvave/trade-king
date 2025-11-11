const crypto = require('crypto');
const escape = require('escape-html');
const { createInitialTeamState } = require('./rooms');
const { countryConfig, EVENT_CONFIG } = require('../config');
const { isValidAmount, determineRPSResult, determineEvent, calculateRankings } = require('./utils');
const { PHASES, COUNTRIES, INVESTMENT_FAILURE_COMPENSATION_PA, CAMUSARI_COMPENSATION_PA, RPS_WIN_PA_CHANGE, RPS_LOSE_PA_CHANGE, FRANCE_MERCANTILISM_BONUS_PA, FINAL_RPS_WIN_GOODS_CHANGE, FINAL_RPS_LOSE_GOODS_CHANGE } = require('./constants');

const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error || ''),
};

function _getPlayerAndTeam(room, socketId) {
    const player = room.players[socketId];
    if (!player) {
        return { error: '플레이어 정보를 찾을 수 없습니다.' };
    }
    const team = room.teams[player.team];
    if (!team) {
        return { error: '팀 정보를 찾을 수 없습니다.' };
    }
    return { player, team };
}

function broadcastTeamsUpdate(io, room, roomId) {
    io.to(roomId).emit('teams_update', { teams: room.teams });
}

function updateTeamMembers(io, team, room, roomId) {
    team.members.forEach(member => {
        if (member.connected) {
            io.to(member.id).emit('team_state_update', team);
        }
    });
    broadcastTeamsUpdate(io, room, roomId);
}

function distributeInvestmentReturns(io, team, room, roomId, goodsMultiplier, rpsGoodsChange, destination) {
    if (team.investmentsReceived.length > 0) {
        if (team.camusariHappened) {
            // 카무사리 발생 시 투자자 처리
            team.investmentsReceived.forEach(investment => {
                const investorTeam = room.teams[investment.fromTeam];
                if (investorTeam) {
                    investorTeam.totalPA += INVESTMENT_FAILURE_COMPENSATION_PA; // 투자 실패 보상금
                    updateTeamMembers(io, investorTeam, room, roomId);
                }
            });
        } else {
            // 일반 투자 수익 분배
            team.investmentsReceived.forEach(investment => {
                const investorTeam = room.teams[investment.fromTeam];
                if (investorTeam) {
                    investorTeam.totalPA += investment.amount;

                    let investmentGoods = (investment.amount / 10) * goodsMultiplier;
                    investmentGoods = Math.max(0, investmentGoods + rpsGoodsChange);
                    if (investmentGoods > 0) {
                        if (destination === 'china') {
                            investorTeam.silk += investmentGoods;
                        } else if (destination === 'india') {
                            investorTeam.pepper += investmentGoods;
                        }
                    }
                    
                    if (investorTeam.country === COUNTRIES.FRANCE && goodsMultiplier > 1) {
                        investorTeam.totalPA += FRANCE_MERCANTILISM_BONUS_PA;
                    }
                    updateTeamMembers(io, investorTeam, room, roomId);
                }
            });
        }
    }
}

function calculateArrivalResults(io, team, room, roomId) {
    if (team.eventDrawnThisRound && team.finalRpsPlayedThisRound) {
        const tradeData = team.tradeSelection;
        if (!tradeData) return;

                if (team.camusariHappened) {

                    // 카무사리 발생 시 항해자 처리

                    team.totalPA += CAMUSARI_COMPENSATION_PA; // 실패 보상금

                    distributeInvestmentReturns(io, team, room, roomId, 0, 0, null); // 투자자 처리 호출

        

                    io.to(roomId).emit('arrival_summary', {

                        country: team.country,

                        goodsAcquired: 0,

                        profit: CAMUSARI_COMPENSATION_PA - (tradeData.amount / 10), // 실제 이익은 (10 - 출항금액/10)

                        destination: tradeData.type,

                        camusari: true

                    });

        

                } else {

                    // 일반 도착 결과 계산

                    const destination = tradeData.type;

                    const baseAmount = tradeData.amount;

                    const { paMultiplier, goodsMultiplier } = team.eventMultipliers;

                    const rpsGoodsChange = team.rpsGoodsChange;

        

                    let goodsAcquired = (baseAmount / 10) * goodsMultiplier; // Adjusted for 10 PA per good

                    goodsAcquired = Math.max(0, goodsAcquired + rpsGoodsChange);

        

                    if (destination === 'china') {

                        if (goodsAcquired > 0) team.silk += goodsAcquired;

                    } else if (destination === 'india') {

                        if (goodsAcquired > 0) team.pepper += goodsAcquired;

                    }

        

                    distributeInvestmentReturns(io, team, room, roomId, goodsMultiplier, rpsGoodsChange, destination);

                    

                    team.totalPA += (baseAmount * paMultiplier);

        

                    if (team.country === COUNTRIES.FRANCE && paMultiplier > 1) {

                        team.totalPA += 15; // Adjusted for new monopoly premium

                    }

            io.to(roomId).emit('arrival_summary', {
                country: team.country,
                goodsAcquired,
                profit: (baseAmount * paMultiplier) - baseAmount,
                destination
            });
        }
        
        broadcastTeamsUpdate(io, room, roomId);
    }
}

function registerPlayer(io, socket, data, room, roomId, sessionData) {
    const { country } = data;
    const { studentId, name } = sessionData; // Get studentId and name from sessionData
    
    if (!countryConfig[country]) {
        return socket.emit('error', { message: '유효하지 않은 국가입니다.' });
    }

    // 플레이어가 접속하려는 팀이 없으면 생성
    if (!room.teams[country]) {
        const config = countryConfig[country];
        room.teams[country] = createInitialTeamState(country, config);
    }
    
    // **[수정된 로직]**
    // 플레이어가 접속하려는 팀을 '제외'한 다른 팀들에서만 해당 플레이어를 제거
    for (const existingCountry in room.teams) {
        if (room.teams.hasOwnProperty(existingCountry) && existingCountry !== country) {
            const otherTeam = room.teams[existingCountry];
            const initialMemberCount = otherTeam.members.length;
            otherTeam.members = otherTeam.members.filter(m => m.name !== name); // Use 'name' from sessionData
            
            // 만약 다른 팀에서 플레이어가 실제로 제거되었다면, players 객체에서도 정리
            if (otherTeam.members.length < initialMemberCount) {
                for (const playerId in room.players) {
                    if (room.players[playerId].name === name) { // Use 'name' from sessionData
                        delete room.players[playerId];
                        break; // 한 명만 찾아서 삭제
                    }
                }
            }
        }
    }

    const team = room.teams[country];
    const existingMember = team.members.find(m => m.name === name); // Use 'name' from sessionData

    if (existingMember) {
        // 같은 팀에 재접속하는 경우: 소켓 ID와 접속 상태만 갱신 (토큰은 login_or_register에서 처리)
        delete room.players[existingMember.id]; // 이전 소켓 ID 정보 삭제
        existingMember.id = socket.id;
        existingMember.connected = true;
        // existingMember.token = token; // No longer needed
    } else {
        // 새로운 팀에 접속하거나, 처음 접속하는 경우: 새 멤버로 추가
        team.members.push({ id: socket.id, studentId, name, connected: true }); // Include studentId, remove token
    }

    room.players[socket.id] = { studentId, name, team: country }; // Include studentId
    socket.join(roomId);
    socket.roomId = roomId;

    logger.info(`[플레이어 참가] ${name}님이 ${roomId} 방의 ${country} 팀에 참가`);
    
    // socket.emit('registration_success', { token }); // No longer needed

    const safeRoomState = {
        gameStarted: room.gameStarted,
        currentRound: room.currentRound,
        currentPhase: room.currentPhase,
        players: room.players,
        teams: room.teams,
        countryConfig: countryConfig
    };
    socket.emit('game_state_update', safeRoomState);
    socket.emit('team_state_update', team);
    broadcastTeamsUpdate(io, room, roomId);
}

function initializeNewRound(room) {
    room.currentRound++;
    Object.values(room.teams).forEach(t => {
        t.eventDrawnThisRound = false;
        t.finalRpsPlayedThisRound = false;
        t.rerollUsedThisRound = false;
        t.eventText = '';
        t.eventResultClass = '';
        t.eventResult = null;
        if (t.country === COUNTRIES.ENGLAND) {
            t.rpsRerolls = 1;
        }
    });
}

function resetProductionPhase(room) {
    Object.values(room.teams).forEach(t => { 
        t.rpsPlayedThisRound = false; 
        t.rerollUsedThisRound = false;
        t.rpsPaChange = 0;
        t.rpsResult = null;
    });
}

function resetArrivalPhase(room) {
    Object.values(room.teams).forEach(t => { 
        t.eventDrawnThisRound = false; 
        t.finalRpsPlayedThisRound = false; 
        t.eventMultipliers = { paMultiplier: 1, goodsMultiplier: 1 };
        t.rpsGoodsChange = 0;
        t.eventText = '';
        t.finalRpsResult = '';
        t.eventResultClass = '';
    });
}

function prepareInvestmentPhase(io, room, roomId) {
    const voyageInfo = Object.values(room.teams)
        .filter(t => t.tradeSelection)
        .map(t => ({ 
            country: t.country, 
            destination: t.tradeSelection.type, 
            amount: t.tradeSelection.amount 
        }));
    io.to(roomId).emit('investment_info', { voyages: voyageInfo });
}

function resetTradePhase(room) {
    Object.values(room.teams).forEach(t => {
        t.tradeSelection = null;
        t.investmentsMade = [];
        t.investmentsReceived = [];
    });
}

function startPhase(io, socket, data, room, roomId, sessionData) {
    if (socket.id !== room.adminSocketId) return;

    const { phase } = data;
    if (!room.gameStarted) {
        room.gameStarted = true;
        room.currentRound = 1;
    } else if (phase === PHASES.TRADE && room.currentPhase === PHASES.ARRIVAL) {
        initializeNewRound(room);
    }

    room.currentPhase = phase;
    logger.info(`[게임 진행] ${roomId} 방: 라운드 ${room.currentRound} - ${phase} 시작`);

    switch (phase) {
        case PHASES.PRODUCTION:
            resetProductionPhase(room);
            break;
        case PHASES.ARRIVAL:
            resetArrivalPhase(room);
            break;
        case PHASES.INVESTMENT:
            prepareInvestmentPhase(io, room, roomId);
            break;
        case PHASES.TRADE:
            resetTradePhase(room);
            break;
    }

    const safeRoomState = {
        gameStarted: room.gameStarted,
        currentRound: room.currentRound,
        currentPhase: room.currentPhase,
    };
    io.to(roomId).emit('game_state_update', safeRoomState);

    broadcastTeamsUpdate(io, room, roomId);
}
function productionBatch(io, socket, data, room, roomId, sessionData) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        logger.warn(`플레이어를 찾을 수 없음: ${socket.id}`);
        return socket.emit('error', { message: '플레이어 정보를 찾을 수 없습니다.' });
    }

    const config = countryConfig[player.team];
    if (!config) {
        logger.warn(`국가 설정을 찾을 수 없음: ${player.team}`);
        return socket.emit('error', { message: '국가 정보를 찾을 수 없습니다.' });
    }

    const clicks = data.clicks || 0;
    let paGained = 0;
    for (let i = 0; i < clicks; i++) {
        // Check against maxProduct (total PA)
        if (team.totalPA < config.maxProduct) {
            team.clickCount++; // Track clicks for UI
            // Check if a batch of clicks is complete
            if (team.clickCount % config.clicksPerBatch === 0) {
                paGained += config.paPerBatch;
            }
        } else {
            break;
        }
    }
    team.totalPA += paGained;
    // Ensure totalPA does not exceed maxProduct
    team.totalPA = Math.min(team.totalPA, config.maxProduct);
    updateTeamMembers(io, team, room, roomId);
}

function tradeSelection(io, socket, data, room, roomId, sessionData) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.tradeSelection) {
        return socket.emit('error', { message: '이미 출항 선택을 완료했습니다.' });
    }

    const { type, amount } = data;
    const parsedAmount = parseInt(amount);

    const previousAmount = 0;
    const availablePA = team.totalPA + previousAmount;

    if (type === 'none') {
        team.tradeSelection = { type, amount: 0, playerName: player.name };
    } else {
        if (!isValidAmount(parsedAmount) || parsedAmount < 20 || parsedAmount % 10 !== 0) {
            return socket.emit('error', { message: '유효하지 않은 금액입니다. (20 PA 이상, 10 PA 단위로 입력)' });
        }
        if (parsedAmount > availablePA) {
            return socket.emit('error', { message: '보유한 PA가 부족합니다.' });
        }

        team.totalPA = Math.max(0, availablePA - parsedAmount);
        team.tradeSelection = { type, amount: parsedAmount, playerName: player.name };
    }

    updateTeamMembers(io, team, room, roomId);
    if (room.adminSocketId) {
        io.to(room.adminSocketId).emit('player_trade_selection', {
            playerName: player.name,
            selection: data
        });
    }

    const destText = type === 'china' ? '중국 (비단)' : (type === 'india' ? '인도 (후추)' : '출항 안 함');
    const message = `${player.name}님이 출항 선택을 했습니다: ${destText} ${type !== 'none' ? `/ ${parsedAmount} PA` : ''}`;

    team.members.forEach(member => {
        if (member.id !== socket.id && member.connected) {
            io.to(member.id).emit('notification', { message });
        }
    });
}

function makeInvestment(io, socket, data, room, roomId, sessionData) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
      return socket.emit('error', { message: error });
    }

    const targetTeam = room.teams[data.targetCountry];
    if (!targetTeam) {
      return socket.emit('error', { message: '투자 대상 팀을 찾을 수 없습니다.' });
    }
    const amount = parseInt(data.amount);

    if (!targetTeam || !isValidAmount(amount) || amount > team.totalPA || amount < 10 || amount % 10 !== 0) {
      return socket.emit('error', { message: '유효하지 않은 투자입니다. (10 PA 이상, 10 PA 단위로 입력)' });
    }

    team.totalPA = Math.max(0, team.totalPA - amount);
    team.investmentsMade.push({ toTeam: data.targetCountry, amount });
    targetTeam.investmentsReceived.push({ fromTeam: player.team, amount, playerName: player.name, teamName: team.name });

    const message = `${player.name}님이 ${targetTeam.name}에 ${amount} PA를 투자했습니다.`;
    team.members.forEach(member => {
        if (member.id !== socket.id && member.connected) {
            io.to(member.id).emit('notification', { message });
        }
    });

    updateTeamMembers(io, team, room, roomId);
    updateTeamMembers(io, targetTeam, room, roomId);
}

function resetTrade(io, socket, data, room, roomId, sessionData) {
    if (room.currentPhase !== PHASES.TRADE) {
        return socket.emit('error', { message: '지금은 출항 선택을 초기화할 수 없습니다.' });
    }

    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.tradeSelection) {
        team.totalPA += team.tradeSelection.amount;
        team.tradeSelection = null;

        const message = `${player.name}님이 출항 선택을 초기화했습니다.`;
        team.members.forEach(member => {
            if (member.id !== socket.id && member.connected) {
                io.to(member.id).emit('notification', { message });
            }
        });

        updateTeamMembers(io, team, room, roomId);
    }
}

function resetInvestments(io, socket, data, room, roomId, sessionData) {
    if (room.currentPhase !== PHASES.INVESTMENT) {
        return socket.emit('error', { message: '지금은 투자를 초기화할 수 없습니다.' });
    }

    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.investmentsMade && team.investmentsMade.length > 0) {
        let totalRefund = 0;
        team.investmentsMade.forEach(investment => {
            totalRefund += investment.amount;
            const targetTeam = room.teams[investment.toTeam];
            if (targetTeam) {
                targetTeam.investmentsReceived = targetTeam.investmentsReceived.filter(
                    inv => !(inv.fromTeam === player.team && inv.amount === investment.amount)
                );
                updateTeamMembers(io, targetTeam, room, roomId);
            }
        });

        team.totalPA += totalRefund;
        team.investmentsMade = [];

        const message = `${player.name}님이 모든 투자를 초기화했습니다.`;
        team.members.forEach(member => {
            if (member.id !== socket.id && member.connected) {
                io.to(member.id).emit('notification', { message });
            }
        });

        updateTeamMembers(io, team, room, roomId);
    }
}

function playRPS(io, socket, data, room, roomId, sessionData) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
      return socket.emit('error', { message: error });
    }

        if (team.rpsPlayedThisRound) {
          return;
        }
    
        const computerChoice = ['✌️', '✊', '✋'][Math.floor(Math.random() * 3)];
        const result = determineRPSResult(data.choice, computerChoice);
        const paChange = result === 'win' ? RPS_WIN_PA_CHANGE : result === 'lose' ? RPS_LOSE_PA_CHANGE : 0;
    
        team.totalPA = Math.max(0, team.totalPA + paChange);
        team.rpsPaChange = paChange;
        team.rpsPlayedThisRound = true;
    
        team.rpsResult = {
            playerChoice: data.choice,
            opponentChoice: computerChoice,
            result: result,
            playerName: player.name
        };
    updateTeamMembers(io, team, room, roomId);
    broadcastTeamsUpdate(io, room, roomId);
}

function _handleReroll(io, socket, room, roomId, sessionData, phase) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.country !== COUNTRIES.ENGLAND || team.rpsRerolls <= 0) {
      return socket.emit('error', { message: '리롤 토큰이 없거나 사용할 수 없습니다.' });
    }

    if (team.rerollUsedThisRound) {
        return socket.emit('error', { message: '이번 라운드에 이미 리롤 토큰을 사용했습니다.' });
    }

    team.rerollUsedThisRound = true;
    team.rpsRerolls--;

    const isProduction = phase === PHASES.PRODUCTION;
    if (isProduction) {
        team.totalPA = Math.max(0, team.totalPA - (team.rpsPaChange || 0));
        team.rpsPaChange = 0;
        team.rpsPlayedThisRound = false;
    } else { // arrival
        team.finalRpsPlayedThisRound = false;
        team.rpsGoodsChange = 0;
    }

    socket.emit('action_result', { 
      message: '리롤 토큰을 사용했습니다. 다시 선택하세요!', 
      teamState: team, 
      action: isProduction ? 'rps_reroll' : 'final_rps_reroll'
    });
    broadcastTeamsUpdate(io, room, roomId);
}

function rerollRPS(io, socket, data, room, roomId, sessionData) {
    _handleReroll(io, socket, room, roomId, sessionData, PHASES.PRODUCTION);
}

function drawEvent(io, socket, data, room, roomId, sessionData) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.eventDrawnThisRound || !team.tradeSelection) return;

    const event = determineEvent(EVENT_CONFIG);

    if (event.class === 'lose') { // 카무사리 이벤트
        team.camusariHappened = true;
        team.eventMultipliers = { paMultiplier: 0, goodsMultiplier: 0 };
        team.finalRpsPlayedThisRound = true; // 가위바위보 비활성화
    } else {
        team.eventMultipliers = { paMultiplier: event.paMultiplier, goodsMultiplier: event.goodsMultiplier };
    }

    team.eventDrawnThisRound = true;
    team.eventText = event.text;
    team.eventResultClass = event.class;

    team.eventResult = { html: event.text, resultClass: event.class, playerName: player.name };

    updateTeamMembers(io, team, room, roomId);
    calculateArrivalResults(io, team, room, roomId);
}

function playFinalRPS(io, socket, data, room, roomId, sessionData) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.finalRpsPlayedThisRound || !team.tradeSelection || team.camusariHappened) return;

    const computerChoice = ['✌️', '✊', '✋'][Math.floor(Math.random() * 3)];
    const result = determineRPSResult(data.choice, computerChoice);
    const goodsChange = result === 'win' ? FINAL_RPS_WIN_GOODS_CHANGE : result === 'lose' ? FINAL_RPS_LOSE_GOODS_CHANGE : 0;

    team.rpsGoodsChange = goodsChange;
    team.finalRpsPlayedThisRound = true;
    team.finalRpsResult = result;

    team.finalRpsResultData = {
        playerChoice: data.choice,
        opponentChoice: computerChoice,
        result: result,
        playerName: player.name
    };

    updateTeamMembers(io, team, room, roomId);
    calculateArrivalResults(io, team, room, roomId);
}

function rerollFinalRPS(io, socket, data, room, roomId, sessionData) {
    _handleReroll(io, socket, room, roomId, sessionData, PHASES.ARRIVAL);
}

function resetGame(io, socket, data, room, roomId, sessionData) {
    if (socket.id !== room.adminSocketId) return;

    Object.values(room.teams).forEach(team => {
      const members = team.members;
      const newTeamState = createInitialTeamState(team.country, countryConfig[team.country]);
      newTeamState.members = members;
      room.teams[team.country] = newTeamState;
    });

    room.currentRound = 0;
    room.currentPhase = PHASES.WAITING;
    room.gameStarted = false;

    broadcastTeamsUpdate(io, room, roomId);
    const safeRoomState = {
        gameStarted: room.gameStarted,
        currentRound: room.currentRound,
        currentPhase: room.currentPhase,
        players: room.players,
        teams: room.teams
    };
    io.to(roomId).emit('game_state_update', safeRoomState);
}

async function disconnect(io, socket, room, roomId, sessionData, supabase) {
    try {
      if (!room) return false;

      const playerInfo = room.players[socket.id];

      if (playerInfo) {
        const team = room.teams[playerInfo.team];
        if (team) {
          const member = team.members.find(m => m.id === socket.id);
          if(member) {
            member.connected = false;
            // Do NOT delete from room.players immediately. Reconnect will update it.
            // delete room.players[socket.id]; // Removed this line
          }
        }
        // The player entry in room.players will be updated by reconnectPlayer or cleaned up if the room is deleted.
        // io.to(roomId).emit('player_disconnected', { playerName: playerInfo.name }); // This emit might need adjustment if player is not fully gone
        broadcastTeamsUpdate(io, room, roomId);
      }

      if (socket.id === room.adminSocketId) {
        logger.warn(`[관리자 퇴장] ${roomId} 방 관리자 퇴장`);
        room.adminSocketId = null;
      }

      // Check if the room is now empty and should be deleted
      let connectedPlayersInRoom = 0;
      for (const team of Object.values(room.teams)) {
          connectedPlayersInRoom += team.members.filter(m => m.connected).length;
      }

      if (connectedPlayersInRoom === 0 && !room.adminSocketId) {
        try {
            const { error } = await supabase.from('rooms').delete().eq('room_id', roomId);
            if (error) {
                logger.error(`[DB 삭제 실패] ${roomId}`, error);
            } else {
                logger.info(`[DB 삭제] ${roomId} 방이 비어서 데이터베이스에서 삭제됨`);
            }
        } catch (dbError) {
            logger.error(`[DB 삭제 중 예외 발생] ${roomId}`, dbError);
        }
        return true; // Always signal for memory cleanup if room is empty
      }

      return false; // Signal that the room state should be updated, not deleted
    } catch (error) {
      logger.error('연결 해제 처리 중 오류', error);
      return false;
    }
}

function endGame(io, socket, data, room, roomId, sessionData) {
    if (socket.id !== room.adminSocketId) return;

    const finalResults = calculateRankings(room);
    room.currentPhase = PHASES.ENDED;

    io.to(roomId).emit('game_state_update', {
        gameStarted: room.gameStarted,
        currentRound: room.currentRound,
        currentPhase: room.currentPhase,
        players: room.players,
        teams: room.teams
    });

    io.to(roomId).emit('game_ended', finalResults);
}

function resetProduction(io, socket, data, room, roomId, sessionData) {
    if (socket.id !== room.adminSocketId) return;

    Object.values(room.teams).forEach(team => {
        // Reverse PA from RPS before resetting counters
        team.totalPA = Math.max(0, team.totalPA - (team.rpsPaChange || 0));
        team.clickCount = 0;
    });

    resetProductionPhase(room); 

    broadcastTeamsUpdate(io, room, roomId);
    logger.info(`[관리자] ${roomId} 방의 생산 상태 초기화`);
}

function reconnectPlayer(io, socket, data, gameState, roomId, sessionData) {
    // The sessionData contains the authenticated user's studentId and name
    const { studentId, name } = sessionData;

    let foundPlayer = null;
    let playerTeam = null;
    let oldSocketId = null;

    // Find the player and their old socket ID by studentId
    for (const team of Object.values(gameState.teams)) {
        const member = team.members.find(m => m.studentId === studentId); // Use studentId for identification
        if (member) {
            foundPlayer = member;
            playerTeam = team;
            oldSocketId = member.id; // The ID stored in the member object is the old socket ID
            break;
        }
    }

    if (foundPlayer && playerTeam) {
        // Clean up old player entry if it exists
        if (oldSocketId && gameState.players[oldSocketId]) {
            delete gameState.players[oldSocketId];
        }

        // Update player data with new socket ID
        foundPlayer.id = socket.id;
        foundPlayer.connected = true;
        gameState.players[socket.id] = { studentId: foundPlayer.studentId, name: foundPlayer.name, team: playerTeam.country }; // Store studentId

        socket.join(roomId);
        socket.roomId = roomId;

        logger.info(`[재접속] ${foundPlayer.name}님이 ${roomId} 방에 다시 연결되었습니다.`);

        // Send full state to reconnected client
        socket.emit('game_state_update', gameState);
        
        // Notify others
        io.to(roomId).emit('teams_update', { teams: gameState.teams });

    } else {
        // This case should ideally not be reached if safeHandler already validated the token
        // and the user is expected to be in a room.
        // However, if the user is authenticated but not in this specific room,
        // or if their team member entry was somehow removed, this handles it.
        socket.emit('error', { message: '인증된 사용자이지만, 이 방에서 플레이어 정보를 찾을 수 없습니다.' });
    }
}

async function loginOrRegister(socket, data, supabase, redisClient) {
    const { studentId, name } = data;
    try {
        // 1. Check if user exists
        const { data: existingUser, error: selectError } = await supabase
            .from('users')
            .select('id, student_id, name')
            .eq('student_id', studentId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') { // PGRST116: row not found
            throw new Error(`Supabase select error: ${selectError.message}`);
        }

        let user = existingUser;

        if (user) {
            // 2. User exists, verify name
            if (user.name !== name) {
                socket.emit('login_failure', { message: '학번과 이름이 일치하지 않습니다.' });
                return;
            }
        } else {
            // 3. User does not exist, create new user
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({ student_id: studentId, name: name })
                .select('id, student_id, name')
                .single();

            if (insertError) {
                throw new Error(`Supabase insert error: ${insertError.message}`);
            }
            user = newUser;
        }

        // 4. Generate session token and store in Redis
        const token = crypto.randomUUID();
        const sessionData = { userId: user.id, studentId: user.student_id, name: user.name };
        
        // Store session in Redis for 24 hours (24 * 60 * 60 seconds)
        await redisClient.set(`session:${token}`, JSON.stringify(sessionData), {
            EX: 24 * 60 * 60,
        });

        // 5. Emit success to client
        socket.emit('login_success', { token, studentId: user.student_id, name: user.name });
        logger.info(`[로그인 성공] 학번: ${studentId}, 이름: ${name}`);

    } catch (error) {
        logger.error('Login or registration failed', error);
        socket.emit('login_failure', { message: '서버 오류가 발생했습니다. 다시 시도해주세요.' });
    }
}

async function loginOrRegister(socket, data, supabase, redisClient) {
    const { studentId, name } = data;
    try {
        // 1. Check if user exists
        const { data: existingUser, error: selectError } = await supabase
            .from('users')
            .select('id, student_id, name')
            .eq('student_id', studentId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') { // PGRST116: row not found
            throw new Error(`Supabase select error: ${selectError.message}`);
        }

        let user = existingUser;

        if (user) {
            // 2. User exists, verify name
            if (user.name !== name) {
                socket.emit('login_failure', { message: '학번과 이름이 일치하지 않습니다.' });
                return;
            }
        } else {
            // 3. User does not exist, create new user
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert({ student_id: studentId, name: name })
                .select('id, student_id, name')
                .single();

            if (insertError) {
                throw new Error(`Supabase insert error: ${insertError.message}`);
            }
            user = newUser;
        }

        // 4. Generate session token and store in Redis
        const token = crypto.randomUUID();
        const sessionData = { userId: user.id, studentId: user.student_id, name: user.name };
        
        // Store session in Redis for 24 hours (24 * 60 * 60 seconds)
        await redisClient.set(`session:${token}`, JSON.stringify(sessionData), {
            EX: 24 * 60 * 60,
        });

        // 5. Emit success to client
        socket.emit('login_success', { token, studentId: user.student_id, name: user.name });
        logger.info(`[로그인 성공] 학번: ${studentId}, 이름: ${name}`);

    } catch (error) {
        logger.error('Login or registration failed', error);
        socket.emit('login_failure', { message: '서버 오류가 발생했습니다. 다시 시도해주세요.' });
    }
}

async function getUsers(socket, supabase) {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('student_id, name, created_at')
            .order('created_at', { ascending: true });

        if (error) {
            throw new Error(`Supabase fetch users error: ${error.message}`);
        }

        socket.emit('users_list_update', users);
    } catch (error) {
        logger.error('Failed to get users list', error);
        socket.emit('error', { message: '사용자 목록을 가져오는 데 실패했습니다.' });
    }
}

async function deleteUser(socket, data, supabase) {
    const { studentId } = data;
    try {
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('student_id', studentId);

        if (error) {
            throw new Error(`Supabase delete user error: ${error.message}`);
        }

        socket.emit('user_deleted_success', { studentId, message: '사용자가 성공적으로 삭제되었습니다.' });
        logger.info(`[사용자 삭제] 학번: ${studentId}`);
    } catch (error) {
        logger.error(`Failed to delete user ${studentId}`, error);
        socket.emit('user_deleted_failure', { studentId, message: '사용자 삭제에 실패했습니다.' });
    }
}

module.exports = {
    loginOrRegister,
    getUsers, // Export new function
    deleteUser, // Export new function
    registerPlayer,
    startPhase,
    productionBatch,
    tradeSelection,
    makeInvestment,
    playRPS,
    rerollRPS,
    drawEvent,
    playFinalRPS,
    rerollFinalRPS,
    resetGame,
    disconnect,
    endGame,
    resetTrade,
    resetInvestments,
    resetProduction,
    reconnectPlayer
};