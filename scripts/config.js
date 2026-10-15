/* ==========================================================
   Supabase 연결 설정
   1) supabase.com 에서 프로젝트를 만듭니다.
   2) Project Settings > API 에서 Project URL 과 anon public 키를 복사해 아래에 붙여넣습니다.
   3) supabase-setup.sql 내용을 SQL Editor 에서 한 번 실행합니다.
   ※ 여기에는 anon(공개) 키만 넣으세요. service_role 키는 절대 넣으면 안 됩니다.
   ========================================================== */
window.PADLET_CONFIG = {
    SUPABASE_URL: 'https://nwepaojkwuzpmqqewchy.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53ZXBhb2prd3V6cG1xcWV3Y2h5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNTIxMzEsImV4cCI6MjEwNzYyODEzMX0.Z0MB0F8rEnibiwQ10kiJ14omNrI4PexgwahRWI2G0PQ',
    BUCKET: 'padlet-files',
    // 파일 한 개당 최대 크기 (SQL의 bucket 설정과 같아야 합니다)
    MAX_FILE_SIZE: 50 * 1024 * 1024
};
