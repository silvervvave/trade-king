
const countryConfig = {
    spain: { name: '스페인', trait: '자원 부국: 가장 많은 자원을 생산합니다.', maxBatchCount: 50, paPerBatch: 2, clicksPerBatch: 30, icon: '🇪🇸', resetTokens: 0, mercantilismTokens: 0 },
    netherlands: { name: '네덜란드', trait: '무역 강국: 자원 생산 효율이 좋습니다.', maxBatchCount: 30, paPerBatch: 3, clicksPerBatch: 30, icon: '🇳🇱', resetTokens: 0, mercantilismTokens: 0 },
    england: { name: '영국', trait: '절대왕정: 부가가치 대결에서 무조건 승리합니다.', maxBatchCount: 30, paPerBatch: 2, clicksPerBatch: 30, icon: '🇬🇧', resetTokens: 0, mercantilismTokens: 0 },
    france: { name: '프랑스', trait: '중상주의: 특정 조건에서 추가 자원을 획득합니다.', maxBatchCount: 30, paPerBatch: 2, clicksPerBatch: 30, icon: '🇫🇷', resetTokens: 0, mercantilismTokens: 1 }
};

const EVENT_CONFIG = {
    goodFortune: { threshold: 5, text: '무역풍을 만나 무역품을 2배로 획득합니다!', paMultiplier: 1, goodsMultiplier: 2, class: 'win' },
    disaster: { threshold: 25, text: '카무사리!', paMultiplier: 1, goodsMultiplier: 0, class: 'lose' },
    normal: { threshold: 100, text: '순풍을 만나 무사히 항해를 마쳤습니다.', paMultiplier: 1, goodsMultiplier: 1, class: 'draw' }
};

module.exports = {
    countryConfig,
    EVENT_CONFIG
};
