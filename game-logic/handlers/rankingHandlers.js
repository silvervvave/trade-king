const { countryConfig } = require('../../config');
const logger = require('../utils/logger');

async function getRankings(socket, supabase) {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('name, country, country_stats');

        if (error) throw error;

        const rankings = {};
        Object.keys(countryConfig).forEach(c => rankings[c] = []);

        users.forEach(user => {
            if (user.country && user.country_stats && user.country_stats[user.country]) {
                const stats = user.country_stats[user.country];
                rankings[user.country].push({
                    name: user.name,
                    wins: stats.wins || 0,
                    maxPa: stats.maxPa || 0
                });
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
