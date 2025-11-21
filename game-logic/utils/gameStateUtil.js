const { redisClient } = require('../redisClient');
const logger = require('./logger');

/**
 * Safely retrieves, modifies, and saves the game state.
 * @param {string} roomId - The ID of the room.
 * @param {Function} callback - A callback function that receives the gameState and returns a modified state (or void if modification happens in place).
 * @returns {Promise<void>}
 */
async function withGameState(roomId, callback) {
    try {
        const gameStateJSON = await redisClient.get(`room:${roomId}`);
        if (!gameStateJSON) {
            // Room might not exist or has expired
            return null;
        }

        let gameState;
        try {
            gameState = JSON.parse(gameStateJSON);
        } catch (parseError) {
            logger.error(`Error parsing game state for room ${roomId}:`, parseError);
            return null;
        }

        // Execute the business logic
        // The callback can be async
        await callback(gameState);

        // Save the updated state
        await redisClient.set(`room:${roomId}`, JSON.stringify(gameState));

    } catch (error) {
        logger.error(`Error in withGameState for room ${roomId}:`, error);
        throw error; // Re-throw to let the caller handle or log specific context if needed
    }
}

module.exports = { withGameState };
