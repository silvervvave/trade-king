const { createClient } = require('redis');

// Redis 클라이언트 생성
const redisClient = createClient({
  url: `redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

redisClient.on('connect', () => {
    console.log('Redis에 성공적으로 연결되었습니다.');
});

// 앱 시작 시 Redis에 연결하고, 실패 시 프로세스 종료하는 초기화 함수
async function initialize() {
    try {
        await redisClient.connect();
    } catch (err) {
        console.error('Redis 연결에 실패했습니다. 서버를 시작할 수 없습니다.', err);
        process.exit(1);
    }
}

// 다른 파일에서 redisClient와 초기화 함수를 사용할 수 있도록 내보내기
module.exports = { redisClient, initialize };
