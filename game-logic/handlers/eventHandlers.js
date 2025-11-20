const { EVENT_CONFIG } = require('../../config');
const { determineEvent, determineRPSResult } = require('../utils');
const { _getPlayerAndTeam, updateTeamMembers, _handleReroll } = require('./common');
const { PHASES, COUNTRIES, FINAL_RPS_WIN_GOODS_CHANGE, FINAL_RPS_LOSE_GOODS_CHANGE } = require('../constants');

function drawEvent(io, socket, data, room, roomId) {
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
    // calculateArrivalResults(io, team, room, roomId); // REMOVED: Calculation is now deferred to the end of the phase.
}

function playFinalRPS(io, socket, data, room, roomId) {
    const { player, team, error } = _getPlayerAndTeam(room, socket.id);
    if (error) {
        return socket.emit('error', { message: error });
    }

    if (team.finalRpsPlayedThisRound || !team.tradeSelection || team.camusariHappened) return;

    const computerChoice = ['✌️', '✊', '✋'][Math.floor(Math.random() * 3)];
    let result = determineRPSResult(data.choice, computerChoice);

    // England's special ability: no loss in RPS
    if (team.country === COUNTRIES.ENGLAND && result === 'lose') {
        result = 'draw';
    }

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

    socket.emit('final_rps_result', team.finalRpsResultData);
    updateTeamMembers(io, team, room, roomId);
    // calculateArrivalResults(io, team, room, roomId); // REMOVED: Calculation is now deferred to the end of the phase.
}

function rerollFinalRPS(io, socket, data, room, roomId) {
    _handleReroll(io, socket, room, roomId, PHASES.ARRIVAL);
}

module.exports = {
    drawEvent,
    playFinalRPS,
    rerollFinalRPS
};
