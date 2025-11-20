const { isValidAmount } = require('../utils');
const { PHASES } = require('../constants');
const { _getPlayerAndTeam, updateTeamMembers } = require('./common');

function tradeSelection(io, socket, data, room, roomId) {
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
            return socket.emit('trade_selection_error', { message: '보유한 PA가 부족합니다.' });
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

function makeInvestment(io, socket, data, room, roomId) {
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

function resetTrade(io, socket, data, room, roomId) {
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

function resetInvestments(io, socket, data, room, roomId) {
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

module.exports = {
    tradeSelection,
    makeInvestment,
    resetTrade,
    resetInvestments
};
