/* ==========================================================
   Leo's Padlet - 보드 동작 (Supabase 서버 저장 버전)
   - 제목/부제/컬럼 제목 편집
   - 컬럼 추가/삭제, 컬럼 순서 바꾸기 (드래그 또는 ◀ ▶), 항목 추가/삭제
   - 텍스트, 링크, 이미지, 영상, 파일 올리기 (서버 저장소)
   - 디자인 설정: 배경, 강조색, 카드 모양, 컬럼별 색
   ========================================================== */

const CONFIG = window.PADLET_CONFIG || {};
const BUCKET = CONFIG.BUCKET || 'padlet-files';
const MAX_FILE_SIZE = CONFIG.MAX_FILE_SIZE || 50 * 1024 * 1024;

const TYPE_LABEL = { text: '텍스트', link: '링크', image: '이미지', video: '영상', file: '파일' };

/* ---------- 디자인 프리셋 (여기만 고치면 선택지가 바뀝니다) ---------- */
// 배경 예시. mode는 글자색이 밝을지(dark) 어두울지(light)를 정합니다.
const BACKGROUNDS = [
    { key: 'default', label: '기본 회색', css: '#f1f3f7', mode: 'light' },
    { key: 'white', label: '화이트', css: '#ffffff', mode: 'light' },
    { key: 'paper', label: '베이지 종이', css: '#f5efe1', mode: 'light' },
    { key: 'ocean', label: '오션', css: 'linear-gradient(135deg, #4facfe, #00f2fe)', mode: 'light' },
    { key: 'sunset', label: '선셋', css: 'linear-gradient(135deg, #ff9a8b, #ff6a88)', mode: 'light' },
    { key: 'lavender', label: '라벤더', css: 'linear-gradient(135deg, #e0c3fc, #8ec5fc)', mode: 'light' },
    { key: 'mint', label: '민트', css: 'linear-gradient(135deg, #d4fc79, #96e6a1)', mode: 'light' },
    { key: 'chalkboard', label: '칠판', css: '#2f3d36', mode: 'dark' },
    { key: 'night', label: '나이트', css: 'linear-gradient(135deg, #232526, #414345)', mode: 'dark' },
    { key: 'galaxy', label: '은하수', css: 'linear-gradient(135deg, #1e1b4b, #7c3aed)', mode: 'dark' }
];

// 강조색 (버튼, 포커스 색)
const ACCENTS = ['#4f6df5', '#e5484d', '#f76b15', '#30a46c', '#0ea5e9', '#8e4ec6', '#111827'];

// 컬럼 색: tint는 컬럼 배경, accent는 컬럼 위쪽 줄 색
const COLUMN_COLORS = [
    { key: 'none', label: '기본', tint: '', accent: '' },
    { key: 'red', label: '빨강', tint: '#fde2e2', accent: '#e5484d' },
    { key: 'orange', label: '주황', tint: '#ffedd5', accent: '#f76b15' },
    { key: 'yellow', label: '노랑', tint: '#fef9c3', accent: '#ca8a04' },
    { key: 'green', label: '초록', tint: '#dcfce7', accent: '#30a46c' },
    { key: 'blue', label: '파랑', tint: '#dbeafe', accent: '#3b82f6' },
    { key: 'purple', label: '보라', tint: '#f3e8ff', accent: '#8e4ec6' },
    { key: 'gray', label: '회색', tint: '#e5e7eb', accent: '#4b5563' }
];

const DEFAULT_THEME = { background: 'default', accent: '#4f6df5', card: 'round' };

// 처음 연결했을 때 한 번만 넣어 줄 예시 데이터
const DEFAULT_BOARD_META = {
    title: "Leo's Padlet",
    subtitle: '2026 클로드 코드 강의 · 수강생 공유 보드'
};

const DEFAULT_COLUMNS = [
    {
        title: '📢 공지', color: 'none', items: [
            { type: 'text', title: '수업 일정 안내', body: '이번 주 실습은 토요일 오전 10시에 진행됩니다. 노트북 충전기를 꼭 챙겨 오세요.', author: '강사 레오' },
            { type: 'link', title: 'Claude Code 공식 문서', url: 'https://claude.com/claude-code', author: '강사 레오' }
        ]
    },
    { title: '🖼️ 자료', color: 'none', items: [] },
    {
        title: '🙋 질문', color: 'none', items: [
            { type: 'text', title: 'CSS 파일은 어떻게 연결하나요?', body: 'head 태그 안에 link 태그로 styles/style.css를 연결하면 됩니다.', author: '수강생 준호' }
        ]
    },
    { title: '📝 과제 제출', color: 'none', items: [] }
];

/* ---------- 요소 찾기 ---------- */
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('saveStatus');
const composer = document.getElementById('composer');
const composerTitle = document.getElementById('composerTitle');
const composerError = document.getElementById('composerError');
const composerForm = document.getElementById('composerForm');
const composerSubmit = document.getElementById('composerSubmit');
const typeTabs = document.getElementById('typeTabs');
const settingsDialog = document.getElementById('settings');
const columnStyleDialog = document.getElementById('columnStyle');
const titleEl = document.querySelector('[data-edit="title"]');
const subtitleEl = document.querySelector('[data-edit="subtitle"]');
const composerDelete = document.getElementById('composerDelete');
const currentFileEl = document.getElementById('currentFile');
const loginDialog = document.getElementById('login');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const adminToggle = document.getElementById('adminToggle');

// Supabase 연결 (scripts/config.js 에 값을 넣어야 동작합니다)
const isConfigured = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY)
    && !CONFIG.SUPABASE_URL.includes('YOUR-PROJECT');
const db = isConfigured ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

// 화면에서 쓰는 보드 데이터 (서버 데이터를 받아 와서 채움)
let board = { title: '', subtitle: '', theme: { ...DEFAULT_THEME }, columns: [] };
let composerColumnId = null;
let styleColumnId = null;
let currentType = 'text';
let busy = false;
let isAdmin = false; // 관리자로 로그인했는지 여부 (화면 표시용, 실제 권한은 Supabase가 확인)
let editingItemId = null; // 값이 있으면 작성 창이 "수정 모드"

/* ---------- 상태 표시 / 공통 처리 ---------- */
function showStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', isError);
}

// 관리자 전용 기능 앞에서 확인. 관리자가 아니면 안내만 하고 막음
function requireAdmin() {
    if (isAdmin) return true;
    showStatus('관리자만 할 수 있는 기능입니다. 오른쪽 위에서 관리자 로그인을 해 주세요.', true);
    return false;
}

// 서버 호출을 감싸서 상태 표시와 오류 처리를 한 곳에서 함
async function run(message, task, doneMessage = '저장됨') {
    try {
        showStatus(message);
        const result = await task();
        showStatus(doneMessage);
        return result;
    } catch (error) {
        console.error(error);
        showStatus(`오류: ${error.message || error}`, true);
        return null;
    }
}

// supabase 응답에서 error가 있으면 던지고, 있으면 data를 돌려줌
async function exec(query) {
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

/* ---------- 유틸 ---------- */
function esc(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 입력한 주소에 http(s)가 없으면 붙여줌
function normalizeUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// 화면에 찍기 전에 위험한 주소(javascript: 등)는 막음
function safeUrl(value = '') {
    return /^https?:\/\//i.test(value) ? value : '#';
}

function getYoutubeEmbed(url = '') {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : '';
}

function formatSize(bytes) {
    return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)}MB`
        : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// 저장소에 올릴 파일 이름 (한글 등은 _ 로 바꾸고 확장자는 유지)
function safeFileName(name) {
    const cleaned = name.normalize('NFKD').replace(/[^\w.-]+/g, '_');
    return `${Date.now()}-${cleaned}`;
}

// 강조색을 어둡게 (hover용)
function shade(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const channel = (shift) => {
        const value = (num >> shift) & 255;
        return Math.max(0, Math.min(255, Math.round(value * (1 + amount))));
    };
    return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

function findColumn(id) {
    return board.columns.find((column) => column.id === id);
}

function fileUrl(path) {
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* ---------- 서버 데이터 읽기 / 처음 넣기 ---------- */
function fromDbItem(row) {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        url: row.url,
        author: row.author,
        filePath: row.file_path,
        fileName: row.file_name,
        createdAt: new Date(row.created_at).getTime()
    };
}

async function seedDefaults() {
    for (const column of DEFAULT_COLUMNS) {
        const created = await exec(db.from('padlet_columns')
            .insert({ title: column.title, color: column.color })
            .select()
            .single());

        if (column.items.length) {
            const rows = column.items.map((item) => ({
                column_id: created.id,
                type: item.type,
                title: item.title,
                body: item.body || '',
                url: item.url || '',
                author: item.author || ''
            }));
            await exec(db.from('padlet_items').insert(rows));
        }
    }
}

// seedIfEmpty: 컬럼이 하나도 없을 때 예시 데이터를 넣을지 여부 (초기화 때는 false)
async function loadBoard(seedIfEmpty = true) {
    const meta = await exec(db.from('padlet_board').select('*').eq('id', 1).maybeSingle());
    // 보드 설정 행은 관리자가 만들 수 있음 (일반 방문자는 기본값으로 보여 줌)
    if (!meta && isAdmin) {
        await exec(db.from('padlet_board').insert({
            id: 1,
            title: DEFAULT_BOARD_META.title,
            subtitle: DEFAULT_BOARD_META.subtitle,
            theme: DEFAULT_THEME
        }));
    }

    let columns = await exec(db.from('padlet_columns').select('*, padlet_items(*)').order('created_at'));
    if (columns.length === 0 && seedIfEmpty) {
        await seedDefaults();
        columns = await exec(db.from('padlet_columns').select('*, padlet_items(*)').order('created_at'));
    }

    const theme = { ...DEFAULT_THEME, ...(meta?.theme || {}) };
    // 컬럼 순서는 theme.columnOrder(컬럼 id 목록)에 저장됨. 목록에 없는 새 컬럼은 맨 뒤에 둠
    const order = Array.isArray(theme.columnOrder) ? theme.columnOrder : [];
    const rank = (column) => {
        const index = order.indexOf(column.id);
        return index === -1 ? order.length : index;
    };
    columns.sort((a, b) => rank(a) - rank(b)); // sort는 같은 순위끼리 원래 순서(만든 순서)를 유지함

    board = {
        title: meta?.title || DEFAULT_BOARD_META.title,
        subtitle: meta?.subtitle ?? DEFAULT_BOARD_META.subtitle,
        theme,
        columns: columns.map((column) => ({
            id: column.id,
            title: column.title,
            color: column.color,
            items: (column.padlet_items || [])
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                .map(fromDbItem)
        }))
    };
    return true;
}

// 제목, 부제, 디자인 저장
function saveMeta() {
    return exec(db.from('padlet_board').update({
        title: board.title,
        subtitle: board.subtitle,
        theme: board.theme
    }).eq('id', 1));
}

/* ---------- 디자인 적용 ---------- */
function applyTheme() {
    const root = document.documentElement;
    const background = BACKGROUNDS.find((bg) => bg.key === board.theme.background) || BACKGROUNDS[0];

    // 글자색 세트 (light / dark)
    root.dataset.theme = background.mode;
    root.style.setProperty('--page-bg', background.css);
    root.style.setProperty('--color-primary', board.theme.accent);
    root.style.setProperty('--color-primary-hover', shade(board.theme.accent, -0.15));
    root.style.setProperty('--radius-md', board.theme.card === 'square' ? '2px' : '14px');

    markSelected('[data-bg]', 'bg', board.theme.background);
    markSelected('[data-accent]', 'accent', board.theme.accent);
    markSelected('[data-card]', 'card', board.theme.card);
    document.getElementById('accentInput').value = board.theme.accent;
}

function markSelected(selector, datasetKey, currentValue) {
    document.querySelectorAll(selector).forEach((el) => {
        el.classList.toggle('is-selected', el.dataset[datasetKey] === currentValue);
    });
}

function renderPresetSwatches() {
    document.getElementById('bgPresets').innerHTML = BACKGROUNDS.map((bg) => `
        <button class="swatch" type="button" data-bg="${bg.key}" title="${bg.label}" aria-label="${bg.label}"
            style="background:${bg.css}"></button>`).join('');

    document.getElementById('accentPresets').innerHTML = ACCENTS.map((color) => `
        <button class="swatch" type="button" data-accent="${color}" title="${color}" aria-label="${color}"
            style="background:${color}"></button>`).join('');
}

function renderColumnPresets() {
    const column = findColumn(styleColumnId);
    const current = column ? column.color : 'none';

    document.getElementById('columnPresets').innerHTML = COLUMN_COLORS.map((color) => {
        const preview = color.tint
            ? `background:${color.tint}; box-shadow: inset 0 -6px 0 ${color.accent}`
            : 'background: var(--color-bg); box-shadow: inset 0 -6px 0 var(--color-border)';
        return `
            <button class="swatch${color.key === current ? ' is-selected' : ''}" type="button"
                data-tint="${color.key}" title="${color.label}" aria-label="${color.label}" style="${preview}"></button>`;
    }).join('');
}

// 컬럼 한 칸에 적용할 색 (연한 배경에서 글자가 잘 보이도록 글자색과 카드 색도 함께 맞춤)
function columnStyleAttr(column) {
    const preset = COLUMN_COLORS.find((color) => color.key === column.color);
    if (!preset || !preset.tint) return '';
    return `style="--column-tint:${preset.tint};--column-accent:${preset.accent};`
        + '--color-surface:#ffffff;--color-text:#1f2430;--color-text-sub:#5b6270;--color-border:#e3e6ee"';
}

/* ---------- 렌더링 ---------- */
function renderCaption(item) {
    return `
        <div class="card__content">
            <h4 class="card__title">${esc(item.title)}</h4>
            ${item.body ? `<p class="card__body">${esc(item.body)}</p>` : ''}
        </div>`;
}

function renderVideo(item) {
    if (item.filePath) {
        return `<video class="card__video" controls src="${esc(fileUrl(item.filePath))}"></video>`;
    }
    const embed = getYoutubeEmbed(item.url);
    if (embed) {
        return `<iframe class="card__video" src="${esc(embed)}" title="${esc(item.title)}" allowfullscreen></iframe>`;
    }
    return `<video class="card__video" controls src="${esc(safeUrl(item.url))}"></video>`;
}

function renderItemBody(item) {
    switch (item.type) {
        case 'text':
            return renderCaption(item);

        case 'link':
            return `
                <a class="card__link" href="${esc(safeUrl(item.url))}" target="_blank" rel="noopener">
                    <span class="card__link-icon">🔗</span>
                    <span class="card__link-text">
                        <strong>${esc(item.title)}</strong>
                        <small>${esc(item.url)}</small>
                    </span>
                </a>`;

        case 'image': {
            const src = item.filePath ? fileUrl(item.filePath) : safeUrl(item.url);
            return `
                <figure class="card__media">
                    <img class="card__img" src="${esc(src)}" alt="${esc(item.title)}">
                </figure>
                ${renderCaption(item)}`;
        }

        case 'video':
            return `
                <div class="card__media">${renderVideo(item)}</div>
                ${renderCaption(item)}`;

        case 'file':
            return `
                <a class="card__link" href="${esc(fileUrl(item.filePath))}" download="${esc(item.fileName)}">
                    <span class="card__link-icon">📎</span>
                    <span class="card__link-text">
                        <strong>${esc(item.title)}</strong>
                        <small>${esc(item.fileName)}</small>
                    </span>
                </a>`;

        default:
            return '';
    }
}

function renderItem(columnId, item) {
    const date = new Date(item.createdAt).toLocaleDateString('ko-KR');
    return `
        <article class="card card--${item.type}">
            <button class="card__copy" type="button" data-action="copy-item"
                data-item="${item.id}" aria-label="내용 복사" title="내용 복사">⧉</button>
            <button class="card__edit" type="button" data-action="edit-item"
                data-column="${columnId}" data-item="${item.id}" aria-label="항목 수정" title="항목 수정">✎</button>
            <button class="card__delete admin-only" type="button" data-action="delete-item"
                data-column="${columnId}" data-item="${item.id}" aria-label="항목 삭제" title="항목 삭제">✕</button>
            ${renderItemBody(item)}
            <footer class="card__meta">
                <span class="card__author">${esc(item.author || '익명')} · ${TYPE_LABEL[item.type]}</span>
                <time>${date}</time>
            </footer>
        </article>`;
}

// 컬럼 = 위쪽 제목 박스 + 아래쪽 항목 판 (제목과 항목 판은 따로 있음)
function renderColumn(column, index) {
    const items = column.items.map((item) => renderItem(column.id, item)).join('');
    const isFirst = index === 0;
    const isLast = index === board.columns.length - 1;
    return `
        <div class="column-wrap" data-column-id="${column.id}" ${columnStyleAttr(column)}>
            <header class="column__header">
                <h3 class="column__title editable" contenteditable="${isAdmin}" spellcheck="false"
                    data-edit="column" data-column="${column.id}">${esc(column.title)}</h3>
                <span class="column__count">${column.items.length}</span>
                <div class="column__tools admin-only">
                    <span class="column__handle" draggable="true" data-drag-column="${column.id}"
                        title="끌어서 순서 바꾸기" aria-label="끌어서 순서 바꾸기">⠿</span>
                    <button class="column__move" type="button" data-action="move-column" data-column="${column.id}"
                        data-dir="-1" aria-label="왼쪽으로 옮기기" title="왼쪽으로 옮기기" ${isFirst ? 'disabled' : ''}>◀</button>
                    <button class="column__move" type="button" data-action="move-column" data-column="${column.id}"
                        data-dir="1" aria-label="오른쪽으로 옮기기" title="오른쪽으로 옮기기" ${isLast ? 'disabled' : ''}>▶</button>
                    <button class="icon-btn" type="button" data-action="column-color"
                        data-column="${column.id}" aria-label="컬럼 색 바꾸기" title="컬럼 색 바꾸기">🎨</button>
                    <button class="icon-btn" type="button" data-action="delete-column"
                        data-column="${column.id}" aria-label="컬럼 삭제" title="컬럼 삭제">🗑</button>
                </div>
            </header>

            <section class="column">
                <button class="column__plus" type="button" data-action="add-item" data-column="${column.id}"
                    aria-label="항목 추가" title="항목 추가">+</button>

                <div class="column__list">
                    ${items || '<p class="column__empty">아직 항목이 없습니다.</p>'}
                </div>
            </section>
        </div>`;
}

function render() {
    const empty = board.columns.length === 0
        ? '<p class="column__empty board-empty">아직 컬럼이 없습니다. 관리자가 컬럼을 추가하면 여기에 보여요.</p>'
        : '';
    boardEl.innerHTML = empty + board.columns.map((column, index) => renderColumn(column, index)).join('')
        + '<button class="column-add admin-only" type="button" data-action="add-column">+ 컬럼 추가</button>';
    applyTheme();
}

// 로그인 상태에 따라 화면 표시를 바꿈 (관리 기능 숨김, 제목·부제 편집 허용 여부, 로그인 버튼 글자)
function applyRole() {
    document.body.classList.toggle('is-admin', isAdmin);
    titleEl.contentEditable = String(isAdmin);
    subtitleEl.contentEditable = String(isAdmin);
    adminToggle.textContent = isAdmin ? '🔓 관리자 로그아웃' : '🔐 관리자 로그인';
}

// 현재 로그인한 사람이 관리자인지 Supabase에 물어봄
async function checkAdmin() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return false;
    const { data, error } = await db.rpc('is_padlet_admin');
    return !error && data === true;
}

// 처음 열때와 로그인·로그아웃 후에 보드를 다시 불러옴
async function startApp() {
    isAdmin = await checkAdmin().catch(() => false);
    applyRole();

    const loaded = await run('불러오는 중…', () => loadBoard(isAdmin), '불러옴');
    if (!loaded) return;

    titleEl.textContent = board.title;
    subtitleEl.textContent = board.subtitle;
    render();
}

/* ---------- 제목 / 부제 / 컬럼 제목 편집 ---------- */
async function applyEdit(el) {
    if (!requireAdmin()) return;
    const kind = el.dataset.edit;

    if (kind === 'column') {
        // 컬럼 제목은 Enter로 줄바꿈하므로 innerText로 읽어야 줄바꿈이 남음
        const column = findColumn(el.dataset.column);
        if (!column) return;
        const newTitle = el.innerText.trim() || column.title;
        el.textContent = newTitle;
        if (newTitle === column.title) return;
        column.title = newTitle;
        return run('저장 중…', () => exec(db.from('padlet_columns')
            .update({ title: newTitle }).eq('id', column.id)));
    }

    const value = el.textContent.trim();
    if (kind === 'title') {
        board.title = value || board.title;
        el.textContent = board.title;
    } else {
        board.subtitle = value;
        el.textContent = value;
    }
    return run('저장 중…', saveMeta);
}

// 편집 칸에서 포커스가 빠질 때 저장
document.addEventListener('focusout', (event) => {
    if (event.target.matches?.('[data-edit]')) {
        applyEdit(event.target);
    }
});

// Enter는 줄바꿈 대신 편집 끝내기 (컬럼 제목은 예외: Enter로 줄바꿈, Ctrl+Enter로 편집 끝내기)
document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.matches?.('[data-edit]')) return;
    event.preventDefault();

    if (event.target.dataset.edit === 'column') {
        if (event.ctrlKey || event.metaKey) event.target.blur();
        else document.execCommand('insertLineBreak');
        return;
    }
    event.target.blur();
});

// 붙여넣기는 글자만 들어가게
document.addEventListener('paste', (event) => {
    if (event.target.matches?.('[data-edit]')) {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }
});

// 보드에서 드래그해 복사할 때는 컬럼 제목(머리글)을 빼고 본문 내용만 복사
document.addEventListener('copy', (event) => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    if (!boardEl.contains(selection.anchorNode) || !boardEl.contains(selection.focusNode)) return;

    // 제목 칸 안에서만 고르는 경우는 그대로 복사 (직접 고친 제목을 복사하는 경우)
    const inTitle = (node) => node.parentElement?.closest('.column__title');
    if (inTitle(selection.anchorNode) && inTitle(selection.focusNode)) return;

    // 선택 영역을 복사본으로 만든 뒤 컬럼 머리글(제목 줄)을 지우고 글자만 꺼냄
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:pre-wrap;';
    holder.appendChild(selection.getRangeAt(0).cloneContents());
    if (!holder.querySelector('.column__header')) return;

    holder.querySelectorAll('.column__header').forEach((header) => header.remove());
    document.body.appendChild(holder);
    const text = holder.innerText.trim();
    holder.remove();

    event.preventDefault();
    event.clipboardData.setData('text/plain', text);
});

/* ---------- 컬럼 / 항목 추가·삭제 ---------- */
async function addColumn() {
    if (!requireAdmin()) return;
    const created = await run('컬럼 만드는 중…', () => exec(db.from('padlet_columns')
        .insert({ title: '새 컬럼', color: 'none' })
        .select()
        .single()));
    if (!created) return;

    board.columns.push({ id: created.id, title: created.title, color: created.color, items: [] });
    render();

    // 새 컬럼 제목을 바로 편집할 수 있게 전체 선택
    const heading = boardEl.querySelector(`[data-edit="column"][data-column="${created.id}"]`);
    heading.focus();
    const range = document.createRange();
    range.selectNodeContents(heading);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    boardEl.scrollLeft = boardEl.scrollWidth;
}

// 파일 저장소에서 여러 파일 지우기
function removeFiles(paths) {
    if (!paths.length) return Promise.resolve();
    return exec(db.storage.from(BUCKET).remove(paths));
}

async function deleteColumn(columnId) {
    if (!requireAdmin()) return;
    const column = findColumn(columnId);
    if (!column) return;

    const ok = confirm(`"${column.title}" 컬럼과 안의 항목 ${column.items.length}개를 모두 삭제할까요?`);
    if (!ok) return;

    const paths = column.items.map((item) => item.filePath).filter(Boolean);
    const done = await run('삭제 중…', async () => {
        // 항목은 컬럼 삭제와 함께 자동으로 지워짐
        await exec(db.from('padlet_columns').delete().eq('id', columnId));
        await removeFiles(paths);
        return true;
    }, '삭제됨');
    if (!done) return;

    board.columns = board.columns.filter((col) => col.id !== columnId);
    render();
}

async function deleteItem(columnId, itemId) {
    if (!requireAdmin()) return;
    const column = findColumn(columnId);
    const item = column?.items.find((entry) => entry.id === itemId);
    if (!item) return;

    const done = await run('삭제 중…', async () => {
        await exec(db.from('padlet_items').delete().eq('id', itemId));
        if (item.filePath) await removeFiles([item.filePath]);
        return true;
    }, '삭제됨');
    if (!done) return;

    column.items = column.items.filter((entry) => entry.id !== itemId);
    render();
}

// 클립보드에 글자 넣기 (보안 연결이 아니거나 브라우저가 막으면 예전 방식으로 복사)
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (error) {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
    }
    showStatus('복사됨');
}

// 항목 종류에 따라 복사할 내용을 정함: 텍스트는 제목+내용, 나머지는 주소
function copyItem(itemId) {
    const found = findItem(itemId);
    if (!found) return;
    const { item } = found;

    let text = '';
    if (item.type === 'text') {
        text = [item.title, item.body].filter(Boolean).join('\n');
    } else if (item.type === 'link') {
        text = item.url;
    } else if (item.filePath) {
        text = fileUrl(item.filePath);
    } else {
        text = item.url;
    }

    if (!text) return showStatus('복사할 내용이 없습니다.', true);
    copyToClipboard(text);
}

// 모든 컬럼·항목·업로드 파일을 지워서 빈 보드로 만듦 (제목, 부제, 디자인 설정은 유지)
async function resetColumns() {
    if (!requireAdmin()) return;
    const itemCount = board.columns.reduce((sum, column) => sum + column.items.length, 0);
    const ok = confirm(
        `모든 컬럼(${board.columns.length}개)과 항목(${itemCount}개), 업로드한 파일을 삭제하고\n`
        + '빈 보드로 초기화할까요?\n\n이 작업은 되돌릴 수 없습니다.'
    );
    if (!ok) return;

    const paths = board.columns.flatMap((column) => column.items.map((item) => item.filePath)).filter(Boolean);
    const done = await run('초기화 중…', async () => {
        // 컬럼을 지우면 항목도 함께 지워짐
        await exec(db.from('padlet_columns').delete().not('id', 'is', null));
        await removeFiles(paths);
        // 빈 보드로 남기기 위해 예시 데이터는 다시 넣지 않음
        return loadBoard(false);
    }, '초기화됨');
    if (!done) return;

    render();
}

boardEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const { action, column, item } = button.dataset;
    if (action === 'add-column') addColumn();
    if (action === 'delete-column') deleteColumn(column);
    if (action === 'add-item') openComposer(column);
    if (action === 'delete-item') deleteItem(column, item);
    if (action === 'column-color') openColumnStyle(column);
    if (action === 'edit-item') openEditComposer(item);
    if (action === 'copy-item') copyItem(item);
    if (action === 'move-column') moveColumn(column, Number(button.dataset.dir));
});

/* ---------- 컬럼 순서 바꾸기 (드래그 또는 ◀ ▶ 버튼) ---------- */
let draggingColumnId = null; // 지금 끌고 있는 컬럼 id

// 현재 화면의 컬럼 순서를 보드 설정(theme.columnOrder)에 저장. 실패하면 서버 기준으로 다시 불러와 화면을 맞춤
async function saveColumnOrder() {
    board.theme.columnOrder = board.columns.map((column) => column.id);
    const saved = await run('순서 저장 중…', saveMeta, '순서 저장됨');
    if (saved === null) {
        await loadBoard(false).then(render).catch(console.error);
    }
}

// fromIndex 자리의 컬럼을 toIndex 자리로 옮기고 화면과 서버에 반영
function placeColumn(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [column] = board.columns.splice(fromIndex, 1);
    board.columns.splice(toIndex, 0, column);
    render();
    saveColumnOrder();
}

// ◀ ▶ 버튼: 한 칸씩 옮김
function moveColumn(columnId, direction) {
    if (!requireAdmin()) return;
    const index = board.columns.findIndex((column) => column.id === columnId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= board.columns.length) return;
    placeColumn(index, target);
}

// 드래그 시작: 손잡이(⠿)를 잡았을 때만 시작하고, 컬럼 전체가 끌려가는 모습을 보여 줌
boardEl.addEventListener('dragstart', (event) => {
    const handle = event.target.closest?.('[data-drag-column]');
    if (!handle) return;
    if (!isAdmin) return event.preventDefault();

    const wrap = handle.closest('.column-wrap');
    draggingColumnId = handle.dataset.dragColumn;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggingColumnId); // Firefox는 데이터가 있어야 끌기 시작함
    event.dataTransfer.setDragImage(wrap, 24, 24);
    wrap.classList.add('is-dragging');
});

// 끌고 다니는 동안: 놓으면 앞에 들어갈지 뒤에 들어갈지 표시
boardEl.addEventListener('dragover', (event) => {
    if (!draggingColumnId) return;
    const wrap = event.target.closest('.column-wrap');
    if (!wrap || wrap.dataset.columnId === draggingColumnId) return;

    event.preventDefault(); // 여기서 막아야 drop이 일어남
    const rect = wrap.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    clearDropMarks();
    wrap.classList.add(after ? 'drop-after' : 'drop-before');
});

boardEl.addEventListener('drop', (event) => {
    if (!draggingColumnId) return;
    const wrap = event.target.closest('.column-wrap');
    if (!wrap) return;

    event.preventDefault();
    const fromIndex = board.columns.findIndex((column) => column.id === draggingColumnId);
    const targetIndex = board.columns.findIndex((column) => column.id === wrap.dataset.columnId);
    const after = wrap.classList.contains('drop-after');
    // 뒤에 놓으면 한 칸 뒤, 앞에 놓으면 그 자리. 왼쪽에서 오른쪽으로 옮길 땐 빠진 자리만큼 당김
    let toIndex = after ? targetIndex + 1 : targetIndex;
    if (fromIndex < toIndex) toIndex -= 1;
    // 여기서 먼저 정리: 드래그 중인 요소가 render()로 사라지면 dragend가 오지 않아 상태가 남음
    clearDragState();
    placeColumn(fromIndex, toIndex);
});

// 끝나면(놓았든, 취소했든) 표시와 끌기 상태를 모두 지움
boardEl.addEventListener('dragend', clearDragState);

function clearDropMarks() {
    boardEl.querySelectorAll('.drop-before, .drop-after')
        .forEach((el) => el.classList.remove('drop-before', 'drop-after'));
}

function clearDragState() {
    draggingColumnId = null;
    boardEl.querySelectorAll('.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    clearDropMarks();
}

/* ---------- 항목 작성 창 ---------- */
function setType(type) {
    currentType = type;
    composerError.hidden = true;

    typeTabs.querySelectorAll('[data-type]').forEach((tab) => {
        tab.classList.toggle('is-active', tab.dataset.type === type);
    });

    composerForm.querySelectorAll('[data-for]').forEach((field) => {
        field.hidden = !field.dataset.for.split(' ').includes(type);
    });

    // 종류에 맞는 파일만 고르도록 제한 (이미지는 이미지, 영상은 영상)
    const fileInput = composerForm.elements.file;
    fileInput.accept = type === 'image' ? 'image/*' : type === 'video' ? 'video/*' : '';
    fileInput.value = '';
}

function openComposer(columnId) {
    const column = findColumn(columnId);
    if (!column) return;

    composerColumnId = columnId;
    editingItemId = null;
    typeTabs.hidden = false;
    composerSubmit.textContent = '게시하기';
    composerTitle.textContent = `"${column.title}"에 추가`;
    composerForm.reset();
    composerForm.elements.file.multiple = true; // 새 항목은 파일 여러 개 가능
    composerDelete.hidden = true;
    currentFileEl.hidden = true;
    // 이름은 이전에 입력한 값을 기억해서 채움
    composerForm.elements.author.value = localStorage.getItem('padlet-author') || '';
    setType('text');
    composer.showModal();
}

// 항목 id로 컬럼과 항목을 찾음
function findItem(itemId) {
    for (const column of board.columns) {
        const item = column.items.find((entry) => entry.id === itemId);
        if (item) return { column, item };
    }
    return null;
}

// 이미 있는 항목을 작성 창에 채워서 수정
function openEditComposer(itemId) {
    const found = findItem(itemId);
    if (!found) return;
    const { item } = found;

    editingItemId = itemId;
    composerTitle.textContent = '항목 수정';
    composerForm.reset();
    typeTabs.hidden = false; // 종류도 바꿀 수 있음
    setType(item.type);

    composerForm.elements.title.value = item.title || '';
    composerForm.elements.body.value = item.body || '';
    composerForm.elements.url.value = item.url || '';
    composerForm.elements.author.value = item.author || '';

    // 수정 땐 파일을 한 개만 골라 바꿈
    composerForm.elements.file.multiple = false;
    currentFileEl.textContent = `현재 파일: ${item.fileName}  (새 파일을 고르면 이 파일을 대신합니다)`;
    currentFileEl.hidden = !item.filePath;

    composerDelete.hidden = false;
    composerSubmit.textContent = '저장';
    composer.showModal();
}

// 수정 창의 삭제 버튼: 확인 후 항목 삭제 (업로드 파일도 함께 지움)
composerDelete.addEventListener('click', () => {
    const found = findItem(editingItemId);
    if (!found) return;
    const { column, item } = found;
    if (!confirm(`"${item.title}" 항목을 삭제할까요?`)) return;

    composer.close();
    deleteItem(column.id, item.id);
});

// 수정 저장: 종류, 제목, 내용, 주소, 이름, 파일 모두 다시 정할 수 있음
async function saveItemEdit() {
    if (busy) return;
    const found = findItem(editingItemId);
    if (!found) return composer.close();
    const { column, item } = found;

    const type = currentType;
    const title = composerForm.elements.title.value.trim();
    const body = composerForm.elements.body.value.trim();
    const url = normalizeUrl(composerForm.elements.url.value);
    const author = composerForm.elements.author.value.trim();
    const usesFile = ['image', 'video', 'file'].includes(type);
    const newFile = usesFile ? composerForm.elements.file.files[0] : null;
    // 파일 종류인데 새 파일을 안 고르면 기존 파일을 그대로 씀
    const keepsFile = usesFile && !newFile && Boolean(item.filePath);

    if (type === 'text' && !title && !body) {
        return showComposerError('제목이나 내용을 입력해 주세요.');
    }
    if (type === 'link' && !url) {
        return showComposerError('링크 주소를 입력해 주세요.');
    }
    if ((type === 'image' || type === 'video') && !newFile && !keepsFile && !url) {
        return showComposerError('파일을 올리거나 주소를 입력해 주세요.');
    }
    if (type === 'file' && !newFile && !keepsFile) {
        return showComposerError('업로드할 파일을 선택해 주세요.');
    }
    if (newFile && newFile.size > MAX_FILE_SIZE) {
        return showComposerError(`"${newFile.name}" 파일이 너무 큽니다. 파일당 ${formatSize(MAX_FILE_SIZE)} 이하만 올릴 수 있습니다.`);
    }

    // 최종 파일 경로: 새 파일 > 기존 파일 유지 > 없음
    const oldPath = item.filePath || '';
    const newPath = newFile ? `${column.id}/${safeFileName(newFile.name)}` : '';
    const filePath = newFile ? newPath : (keepsFile ? oldPath : '');
    const fileName = newFile ? newFile.name : (keepsFile ? item.fileName : '');

    const changes = {
        type,
        title: title || (newFile ? newFile.name : '') || url || '제목 없음',
        body: type === 'text' || filePath ? body : '',
        url: type === 'text' || type === 'file' ? '' : url,
        author: author || '익명',
        file_path: filePath,
        file_name: fileName
    };
    if (!keepsFile) changes.file_size = newFile ? newFile.size : 0;

    setBusy(true);
    let uploadedPath = '';
    try {
        if (newFile) {
            const { error } = await db.storage.from(BUCKET).upload(newPath, newFile, {
                contentType: newFile.type || undefined,
                upsert: false
            });
            if (error) throw error;
            uploadedPath = newPath;
        }

        await exec(db.from('padlet_items').update(changes).eq('id', item.id));

        // 파일이 바뀌었거나 파일 종류가 아니게 됐으면 예전 파일은 저장소에서 지움
        if (oldPath && oldPath !== filePath) await removeFiles([oldPath]).catch(console.error);

        Object.assign(item, {
            type,
            title: changes.title,
            body: changes.body,
            url: changes.url,
            author: changes.author,
            filePath,
            fileName
        });
        composer.close();
        showStatus('저장됨');
    } catch (error) {
        console.error(error);
        if (uploadedPath) await db.storage.from(BUCKET).remove([uploadedPath]).catch(() => {});
        showComposerError(`저장 실패: ${error.message || error}`);
    } finally {
        setBusy(false);
        render();
    }
}

// 창이 닫히면 수정 모드를 풀어서 다음 추가에 영향이 없게 함
composer.addEventListener('close', () => {
    editingItemId = null;
    typeTabs.hidden = false;
});

function showComposerError(message) {
    composerError.textContent = message;
    composerError.hidden = false;
}

function setBusy(isBusy) {
    busy = isBusy;
    composerSubmit.disabled = isBusy;
    if (editingItemId) {
        composerSubmit.textContent = isBusy ? '저장 중…' : '저장';
    } else {
        composerSubmit.textContent = isBusy ? '업로드 중…' : '게시하기';
    }
}

typeTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-type]');
    if (tab) setType(tab.dataset.type);
});

composerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (editingItemId) return saveItemEdit();
    if (busy) return;

    const title = composerForm.elements.title.value.trim();
    const body = composerForm.elements.body.value.trim();
    const url = normalizeUrl(composerForm.elements.url.value);
    const author = composerForm.elements.author.value.trim();
    const usesFile = ['image', 'video', 'file'].includes(currentType);
    const files = usesFile ? Array.from(composerForm.elements.file.files) : [];

    // 종류별 입력 확인
    if (currentType === 'text' && !title && !body) {
        return showComposerError('제목이나 내용을 입력해 주세요.');
    }
    if (currentType === 'link' && !url) {
        return showComposerError('링크 주소를 입력해 주세요.');
    }
    if ((currentType === 'image' || currentType === 'video') && !files.length && !url) {
        return showComposerError('파일을 올리거나 주소를 입력해 주세요.');
    }
    if (currentType === 'file' && !files.length) {
        return showComposerError('업로드할 파일을 선택해 주세요.');
    }
    const tooBig = files.find((file) => file.size > MAX_FILE_SIZE);
    if (tooBig) {
        return showComposerError(`"${tooBig.name}" 파일이 너무 큽니다. 파일당 ${formatSize(MAX_FILE_SIZE)} 이하만 올릴 수 있습니다. (${formatSize(tooBig.size)})`);
    }

    const column = findColumn(composerColumnId);
    if (!column) return composer.close();

    if (author) localStorage.setItem('padlet-author', author);

    // 파일을 여러 개 고르면 파일 하나당 항목 하나를 만듦. 파일이 없으면(텍스트, 링크, 주소) 한 개만 만듦
    const jobs = files.length ? files : [null];

    // 파일 이름 대신 제목을 정했을 때: 여러 개면 "제목 1", "제목 2"처럼 번호를 붙임
    const makeTitle = (index, file) => {
        if (!file) return title || url || '제목 없음';
        if (!title) return file.name;
        return jobs.length > 1 ? `${title} ${index + 1}` : title;
    };

    setBusy(true);
    let saved = 0;
    let pendingPath = ''; // 파일은 올렸지만 글 저장 전인 경우, 실패하면 이 파일을 지움
    try {
        for (const [index, file] of jobs.entries()) {
            if (jobs.length > 1) showStatus(`업로드 중… (${index + 1}/${jobs.length})`);
            else showStatus('업로드 중…');

            let filePath = '';
            if (file) {
                filePath = `${column.id}/${safeFileName(file.name)}`;
                const { error } = await db.storage.from(BUCKET).upload(filePath, file, {
                    contentType: file.type || undefined,
                    upsert: false
                });
                if (error) throw error;
                pendingPath = filePath;
            }

            const row = {
                column_id: column.id,
                type: currentType,
                title: makeTitle(index, file),
                body: currentType === 'text' || file ? body : '',
                url: currentType === 'text' || currentType === 'file' ? '' : url,
                author: author || '익명',
                file_path: filePath,
                file_name: file ? file.name : '',
                file_size: file ? file.size : 0
            };

            const inserted = await exec(db.from('padlet_items').insert(row).select().single());
            column.items.push(fromDbItem(inserted));
            saved++;
            pendingPath = '';
        }

        composer.close();
        showStatus(jobs.length > 1 ? `${saved}개 저장됨` : '저장됨');
    } catch (error) {
        console.error(error);
        if (pendingPath) await db.storage.from(BUCKET).remove([pendingPath]).catch(() => {});

        const message = `업로드 실패: ${error.message || error}`;
        if (saved > 0) {
            // 일부만 저장된 경우: 저장된 것은 그대로 두고 창을 닫아 중복 저장을 막음
            composer.close();
            showStatus(`${jobs.length}개 중 ${saved}개만 저장됨. ${message}`, true);
        } else {
            showComposerError(message);
        }
    } finally {
        setBusy(false);
        render();
        if (saved > 0) scrollToBottom(column.id);
    }
});

// 새 항목이 아래로 쌓이므로, 해당 컬럼 목록을 맨 아래로 내려서 새 카드가 보이게 함
function scrollToBottom(columnId) {
    const list = boardEl.querySelector(`.column-wrap[data-column-id="${columnId}"] .column__list`);
    if (list) list.scrollTop = list.scrollHeight;
}

/* ---------- 컬럼 색 창 ---------- */
function openColumnStyle(columnId) {
    if (!requireAdmin()) return;
    const column = findColumn(columnId);
    if (!column) return;

    styleColumnId = columnId;
    document.getElementById('columnStyleTitle').textContent = `"${column.title}" 색`;
    renderColumnPresets();
    columnStyleDialog.showModal();
}

/* ---------- 디자인 설정 창 ---------- */
async function commitTheme() {
    applyTheme();
    await run('저장 중…', saveMeta);
}

// 색 선택, 창 열기·닫기 같은 공통 클릭 처리
document.addEventListener('click', async (event) => {
    // 관리자 전용 버튼(디자인 색, 카드 모양, 컬럼 색, 초기화, 디자인 창)은 로그인 확인 후에만 동작
    const adminControl = event.target.closest('[data-bg], [data-accent], [data-card], [data-tint], [data-reset-columns], [data-open-settings]');
    if (adminControl && !requireAdmin()) return;

    const bg = event.target.closest('[data-bg]');
    if (bg) {
        board.theme.background = bg.dataset.bg;
        return commitTheme();
    }

    const accent = event.target.closest('[data-accent]');
    if (accent) {
        board.theme.accent = accent.dataset.accent;
        return commitTheme();
    }

    const card = event.target.closest('[data-card]');
    if (card) {
        board.theme.card = card.dataset.card;
        return commitTheme();
    }

    const tint = event.target.closest('[data-tint]');
    if (tint) {
        const column = findColumn(styleColumnId);
        if (column) {
            column.color = tint.dataset.tint;
            render();
            renderColumnPresets();
            await run('저장 중…', () => exec(db.from('padlet_columns')
                .update({ color: column.color }).eq('id', column.id)));
        }
        return;
    }

    if (event.target.closest('[data-reset-columns]')) {
        return resetColumns();
    }

    if (event.target.closest('[data-open-settings]')) {
        applyTheme();
        return settingsDialog.showModal();
    }

    const closeTarget = event.target.closest('[data-close]');
    if (closeTarget) {
        document.getElementById(closeTarget.dataset.close).close();
    }
});

document.getElementById('accentInput').addEventListener('input', (event) => {
    board.theme.accent = event.target.value;
    applyTheme();
});

document.getElementById('accentInput').addEventListener('change', (event) => {
    board.theme.accent = event.target.value;
    commitTheme();
});

document.getElementById('themeReset').addEventListener('click', () => {
    // 디자인만 기본값으로. 컬럼 순서(columnOrder)는 유지
    board.theme = { ...DEFAULT_THEME, columnOrder: board.theme.columnOrder };
    commitTheme();
});

// 항목 작성 창 닫기 버튼
document.getElementById('composerClose').addEventListener('click', () => composer.close());
document.getElementById('composerCancel').addEventListener('click', () => composer.close());

/* ---------- 시작 ---------- */
renderPresetSwatches();

if (!isConfigured) {
    showStatus('scripts/config.js 에 Supabase 주소와 키를 넣어 주세요', true);
    boardEl.innerHTML = '<p class="column__empty">Supabase 연결 정보가 없어 보드를 불러올 수 없습니다.</p>';
} else {
    // 관리자 로그인 창
    adminToggle.addEventListener('click', async () => {
        if (!isAdmin) {
            loginError.hidden = true;
            return loginDialog.showModal();
        }
        await db.auth.signOut();
        await startApp();
    });

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        loginError.hidden = true;
        const submit = loginForm.querySelector('button[type="submit"]');
        submit.disabled = true;

        try {
            const email = loginForm.elements.email.value.trim();
            const password = loginForm.elements.password.value;
            const { error } = await db.auth.signInWithPassword({ email, password });
            if (error) throw error;

            // 로그인은 됐어도 관리자 목록에 없으면 바로 로그아웃
            if (!(await checkAdmin())) {
                await db.auth.signOut();
                throw new Error('관리자 계정이 아닙니다.');
            }

            loginDialog.close();
            loginForm.reset();
            await startApp();
        } catch (error) {
            const isWrongLogin = /invalid/i.test(error.message || '');
            loginError.textContent = isWrongLogin ? '이메일 또는 비밀번호가 맞지 않습니다.' : error.message;
            loginError.hidden = false;
        } finally {
            submit.disabled = false;
        }
    });

    startApp();
}
