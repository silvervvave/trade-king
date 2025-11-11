function calculateRankings(room) {
    const teams = Object.values(room.teams);
    if (teams.length === 0) return { rankings: [], premiumInfo: {} };

    const totalSilk = teams.reduce((sum, team) => sum + team.silk, 0);
    const totalPepper = teams.reduce((sum, team) => sum + team.pepper, 0);

    let silkValue = 10;
    let pepperValue = 10;
    let scarceGood = null;

    if (totalSilk > 0 && totalSilk < totalPepper) {
        silkValue *= 1.1;
        scarceGood = '비단';
    } else if (totalPepper > 0 && totalPepper < totalSilk) {
        pepperValue *= 1.1;
        scarceGood = '후추';
    }

    teams.forEach(team => {
        team.premiums = [];
        let totalAssets = team.totalPA;
        totalAssets += team.silk * silkValue;
        totalAssets += team.pepper * pepperValue;

        if (totalSilk > 0 && (team.silk / totalSilk) > 0.5) {
            totalAssets += 15;
            team.premiums.push('비단 독점');
        }
        if (totalPepper > 0 && (team.pepper / totalPepper) > 0.5) {
            totalAssets += 15;
            team.premiums.push('후추 독점');
        }
        
        team.totalAssets = Math.round(totalAssets);
    });

    teams.sort((a, b) => b.totalAssets - a.totalAssets);

    const rankings = teams.map((team, index) => ({
        rank: index + 1,
        name: `${team.name}`,
        country: team.country,
        totalPA: Math.floor(team.totalPA),
        silk: team.silk,
        pepper: team.pepper,
        totalAssets: Math.floor(team.totalAssets),
        premiums: team.premiums
    }));

    return {
        rankings,
        premiumInfo: {
            scarceGood: scarceGood,
            silkValue: Math.round(silkValue),
            pepperValue: Math.round(pepperValue)
        }
    };
}

function determineRPSResult(player, computer) {
  // Accept either emoji choices (✊, ✋, ✌️) or legacy words ('가위','바위','보','rock','paper','scissors')
  const normalize = (v) => {
    if (!v) return v;
    const map = {
      '가위': '✌️',
      '바위': '✊',
      '보': '✋',
      'rock': '✊',
      'paper': '✋',
      'scissors': '✌️',
      '✊': '✊',
      '✋': '✋',
      '✌️': '✌️'
    };
    return map[v] || v;
  };

  const p = normalize(player);
  const c = normalize(computer);

  if (p === c) return 'draw';

  // Define winning relationships: ✌️ beats ✋, ✊ beats ✌️, ✋ beats ✊
  if ((p === '✌️' && c === '✋') ||
      (p === '✊' && c === '✌️') ||
      (p === '✋' && c === '✊')) {
    return 'win';
  }

  return 'lose';
}

function determineEvent(EVENT_CONFIG) {
  const roll = Math.floor(Math.random() * 100) + 1;

  // Robust selection: sort configured events by threshold and pick the first matching one.
  const events = Object.values(EVENT_CONFIG || {})
    .filter(e => e && typeof e.threshold === 'number')
    .sort((a, b) => a.threshold - b.threshold);

  for (const ev of events) {
    if (roll <= ev.threshold) return ev;
  }

  // Fallback to a sane default
  return (EVENT_CONFIG && EVENT_CONFIG.normal) ? EVENT_CONFIG.normal : (events[events.length - 1] || null);
}

function isValidAmount(amount) {
    return typeof amount === 'number' && amount > 0;
}



module.exports = {
    isValidAmount,
    calculateRankings,
    determineRPSResult,
    determineEvent
};