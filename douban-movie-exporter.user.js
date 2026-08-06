// ==UserScript==
// @name         豆瓣书影音游戏数据导出工具
// @name:en      Douban Media Export Tool
// @name:zh-CN   豆瓣书影音游戏数据导出工具
// @namespace    https://github.com/byJming/douban-movie-exporter
// @version      2.3.0
// @description  导出豆瓣电影、读书、音乐和游戏收藏，支持 Excel/JSON、封面资源 ZIP，并在豆瓣页面提供汇总导航。
// @description:en Export Douban movies, books, music and games to Excel/JSON with cover ZIP support and a compact summary navigator.
// @author       ming
// @match        https://*.douban.com/*
// @match        https://douban.com/*
// @match        https://www.douban.com/people/*
// @match        https://movie.douban.com/mine*
// @match        https://movie.douban.com/people/*/collect*
// @match        https://book.douban.com/mine*
// @match        https://book.douban.com/people/*/collect*
// @match        https://music.douban.com/mine*
// @match        https://music.douban.com/people/*/collect*
// @match        https://www.douban.com/people/*/games*
// @require      https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *.doubanio.com
// @connect      doubanio.com
// @connect      img1.doubanio.com
// @connect      img2.doubanio.com
// @connect      img3.doubanio.com
// @connect      img4.doubanio.com
// @connect      img5.doubanio.com
// @connect      img6.doubanio.com
// @connect      img7.doubanio.com
// @connect      img8.doubanio.com
// @connect      img9.doubanio.com
// @license      MIT
// @homepage     https://github.com/byJming/douban-movie-exporter
// @supportURL   https://github.com/byJming/douban-movie-exporter/issues
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        minDelay: 1200,
        maxDelay: 3000,
        stateKey: 'db_export_state_v2',
        dataKey: 'db_export_data_v2',
        fieldsKey: 'db_export_fields_v2',
        coverConcurrency: 2
    };

    const CATEGORIES = {
        movie: { label: '电影', icon: '🎬', sheet: '电影收藏', file: 'Movie', pageSize: 15 },
        book: { label: '读书', icon: '📚', sheet: '读书收藏', file: 'Book', pageSize: 15 },
        music: { label: '音乐', icon: '🎵', sheet: '音乐收藏', file: 'Music', pageSize: 15 },
        game: { label: '游戏', icon: '🎮', sheet: '游戏收藏', file: 'Game', pageSize: 15 }
    };

    const FIELDS = [
        { key: 'title', name: '标题', default: true },
        { key: 'id', name: '豆瓣条目 ID', default: false },
        { key: 'rating', name: '个人评分', default: true },
        { key: 'date', name: '标记日期', default: true },
        { key: 'status', name: '收藏状态', default: false },
        { key: 'tags', name: '标签', default: false },
        { key: 'comment', name: '短评/备注', default: true },
        { key: 'intro', name: '简介/出版信息', default: false },
        { key: 'link', name: '豆瓣链接', default: true }
    ];

    const styleText = `
        #db-export-summary-btn {
            position: fixed; top: 110px; right: 20px; z-index: 9999;
            padding: 10px 18px; border: 0; border-radius: 24px; cursor: pointer;
            background: #3eaf7c; color: #fff; font-size: 14px; font-weight: 700;
            box-shadow: 0 4px 12px rgba(62,175,124,.35); transition: .2s;
        }
        #db-export-summary-btn:hover { background: #339268; transform: translateY(-1px); }
        #db-export-summary-overlay, #db-export-modal-overlay {
            position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.52);
            display: flex; align-items: center; justify-content: center;
        }
        #db-export-summary-panel, #db-export-modal {
            box-sizing: border-box; width: min(520px, 92vw); max-height: 86vh; overflow-y: auto;
            padding: 24px; border-radius: 10px; background: #fff; color: #333;
            font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
            box-shadow: 0 12px 36px rgba(0,0,0,.22); animation: dbFadeIn .2s ease-out;
        }
        #db-export-summary-panel h3, #db-export-modal h3 { margin: 0; padding-bottom: 12px; border-bottom: 2px solid #3eaf7c; font-size: 18px; }
        .db-summary-help { margin: 12px 0 16px; color:#666; font-size: 13px; line-height: 1.6; }
        .db-summary-list { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .db-summary-card { display:flex; align-items:center; gap: 10px; padding: 12px; border:1px solid #e8e8e8; border-radius: 8px; }
        .db-summary-cover { width: 40px; height: 54px; flex: 0 0 40px; object-fit: cover; border-radius: 3px; background:#f2f2f2; }
        .db-summary-main { min-width:0; flex:1; }
        .db-summary-title { font-weight:700; font-size:14px; }
        .db-summary-meta { margin-top:4px; color:#888; font-size:12px; line-height:1.4; }
        .db-summary-action { margin-top:8px; padding: 6px 10px; border:0; border-radius:5px; cursor:pointer; color:#fff; background:#3eaf7c; font-size:12px; }
        .db-summary-action:hover { background:#339268; }
        .db-btn { padding: 8px 14px; border: 0; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 700; }
        .db-btn-primary { background:#3eaf7c; color:#fff; }
        .db-btn-primary:hover { background:#339268; }
        .db-btn-secondary { background:#f0f0f0; color:#666; }
        .db-btn-secondary:hover { background:#e2e2e2; }
        .db-checkbox-group { display:flex; flex-direction:column; gap:9px; max-height:330px; overflow-y:auto; margin:16px 0; }
        .db-checkbox-label { display:flex; align-items:center; gap:9px; cursor:pointer; color:#444; font-size:14px; user-select:none; }
        .db-checkbox-label input { width:16px; height:16px; accent-color:#3eaf7c; }
        .db-page-range { display:flex; align-items:center; gap:8px; margin:9px 0 0 25px; padding:10px; border-radius:7px; background:#f7f9f8; }
        .db-page-range[hidden] { display:none; }
        .db-page-range input { box-sizing:border-box; width:72px; padding:5px 7px; border:1px solid #d7dedb; border-radius:5px; }
        .db-download-section { padding:12px; border:1px solid #e6ebe8; border-radius:8px; }
        .db-download-section + .db-download-section { margin-top:10px; }
        .db-download-title { margin-bottom:8px; color:#333; font-weight:700; font-size:13px; }
        .db-download-actions { display:flex; flex-direction:column; gap:8px; }
        .db-btn-group { display:flex; justify-content:flex-end; gap:9px; margin-top:20px; }
        .db-note { color:#777; font-size:12px; line-height:1.6; }
        .db-progress-track { height:6px; margin-top:10px; overflow:hidden; border-radius:999px; background:#edf1ef; }
        .db-progress-bar { width:0; height:100%; border-radius:inherit; background:#3eaf7c; transition:width .15s ease; }
        @keyframes dbFadeIn { from { opacity:0; transform:translateY(-12px); } to { opacity:1; transform:translateY(0); } }
        @media (max-width: 560px) { .db-summary-list { grid-template-columns: 1fr; } }
    `;

    function addStyle(css) {
        if (typeof GM_addStyle === 'function') GM_addStyle(css);
        else {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    function textOf(el) {
        return el ? (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    function parseJson(value, fallback) {
        try { return value ? JSON.parse(value) : fallback; } catch (e) { return fallback; }
    }

    function getProfileSlug() {
        const match = location.pathname.match(/^\/people\/([^/]+)/);
        if (match) return match[1];
        return window._GLOBAL_NAV && window._GLOBAL_NAV.USER_ID ? String(window._GLOBAL_NAV.USER_ID) : '';
    }

    function detectContext() {
        const host = location.hostname;
        const path = location.pathname;
        if (host === 'movie.douban.com' && (/\/mine/.test(path) || /\/people\/[^/]+\/collect/.test(path))) return 'movie';
        if (host === 'book.douban.com' && (/\/mine/.test(path) || /\/people\/[^/]+\/collect/.test(path))) return 'book';
        if (host === 'music.douban.com' && (/\/mine/.test(path) || /\/people\/[^/]+\/collect/.test(path))) return 'music';
        if (host === 'www.douban.com' && /\/people\/[^/]+\/games/.test(path)) return 'game';
        if (host === 'www.douban.com' && /^\/people\/[^/]+\/?$/.test(path)) return 'profile';
        if ((host === 'douban.com' || host.endsWith('.douban.com')) && host !== 'accounts.douban.com') return 'generic';
        return '';
    }

    function storageKey(key) {
        // /mine 首页的下一页通常会跳到 /people/<id>/collect，按 host 存储可跨分页保持状态。
        return `${key}:${location.hostname}`;
    }

    function getState() {
        return parseJson(localStorage.getItem(storageKey(CONFIG.stateKey)), { status: 'idle' });
    }

    function setState(state) {
        localStorage.setItem(storageKey(CONFIG.stateKey), JSON.stringify(state));
    }

    function getStoredData() {
        return parseJson(localStorage.getItem(storageKey(CONFIG.dataKey)), []);
    }

    function setStoredData(data) {
        localStorage.setItem(storageKey(CONFIG.dataKey), JSON.stringify(data));
    }

    function getSelectedFields() {
        const allowed = new Set(FIELDS.map(field => field.key));
        return parseJson(localStorage.getItem(storageKey(CONFIG.fieldsKey)), FIELDS.filter(f => f.default).map(f => f.key))
            .filter(field => allowed.has(field));
    }

    function cleanTitle(value) {
        return value.replace(/^\[.*?\]\s*/, '').replace(/\s+/g, ' ').trim();
    }

    function extractDate(value) {
        const match = value.match(/\d{4}-\d{1,2}-\d{1,2}/);
        return match ? match[0] : value.trim();
    }

    function parseRating(el) {
        if (!el) return '';
        const attr = el.getAttribute('data-rating');
        if (attr && /^\d+(?:\.\d+)?$/.test(attr)) return Number(attr);
        const cls = el.className || '';
        const rating = cls.match(/rating(\d)-t/);
        if (rating) return Number(rating[1]);
        const stars = cls.match(/allstar(\d+)/);
        if (stars) return Number(stars[1]) / 10;
        return '';
    }

    function getRating(item) {
        return parseRating(item.querySelector('[class^="rating"][class$="-t"], [class*="allstar"], [data-rating]'));
    }

    function getCover(item, category) {
        const img = item && item.querySelector('img[data-src], img[data-original], img[src]');
        if (!img) return '';
        let url = img.getAttribute('data-src') || img.getAttribute('data-original') || img.src || '';
        if (['book', 'music'].includes(category)) url = url.replace('/view/subject/s/public/', '/view/subject/l/public/').replace('/view/subject/m/public/', '/view/subject/l/public/');
        return url;
    }

    function getId(link) {
        const match = (link || '').match(/\/(?:subject|game)\/(\d+)/);
        return match ? match[1] : '';
    }

    function baseRecord(category, link, item) {
        return {
            category,
            id: getId(link),
            title: '',
            rating: '',
            date: '',
            status: new URL(location.href).searchParams.get('status') || new URL(location.href).searchParams.get('action') || 'collect',
            tags: '',
            comment: '',
            intro: '',
            cover_url: getCover(item, category),
            link
        };
    }

    function parseMoviePage() {
        const items = [...document.querySelectorAll('.grid-view .item, .list-view .item')]
            .filter(item => item.querySelector('a[href*="/subject/"]'));
        return items.map(item => {
            const titleLink = item.querySelector('.title a[href*="/subject/"]') || item.querySelector('a[href*="/subject/"]');
            const record = baseRecord('movie', titleLink ? titleLink.href : '', item);
            record.title = cleanTitle(textOf(titleLink));
            record.rating = getRating(item);
            record.date = extractDate(textOf(item.querySelector('.date')));
            record.tags = textOf(item.querySelector('.tags')).replace(/^标签[:：]\s*/, '');
            record.comment = textOf(item.querySelector('.comment'));
            record.intro = textOf(item.querySelector('.intro'));
            return record;
        });
    }

    function parseBookPage() {
        return [...document.querySelectorAll('.subject-item')].map(item => {
            const titleLink = item.querySelector('.info h2 a[href*="/subject/"]') || item.querySelector('a[href*="/subject/"]');
            const record = baseRecord('book', titleLink ? titleLink.href : '', item);
            record.title = cleanTitle(textOf(titleLink));
            record.rating = getRating(item);
            record.date = extractDate(textOf(item.querySelector('.date')));
            record.comment = textOf(item.querySelector('.comment'));
            record.intro = textOf(item.querySelector('.pub'));
            return record;
        }).filter(record => record.link);
    }

    function parseMusicPage() {
        return [...document.querySelectorAll('.item.comment-item, .item')]
            .filter(item => item.querySelector('a[href*="/subject/"]'))
            .map(item => {
                const titleLink = item.querySelector('.title a[href*="/subject/"]') || item.querySelector('a[href*="/subject/"]');
                const record = baseRecord('music', titleLink ? titleLink.href : '', item);
                record.title = cleanTitle(textOf(titleLink));
                record.rating = getRating(item);
                record.date = extractDate(textOf(item.querySelector('.date')));
                record.comment = textOf(item.querySelector('.comment'));
                record.intro = textOf(item.querySelector('.intro'));
                return record;
            }).filter(record => record.link);
    }

    function parseGamePage() {
        return [...document.querySelectorAll('.game-list .common-item')].map(item => {
            const titleLink = item.querySelector('.title a[href*="/game/"]') || item.querySelector('a[href*="/game/"]');
            const record = baseRecord('game', titleLink ? titleLink.href : '', item);
            record.title = cleanTitle(textOf(titleLink));
            record.rating = getRating(item);
            record.date = extractDate(textOf(item.querySelector('.date')));
            const desc = item.querySelector('.desc');
            if (desc) {
                const clone = desc.cloneNode(true);
                clone.querySelector('.rating-info')?.remove();
                record.intro = textOf(clone);
            }
            const comment = [...item.querySelectorAll('.content > div')]
                .find(el => !el.classList.contains('title') && !el.classList.contains('desc') && !el.classList.contains('user-operation'));
            record.comment = textOf(comment);
            return record;
        }).filter(record => record.link);
    }

    async function enrichMovieFromList(records, fields) {
        if (!fields.includes('tags') && !fields.includes('comment')) return records;
        try {
            const listUrl = new URL(location.href);
            listUrl.searchParams.set('mode', 'list');
            const response = await fetch(listUrl.href, { credentials: 'include' });
            if (!response.ok) return records;
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const detailMap = new Map();
            [...doc.querySelectorAll('.list-view .item')].forEach(item => {
                const link = item.querySelector('.title a[href*="/subject/"]');
                if (!link) return;
                detailMap.set(getId(link.href), {
                    tags: textOf(item.querySelector('.tags')).replace(/^标签[:：]\s*/, ''),
                    comment: textOf(item.querySelector('.comment'))
                });
            });
            records.forEach(record => Object.assign(record, detailMap.get(record.id) || {}));
        } catch (e) {
            console.warn('[Douban Export] 无法补充电影列表字段:', e);
        }
        return records;
    }

    async function scrapeCurrentPage(category, fields) {
        let records;
        if (category === 'movie') records = parseMoviePage();
        else if (category === 'book') records = parseBookPage();
        else if (category === 'music') records = parseMusicPage();
        else records = parseGamePage();
        if (category === 'movie') records = await enrichMovieFromList(records, fields);
        return records;
    }

    function getNextPage() {
        const next = document.querySelector('.paginator .next a[href]');
        return next && next.href && !next.href.startsWith('javascript:') ? next.href : '';
    }

    function getCurrentPageNumber(category) {
        const current = Number.parseInt(textOf(document.querySelector('.paginator .thispage')), 10);
        if (Number.isInteger(current) && current > 0) return current;
        const start = Number.parseInt(new URL(location.href).searchParams.get('start') || '0', 10);
        return Math.floor((Number.isFinite(start) ? start : 0) / CATEGORIES[category].pageSize) + 1;
    }

    function getTotalPageCount() {
        const pages = [...document.querySelectorAll('.paginator .thispage, .paginator a')]
            .map(element => Number.parseInt(textOf(element), 10))
            .filter(page => Number.isInteger(page) && page > 0);
        return pages.length ? Math.max(...pages) : 1;
    }

    function formatPageRange(pageRange) {
        return pageRange ? `第 ${pageRange.startPage}～${pageRange.endPage} 页` : '全部页（从第 1 页开始）';
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    }

    function getCategoryUrl(category, slug, section) {
        const link = section && section.querySelector('a[href*="status=collect"], a[href*="games?action=collect"]');
        if (link) return new URL(link.href, location.href).href;
        if (category === 'movie') return slug ? `https://movie.douban.com/people/${slug}/collect?mode=grid` : 'https://movie.douban.com/mine?status=collect&mode=grid';
        if (category === 'book') return slug ? `https://book.douban.com/people/${slug}/collect?mode=grid` : 'https://book.douban.com/mine?status=collect&mode=grid';
        if (category === 'music') return slug ? `https://music.douban.com/people/${slug}/collect?mode=grid` : 'https://music.douban.com/mine?status=collect&mode=grid';
        return slug ? `https://www.douban.com/people/${slug}/games?action=collect` : 'https://www.douban.com/mine/';
    }

    function withAutoExport(url) {
        const next = new URL(url, location.href);
        next.searchParams.set('db_export', '1');
        return next.href;
    }

    function getSummaryEntries(context) {
        const slug = getProfileSlug();
        const sections = [...document.querySelectorAll('.sort[id]')]
            .filter(section => Object.prototype.hasOwnProperty.call(CATEGORIES, section.id));
        if (context === 'profile' && sections.length) {
            return sections.map(section => {
                const category = section.id;
                const heading = section.querySelector('h2');
                const image = section.querySelector('img.climg');
                return {
                    category,
                    label: CATEGORIES[category].label,
                    icon: CATEGORIES[category].icon,
                    summary: textOf(heading).replace(/·/g, '').replace(/\s+/g, ' ').trim() || '打开收藏页查看全部',
                    cover: image ? image.src : '',
                    current: false,
                    url: withAutoExport(getCategoryUrl(category, slug, section))
                };
            });
        }
        return Object.keys(CATEGORIES).map(category => ({
            category,
            label: CATEGORIES[category].label,
            icon: CATEGORIES[category].icon,
            summary: category === context ? `当前页面：${document.title}` : '打开对应收藏页开始导出',
            cover: '',
            current: category === context,
            url: withAutoExport(getCategoryUrl(category, slug))
        }));
    }

    function showSummaryPanel(context) {
        if (document.getElementById('db-export-summary-overlay')) return;
        const entries = getSummaryEntries(context);
        const overlay = document.createElement('div');
        overlay.id = 'db-export-summary-overlay';
        overlay.innerHTML = `<div id="db-export-summary-panel" role="dialog" aria-label="书影音游戏数据汇总">
            <h3>📊 书影音游戏数据汇总</h3>
            <p class="db-summary-help">从这里选择分类。当前收藏页直接打开字段选择，其他分类会在新标签页打开并自动进入导出流程。个人主页的栏目顺序沿用豆瓣原生页面顺序。</p>
            <div class="db-summary-list">${entries.map(entry => `<div class="db-summary-card">
                ${entry.cover ? `<img class="db-summary-cover" src="${escapeHtml(entry.cover)}" alt="${escapeHtml(entry.label)}封面">` : '<div class="db-summary-cover"></div>'}
                <div class="db-summary-main"><div class="db-summary-title">${escapeHtml(entry.icon)} ${escapeHtml(entry.label)}</div><div class="db-summary-meta">${escapeHtml(entry.summary)}</div><button class="db-summary-action" data-current="${entry.current ? '1' : '0'}" data-url="${escapeHtml(entry.url)}">${entry.current ? '导出当前分类' : '去导出'}</button></div>
            </div>`).join('')}</div>
            <div class="db-btn-group"><button class="db-btn db-btn-secondary" id="db-close-summary">关闭</button></div>
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.id === 'db-close-summary') { overlay.remove(); return; }
            const action = event.target.closest('.db-summary-action');
            if (action && action.dataset.current === '1') { overlay.remove(); showConfigPanel(); }
            else if (action) window.open(action.dataset.url, '_blank', 'noopener');
        });
    }

    function renderSummaryButton(context) {
        if (document.getElementById('db-export-summary-btn')) return;
        addStyle(styleText);
        const button = document.createElement('button');
        button.id = 'db-export-summary-btn';
        button.type = 'button';
        const state = getState();
        button.textContent = state.status === 'running' && state.category === context ? '⏳ 抓取中 · 汇总' : '📊 书影音游戏汇总';
        button.title = '汇总并导航到具体分类导出';
        button.onclick = () => showSummaryPanel(context);
        document.body.appendChild(button);
    }

    function getCoverAssetPath(item, index) {
        if (!item.cover_url) return '';
        const pathname = new URL(item.cover_url, location.href).pathname;
        const suffix = ((pathname.match(/\.(avif|webp|png|jpe?g|gif)$/i) || [])[1] || 'jpg').toLowerCase();
        const key = item.id || String(index + 1).padStart(4, '0');
        return `covers/${item.category || 'douban'}-${key}.${suffix}`;
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 KB';
        if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    function estimateCoverSize(count) {
        return `${formatBytes(count * 15 * 1024)}～${formatBytes(count * 80 * 1024)}`;
    }

    const CRC32_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n += 1) {
            let value = n;
            for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
            table[n] = value >>> 0;
        }
        return table;
    })();

    function crc32(bytes) {
        let value = 0xffffffff;
        for (let index = 0; index < bytes.length; index += 1) value = (value >>> 8) ^ CRC32_TABLE[(value ^ bytes[index]) & 0xff];
        return (value ^ 0xffffffff) >>> 0;
    }

    function utf8Bytes(value) {
        return new TextEncoder().encode(value);
    }

    function dosDateTime(date = new Date()) {
        const year = Math.max(1980, date.getFullYear());
        return {
            time: ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xffff,
            date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff
        };
    }

    function createZipLocalHeader(name, bytes, crc, dateTime) {
        const header = new Uint8Array(30 + name.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0x0800, true); // UTF-8 file name
        view.setUint16(8, 0, true); // STORE
        view.setUint16(10, dateTime.time, true);
        view.setUint16(12, dateTime.date, true);
        view.setUint32(14, crc, true);
        view.setUint32(18, bytes.byteLength, true);
        view.setUint32(22, bytes.byteLength, true);
        view.setUint16(26, name.length, true);
        view.setUint16(28, 0, true);
        header.set(name, 30);
        return header;
    }

    function createZipCentralHeader(name, bytes, crc, dateTime, offset) {
        const header = new Uint8Array(46 + name.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0x0800, true); // UTF-8 file name
        view.setUint16(10, 0, true); // STORE
        view.setUint16(12, dateTime.time, true);
        view.setUint16(14, dateTime.date, true);
        view.setUint32(16, crc, true);
        view.setUint32(20, bytes.byteLength, true);
        view.setUint32(24, bytes.byteLength, true);
        view.setUint16(28, name.length, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, offset, true);
        header.set(name, 46);
        return header;
    }

    function createZipEndRecord(fileCount, centralSize, centralOffset) {
        const end = new Uint8Array(22);
        const view = new DataView(end.buffer);
        view.setUint32(0, 0x06054b50, true);
        view.setUint16(8, fileCount, true);
        view.setUint16(10, fileCount, true);
        view.setUint32(12, centralSize, true);
        view.setUint32(16, centralOffset, true);
        return end;
    }

    async function createStoredZipBlob(entries, manifestText, statusEl, progressBar, onProgress) {
        const files = entries.filter(Boolean).map(entry => ({ ...entry, name: entry.path, nameBytes: utf8Bytes(entry.path) }));
        const manifestBytes = utf8Bytes(manifestText);
        files.push({ path: 'cover-manifest.json', bytes: manifestBytes, name: 'cover-manifest.json', nameBytes: utf8Bytes('cover-manifest.json'), crc: crc32(manifestBytes) });
        if (files.length > 0xffff) throw new Error('ZIP 文件数超过传统 ZIP 格式限制');
        let offset = 0;
        let centralSize = 0;
        const parts = [];
        const centralParts = [];
        const dateTime = dosDateTime();
        for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            const local = createZipLocalHeader(file.nameBytes, file.bytes, file.crc, dateTime);
            const central = createZipCentralHeader(file.nameBytes, file.bytes, file.crc, dateTime, offset);
            parts.push(local, file.bytes);
            centralParts.push(central);
            offset += local.byteLength + file.bytes.byteLength;
            centralSize += central.byteLength;
            if (offset > 0xffffffff) throw new Error('ZIP 文件超过 4 GB 限制');
            const percent = Math.round(((index + 1) / files.length) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (statusEl && statusEl.firstChild) statusEl.firstChild.textContent = `正在生成 ZIP：${percent}%，已写入 ${index + 1}/${files.length} 个文件（图片无需重新压缩）`;
            if (onProgress) onProgress(percent);
            if (index % 8 === 7) await new Promise(resolve => setTimeout(resolve, 0));
        }
        const centralOffset = offset;
        parts.push(...centralParts, createZipEndRecord(files.length, centralSize, centralOffset));
        return new Blob(parts, { type: 'application/zip' });
    }

    function requestCoverBytes(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('当前脚本管理器不支持 GM_xmlhttpRequest'));
                return;
            }
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                // 直接拿 ArrayBuffer，避免 Tampermonkey 沙箱 Blob 交给 ZIP 写入器时卡在 FileReader。
                responseType: 'arraybuffer',
                anonymous: false,
                headers: {
                    Referer: location.href,
                    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
                },
                onload: async response => {
                    if (response.status < 200 || response.status >= 300 || !response.response) {
                        reject(new Error(`HTTP ${response.status}`));
                        return;
                    }
                    try {
                        let body = response.response;
                        // 兼容少数脚本管理器忽略 responseType 的情况。
                        if (body && typeof body.arrayBuffer === 'function') body = await body.arrayBuffer();
                        let bytes = null;
                        if (body instanceof Uint8Array) bytes = body;
                        else if (ArrayBuffer.isView(body)) bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
                        else if (body instanceof ArrayBuffer || (body && typeof body.byteLength === 'number')) bytes = new Uint8Array(body);
                        if (!bytes || !bytes.byteLength) throw new Error('图片响应不是有效的二进制数据');
                        resolve(bytes);
                    } catch (error) {
                        reject(new Error(`图片二进制转换失败：${error.message || error}`));
                    }
                },
                onerror: () => reject(new Error('网络请求失败')),
                ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    async function downloadCoversZip(category, statusEl, button) {
        const records = getStoredData()
            .map((item, dataIndex) => ({ item, dataIndex }))
            .filter(entry => entry.item.cover_url);
        if (!records.length) { alert('没有可下载的封面资源'); return; }
        if (records.length > 200 && !confirm(`将下载 ${records.length} 张封面，粗略占用 ${estimateCoverSize(records.length)}，生成 ZIP 时还会占用额外浏览器内存。是否继续？`)) return;
        if (button) { button.disabled = true; button.textContent = '正在下载封面…'; }
        const fileEntries = [];
        let nextIndex = 0;
        let completed = 0;
        let totalBytes = 0;
        const manifest = records.map(({ item, dataIndex }) => ({
            record_key: `${category}:${item.id || dataIndex + 1}`,
            category,
            douban_id: item.id,
            title: item.title,
            douban_url: item.link,
            rating: item.rating === '' ? null : item.rating,
            mark_date: item.date,
            status: item.status,
            cover_file: getCoverAssetPath(item, dataIndex),
            downloaded: false,
            bytes: 0
        }));
        const worker = async () => {
            while (true) {
                const index = nextIndex;
                nextIndex += 1;
                if (index >= records.length) return;
                const { item, dataIndex } = records[index];
                try {
                    const bytes = await requestCoverBytes(item.cover_url);
                    totalBytes += bytes.byteLength;
                    fileEntries[index] = { path: getCoverAssetPath(item, dataIndex), bytes, crc: crc32(bytes) };
                    manifest[index].downloaded = true;
                    manifest[index].bytes = bytes.byteLength;
                } catch (error) {
                    manifest[index].error = String(error.message || error);
                }
                completed += 1;
                if (statusEl) statusEl.textContent = `正在下载封面：${completed}/${records.length}，已获取 ${formatBytes(totalBytes)}`;
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONFIG.coverConcurrency, records.length) }, worker));
        const failures = manifest.filter(item => !item.downloaded);
        if (statusEl) statusEl.textContent = `封面下载完成：成功 ${records.length - failures.length}，失败 ${failures.length}；正在准备资源包中的 JSON 和 Excel…`;
        const packageEntries = buildDataPackageEntries(category);
        fileEntries.push(...packageEntries);
        const exportState = getState();
        const manifestText = JSON.stringify({
            category,
            total: records.length,
            downloaded: records.length - failures.length,
            failed: failures.length,
            source_bytes: totalBytes,
            page_range: exportState.pageRange || null,
            page_range_label: formatPageRange(exportState.pageRange),
            package_files: packageEntries.map(entry => entry.path),
            items: manifest,
            failures
        }, null, 2);
        if (statusEl) statusEl.innerHTML = `封面下载完成：成功 ${records.length - failures.length}，失败 ${failures.length}，图片共 ${formatBytes(totalBytes)}；正在生成 ZIP（无需重新压缩图片）…<div class="db-progress-track"><div class="db-progress-bar"></div></div>`;
        const progressBar = statusEl && statusEl.querySelector('.db-progress-bar');
        const generationStartedAt = Date.now();
        let lastPercent = 0;
        const progressTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - generationStartedAt) / 1000);
            if (statusEl && statusEl.firstChild) statusEl.firstChild.textContent = `正在生成 ZIP：${Math.round(lastPercent)}%，已用时 ${elapsed} 秒（图片无需重新压缩，请保持页面打开）`;
        }, 1000);
        let blob;
        try {
            blob = await createStoredZipBlob(fileEntries, manifestText, statusEl, progressBar, percent => { lastPercent = percent; });
        } finally {
            clearInterval(progressTimer);
        }
        triggerDownload(blob, `Douban_${CATEGORIES[category].file}_Covers_${new Date().toISOString().slice(0, 10)}.zip`);
        if (statusEl) statusEl.textContent = `封面 ZIP 已生成：${formatBytes(blob.size)}；成功 ${records.length - failures.length}，失败 ${failures.length}`;
        if (button) { button.disabled = false; button.textContent = '🖼️ 重新下载封面 ZIP'; }
    }

    function renderFloatingButton(category) {
        renderSummaryButton(category);
    }

    function showConfigPanel() {
        if (document.getElementById('db-export-modal-overlay')) return;
        const category = detectContext();
        if (!CATEGORIES[category]) return;
        const selected = getSelectedFields();
        // 封面下载会额外占用网络、内存和磁盘，因此每次新任务都要求用户主动选择。
        const includeCovers = false;
        const totalPages = getTotalPageCount();
        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';
        overlay.innerHTML = `<div id="db-export-modal">
            <h3>${CATEGORIES[category].icon} 导出${CATEGORIES[category].label}</h3>
            <p class="db-note">选择数据字段；封面资源单独打包，JSON/Excel 只记录本地文件路径，不保存豆瓣图片原始地址。</p>
            <div class="db-checkbox-group">${FIELDS.map(field => `<label class="db-checkbox-label"><input class="db-field-checkbox" type="checkbox" value="${field.key}" ${selected.includes(field.key) ? 'checked' : ''}>${field.name}</label>`).join('')}</div>
            <label class="db-checkbox-label" style="padding:10px;border:1px solid #e8e8e8;border-radius:7px"><input id="db-include-covers" type="checkbox" ${includeCovers ? 'checked' : ''}><span><b>同时导出海报/封面资源</b><br><small style="color:#888">完成后下载独立 ZIP；会增加网络流量、浏览器内存与磁盘占用</small></span></label>
            <label class="db-checkbox-label" style="margin-top:12px"><input id="db-limit-pages" type="checkbox"><span><b>仅导出指定页码范围</b><br><small style="color:#888">默认不勾选，将从第 1 页导出到最后一页</small></span></label>
            <div class="db-page-range" id="db-page-range" hidden><label>从第 <input id="db-start-page" type="number" min="1" max="${totalPages}" value="1"> 页</label><span>至</span><label>第 <input id="db-end-page" type="number" min="1" max="${totalPages}" value="${totalPages}"> 页</label></div>
            <p class="db-note">当前共识别到 ${totalPages} 页，每页最多 ${CATEGORIES[category].pageSize} 条。无论从哪一页打开导出，未限制范围时都会先返回第 1 页。</p>
            <div class="db-btn-group"><button class="db-btn db-btn-secondary" id="db-cancel-btn">取消</button><button class="db-btn db-btn-primary" id="db-start-btn">开始抓取</button></div>
        </div>`;
        document.body.appendChild(overlay);
        const rangeToggle = overlay.querySelector('#db-limit-pages');
        const rangeFields = overlay.querySelector('#db-page-range');
        rangeToggle.onchange = () => { rangeFields.hidden = !rangeToggle.checked; };
        overlay.querySelector('#db-cancel-btn').onclick = () => overlay.remove();
        overlay.querySelector('#db-start-btn').onclick = () => {
            const fields = [...overlay.querySelectorAll('.db-field-checkbox:checked')].map(input => input.value);
            const exportCovers = overlay.querySelector('#db-include-covers').checked;
            if (!fields.length && !exportCovers) { alert('请至少选择一个数据字段或封面资源！'); return; }
            let pageRange = null;
            if (rangeToggle.checked) {
                const startPage = Number.parseInt(overlay.querySelector('#db-start-page').value, 10);
                const endPage = Number.parseInt(overlay.querySelector('#db-end-page').value, 10);
                if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage < startPage || endPage > totalPages) {
                    alert(`请输入 1～${totalPages} 之间的有效页码，且结束页不能小于起始页。`);
                    return;
                }
                pageRange = { startPage, endPage };
            }
            localStorage.setItem(storageKey(CONFIG.fieldsKey), JSON.stringify(fields));
            overlay.remove();
            startScraping(category, fields, exportCovers, pageRange);
        };
    }

    function showDownloadPanel(category) {
        if (document.getElementById('db-export-modal-overlay')) return;
        const data = getStoredData();
        const state = getState();
        const includeCovers = Boolean(state.includeCovers);
        const coverCount = data.filter(item => item.cover_url).length;
        const coverAction = includeCovers && coverCount > 0 ? `<button class="db-btn db-btn-primary" style="background:#7b61ff" id="db-dl-covers">📦 下载完整资源包 ZIP（封面 + JSON + Excel）</button>` : '';
        const coverNote = !includeCovers
            ? '本次未选择封面资源，不会产生额外图片请求或占用。'
            : coverCount > 0
                ? `识别到 ${coverCount} 张封面，粗略占用 ${estimateCoverSize(coverCount)}。下面两个按钮是单独的数据文件；完整资源包 ZIP 还会包含封面图片、主数据 JSON、Excel 和 cover-manifest.json。`
                : '本次选择了封面资源，但页面中没有识别到可下载图片，因此不会产生封面 ZIP；数据文件中的封面路径为空。';
        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';
        overlay.innerHTML = `<div id="db-export-modal">
            <h3>✅ 抓取完成</h3><p style="font-size:16px;text-align:center">共收集到 <b>${data.length}</b> 条${CATEGORIES[category].label}数据（${formatPageRange(state.pageRange)}）</p>
            <p class="db-note">${coverNote}</p>
            <div class="db-download-section"><div class="db-download-title">单独导出数据文件</div><div class="db-download-actions"><button class="db-btn db-btn-primary" id="db-dl-xlsx">📊 单独导出 Excel (.xlsx)</button><button class="db-btn db-btn-primary" style="background:#2c3e50" id="db-dl-json">🤖 单独导出 JSON</button></div></div>
            ${includeCovers && coverCount > 0 ? `<div class="db-download-section"><div class="db-download-title">完整资源包</div><div class="db-download-actions">${coverAction}</div><p class="db-note">ZIP 内含 covers/、data/*.json、data/*.xlsx 和 cover-manifest.json。</p></div>` : ''}
            <div class="db-btn-group"><button class="db-btn db-btn-secondary" id="db-close-finish">关闭并清理</button></div><p class="db-note" id="db-cover-status" aria-live="polite"></p>
        </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#db-dl-xlsx').onclick = () => generateFile(category, 'xlsx');
        overlay.querySelector('#db-dl-json').onclick = () => generateFile(category, 'json');
        const coverButton = overlay.querySelector('#db-dl-covers');
        if (coverButton) coverButton.onclick = () => downloadCoversZip(category, overlay.querySelector('#db-cover-status'), coverButton).catch(error => {
            const status = overlay.querySelector('#db-cover-status');
            if (status) status.textContent = `封面 ZIP 生成失败：${error.message || error}`;
            coverButton.disabled = false;
            coverButton.textContent = '🖼️ 重试下载封面 ZIP';
        });
        overlay.querySelector('#db-close-finish').onclick = () => {
            localStorage.removeItem(storageKey(CONFIG.dataKey));
            setState({ status: 'idle' });
            location.reload();
        };
    }

    function setGridMode(category, url) {
        if (!['movie', 'book', 'music'].includes(category)) return url;
        const next = new URL(url);
        next.searchParams.set('mode', 'grid');
        return next.href;
    }

    function getPageStartUrl(category, pageNumber) {
        const target = new URL(setGridMode(category, location.href));
        target.searchParams.set('start', String(Math.max(0, (pageNumber - 1) * CATEGORIES[category].pageSize)));
        target.searchParams.delete('db_export');
        return target.href;
    }

    function startScraping(category, fields, includeCovers, pageRange) {
        const current = new URL(location.href);
        const target = getPageStartUrl(category, pageRange ? pageRange.startPage : 1);
        setState({ status: 'running', category, includeCovers: Boolean(includeCovers), pageRange: pageRange || null, startedAt: new Date().toISOString() });
        setStoredData([]);
        if (target !== current.href) {
            location.href = target;
            return;
        }
        processPage(category, fields);
    }

    async function processPage(category, fields) {
        const state = getState();
        if (state.status !== 'running') return;
        const delay = Math.floor(Math.random() * (CONFIG.maxDelay - CONFIG.minDelay) + CONFIG.minDelay);
        setTimeout(async () => {
            try {
                const pageData = await scrapeCurrentPage(category, fields);
                if (!state.includeCovers) pageData.forEach(item => { item.cover_url = ''; });
                const merged = new Map(getStoredData().map(item => [item.link || item.id, item]));
                pageData.forEach(item => merged.set(item.link || item.id, item));
                setStoredData([...merged.values()]);
                const currentPage = getCurrentPageNumber(category);
                const reachedRangeEnd = state.pageRange && currentPage >= state.pageRange.endPage;
                const next = reachedRangeEnd ? '' : getNextPage();
                if (next) location.href = next;
                else {
                    setState({ status: 'paused_for_download', category, includeCovers: Boolean(state.includeCovers), pageRange: state.pageRange || null, startedAt: state.startedAt, finishedAt: new Date().toISOString() });
                    showDownloadPanel(category);
                }
            } catch (error) {
                console.error('[Douban Export] 页面解析失败:', error);
                setState({ status: 'error', category, includeCovers: Boolean(state.includeCovers), pageRange: state.pageRange || null, message: String(error) });
                alert('本页解析失败，请打开控制台查看错误后重试。');
            }
        }, delay);
    }

    function selectedExportItem(item, fields, index, includeCovers) {
        const result = {};
        if (fields.includes('title')) result.title = item.title;
        if (fields.includes('id')) result.douban_id = item.id;
        if (fields.includes('rating')) result.user_rating = item.rating === '' ? null : item.rating;
        if (fields.includes('date')) result.mark_date = item.date;
        if (fields.includes('status')) result.status = item.status;
        if (fields.includes('tags')) result.tags = item.tags ? item.tags.split(/\s+/).filter(Boolean) : [];
        if (fields.includes('comment')) result.comment = item.comment;
        if (fields.includes('intro')) result.intro = item.intro;
        if (fields.includes('link')) result.douban_url = item.link;
        if (includeCovers && item.cover_url) result.cover_file = getCoverAssetPath(item, index);
        return result;
    }

    function getExportBaseName(category) {
        return `Douban_${CATEGORIES[category].file}_Export_${new Date().toISOString().slice(0, 10)}`;
    }

    function buildJsonOutput(category) {
        const data = getStoredData();
        const fields = getSelectedFields();
        const state = getState();
        const includeCovers = Boolean(state.includeCovers);
        return {
            meta: {
                category,
                category_name: CATEGORIES[category].label,
                export_date: new Date().toISOString(),
                total_count: data.length,
                page_range: state.pageRange || null,
                page_range_label: formatPageRange(state.pageRange),
                source: 'Douban Media Export Tool',
                cover_note: includeCovers ? 'cover_file 指向完整资源包 ZIP 中 covers/ 下的本地文件；不保存豆瓣图片原始地址' : '本次未导出封面资源'
            },
            items: data.map((item, index) => selectedExportItem(item, fields, index, includeCovers))
        };
    }

    function buildWorkbook(category) {
        if (typeof XLSX === 'undefined') throw new Error('Excel 组件加载失败，请刷新页面后重试。');
        const data = getStoredData();
        const fields = getSelectedFields();
        const includeCovers = Boolean(getState().includeCovers);
        const headers = {
            title: '标题', id: '豆瓣条目 ID', rating: '个人评分', date: '标记日期', status: '收藏状态', tags: '标签',
            comment: '短评/备注', intro: '简介/出版信息', cover_file: '封面文件', link: '豆瓣链接'
        };
        const exportFields = includeCovers ? [...fields, 'cover_file'] : fields;
        const sheet = [exportFields.map(field => headers[field])];
        data.forEach((item, index) => sheet.push(exportFields.map(field => {
            if (field === 'rating') return item.rating === '' ? '' : item.rating;
            if (field === 'tags') return item.tags || '';
            if (field === 'cover_file') return getCoverAssetPath(item, index);
            return item[field] || '';
        })));
        const ws = XLSX.utils.aoa_to_sheet(sheet);
        ws['!cols'] = exportFields.map(field => ({ wch: field === 'title' ? 42 : field === 'comment' || field === 'intro' ? 52 : field === 'link' ? 64 : field === 'cover_file' ? 36 : 16 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, CATEGORIES[category].sheet);
        return wb;
    }

    function buildXlsxBytes(category) {
        const output = XLSX.write(buildWorkbook(category), { bookType: 'xlsx', type: 'array' });
        return output instanceof Uint8Array ? output : new Uint8Array(output);
    }

    function buildDataPackageEntries(category) {
        const baseName = getExportBaseName(category);
        const jsonBytes = utf8Bytes(JSON.stringify(buildJsonOutput(category), null, 2));
        const xlsxBytes = buildXlsxBytes(category);
        return [
            { path: `data/${baseName}.json`, bytes: jsonBytes, crc: crc32(jsonBytes) },
            { path: `data/${baseName}.xlsx`, bytes: xlsxBytes, crc: crc32(xlsxBytes) }
        ];
    }

    function generateFile(category, format) {
        const data = getStoredData();
        if (!data.length) { alert('无数据'); return; }
        const name = getExportBaseName(category);
        try {
            if (format === 'json') {
                const bytes = utf8Bytes(JSON.stringify(buildJsonOutput(category), null, 2));
                triggerDownload(new Blob([bytes], { type: 'application/json;charset=utf-8' }), `${name}.json`);
                return;
            }
            const bytes = buildXlsxBytes(category);
            triggerDownload(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
        } catch (error) {
            alert(error.message || error);
        }
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function init() {
        const context = detectContext();
        if (!context) return;
        if (context === 'profile') {
            renderSummaryButton(context);
            return;
        }
        renderFloatingButton(context);
        const state = getState();
        if (state.status === 'paused_for_download' && state.category === context) {
            showDownloadPanel(context);
        } else if (state.status === 'running' && state.category === context) {
            setTimeout(() => processPage(context, getSelectedFields()), 800);
        } else if (context !== 'generic' && new URL(location.href).searchParams.get('db_export') === '1') {
            setTimeout(showConfigPanel, 500);
        }
    }

    init();
})();
