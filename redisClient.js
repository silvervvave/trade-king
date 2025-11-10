const { createClient } = require('redis');
const { redisConfig } = require('./config');

// Redis 클라이언트 생성
const redisClient = createClient({
  url: `redis://${process.env.REDIS_USER}:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// 앱 시작 시 Redis에 연결
redisClient.connect().then(() => {
    console.log('Redis에 성공적으로 연결되었습니다.');
}).catch(console.error);

// 다른 파일에서 redisClient를 사용할 수 있도록 내보내기
module.exports = redisClient;
