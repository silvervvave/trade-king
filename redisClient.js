const { createClient } = require('redis');

// Redis 클라이언트 생성
const redisClient = createClient({
  url: `redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

redisClient.on('error', (err) => {
    // WRONGPASS 에러는 connect() 호출 시 발생하므로, initialize 함수에서 처리
    // 그 외의 런타임 에러는 여기서 로깅
    if (!err.message.includes('WRONGPASS')) {
        console.error('Redis Client Runtime Error', err);
    }
});

async function initialize() {
    return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Redis 연결 시간 초과'));
        }, 10000); // 10초 타임아웃

        redisClient.once('ready', () => {
            clearTimeout(timeout);
            console.log('Redis에 성공적으로 연결 및 인증되었습니다.');
            resolve();
        });

        redisClient.once('error', (err) => {
            clearTimeout(timeout);
            // WRONGPASS 에러는 여기서 reject하여 initialize 함수에서 잡도록 함
            reject(new Error(`Redis 연결 또는 인증 실패: ${err.message}`));
        });

        try {
            await redisClient.connect();
        } catch (err) {
            clearTimeout(timeout);
            reject(new Error(`Redis 연결 시도 중 오류: ${err.message}`));
        }
    });
}

// 다른 파일에서 redisClient와 초기화 함수를 사용할 수 있도록 내보내기
module.exports = { redisClient, initialize };
