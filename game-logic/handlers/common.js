const { countryConfig } = require('../../config');
const { COUNTRIES, PHASES, FRANCE_MERCANTILISM_BONUS_PA } = require('../constants');
const logger = require('../utils/logger');

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
            io.to(member.id).emit('team_update', team);
        }
    });
    broadcastTeamsUpdate(io, room, roomId);
}

function _handleReroll(io, socket, room, roomId, phase) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.country !== COUNTRIES.ENGLAND || team.rpsRerolls <= 0) {
        return socket.emit('error', { message: '리롤 토큰을 사용할 수 없습니다.' });
    }

    if (team.rerollUsedThisRound) {
        return socket.emit('error', { message: '이번 라운드에 리롤 토큰을 사용했습니다.' });
    }

    team.rerollUsedThisRound = true;
    team.rpsRerolls--;

    const isProduction = phase === PHASES.PRODUCTION;
    if (isProduction) {
        team.totalPA = Math.max(0, team.totalPA - (team.rpsPaChange || 0));
        team.rpsPaChange = 0;
        team.rpsPlayedThisRound = false;
        team.rpsResult = null; // 이전 RPS 결과 초기화
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

function distributeInvestmentReturns(io, team, room, roomId, goodsMultiplier, rpsGoodsChange, destination) {
    if (team.investmentsReceived.length > 0) {
        if (team.camusariHappened) {
            // 카무사리 발생 시 투자자 처리
            team.investmentsReceived.forEach(investment => {
                const investorTeam = room.teams[investment.fromTeam];
                if (investorTeam) {
                    investorTeam.totalPA += investment.amount; // 투자 원금 보전
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

                    if (investorTeam.country === COUNTRIES.FRANCE && goodsMultiplier > 0 && investorTeam.mercantilismUses < 10) {
                        investorTeam.totalPA += FRANCE_MERCANTILISM_BONUS_PA;
                        investorTeam.mercantilismUses++;
                    }
                    updateTeamMembers(io, investorTeam, room, roomId);
                }
            });
        }
    }
}

function calculateArrivalResults(io, team, room, roomId) {
    if (!team.tradeSelection || !team.eventDrawnThisRound || team.arrivalCalculationDone) {
        return;
    }

    // 가위바위보를 하지 않은 경우를 위해 기본값 설정
    const rpsGoodsChange = team.finalRpsPlayedThisRound ? team.rpsGoodsChange : 0;

    if (team.camusariHappened) {
        // 카무사리 발생 시 항해자 처리 (항해비 보전)
        team.totalPA += team.tradeSelection.amount;
        distributeInvestmentReturns(io, team, room, roomId, 0, 0, null);
        io.to(roomId).emit('arrival_summary', {
            country: team.country,
            goodsAcquired: 0,
            profit: 0,
            destination: team.tradeSelection.type,
            camusari: true
        });
    } else {
        // 일반 도착 결과 계산
        const destination = team.tradeSelection.type;
        const baseAmount = team.tradeSelection.amount;
        const { paMultiplier, goodsMultiplier } = team.eventMultipliers;

        let goodsAcquired = Math.floor((baseAmount / 10) * goodsMultiplier);
        goodsAcquired = Math.max(0, goodsAcquired + rpsGoodsChange);

        if (destination === 'china') {
            if (goodsAcquired > 0) team.silk += goodsAcquired;
        } else if (destination === 'india') {
            if (goodsAcquired > 0) team.pepper += goodsAcquired;
        }

        distributeInvestmentReturns(io, team, room, roomId, goodsMultiplier, rpsGoodsChange, destination);

        team.totalPA += (baseAmount * paMultiplier);

        if (team.country === COUNTRIES.FRANCE && goodsMultiplier > 0 && team.mercantilismUses < 10) {
            team.totalPA += FRANCE_MERCANTILISM_BONUS_PA;
            team.mercantilismUses++;
        }

        io.to(roomId).emit('arrival_summary', {
            country: team.country,
            goodsAcquired,
            profit: (baseAmount * paMultiplier) - baseAmount,
            destination
        });
    }

    team.arrivalCalculationDone = true; // 계산 완료 플래그 설정
    // broadcastTeamsUpdate(io, room, roomId); // This will be done in a batch later
}

module.exports = {
    _getPlayerAndTeam,
    broadcastTeamsUpdate,
    updateTeamMembers,
    distributeInvestmentReturns,
    calculateArrivalResults,
    _handleReroll
};
