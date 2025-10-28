const { rooms, createInitialTeamState } = require('./rooms');
const { countryConfig, EVENT_CONFIG } = require('../config');
const { isValidAmount, determineRPSResult, determineEvent, calculateRankings } = require('./utils');

const logger = {
  info: (message) => console.log(`[INFO] ${message}`),
  warn: (message) => console.warn(`[WARN] ${message}`),
  error: (message, error) => console.error(`[ERROR] ${message}`, error || ''),
};

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

    disconnect

};