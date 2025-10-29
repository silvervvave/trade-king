const { rooms, createInitialTeamState } = require('./rooms');
const { countryConfig, EVENT_CONFIG } = require('../config');
const { isValidAmount, determineRPSResult, determineEvent, calculateRankings } = require('./utils');

const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error || ''),
};

function broadcastTeamsUpdate(io, room, roomId) {
    io.to(roomId).emit('teams_update', { teams: room.teams });
}

function updateTeamMembers(io, team, roomId) {
    team.members.forEach(member => {
        if (member.connected) {
            io.to(member.id).emit('team_state_update', team);
        }
    });
    broadcastTeamsUpdate(io, rooms[roomId], roomId);
}

function calculateArrivalResults(io, team, room, roomId) {
    if (team.eventDrawnThisRound && team.finalRpsPlayedThisRound) {
        const tradeData = team.tradeSelection;
        if (!tradeData) return;

        const destination = tradeData.type;
        const baseAmount = tradeData.amount;
        const { paMultiplier, goodsMultiplier } = team.eventMultipliers;
        const rpsGoodsChange = team.rpsGoodsChange;

        let goodsAcquired = Math.max(0, Math.floor(baseAmount / 100) + rpsGoodsChange);
        goodsAcquired *= goodsMultiplier;

        if (destination === 'china') { // 비단
            if (goodsAcquired > 0) team.silk += goodsAcquired;
        } else if (destination === 'india') { // 후추
            if (goodsAcquired > 0) team.pepper += goodsAcquired;
        }

        const profit = (baseAmount * paMultiplier) - baseAmount;

        if (team.investmentsReceived.length > 0) {
            team.investmentsReceived.forEach(investment => {
                const investorTeam = room.teams[investment.fromTeam];
                if (investorTeam) {
                    // 투자금 반환
                    investorTeam.totalPA += investment.amount;

                    // 무역품 분배
                    const investmentGoods = Math.floor(investment.amount / 100) * goodsMultiplier;
                    if (investmentGoods > 0) {
                        if (destination === 'china') {
                            investorTeam.silk += investmentGoods;
                        } else if (destination === 'india') {
                            investorTeam.pepper += investmentGoods;
                        }
                    }
                    
                    // 프랑스 투자 보너스
                    if (investorTeam.country === 'france' && profit > 0) {
                        investorTeam.totalPA += 50;
                    }
                    updateTeamMembers(io, investorTeam, roomId);
                }
            });
        }
        
        team.totalPA += (baseAmount * paMultiplier);

        if (team.country === 'france' && paMultiplier > 0) {
            team.totalPA += 50;
        }

        io.to(roomId).emit('arrival_summary', {
            country: team.country,
            goodsAcquired,
            profit,
            destination
        });
        
        broadcastTeamsUpdate(io, room, roomId);
    }
}

function registerPlayer(io, socket, data, room, roomId) {
    const { country, playerName } = data;
    if (!countryConfig[country]) return socket.emit('error', { message: '유효하지 않은 국가입니다.' });

    const sanitizedPlayerName = playerName.replace(/[<>"'&]/g, ' ').trim();
    if (sanitizedPlayerName.length === 0) {
        return socket.emit('error', { message: '이름이 유효하지 않습니다.' });
    }

    if (!room.teams[country]) {
      const config = countryConfig[country];
      room.teams[country] = createInitialTeamState(country, config);
    }
    
    const team = room.teams[country];
    const existingMember = team.members.find(m => m.name === sanitizedPlayerName);

    if (existingMember) {
      existingMember.id = socket.id;
      existingMember.connected = true;
    } else {
      team.members.push({ id: socket.id, name: sanitizedPlayerName, connected: true });
    }

    room.players[socket.id] = { name: sanitizedPlayerName, team: country };
    socket.join(roomId);
    socket.roomId = roomId;

    logger.info(`[플레이어 참가] ${sanitizedPlayerName}님이 ${roomId} 방의 ${country} 팀에 참가`);
    
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

function startPhase(io, socket, data, room, roomId) {
    if (socket.id !== room.adminSocketId) return;

    const { phase } = data;
    if (!room.gameStarted) {
      room.gameStarted = true;
      room.currentRound = 1;
    } else if (phase === 'trade' && room.currentPhase === 'arrival') {
      room.currentRound++;
      Object.values(room.teams).forEach(t => {
        t.eventDrawnThisRound = false;
        t.finalRpsPlayedThisRound = false;
        t.rerollUsedThisRound = false;
      });
    }

    room.currentPhase = phase;
    logger.info(`[게임 진행] ${roomId} 방: 라운드 ${room.currentRound} - ${phase} 시작`);
    
    const safeRoomState = {
        gameStarted: room.gameStarted,
        currentRound: room.currentRound,
        currentPhase: room.currentPhase,
        players: room.players,
        teams: room.teams
    };
    io.to(roomId).emit('game_state_update', safeRoomState);

    if (phase === 'production') {
      Object.values(room.teams).forEach(t => { 
        t.rpsPlayedThisRound = false; 
        t.rerollUsedThisRound = false;
        t.rpsPaChange = 0; 
      });
    }

    if (phase === 'arrival') {
      Object.values(room.teams).forEach(t => { 
        t.eventDrawnThisRound = false; 
        t.finalRpsPlayedThisRound = false; 
        t.eventMultipliers = { paMultiplier: 1, goodsMultiplier: 1 };
        t.rpsGoodsChange = 0;
        t.eventText = '';
        t.finalRpsResult = '';
      });
    }

    if (phase === 'investment') {
      const voyageInfo = Object.values(room.teams)
        .filter(t => t.tradeSelection)
        .map(t => ({ 
          country: t.country, 
          destination: t.tradeSelection.type, 
          amount: t.tradeSelection.amount 
        }));
      io.to(roomId).emit('investment_info', { voyages: voyageInfo });
    }

    if (phase === 'trade') {
      Object.values(room.teams).forEach(t => {
        t.tradeSelection = null;
        t.investmentsMade = [];
        t.investmentsReceived = [];
      });
    }

    broadcastTeamsUpdate(io, room, roomId);
}

function productionBatch(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    if (!player) {
        logger.warn(`플레이어를 찾을 수 없음: ${socket.id}`);
        return socket.emit('error', { message: '플레이어 정보를 찾을 수 없습니다.' });
    }

    const team = room.teams[player.team];
    if (!team) {
        logger.warn(`팀을 찾을 수 없음: ${player.team}`);
        return socket.emit('error', { message: '팀 정보를 찾을 수 없습니다.' });
    }

    const config = countryConfig[player.team];
    if (!config) {
        logger.warn(`국가 설정을 찾을 수 없음: ${player.team}`);
        return socket.emit('error', { message: '국가 정보를 찾을 수 없습니다.' });
    }

    const clicks = data.clicks || 0;
    let paGained = 0;
    for (let i = 0; i < clicks; i++) {
        if (team.clickCount < config.maxClicks) {
            team.clickCount++;
            paGained += config.paPerClick;
        } else {
            break;
        }
    }
    team.totalPA += paGained;
    updateTeamMembers(io, team, roomId);
}

function tradeSelection(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    if (!player) {
        return socket.emit('error', { message: '플레이어 정보를 찾을 수 없습니다.' });
    }

    const team = room.teams[player.team];
    if (!team) {
        return socket.emit('error', { message: '팀 정보를 찾을 수 없습니다.' });
    }

    const { type, amount } = data;
    const parsedAmount = parseInt(amount);

    const previousAmount = team.tradeSelection ? team.tradeSelection.amount : 0;
    const availablePA = team.totalPA + previousAmount;

    if (type === 'none') {
        team.totalPA = availablePA;
        team.tradeSelection = null;
    } else {
        if (!isValidAmount(parsedAmount) || parsedAmount < 200 || parsedAmount % 100 !== 0) {
            return socket.emit('error', { message: '유효하지 않은 금액입니다. (200 PA 이상, 100 PA 단위로 입력)' });
        }
        if (parsedAmount > availablePA) {
            return socket.emit('error', { message: '보유한 PA가 부족합니다.' });
        }

        team.totalPA = availablePA - parsedAmount;
        team.tradeSelection = { type, amount: parsedAmount };
    }

    updateTeamMembers(io, team, roomId);
    if (room.adminSocketId) {
        io.to(room.adminSocketId).emit('player_trade_selection', {
            playerName: player.name,
            selection: data
        });
    }
}

function makeInvestment(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    if (!player) {
      return socket.emit('error', { message: '플레이어 정보를 찾을 수 없습니다.' });
    }

    const investingTeam = room.teams[player.team];
    if (!investingTeam) {
      return socket.emit('error', { message: '팀 정보를 찾을 수 없습니다.' });
    }

    const targetTeam = room.teams[data.targetCountry];
    if (!targetTeam) {
      return socket.emit('error', { message: '투자 대상 팀을 찾을 수 없습니다.' });
    }
    const amount = parseInt(data.amount);

    if (!targetTeam || !isValidAmount(amount) || amount > investingTeam.totalPA || amount < 100 || amount % 100 !== 0) {
      return socket.emit('error', { message: '유효하지 않은 투자입니다. (100 PA 이상, 100 PA 단위로 입력)' });
    }

    investingTeam.totalPA -= amount;
    investingTeam.investmentsMade.push({ toTeam: data.targetCountry, amount });
    targetTeam.investmentsReceived.push({ fromTeam: player.team, amount });

    socket.emit('action_result', { 
      message: `${targetTeam.country} 팀에 ${amount} PA 투자 완료!`,
      teamState: investingTeam 
    });
    updateTeamMembers(io, targetTeam, roomId);
}

function playRPS(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    if (!player) {
      return socket.emit('error', { message: '플레이어 정보를 찾을 수 없습니다.' });
    }

    const team = room.teams[player.team];
    if (!team) {
      return socket.emit('error', { message: '팀 정보를 찾을 수 없습니다.' });
    }

    if (team.rpsPlayedThisRound) {
      return;
    }

    team.totalPA -= (team.rpsPaChange || 0);
  const computerChoice = ['✌️', '✊', '✋'][Math.floor(Math.random() * 3)];
    const result = determineRPSResult(data.choice, computerChoice);
    const paChange = result === 'win' ? 50 : result === 'lose' ? -50 : 0;

    team.totalPA += paChange;
    team.rpsPaChange = paChange;
    team.rpsPlayedThisRound = true;

    let html = `결과: ${result}. ${paChange} PA`;
    if (team.country === 'england' && team.rpsRerolls > 0 && result !== 'win') {
      html += ` 재도전 (${team.rpsRerolls} 남음)`;
    }

    io.to(socket.id).emit('rps_result', { html, resultClass: result, teamState: team });
    broadcastTeamsUpdate(io, room, roomId);
}

function rerollRPS(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    if (!player) return;
    const team = room.teams[player.team];

    if (team.country !== 'england' || team.rpsRerolls <= 0) {
      return socket.emit('error', { message: '리롤 토큰이 없거나 사용할 수 없습니다.' });
    }

    if (team.rerollUsedThisRound) {
        return socket.emit('error', { message: '이번 라운드에 이미 리롤 토큰을 사용했습니다.' });
    }

    team.rerollUsedThisRound = true;
    team.rpsRerolls--;
    team.totalPA -= (team.rpsPaChange || 0);
    team.rpsPaChange = 0;
    team.rpsPlayedThisRound = false;

    socket.emit('action_result', { 
      message: '리롤 토큰을 사용했습니다. 다시 선택하세요!', 
      teamState: team, 
      action: 'rps_reroll'
    });
    broadcastTeamsUpdate(io, room, roomId);
}

function drawEvent(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    const team = room.teams[player.team];

    if (team.eventDrawnThisRound || !team.tradeSelection) return;

    const event = determineEvent(EVENT_CONFIG);
    team.eventMultipliers = { paMultiplier: event.paMultiplier, goodsMultiplier: event.goodsMultiplier };
    team.eventDrawnThisRound = true;
    team.eventText = event.text;

    io.to(socket.id).emit('event_result', { 
      html: event.text, 
      resultClass: event.class, 
      teamState: team 
    });
    calculateArrivalResults(io, team, room, roomId);
}

function playFinalRPS(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    const team = room.teams[player.team];

    if (team.finalRpsPlayedThisRound || !team.tradeSelection) return;

  const computerChoice = ['✌️', '✊', '✋'][Math.floor(Math.random() * 3)];
    const result = determineRPSResult(data.choice, computerChoice);
    team.rpsGoodsChange = result === 'win' ? 2 : result === 'lose' ? -2 : 0;
    team.finalRpsPlayedThisRound = true;
    team.finalRpsResult = result;

    let html = `결과: ${result}. 상품 ${team.rpsGoodsChange}개`;
    if (team.country === 'england' && team.rpsRerolls > 0 && result !== 'win') {
      html += ` 재도전 (${team.rpsRerolls} 남음)`;
    }

    io.to(socket.id).emit('final_rps_result', { 
      html, 
      resultClass: result, 
      teamState: team 
    });
    calculateArrivalResults(io, team, room, roomId);
}

function rerollFinalRPS(io, socket, data, room, roomId) {
    const player = room.players[socket.id];
    if (!player) return;
    const team = room.teams[player.team];

    if (team.country !== 'england' || team.rpsRerolls <= 0) {
      return socket.emit('error', { message: '리롤 토큰이 없거나 사용할 수 없습니다.' });
    }

    if (team.rerollUsedThisRound) {
        return socket.emit('error', { message: '이번 라운드에 이미 리롤 토큰을 사용했습니다.' });
    }

    team.rerollUsedThisRound = true;
    team.rpsRerolls--;
    team.finalRpsPlayedThisRound = false;
    team.rpsGoodsChange = 0;

    socket.emit('action_result', { 
      message: '리롤 토큰을 사용했습니다. 다시 선택하세요!', 
      teamState: team, 
      action: 'final_rps_reroll'
    });
    broadcastTeamsUpdate(io, room, roomId);
}

function resetGame(io, socket, data, room, roomId) {
    if (socket.id !== room.adminSocketId) return;

    Object.values(room.teams).forEach(team => {
      const members = team.members;
      const newTeamState = createInitialTeamState(team.country, countryConfig[team.country]);
      newTeamState.members = members;
      room.teams[team.country] = newTeamState;
    });

    room.currentRound = 0;
    room.currentPhase = 'waiting';
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

function disconnect(io, socket, room, roomId) {
    try {
      if (!roomId || !room) return;

      const playerInfo = room.players[socket.id];

      if (playerInfo) {
        const team = room.teams[playerInfo.team];
        if (team) {
          const member = team.members.find(m => m.id === socket.id);
          if(member) member.connected = false;
        }
        delete room.players[socket.id];
        io.to(roomId).emit('player_disconnected', { playerName: playerInfo.name });
        broadcastTeamsUpdate(io, room, roomId);
      }

      if (socket.id === room.adminSocketId) {
        logger.warn(`[관리자 퇴장] ${roomId} 방 관리자 퇴장`);
        room.adminSocketId = null;
      }

      if (Object.keys(room.players).length === 0 && !room.adminSocketId) {
        delete rooms[roomId];
        logger.info(`[방 삭제] ${roomId} 방이 비어서 삭제됨`);
      }
    } catch (error) {
      logger.error('연결 해제 처리 중 오류', error);
    }
}

function endGame(io, socket, data, room, roomId) {
    if (socket.id !== room.adminSocketId) return;

    const finalRankings = calculateRankings(room);
    room.currentPhase = 'ended';

    io.to(roomId).emit('game_ended', { rankings: finalRankings });
    broadcastTeamsUpdate(io, room, roomId);
}

module.exports = {
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
    endGame
};