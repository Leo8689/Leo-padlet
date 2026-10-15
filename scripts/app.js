/* ==========================================================
   Leo's Padlet - 보드 동작 (Supabase 서버 저장 버전)
   - 제목/부제/컬럼 제목 편집
   - 컬럼 추가/삭제, 항목 추가/삭제
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

/* ---------- 상태 표시 / 공통 처리 ---------- */
function showStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle('is-error', isError);
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
    if (!meta) {
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

    board = {
        title: meta?.title || DEFAULT_BOARD_META.title,
        subtitle: meta?.subtitle ?? DEFAULT_BOARD_META.subtitle,
        theme: { ...DEFAULT_THEME, ...(meta?.theme || {}) },
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
            <button class="card__delete" type="button" data-action="delete-item"
                data-column="${columnId}" data-item="${item.id}" aria-label="항목 삭제" title="항목 삭제">✕</button>
            ${renderItemBody(item)}
            <footer class="card__meta">
                <span class="card__author">${esc(item.author || '익명')} · ${TYPE_LABEL[item.type]}</span>
                <time>${date}</time>
            </footer>
        </article>`;
}

function renderColumn(column) {
    const items = column.items.map((item) => renderItem(column.id, item)).join('');
    return `
        <section class="column" ${columnStyleAttr(column)}>
            <header class="column__header">
                <h3 class="column__title editable" contenteditable="true" spellcheck="false"
                    data-edit="column" data-column="${column.id}">${esc(column.title)}</h3>
                <span class="column__count">${column.items.length}</span>
                <button class="icon-btn" type="button" data-action="column-color"
                    data-column="${column.id}" aria-label="컬럼 색 바꾸기" title="컬럼 색 바꾸기">🎨</button>
                <button class="icon-btn" type="button" data-action="delete-column"
                    data-column="${column.id}" aria-label="컬럼 삭제" title="컬럼 삭제">🗑</button>
            </header>

            <div class="column__list">
                ${items || '<p class="column__empty">아직 항목이 없습니다.</p>'}
            </div>

            <button class="column__add" type="button" data-action="add-item" data-column="${column.id}">
                + 항목 추가
            </button>
        </section>`;
}

function render() {
    boardEl.innerHTML = board.columns.map(renderColumn).join('')
        + '<button class="column-add" type="button" data-action="add-column">+ 컬럼 추가</button>';
    applyTheme();
}

/* ---------- 제목 / 부제 / 컬럼 제목 편집 ---------- */
async function applyEdit(el) {
    const kind = el.dataset.edit;
    const value = el.textContent.trim();

    if (kind === 'column') {
        const column = findColumn(el.dataset.column);
        if (!column) return;
        const newTitle = value || column.title;
        el.textContent = newTitle;
        if (newTitle === column.title) return;
        column.title = newTitle;
        return run('저장 중…', () => exec(db.from('padlet_columns')
            .update({ title: newTitle }).eq('id', column.id)));
    }

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

// Enter는 줄바꿈 대신 편집 끝내기
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.matches?.('[data-edit]')) {
        event.preventDefault();
        event.target.blur();
    }
});

// 붙여넣기는 글자만 들어가게
document.addEventListener('paste', (event) => {
    if (event.target.matches?.('[data-edit]')) {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, text);
    }
});

/* ---------- 컬럼 / 항목 추가·삭제 ---------- */
async function addColumn() {
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

// 모든 컬럼·항목·업로드 파일을 지워서 빈 보드로 만듦 (제목, 부제, 디자인 설정은 유지)
async function resetColumns() {
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
});

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
}

function openComposer(columnId) {
    const column = findColumn(columnId);
    if (!column) return;

    composerColumnId = columnId;
    composerTitle.textContent = `"${column.title}"에 추가`;
    composerForm.reset();
    // 이름은 이전에 입력한 값을 기억해서 채움
    composerForm.elements.author.value = localStorage.getItem('padlet-author') || '';
    setType('text');
    composer.showModal();
}

function showComposerError(message) {
    composerError.textContent = message;
    composerError.hidden = false;
}

function setBusy(isBusy) {
    busy = isBusy;
    composerSubmit.disabled = isBusy;
    composerSubmit.textContent = isBusy ? '업로드 중…' : '게시하기';
}

typeTabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-type]');
    if (tab) setType(tab.dataset.type);
});

composerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;

    const title = composerForm.elements.title.value.trim();
    const body = composerForm.elements.body.value.trim();
    const url = normalizeUrl(composerForm.elements.url.value);
    const author = composerForm.elements.author.value.trim();
    const usesFile = ['image', 'video', 'file'].includes(currentType);
    const file = usesFile ? composerForm.elements.file.files[0] : null;

    // 종류별 입력 확인
    if (currentType === 'text' && !title && !body) {
        return showComposerError('제목이나 내용을 입력해 주세요.');
    }
    if (currentType === 'link' && !url) {
        return showComposerError('링크 주소를 입력해 주세요.');
    }
    if ((currentType === 'image' || currentType === 'video') && !file && !url) {
        return showComposerError('파일을 올리거나 주소를 입력해 주세요.');
    }
    if (currentType === 'file' && !file) {
        return showComposerError('업로드할 파일을 선택해 주세요.');
    }
    if (file && file.size > MAX_FILE_SIZE) {
        return showComposerError(`파일은 ${formatSize(MAX_FILE_SIZE)} 이하만 올릴 수 있습니다. (선택한 파일: ${formatSize(file.size)})`);
    }

    const column = findColumn(composerColumnId);
    if (!column) return composer.close();

    if (author) localStorage.setItem('padlet-author', author);

    setBusy(true);
    let filePath = '';
    try {
        if (file) {
            showStatus('파일 업로드 중…');
            filePath = `${column.id}/${safeFileName(file.name)}`;
            const { error } = await db.storage.from(BUCKET).upload(filePath, file, {
                contentType: file.type || undefined,
                upsert: false
            });
            if (error) throw error;
        }

        const row = {
            column_id: column.id,
            type: currentType,
            title: title || (file ? file.name : url) || '제목 없음',
            body: currentType === 'text' || file ? body : '',
            url: currentType === 'text' || currentType === 'file' ? '' : url,
            author: author || '익명',
            file_path: filePath,
            file_name: file ? file.name : '',
            file_size: file ? file.size : 0
        };

        const inserted = await exec(db.from('padlet_items').insert(row).select().single());
        column.items.push(fromDbItem(inserted));
        render();
        composer.close();
        showStatus('저장됨');
    } catch (error) {
        console.error(error);
        // 파일은 올라갔는데 글 저장이 실패하면 파일도 지움
        if (filePath) await db.storage.from(BUCKET).remove([filePath]).catch(() => {});
        showComposerError(`업로드 실패: ${error.message || error}`);
    } finally {
        setBusy(false);
    }
});

/* ---------- 컬럼 색 창 ---------- */
function openColumnStyle(columnId) {
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
    board.theme = { ...DEFAULT_THEME };
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
    (async () => {
        const loaded = await run('불러오는 중…', loadBoard, '불러옴');
        if (!loaded) return;
        titleEl.textContent = board.title;
        subtitleEl.textContent = board.subtitle;
        render();
    })();
}
