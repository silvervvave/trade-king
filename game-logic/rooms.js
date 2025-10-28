const rooms = {};

function generateRoomId(length = 4) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  while (true) {
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!rooms[result]) {
      return result;
    }
  }
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
    clickCount: 0, 
    tradeSelection: null, 
    rpsPlayedThisRound: false, 
    eventDrawnThisRound: false, 
    finalRpsPlayedThisRound: false, 
    rpsRerolls: config.resetTokens, 
    mercantilismTokens: config.mercantilismTokens, 
    investmentsMade: [], 
    investmentsReceived: [], 
    eventMultiplier: 1, 
    rpsGoodsChange: 0, 
    rpsPaChange: 0, 
    members: [] 
  };
}

module.exports = {
    rooms,
    generateRoomId,
    createNewGameState,
    createInitialTeamState
};