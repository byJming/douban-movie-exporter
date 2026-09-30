import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const bundle = read('douban-movie-exporter.bundled.user.js');

test('bundle is reproducible, has no @require, and retains the exact exporter body', () => {
    execFileSync(process.execPath, [fileURLToPath(new URL('scripts/build-bundled.mjs', root)), '--check']);
    assert.doesNotMatch(bundle.split('// ==/UserScript==')[0], /^\/\/ @require/m);
    assert.equal(bundle.split('// END BUNDLED DEPENDENCY\n')[1], read('douban-movie-exporter.user.js').split('// ==/UserScript==')[1]);
});

test('complete bundle creates its button without fetching a library', () => {
    const elements = [];
    const context = vm.createContext({
        location: { hostname: 'movie.douban.com', pathname: '/', href: 'https://movie.douban.com/' },
        document: { getElementById: () => null, createElement: tag => ({ tag }), body: { appendChild: el => elements.push(el) } },
        localStorage: { getItem: () => null },
        GM_addStyle: () => {},
        fetch: () => { throw new Error('Unexpected startup network request'); },
        GM_xmlhttpRequest: () => { throw new Error('Unexpected startup network request'); }
    });
    vm.runInContext(bundle, context, { timeout: 5000 });
    assert.equal(context.XLSX.version, '0.20.1');
    assert.ok(elements.some(el => el.id === 'db-export-summary-btn' && el.textContent.includes('汇总')));
});

test('embedded SheetJS round-trips Chinese titles, ratings, dates and comments', () => {
    const context = vm.createContext({});
    vm.runInContext(read('vendor/sheetjs-0.20.1/xlsx.full.min.js'), context, { timeout: 5000 });
    const x = context.XLSX;
    const rows = [['标题', '个人评分', '标记日期', '短评'], ['验证样本', 5, '2026-09-30', '中文短评']];
    const wb = x.utils.book_new();
    x.utils.book_append_sheet(wb, x.utils.aoa_to_sheet(rows), '看过');
    const bytes = x.write(wb, { type: 'array', bookType: 'xlsx' });
    const restored = x.read(bytes, { type: 'array' });
    assert.equal(JSON.stringify(x.utils.sheet_to_json(restored.Sheets['看过'], { header: 1 })), JSON.stringify(rows));
});
