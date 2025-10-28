
const countryConfig = {
    spain: { name: '스페인', maxClicks: 1000, paPerClick: 1, icon: '🇪🇸', resetTokens: 0, mercantilismTokens: 0 },
    netherlands: { name: '네덜란드', maxClicks: 500, paPerClick: 1.5, icon: '🇳🇱', resetTokens: 0, mercantilismTokens: 0 },
    england: { name: '영국', maxClicks: 500, paPerClick: 1, icon: '🇬🇧', resetTokens: 2, mercantilismTokens: 0 },
    france: { name: '프랑스', maxClicks: 500, paPerClick: 1, icon: '🇫🇷', resetTokens: 0, mercantilismTokens: 1 }
};

const EVENT_CONFIG = {
    goodFortune: { threshold: 15, text: '순풍을 만나 무역품을 2배로 획득합니다!', multiplier: 1.5, class: 'win' },
    disaster: { threshold: 35, text: '카무사리를 당해 무역품을 모두 잃습니다!', multiplier: 0, class: 'lose' },
    normal: { threshold: 100, text: '무사히 항해를 마쳤습니다.', multiplier: 1, class: 'draw' }
};

module.exports = {
    countryConfig,
    EVENT_CONFIG
};
