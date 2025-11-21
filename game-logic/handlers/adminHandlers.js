const { createInitialTeamState } = require('../rooms');
const { countryConfig } = require('../../config');
const { calculateRankings } = require('../utils');
const { PHASES, COUNTRIES } = require('../constants');
const { broadcastTeamsUpdate, calculateArrivalResults } = require('./common');
const logger = require('../utils/logger');

function initializeNewRound(room) {
    room.currentRound++;
    Object.values(room.teams).forEach(t => {
        // Logic from resetTradePhase
        t.tradeSelection = null;
        t.investmentsMade = [];
        t.investmentsReceived = [];

        // Existing logic
        t.eventDrawnThisRound = false;
        t.finalRpsPlayedThisRound = false;
        t.rerollUsedThisRound = false;
        t.camusariHappened = false; // 카무사리 상태 초기화
        t.eventText = '';
        t.eventResultClass = '';
        t.eventResult = null;
        t.rpsResult = null; // 생산 단계 RPS 결과 초기화
        t.rpsPlayedThisRound = false; // 생산 단계 RPS 실행 여부 초기화
        t.finalRpsResultData = null; // 도착 단계 RPS 결과 초기화
        t.arrivalCalculationDone = false; // 보상 계산 플래그 초기화
        if (t.country === COUNTRIES.ENGLAND) {
            t.rpsRerolls = 1;
        }
    });
}

function resetProductionPhase(room) {
    Object.values(room.teams).forEach(t => {
        // Reset production phase state
        t.rerollUsedThisRound = false;
        t.rpsPaChange = 0;
        t.rpsResult = null;
        t.batchCount = 0; // Reset batch count for the new production phase

        // Reset previous arrival phase results
        t.finalRpsResultData = null;
        t.eventDrawnThisRound = false;
        t.eventText = '';
        t.eventResultClass = '';
        t.finalRpsPlayedThisRound = false;
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
            amount: t.tradeSelection.amount,
            investments: t.investmentsReceived.map(inv => ({
                fromTeam: inv.fromTeam,
                amount: inv.amount,
                playerName: inv.playerName,
                teamName: room.teams[inv.fromTeam] ? room.teams[inv.fromTeam].name : 'Unknown'
            }))
        }));
    io.to(roomId).emit('investment_info', { voyages: voyageInfo });
}

function startPhase(io, socket, data, room, roomId) {
    if (socket.id !== room.adminSocketId) return;

    const { phase } = data;
    if (!room.gameStarted) {
        room.gameStarted = true;
        room.currentRound = 1;
    }

    // [MODIFIED LOGIC]
    // If we are leaving the ARRIVAL phase, we must calculate the results first.
    if (room.currentPhase === PHASES.ARRIVAL) {
        Object.values(room.teams).forEach(team => {
            calculateArrivalResults(io, team, room, roomId);
        });
        // 모든 계산이 끝난 후, 한 번에 모든 클라이언트에 업데이트된 정보를 브로드캐스트합니다.
        broadcastTeamsUpdate(io, room, roomId);

        // If the *next* phase is TRADE, it means a new round is starting.
        if (phase === PHASES.TRADE) {
            initializeNewRound(room);
        }
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
            // No longer needed here, logic moved to initializeNewRound
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

function resetGame(io, socket, data, room, roomId) {
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

async function endGame(io, socket, data, room, roomId, redisClient, supabase) {
    if (socket.id !== room.adminSocketId) return;

    // Cancel grace period timer if it exists
    if (room.gracePeriodTimeout) {
        clearTimeout(room.gracePeriodTimeout);
        room.gracePeriodTimeout = null;
        room.gracePeriodStartedAt = null;
        logger.info(`[게임 종료] ${roomId} 방의 유예 기간 타이머가 취소되었습니다.`);
    }

    // [MODIFIED] If ending during ARRIVAL, calculate results first.
    if (room.currentPhase === PHASES.ARRIVAL) {
        logger.info(`[게임 종료] ${roomId} 방: ARRIVAL 단계에서 종료. 최종 결과 정산 중...`);
        Object.values(room.teams).forEach(team => {
            calculateArrivalResults(io, team, room, roomId);
        });
        // Broadcast the final state of teams after calculation
        broadcastTeamsUpdate(io, room, roomId);
    }

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

    // Update player statistics in Supabase
    await updatePlayerStatistics(finalResults, room);

    // Immediately delete room after game ends (admin-initiated termination)
    try {
        // Delete from Supabase
        const { error: dbError } = await supabase.from('rooms').delete().eq('room_id', roomId);
        if (dbError) {
            logger.error(`[게임 종료 - DB 삭제 실패] ${roomId}`, dbError);
        } else {
            logger.info(`[게임 종료 - 방 삭제] ${roomId} 방이 게임 종료로 데이터베이스에서 삭제되었습니다.`);
        }

        // Delete from Redis
        await redisClient.del(`room:${roomId}`);
        logger.info(`[게임 종료 - 방 삭제] ${roomId} 방이 Redis에서 삭제되었습니다.`);

        // Notify all clients that the room has been deleted
        io.to(roomId).emit('room_deleted', { message: '게임이 종료되어 방이 삭제되었습니다.' });
    } catch (error) {
        logger.error(`[게임 종료 - 방 삭제 중 오류] ${roomId}`, error);
    }
}

async function updatePlayerStatistics(finalResults, room) {
    const supabase = require('../../supabaseClient');

    // Determine winning team (rank 1)
    const winningTeam = finalResults.rankings[0];
    const winningCountry = winningTeam.country;

    // Collect all players with their countries and final PA
    const playerUpdates = [];

    for (const player of Object.values(room.players)) {
        const country = player.team;
        if (!country) continue;

        const team = room.teams[country];
        if (!team) continue;

        const finalPa = Math.floor(team.totalPA);
        const didWin = country === winningCountry;

        playerUpdates.push({
            studentId: player.studentId,
            country: country,
            finalPa: finalPa,
            didWin: didWin
        });
    }

    // Update each player's country_stats
    for (const update of playerUpdates) {
        try {
            // Fetch current country_stats
            const { data: user, error: fetchError } = await supabase
                .from('users')
                .select('country_stats')
                .eq('student_id', update.studentId)
                .single();

            if (fetchError) {
                logger.error(`[통계 업데이트 실패] ${update.studentId}: ${fetchError.message}`);
                continue;
            }

            // Initialize country_stats if null
            let countryStats = user.country_stats || {};

            // Initialize country if not exists
            if (!countryStats[update.country]) {
                countryStats[update.country] = { wins: 0, maxPa: 0 };
            }

            // Update wins if player won
            if (update.didWin) {
                countryStats[update.country].wins++;
            }

            // Update maxPa if current PA is higher
            if (update.finalPa > countryStats[update.country].maxPa) {
                countryStats[update.country].maxPa = update.finalPa;
            }

            // Save back to database
            const { error: updateError } = await supabase
                .from('users')
                .update({ country_stats: countryStats })
                .eq('student_id', update.studentId);

            if (updateError) {
                logger.error(`[통계 저장 실패] ${update.studentId}: ${updateError.message}`);
            } else {
                logger.info(`[통계 업데이트] ${update.studentId} (${update.country}): wins=${countryStats[update.country].wins}, maxPa=${countryStats[update.country].maxPa}`);
            }
        } catch (err) {
            logger.error(`[통계 업데이트 예외] ${update.studentId}: ${err.message}`);
        }
    }
}

function resetProduction(io, socket, data, room, roomId) {
    if (socket.id !== room.adminSocketId) return;

    Object.values(room.teams).forEach(team => {
        team.batchCount = 0; // Reset batch count to allow additional production opportunities
    });

    // Do NOT call resetProductionPhase as it resets RPS related states.
    // Do NOT reverse PA from RPS as the user wants to preserve accumulated PA.

    broadcastTeamsUpdate(io, room, roomId);
    logger.info(`[관리자] ${roomId} 방의 생산 상태 초기화 (RPS 및 PA 초기화 제외)`);
}

module.exports = {
    startPhase,
    resetGame,
    endGame,
    resetProduction
};
