const { countryConfig } = require('../../config');
const logger = require('../utils/logger');

async function getRankings(socket, supabase) {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('name, country_stats');

        if (error) throw error;

        const rankings = {};
        Object.keys(countryConfig).forEach(c => rankings[c] = []);

        users.forEach(user => {
            if (user.country_stats) {
                // Iterate over each country's stats within the user's country_stats object
                for (const countryCode in user.country_stats) {
                    // Ensure the country from the stats is valid and exists in the rankings object
                    if (rankings[countryCode] && user.country_stats[countryCode]) {
                        const stats = user.country_stats[countryCode];
                        rankings[countryCode].push({
                            name: user.name,
                            wins: stats.wins || 0,
                            maxPa: stats.maxPa || 0
                        });
                    }
                }
            }
        });

        Object.keys(rankings).forEach(country => {
            rankings[country].sort((a, b) => {
                if (b.wins !== a.wins) return b.wins - a.wins;
                return b.maxPa - a.maxPa;
            });
            rankings[country] = rankings[country].slice(0, 5);
        });

        socket.emit('rankings_update', rankings);
    } catch (error) {
        logger.error('Error fetching rankings:', error);
        socket.emit('error', { message: 'Failed to fetch rankings' });
    }
}

module.exports = { getRankings };
