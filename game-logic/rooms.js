const { redisClient } = require('./redisClient');

async function generateRoomId(length = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const MAX_TRIES = 10;
  let tries = 0;

  while (tries < MAX_TRIES) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    try {
      // Redis에서 'room:{ID}' 키가 존재하는지 확인
      const exists = await redisClient.exists(`room:${result}`);
      if (!exists) {
        return result; // 키가 존재하지 않으면, 유니크한 것으로 간주
      }
    } catch (error) {
      console.error('Error checking room ID in Redis:', error);
      // Redis 에러 발생 시, 루프를 계속하여 다른 ID 시도
    }

    tries++;
  }

  throw new Error('Failed to generate a unique room ID after multiple attempts.');
}

function createNewGameState() {
  return {
    gameStarted: false,
    currentRound: 0,
    currentPhase: 'waiting',
    players: {},
    teams: {},
    adminSocketId: null,
    timer: {
      intervalId: null,
      running: false,
      minutes: 0,
      seconds: 0
    },
  };
}

function createInitialTeamState(country, config) {
  return {
    ...config,
    country,
    totalPA: 0,
    silk: 0,
    pepper: 0,
    batchCount: 0,
    tradeSelection: null,
    rpsPlayedThisRound: false,
    eventDrawnThisRound: false,
    finalRpsPlayedThisRound: false,
    rerollUsedThisRound: false,
    camusariHappened: false,
    rpsRerolls: config.resetTokens,
    mercantilismTokens: config.mercantilismTokens,
    mercantilismUses: 0,
    investmentsMade: [],
    investmentsReceived: [],
    eventMultipliers: { paMultiplier: 1, goodsMultiplier: 1 },
    rpsGoodsChange: 0,
    rpsPaChange: 0,
    eventText: '',
    finalRpsResult: '',
    eventResultClass: '',
    members: []
  };
}

module.exports = {
  generateRoomId,
  createNewGameState,
  createInitialTeamState
};