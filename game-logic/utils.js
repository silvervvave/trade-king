function calculateRankings(room) {
    const teams = Object.values(room.teams);
    if (teams.length === 0) return [];

    // 1. 전체 무역품 수량 계산
    const totalSilk = teams.reduce((sum, team) => sum + team.silk, 0);
    const totalPepper = teams.reduce((sum, team) => sum + team.pepper, 0);

    // 2. 희소성 보너스 적용된 무역품 가치 결정
    let silkValue = 100;
    let pepperValue = 100;

    if (totalSilk < totalPepper) {
        silkValue *= 1.1;
    } else if (totalPepper < totalSilk) {
        pepperValue *= 1.1;
    }

    // 3. 각 팀별 자산 계산
    teams.forEach(team => {
        let totalAssets = team.totalPA;
        totalAssets += team.silk * silkValue;
        totalAssets += team.pepper * pepperValue;

        // 4. 독점 보너스 확인
        if (totalSilk > 0 && (team.silk / totalSilk) > 0.5) {
            totalAssets += 150;
        }
        if (totalPepper > 0 && (team.pepper / totalPepper) > 0.5) {
            totalAssets += 150;
        }
        
        team.totalAssets = totalAssets;
    });

    // 5. 순위 정렬
    teams.sort((a, b) => b.totalAssets - a.totalAssets);

    // 6. 최종 결과 데이터 생성
    return teams.map((team, index) => ({
        rank: index + 1,
        name: `${team.name}`,
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

module.exports = {
    isValidAmount,
    getPhaseKorean,
    calculateRankings,
    determineRPSResult,
    determineEvent
};