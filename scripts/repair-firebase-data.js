/**
 * 一次性修復 Firebase 資料：
 * - table_settings：由 array+null 轉成 object
 * - floor_layout：還原簽到頁正確排位
 */
const https = require('https');

const BASE = 'https://wedding-seatern-default-rtdb.asia-southeast1.firebasedatabase.app';
const SIGNIN_FLOOR_LAYOUT = [
    ['.', '1', '2', '.'],
    ['.', '3', '4', '.'],
    ['11', '5', '6', '13'],
    ['12', '7', '8', '14'],
    ['.', '9', '10', '.']
];

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const data = body != null ? JSON.stringify(body) : null;
        const req = https.request(`${BASE}${path}.json`, {
            method,
            headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
        }, res => {
            let raw = '';
            res.on('data', chunk => { raw += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`${method} ${path} failed: ${res.statusCode} ${raw}`));
                    return;
                }
                resolve(raw ? JSON.parse(raw) : null);
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}

function normalizeTableSettings(raw) {
    const normalized = {};
    if (!raw) return normalized;

    const entries = Array.isArray(raw)
        ? raw.map((settings, idx) => [String(idx), settings])
        : Object.entries(raw);

    entries.forEach(([key, settings]) => {
        const tableNum = parseInt(key, 10);
        if (!tableNum || tableNum < 1 || !settings || typeof settings !== 'object') return;
        if (settings.x == null || settings.y == null) return;
        normalized[String(tableNum)] = settings;
    });

    return normalized;
}

async function main() {
    const rawSettings = await request('GET', '/table_settings');
    const tableSettings = normalizeTableSettings(rawSettings);
    console.log('table_settings keys:', Object.keys(tableSettings).join(', '));

    await request('DELETE', '/table_settings');
    await request('PUT', '/table_settings', tableSettings);
    const verify = await request('GET', '/table_settings');
    const isArray = Array.isArray(verify);
    console.log(isArray ? '⚠️ table_settings 仍係 array，請用新版 seating.js 開一次畫布' : '✅ table_settings repaired as object');
    if (!isArray) console.log('keys:', Object.keys(verify).join(', '));

    await request('PUT', '/floor_layout', SIGNIN_FLOOR_LAYOUT);
    console.log('✅ floor_layout restored');
}

main().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
