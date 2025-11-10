const { createClient } = require('@supabase/supabase-js');

// Supabase 프로젝트 URL 및 anon 키를 .env 파일 또는 환경 변수로 설정해주세요.
// 예: SUPABASE_URL=https://your-project-id.supabase.co
// 예: SUPABASE_KEY=your-public-anon-key
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('********************************************************************************');
  console.error('* 오류: Supabase URL 또는 키가 설정되지 않았습니다.                               *');
  console.error('* .env 파일을 생성하고 SUPABASE_URL 및 SUPABASE_KEY를 설정해주세요.             *');
  console.error('********************************************************************************');
  // 프로세스를 종료하거나 기본값으로 대체하는 대신 오류를 기록합니다.
  // 실제 프로덕션에서는 이 경우 애플리케이션을 시작하지 못하게 해야 할 수 있습니다.
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // 클라이언트 측에서만 사용해야 하므로 서버 측 코드에서는 자동 새로고침을 비활성화합니다.
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabase;
