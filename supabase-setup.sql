-- ==========================================================
-- Leo's Padlet 데이터베이스 설정
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 한 번 실행하세요.
-- ※ 아래 정책은 링크를 아는 누구나 읽고, 쓰고, 지울 수 있는 "열린 보드"입니다.
--    로그인 기능을 붙이면 정책을 더 엄격하게 바꿀 수 있습니다.
-- ==========================================================

-- 1) 보드 제목, 부제, 디자인 (한 줄만 사용)
create table if not exists padlet_board (
    id int primary key default 1,
    title text not null default 'Leo''s Padlet',
    subtitle text not null default '',
    theme jsonb not null default '{}'::jsonb,
    constraint padlet_board_single_row check (id = 1)
);

-- 2) 컬럼
create table if not exists padlet_columns (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    color text not null default 'none',
    created_at timestamptz not null default now()
);

-- 3) 항목 (텍스트, 링크, 이미지, 영상, 파일)
create table if not exists padlet_items (
    id uuid primary key default gen_random_uuid(),
    column_id uuid not null references padlet_columns(id) on delete cascade,
    type text not null,
    title text not null default '',
    body text not null default '',
    url text not null default '',
    author text not null default '',
    file_path text not null default '',
    file_name text not null default '',
    file_size bigint not null default 0,
    created_at timestamptz not null default now()
);

-- 4) 파일 저장소 (이미지, 영상, 파일 보관). 파일 한 개당 최대 50MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('padlet-files', 'padlet-files', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

-- 5) 접근 권한 (열린 보드: anon 키로 읽고 쓰기 허용)
alter table padlet_board enable row level security;
alter table padlet_columns enable row level security;
alter table padlet_items enable row level security;

create policy "padlet_board open" on padlet_board for all to anon using (true) with check (true);
create policy "padlet_columns open" on padlet_columns for all to anon using (true) with check (true);
create policy "padlet_items open" on padlet_items for all to anon using (true) with check (true);

create policy "padlet files read" on storage.objects for select to anon
    using (bucket_id = 'padlet-files');
create policy "padlet files upload" on storage.objects for insert to anon
    with check (bucket_id = 'padlet-files');
create policy "padlet files delete" on storage.objects for delete to anon
    using (bucket_id = 'padlet-files');
