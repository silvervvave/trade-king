const templates = {
  countryCard: (countryCode, config, team) => {
    let statsHtml = `<li>클릭 수: ${config.maxClicks}회</li>`;
    if (config.paPerClick !== 1) {
        statsHtml += `<li>효율: ${config.paPerClick} PA/클릭</li>`;
    }
    if (config.resetTokens > 0) {
        statsHtml += `<li>절대왕정 권력</li>`;
    }
    if (config.mercantilismTokens > 0) {
        statsHtml += `<li>중상주의</li>`;
    }

    let membersHtml = '';
    if (team && team.members && team.members.length > 0) {
        membersHtml = team.members.map(member => `<span class="member-name">${member.name}</span>`).join(', ');
    } else {
        membersHtml = '무역왕 후보 없음';
    }

    return `
        <div class="country-icon">${config.icon}</div>
        <h3>${config.name}</h3>
        <p class="country-trait">${getTrait(countryCode)}</p>
        <ul class="country-stats">
            ${statsHtml}
        </ul>
        <div class="team-members-list">
            <p>참가 플레이어:</p>
            <p>${membersHtml}</p>
        </div>
    `;
  },

  investmentCard: (voyage, config, investments) => {
    const destinationText = voyage.destination === 'china' ? '중국' : '인도';
    const investorsHtml = investments.map(inv => `<li>${inv.teamName} ${inv.playerName}: ${inv.amount} PA</li>`).join('');

    return `
        <h4>${config.name}</h4>
        <p>목적지: ${destinationText}</p>
        <p>기본 투자액: ${voyage.amount} PA</p>
        <div class="input-group">
            <div class="toggle-input" data-step="100" data-min="100">
                <button class="btn-toggle minus">-</button>
                <span id="investAmountValue-${voyage.country}" class="toggle-value">100</span>
                <button class="btn-toggle plus">+</button>
            </div>
            <button class="game-btn" onclick="game.makeInvestment('${voyage.country}')">투자하기</button>
        </div>
        <div class="investment-status" id="investment-status-${voyage.country}">
            <ul class="investment-status-list">${investorsHtml}</ul>
        </div>
    `;
  },

  finalResults: (data) => {
    const rankings = data.rankings || [];
    const premiumInfo = data.premiumInfo || {};

    const winner = rankings[0];
    let winnerCardHtml = '';
    if (winner) {
        winnerCardHtml = `
            <div class="winner-card">
                <h3>1등: ${winner.name}</h3>
                <p>총 자산: ${winner.totalAssets} PA</p>
            </div>
        `;
    }

    let premiumInfoHtml = '';
    if (premiumInfo.scarceGood) {
        premiumInfoHtml = `
            <div class="premium-info-card">
                <h4>프리미엄 정보</h4>
                <p>희귀 프리미엄: <strong>${premiumInfo.scarceGood}</strong> (가치: ${premiumInfo.scarceGood === '비단' ? premiumInfo.silkValue : premiumInfo.pepperValue} PA)</p>
                <p>독점 프리미엄: <strong>150 PA</strong> (한 종류의 무역품 50% 이상 보유 시)</p>
            </div>
        `;
    }

    const tableBodyHtml = rankings.map(team => `
        <tr class="${team.rank === 1 ? 'winner-row' : ''}">
            <td>${team.rank}</td>
            <td>${team.name}</td>
            <td>${team.totalAssets}</td>
            <td>${team.totalPA}</td>
            <td>${team.silk}</td>
            <td>${team.pepper}</td>
            <td>${(team.premiums || []).join(', ') || '-'}</td>
        </tr>
    `).join('');

    return `
        <h2>최종 순위</h2>
        ${winnerCardHtml}
        ${premiumInfoHtml}
        <table class="results-table">
            <thead>
                <tr>
                    <th>순위</th>
                    <th>팀</th>
                    <th>총 자산</th>
                    <th>PA</th>
                    <th>비단</th>
                    <th>후추</th>
                    <th>프리미엄</th>
                </tr>
            </thead>
            <tbody>
                ${tableBodyHtml}
            </tbody>
        </table>
    `;
  },

  resultModal: (title, content) => {
    return `
        <div class="modal-content">
            <h2 class="modal-title">${title}</h2>
            <div class="modal-body">
                ${content}
            </div>
            <button class="modal-close-btn">닫기</button>
        </div>
    `;
  },
};

function getTrait(countryCode) {
    switch(countryCode) {
        case 'spain': return '자원 부국';
        case 'netherlands': return '기술 국가';
        case 'england': return '절대왕정';
        case 'france': return '중상주의';
        default: return '';
    }
}
