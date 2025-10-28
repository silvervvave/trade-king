const TRADE_VALUE_MULTIPLIER = 200;

function isValidAmount(amount) {
  return typeof amount === 'number' && !isNaN(amount) && amount > 0;
}

function getPhaseKorean(phase) {
  const phases = {
    'production': '생산',
    'trade': '무역',
    'investment': '투자',
    'arrival': '입항',
    'waiting': '대기',
    'ended': '종료'
  };
  return phases[phase] || phase;
}

function calculateRankings(room) {
  const teams = Object.values(room.teams);
  teams.forEach(team => {
    const silkValue = team.silk * TRADE_VALUE_MULTIPLIER;
    const pepperValue = team.pepper * TRADE_VALUE_MULTIPLIER;
    team.totalAssets = team.totalPA + silkValue + pepperValue;
  });
  teams.sort((a, b) => b.totalAssets - a.totalAssets);
  return teams.map((team, index) => ({
    rank: index + 1,
    name: `${team.country} 팀`,
    country: team.country,
    totalPA: Math.floor(team.totalPA),
    silk: team.silk,
    pepper: team.pepper,
    totalAssets: Math.floor(team.totalAssets)
  }));
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
  if (roll <= EVENT_CONFIG.goodFortune.threshold) return EVENT_CONFIG.goodFortune;
  if (roll <= EVENT_CONFIG.mildSetback.threshold) return EVENT_CONFIG.mildSetback;
  if (roll <= EVENT_CONFIG.disaster.threshold) return EVENT_CONFIG.disaster;
  return EVENT_CONFIG.normal;
}

module.exports = {
    isValidAmount,
    getPhaseKorean,
    calculateRankings,
    determineRPSResult,
    determineEvent
};