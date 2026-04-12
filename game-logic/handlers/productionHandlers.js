const { countryConfig } = require('../../config');
const { _getPlayerAndTeam, updateTeamMembers, broadcastTeamsUpdate } = require('./common');
const { determineRPSResult } = require('../utils');
const { COUNTRIES, RPS_WIN_PA_CHANGE, RPS_LOSE_PA_CHANGE, PHASES } = require('../constants');
const logger = require('../utils/logger');

function completeProductionBatch(io, socket, data, room, roomId) {
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

    // Check if the team can still produce more batches (라운드마다 +2 배치 추가)
    const bonusBatches = Math.max(0, (room.currentRound - 1)) * 2;
    const effectiveMaxBatch = config.maxBatchCount + bonusBatches;
    if (team.batchCount < effectiveMaxBatch) {
        team.batchCount++;
        team.totalPA += config.paPerBatch;

        // Update all team members with the new state
        updateTeamMembers(io, team, room, roomId);
    } else {
        // Optionally, notify the player that they have reached the max batch count
        socket.emit('notification', { message: '최대 생산 횟수에 도달했습니다!' });
    }
}

function playRPS(io, socket, data, room, roomId) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.rpsPlayedThisRound) {
        return;
    }

    const computerChoice = ['✌️', '✊', '✋'][Math.floor(Math.random() * 3)];
    let result = determineRPSResult(data.choice, computerChoice);

    // England's special ability: always wins in RPS (절대왕정)
    if (team.country === COUNTRIES.ENGLAND) {
        result = 'win';
    }

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

    socket.emit('rps_result', team.rpsResult);
    updateTeamMembers(io, team, room, roomId);
    broadcastTeamsUpdate(io, room, roomId);
}

module.exports = {
    completeProductionBatch,
    playRPS,
};
