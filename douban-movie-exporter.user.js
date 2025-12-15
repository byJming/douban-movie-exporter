// ==UserScript==
// @name         豆瓣电影数据导出工具
// @name:en      Douban Movie Export Tool
// @name:zh-CN   豆瓣电影数据导出工具
// @namespace    https://github.com/byJming/douban-movie-exporter
// @version      1.0.0
// @description  豆瓣观影记录导出工具：支持自定义导出字段（标题、评分、日期、标签、评语等）、导出 Excel/JSON 格式、自动适配列表模式、防风控机制。可用于AI观影分析。
// @description:en Export Douban movie watched list to Excel/JSON files with custom fields (Title, Rating, Date, Tags, Comments). Automatically handles pagination and anti-scraping delays.
// @author       ming
// @match        https://movie.douban.com/mine?status=collect*
// @match        https://movie.douban.com/people/*/collect*
// @require      https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js
// @grant        GM_addStyle
// @license      MIT
// @homepage     https://github.com/byJming/douban-movie-exporter
// @supportURL   https://github.com/byJming/douban-movie-exporter/issues
// ==/UserScript==

(function() {
    'use strict';

    // --- 样式注入 (美化 UI) ---
    GM_addStyle(`
        #db-export-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 10000; display: flex;
            justify-content: center; align-items: center; backdrop-filter: blur(2px);
        }
        #db-export-modal {
            background: white; padding: 25px; border-radius: 12px; width: 340px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2); font-family: sans-serif;
            animation: dbFadeIn 0.3s ease-out;
        }
        @keyframes dbFadeIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        #db-export-modal h3 { margin-top: 0; color: #333; border-bottom: 2px solid #3eaf7c; padding-bottom: 12px; font-size: 18px; }
        .db-checkbox-group { margin: 15px 0; display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; }
        .db-checkbox-label { display: flex; align-items: center; cursor: pointer; color: #444; font-size: 14px; user-select: none; }
        .db-checkbox-label input { margin-right: 10px; width: 16px; height: 16px; accent-color: #3eaf7c; cursor: pointer; }
        .db-btn-group { display: flex; justify-content: flex-end; gap: 10px; margin-top: 25px; }
        .db-btn { padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; transition: all 0.2s; font-size: 14px; }
        .db-btn-primary { background: #3eaf7c; color: white; }
        .db-btn-primary:hover { background: #339268; transform: translateY(-1px); }
        .db-btn-secondary { background: #f0f0f0; color: #666; }
        .db-btn-secondary:hover { background: #e0e0e0; }
        .db-export-floating-btn {
            position: fixed; top: 110px; right: 20px; z-index: 9999;
            padding: 10px 20px; background: #3eaf7c; color: white;
            border-radius: 30px; cursor: pointer; font-weight: bold;
            box-shadow: 0 4px 12px rgba(62, 175, 124, 0.4); transition: 0.3s;
            display: flex; align-items: center; gap: 6px;
        }
        .db-export-floating-btn:hover { background: #339268; transform: scale(1.05); }
    `);

    // --- 配置与状态 ---
    const CONFIG = {
        minDelay: 1500, // 最小延迟 (毫秒)
        maxDelay: 3500, // 最大延迟 (毫秒)
        storageKey: 'db_export_data_v1',
        statusKey: 'db_export_status', // 'idle', 'running', 'paused_for_download'
        configKey: 'db_export_user_config', // 存储用户选择的列
    };

    // 字段定义
    const FIELDS = [
        { key: 'title', name: '🎬 电影标题', default: true },
        { key: 'rating', name: '⭐ 个人评分', default: true },
        { key: 'date', name: '📅 标记日期', default: true },
        { key: 'tags', name: '🏷️ 标签 (Tags)', default: false },
        { key: 'comment', name: '📝 短评', default: true },
        { key: 'link', name: '🔗 豆瓣链接', default: true }
    ];

    // --- UI 逻辑 ---

    function init() {
        const status = localStorage.getItem(CONFIG.statusKey);

        // 如果是暂停等待下载状态，直接显示下载面板
        if (status === 'paused_for_download') {
            showDownloadPanel();
            return;
        }

        // 渲染悬浮按钮
        const btn = document.createElement('div');
        btn.className = 'db-export-floating-btn';

        if (status === 'running') {
            btn.innerHTML = '⏳ 正在抓取中...';
            btn.style.background = '#e6a23c';
            btn.style.boxShadow = '0 4px 12px rgba(230, 162, 60, 0.4)';
            setTimeout(processPage, 1000); // 自动继续任务
        } else {
            btn.innerHTML = '📤 导出观影记录';
            btn.onclick = showConfigPanel;
        }
        document.body.appendChild(btn);
    }

    // 1. 显示配置面板
    function showConfigPanel() {
        if (document.getElementById('db-export-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';

        let checkboxHtml = '';
        FIELDS.forEach(f => {
            checkboxHtml += `
                <label class="db-checkbox-label">
                    <input type="checkbox" value="${f.key}" ${f.default ? 'checked' : ''}>
                    ${f.name}
                </label>`;
        });

        overlay.innerHTML = `
            <div id="db-export-modal">
                <h3>🛠️ 导出设置</h3>
                <p style="font-size:13px; color:#666; margin-bottom:15px;">请选择需要导出的内容字段：</p>
                <div class="db-checkbox-group">
                    ${checkboxHtml}
                </div>
                <div class="db-btn-group">
                    <button class="db-btn db-btn-secondary" id="db-cancel-btn">取消</button>
                    <button class="db-btn db-btn-primary" id="db-start-btn">开始抓取</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('db-cancel-btn').onclick = () => document.body.removeChild(overlay);
        document.getElementById('db-start-btn').onclick = () => {
            const selected = Array.from(overlay.querySelectorAll('input:checked')).map(cb => cb.value);
            if (selected.length === 0) {
                alert('请至少选择一项！');
                return;
            }
            localStorage.setItem(CONFIG.configKey, JSON.stringify(selected));
            document.body.removeChild(overlay);
            startScraping();
        };
    }

    // 2. 显示下载面板
    function showDownloadPanel() {
        const floatBtn = document.querySelector('.db-export-floating-btn');
        if(floatBtn) floatBtn.style.display = 'none';

        if (document.getElementById('db-export-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'db-export-modal-overlay';

        const data = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');

        overlay.innerHTML = `
            <div id="db-export-modal">
                <h3>🎉 抓取完成</h3>
                <div style="text-align:center; padding: 10px 0;">
                    <p style="font-size:16px; color:#333; margin:5px 0;">共收集到 <b>${data.length}</b> 条数据</p>
                </div>
                <p style="font-size:13px; color:#666; margin-bottom:15px;">请选择导出格式：</p>
                <div class="db-btn-group" style="flex-direction: column; gap:10px;">
                    <button class="db-btn db-btn-primary" id="db-dl-xlsx">📊 导出 Excel (.xlsx) <span style="font-size:12px; opacity:0.8; font-weight:normal">推荐</span></button>
                    <button class="db-btn db-btn-primary" style="background:#2c3e50" id="db-dl-json">🤖 导出 JSON (AI分析专用)</button>
                    <button class="db-btn db-btn-secondary" id="db-close-finish">关闭并清理</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('db-dl-xlsx').onclick = () => generateFile('xlsx');
        document.getElementById('db-dl-json').onclick = () => generateFile('json');
        document.getElementById('db-close-finish').onclick = () => {
             localStorage.removeItem(CONFIG.storageKey);
             localStorage.setItem(CONFIG.statusKey, 'idle');
             window.location.reload();
        };
    }

    // --- 抓取核心逻辑 ---

    function startScraping() {
        // 强制切到 List 模式 (数据最全)
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('mode') !== 'list') {
            localStorage.setItem(CONFIG.statusKey, 'running');
            localStorage.setItem(CONFIG.storageKey, '[]');
            currentUrl.searchParams.set('mode', 'list');
            currentUrl.searchParams.set('start', '0');
            window.location.href = currentUrl.href;
            return;
        }

        localStorage.setItem(CONFIG.statusKey, 'running');
        localStorage.setItem(CONFIG.storageKey, '[]');
        processPage();
    }

    function processPage() {
        const delay = Math.floor(Math.random() * (CONFIG.maxDelay - CONFIG.minDelay) + CONFIG.minDelay);
        console.log(`[Douban Export] 正在解析... 下一页延迟: ${delay}ms`);

        setTimeout(() => {
            const pageData = scrapeCurrentPage();

            let allData = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');
            allData = allData.concat(pageData);
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(allData));

            const nextBtn = document.querySelector('span.next a');
            if (nextBtn) {
                window.location.href = nextBtn.href;
            } else {
                localStorage.setItem(CONFIG.statusKey, 'paused_for_download');
                showDownloadPanel();
            }
        }, delay);
    }

    function scrapeCurrentPage() {
        const items = document.querySelectorAll('.list-view .item');
        let results = [];

        items.forEach(item => {
            try {
                const titleEl = item.querySelector('.title a');
                // 移除 [可播放] 等杂乱标记
                const title = titleEl ? titleEl.innerText.trim().replace(/^\[.*?\]\s*/, '') : '';
                const link = titleEl ? titleEl.href : '';

                let rating = '';
                const ratingEl = item.querySelector('[class^="rating"][class$="-t"]');
                if (ratingEl) {
                    const match = ratingEl.className.match(/rating(\d)-t/);
                    if (match) rating = match[1];
                }

                const dateEl = item.querySelector('.date');
                const date = dateEl ? dateEl.innerText.trim() : '';

                const tagsEl = item.querySelector('.tags');
                const tags = tagsEl ? tagsEl.innerText.replace('标签: ', '').trim() : '';

                const commentEl = item.querySelector('.comment');
                const comment = commentEl ? commentEl.innerText.trim() : '';

                results.push({ title, rating, date, tags, comment, link });
            } catch (e) { console.error('Error parsing item', e); }
        });
        return results;
    }

    // --- 文件生成 (JSON / Excel) ---

    function generateFile(format) {
        const allData = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');
        const userConfig = JSON.parse(localStorage.getItem(CONFIG.configKey) || '["title","rating","date"]');

        if (allData.length === 0) { alert('无数据'); return; }

        const fileName = `Douban_Movie_Export_${new Date().toISOString().slice(0,10)}`;

        // JSON 导出逻辑
        if (format === 'json') {
            const exportObj = {
                meta: {
                    user: document.title.replace('我看过的影视', '').trim(),
                    export_date: new Date().toISOString(),
                    total_count: allData.length,
                    source: "Douban Movie Export Tool"
                },
                items: allData.map(item => {
                    let filteredItem = {};
                    if (userConfig.includes('title')) filteredItem.title = item.title;
                    if (userConfig.includes('rating')) filteredItem.user_rating = item.rating ? parseInt(item.rating) : null;
                    if (userConfig.includes('date')) filteredItem.mark_date = item.date;
                    if (userConfig.includes('tags')) filteredItem.tags = item.tags ? item.tags.split(' ') : [];
                    if (userConfig.includes('comment')) filteredItem.comment = item.comment;
                    if (userConfig.includes('link')) filteredItem.douban_url = item.link;
                    return filteredItem;
                })
            };
            const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
            triggerDownload(blob, fileName + '.json');
            return;
        }

        // Excel (.xlsx) 导出
        if (format === 'xlsx') {
            // 1. 准备表头
            const headerMap = {
                title: '电影标题', rating: '评分', date: '标记日期',
                tags: '标签', comment: '短评', link: '豆瓣链接'
            };
            const headers = userConfig.map(key => headerMap[key]);

            // 2. 准备数据行
            const sheetData = [headers];
            allData.forEach(item => {
                const row = userConfig.map(key => {
                    if (key === 'rating') return item.rating ? parseInt(item.rating) : '';
                    return item[key] || '';
                });
                sheetData.push(row);
            });

            // 3. 创建 Worksheet
            const ws = XLSX.utils.aoa_to_sheet(sheetData);

            // 4. 设置列宽
            const colWidths = userConfig.map(key => {
                switch(key) {
                    case 'title': return { wch: 40 };   // 标题宽
                    case 'rating': return { wch: 8 };   // 评分窄
                    case 'date': return { wch: 12 };    // 日期中等
                    case 'tags': return { wch: 25 };    // 标签中宽
                    case 'comment': return { wch: 50 }; // 短评很宽
                    case 'link': return { wch: 60 };    // 链接最宽
                    default: return { wch: 15 };
                }
            });
            ws['!cols'] = colWidths;

            // 5. 创建 Workbook 并导出
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "豆瓣观影记录");
            XLSX.writeFile(wb, fileName + '.xlsx');

            document.querySelector('#db-export-modal h3').innerText = '✅ 导出成功';
        }
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        document.querySelector('#db-export-modal h3').innerText = '✅ 导出成功';
    }

    // 启动
    init();

})();
