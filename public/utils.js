// ============================================
// 공통 유틸리티 함수
// ============================================

/**
 * 기계적인 phase 이름을 한국어로 변환합니다.
 * @param {string} phase - 'production', 'trade' 등
 * @returns {string} '생산', '무역' 등
 */
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

/**
 * 화면 우측 상단에 알림 메시지를 표시합니다.
 * @param {string} message - 표시할 메시지
 */
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * 간단한 효과음 재생
 */
function playSound() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(context.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.1);

        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.1);
    } catch (e) {
        console.warn('사운드 재생 실패:', e);
    }
}

/**
 * 연결 상태 표시를 업데이트합니다.
 * @param {boolean} connected - 연결 여부
 */
function updateConnectionStatus(connected) {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;

    if (connected) {
        statusEl.textContent = '🟢 서버 연결됨';
        statusEl.style.color = 'var(--color-success)';
    } else {
        statusEl.textContent = '🔴 서버 연결 끊김';
        statusEl.style.color = 'var(--color-danger)';
    }
}

// ============================================
// 🆕 추가된 검증 함수들
// ============================================

/**
 * 플레이어 이름 검증
 * @param {string} name - 검증할 이름
 * @returns {boolean} 유효 여부
 */
function validatePlayerName(name) {
    if (!name || typeof name !== 'string') {
        return false;
    }

    const trimmed = name.trim();

    // 길이 체크 (1~20자)
    if (trimmed.length < 1 || trimmed.length > 20) {
        return false;
    }

    // 한글, 영문, 숫자, 공백만 허용
    return /^[가-힣a-zA-Z0-9\s]+$/.test(trimmed);
}

/**
 * 방 코드 검증
 * @param {string} code - 검증할 방 코드
 * @returns {boolean} 유효 여부
 */
function validateRoomCode(code) {
    if (!code || typeof code !== 'string') {
        return false;
    }

    // 정확히 4자리 대문자 영숫자
    return /^[A-Z0-9]{4}$/.test(code);
}

/**
 * 이벤트 데이터 검증
 * @param {object} data - 검증할 데이터
 * @param {object} schema - 검증 스키마 { fieldName: 'type' }
 * @returns {boolean} 유효 여부
 * @throws {Error} 검증 실패 시 에러
 */
function validateEventData(data, schema) {
    if (!data || typeof data !== 'object') {
        throw new Error('데이터가 객체가 아닙니다.');
    }

    for (const [key, expectedType] of Object.entries(schema)) {
        const actualType = typeof data[key];

        if (actualType !== expectedType) {
            throw new Error(`${key}의 타입이 ${expectedType}이어야 하는데 ${actualType}입니다.`);
        }
    }

    return true;
}

/**
 * 로깅 유틸리티 (개발/프로덕션 구분)
 * @param {string} level - 'debug', 'info', 'warn', 'error'
 * @param {string} message - 로그 메시지
 * @param {any} data - 추가 데이터 (선택)
 */
function log(level, message, data = null) {
    const isDevelopment = window.location.hostname === 'localhost' || 
                         window.location.hostname === '127.0.0.1';

    // 프로덕션에서는 debug 레벨 무시
    if (!isDevelopment && level === 'debug') {
        return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
        case 'error':
            console.error(prefix, message, data || '');
            break;
        case 'warn':
            console.warn(prefix, message, data || '');
            break;
        case 'debug':
            console.log(prefix, message, data || '');
            break;
        default: // info
            console.log(prefix, message, data || '');
    }
}

// CSS 애니메이션 추가 (스타일시트에 없을 경우)
if (typeof document !== 'undefined' && !document.getElementById('utils-animations')) {
    const style = document.createElement('style');
    style.id = 'utils-animations';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}
