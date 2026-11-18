// ==UserScript==
// @name         115网盘番号查重与非番号清理助手
// @namespace    https://github.com/thevipsong/115-av-dedup-helper
// @version      5.1.0
// @description  专为115网盘设计的番号整理与查重神器：SHA1二进制同源查重、智能优选策略、分集独立保护、自定义模板重命名(重名冲突防护+字幕联动)、智能建夹归档与集中提取、残损小视频专查、元数据直达(JavBus/JavDB/AVSOX)、缩略图悬浮预览、清单导出与查漏比对、撤销还原、IndexedDB缓存、深色模式及Anti-WAF防风控装甲。
// @author       thevipsong
// @license      MIT
// @homepageURL  https://github.com/thevipsong/115-av-dedup-helper
// @supportURL   https://github.com/thevipsong/115-av-dedup-helper/issues
// @updateURL    https://raw.githubusercontent.com/thevipsong/115-av-dedup-helper/main/115-av-dedup-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/thevipsong/115-av-dedup-helper/main/115-av-dedup-helper.user.js
// @match        https://115.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const APP_VERSION = '5.1.0';
    const SETTINGS_KEY = 'av_dedup_settings_v5';
    const HISTORY_KEY = 'av_dedup_rename_history_v5';
    const DB_NAME = 'av_dedup_cache_v5';
    const DB_STORE = 'scans';
    const DAMAGED_VIDEO_THRESHOLD = 10 * 1024 * 1024; // 10MB 以下视频标为疑似残损

    const VIDEO_EXTS = new Set(['mp4', 'mkv', 'avi', 'wmv', 'mov', 'flv', 'ts', 'm2ts', 'rmvb', 'rm', 'mpg', 'mpeg', 'm4v', 'webm', 'vob', 'iso', '3gp']);
    const SUBTITLE_EXTS = new Set(['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx', 'sup']);
    const SIDECAR_EXTS = new Set(['nfo', 'jpg', 'jpeg', 'png', 'webp']);

    const ICONS = {
        target: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
        refresh: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`,
        bolt: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        clock: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
        sparkle: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
        alert: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
        list: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
        trash: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
        folder: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
        folderPlus: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>`,
        openDir: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        copy: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        check: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>`,
        search: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        shield: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        stop: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><rect width="8" height="8" x="8" y="8" rx="1"/></svg>`,
        edit: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
        info: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
        arrowRight: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
        settings: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        download: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        undo: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
        eye: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        external: `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
        sha: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>`,
        subtitle: `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><rect width="18" height="14" x="3" y="5" rx="2"/><path d="M7 15h4M15 15h2M7 11h2M13 11h4"/></svg>`
    };

    const DEFAULT_SETTINGS = {
        renameTemplate: 'default',       // 'default' | 'sub_uc' | 'badges' | 'custom'
        customTemplate: '{code}{part} {tags}.{ext}',
        syncSubtitles: true,
        preferredSearchSite: 'javbus',   // 'javbus' | 'javdb' | 'avsox'
        ignoreFolders: [],               // Array<string>
        customPrefixes: [],              // 自定义扩展前缀白名单
        customBlacklist: [],             // 自定义屏蔽词黑名单
        archiveMode: 'prefix',           // 'prefix' | 'movie_folder' | 'custom_cid'
        enableCache: true,
        cacheTtlMinutes: 30,             // 默认 30 分钟本地缓存有效期
        theme: 'auto'                    // 'auto' | 'light' | 'dark'
    };

    function safeGetLocalStorage(key, fallback) {
        try {
            if (typeof localStorage === 'undefined') return fallback;
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    }

    function safeSetLocalStorage(key, value) {
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(key, JSON.stringify(value));
        } catch (e) {
            console.warn('[115助手] 本地存储写入失败:', e);
        }
    }

    function getSettings() {
        return { ...DEFAULT_SETTINGS, ...(safeGetLocalStorage(SETTINGS_KEY, {}) || {}) };
    }

    function saveSettings(partial) {
        const next = { ...getSettings(), ...partial };
        safeSetLocalStorage(SETTINGS_KEY, next);
        applyThemeClass(next.theme);
        return next;
    }

    function resolveEffectiveTheme(themePref) {
        if (themePref === 'dark') return 'dark';
        if (themePref === 'light') return 'light';
        try {
            if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        } catch (e) {}
        return 'light';
    }

    function applyThemeClass(themePref) {
        if (typeof document === 'undefined') return;
        const mode = resolveEffectiveTheme(themePref || getSettings().theme);
        document.documentElement.setAttribute('data-av-theme', mode);
    }

    function getRenameHistory() {
        const list = safeGetLocalStorage(HISTORY_KEY, []);
        return Array.isArray(list) ? list : [];
    }

    function addRenameHistory(batch) {
        if (!batch || !batch.items || batch.items.length === 0) return;
        const list = getRenameHistory();
        list.unshift({
            id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6),
            time: new Date().toISOString(),
            cid: batch.cid || '0',
            count: batch.items.length,
            items: batch.items
        });
        safeSetLocalStorage(HISTORY_KEY, list.slice(0, 10));
    }

    function removeRenameHistory(id) {
        safeSetLocalStorage(HISTORY_KEY, getRenameHistory().filter(b => b.id !== id));
    }

    function clearRenameHistory() {
        safeSetLocalStorage(HISTORY_KEY, []);
    }

    // IndexedDB 本地扫描结果缓存管理器
    const CacheManager = {
        _open() {
            return new Promise((resolve, reject) => {
                if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'key' });
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = (e) => reject(e.target.error);
            });
        },
        async get(key, ttlMinutes = 30) {
            try {
                const db = await this._open();
                const entry = await new Promise((resolve) => {
                    const tx = db.transaction(DB_STORE, 'readonly');
                    const req = tx.objectStore(DB_STORE).get(key);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                });
                if (!entry) return null;
                if (ttlMinutes > 0 && entry.timestamp && (Date.now() - entry.timestamp > ttlMinutes * 60 * 1000)) {
                    return null; // 缓存已过有效期
                }
                return entry;
            } catch (e) {
                return null;
            }
        },
        async set(key, value) {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(DB_STORE, 'readwrite');
                    tx.objectStore(DB_STORE).put({ key, ...value, timestamp: Date.now() });
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                });
            } catch (e) {
                return false;
            }
        },
        async clearAll() {
            try {
                const db = await this._open();
                return await new Promise((resolve) => {
                    const tx = db.transaction(DB_STORE, 'readwrite');
                    tx.objectStore(DB_STORE).clear();
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                });
            } catch (e) {
                return false;
            }
        }
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function sanitizeHttpUrl(url) {
        if (!url) return '';
        const clean = String(url).trim();
        return /^https?:\/\//i.test(clean) ? clean : '';
    }

    function getFileExt(filename) {
        if (!filename) return '';
        const m = String(filename).match(/\.([a-zA-Z0-9]{2,5})$/);
        return m ? m[1].toLowerCase() : '';
    }

    function getFileStem(filename) {
        if (!filename) return '';
        return String(filename).replace(/\.[a-zA-Z0-9]{2,5}$/, '');
    }

    function isVideoFile(file) {
        if (!file) return false;
        const ext = getFileExt(file.n);
        if (VIDEO_EXTS.has(ext)) return true;
        if (SUBTITLE_EXTS.has(ext) || SIDECAR_EXTS.has(ext)) return false;
        return file.iv === 1;
    }

    function isSubtitleFile(file) {
        return Boolean(file && SUBTITLE_EXTS.has(getFileExt(file.n)));
    }

    function isDamagedVideoFile(file) {
        return isVideoFile(file) && Number(file.s || 0) < DAMAGED_VIDEO_THRESHOLD;
    }

    function formatFileNameHtml(filename) {
        if (!filename) return '';
        const m = filename.match(/^([^@\s]+@)(.+)$/);
        if (m) {
            return `<span class="av-ad-prefix">${escapeHtml(m[1])}</span><span class="av-file-main">${escapeHtml(m[2])}</span>`;
        }
        return `<span class="av-file-main">${escapeHtml(filename)}</span>`;
    }

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatRelativeTime(ts) {
        if (!ts) return '';
        const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (diffSec < 60) return '刚刚';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin} 分钟前`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour} 小时前`;
        return `${Math.floor(diffHour / 24)} 天前`;
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const sleepRandom = (minMs, maxMs) => {
        const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
        return new Promise(r => setTimeout(r, ms));
    };

    // 提取视频特征标签（规避 PART-C / DISC-C 等分集误判为中字）
    function extractBadges(name) {
        const badges = [];
        if (!name) return badges;
        const stemNoPart = String(name)
            .replace(/\.([a-zA-Z0-9]{2,5})$/, '')
            .replace(/[-_ ](?:part|disc|cd)[-_ ]?[a-z](?![a-z0-9])/gi, ' ');

        if (/4k|2160p/i.test(stemNoPart)) badges.push({ text: '4K', color: '#6f42c1', bg: '#f3e8ff' });
        if (/60fps|060fps/i.test(stemNoPart)) badges.push({ text: '60FPS', color: '#0d6efd', bg: '#e7f1ff' });
        if (/1080p|fhd/i.test(stemNoPart)) badges.push({ text: '1080P', color: '#0284c7', bg: '#e0f2fe' });
        if (/中文字幕|中字|破解|[-_](?:ch|chs|cht)(?=[\s\-_\[\(]|$)|[-_]c(?=[\s\-_\[\(]|$)/i.test(stemNoPart)) {
            badges.push({ text: '中字', color: '#15803d', bg: '#dcfce7' });
        }
        if (/uncensored|无码|leak|流出|[-_]uc(?=[\s\-_\[\(]|$)/i.test(stemNoPart)) {
            badges.push({ text: '无码', color: '#c2410c', bg: '#ffedd5' });
        }
        return badges;
    }

    // 番号与分集提取逻辑（支持自定义厂商白名单与屏蔽黑名单）
    function parseAvFileInfo(filename, options = {}) {
        if (!filename) return null;
        let name = String(filename).replace(/\.[a-zA-Z0-9]{2,5}$/, '');

        // 1. 剥离发布站网址前缀与后缀
        name = name.replace(/^[^@\s]+@/, '');
        name = name.replace(/[-_ ]*(?:www\.)?[a-zA-Z0-9]+\.(?:com|net|org|la|xyz|cc|top|me|tv|vip|club|app|site|live|link|info)[-_ ]*/gi, ' ');

        // 2. 分集识别 (4KS1/4KS2, CD1/CD2, Part1/Part2, 上集/下集, Part-A/B 等)
        let part = '';
        const mPartNum = name.match(/[-_ ](?:4ks|ks|s|ep|episode|disc|part|cd|分卷|卷|集)[-_ ]?([0-9]+)(?![0-9])/i);
        if (mPartNum) {
            part = 'PART' + parseInt(mPartNum[1], 10);
        } else if (/[-_ ]?(上集|上卷|前篇|上)(?=$|[-_ \[])/i.test(name)) {
            part = 'PART1';
        } else if (/[-_ ]?(中集|中卷|中)(?=$|[-_ \[])/i.test(name)) {
            part = 'PART2';
        } else if (/[-_ ]?(下集|下卷|后篇|下)(?=$|[-_ \[])/i.test(name)) {
            part = 'PART3';
        } else {
            const mPartChar = name.match(/[-_ ](cd|part|disc)[-_ ]?([a-z])(?![a-z0-9])/i);
            if (mPartChar) {
                part = mPartChar[1].toUpperCase() + '-' + mPartChar[2].toUpperCase();
            } else {
                const mEndChar = name.match(/[-_ ]([abAB])$/);
                if (mEndChar) {
                    part = 'PART-' + mEndChar[1].toUpperCase();
                } else {
                    const mEndNum = name.match(/[-_ ]([1-9])$/);
                    if (mEndNum) {
                        part = 'PART' + mEndNum[1];
                    }
                }
            }
        }

        // 3. 符号归一化
        let s = name.replace(/[\[\]\(\)\{\}【】（）_]+/g, ' ');
        let clean = s.replace(/(?:^|[\s\-_])(?:4k\d*fps|4ks\d*|4k|2k|8k|\d{3,4}fps|\d{3,4}p|fhd|uhd|hd|x264|x265|h264|h265|hevc|aac|dts|uncensored|leaked|中文字幕|无码流出|破解|ai修复|uc)(?=[\s\-_]|$)/gi, ' ');
        clean = clean.replace(/[- ]+(?:c|ch|cd\d*|part\d*)[- ]*$/gi, ' ');

        // 4. 用户自定义扩展前缀白名单优先匹配
        const customPrefixes = (options.customPrefixes || []).map(p => String(p).trim()).filter(Boolean);
        if (customPrefixes.length > 0) {
            const escaped = customPrefixes.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            const customRe = new RegExp(`(?<![a-zA-Z0-9])(${escaped})[- ]*([0-9]{1,7})(?![0-9])`, 'i');
            const cm = clean.match(customRe);
            if (cm) {
                const prefix = cm[1].toUpperCase();
                const numInt = parseInt(cm[2], 10);
                const normNum = numInt < 1000 ? String(numInt).padStart(3, '0') : String(numInt);
                const code = `${prefix}-${normNum}`;
                return { code, part, dedupKey: part ? `${code} [${part}]` : code };
            }
        }

        // 5. FC2 / Heyzo / Carib / 1Pondo / Tokyo-Hot / 六位日期
        let fc2 = clean.match(/(?<![a-zA-Z0-9])fc2[- ]*(?:ppv)?[- ]*(\d{5,8})(?![0-9])/i);
        if (fc2) return { code: `FC2-PPV-${fc2[1]}`, part, dedupKey: part ? `FC2-PPV-${fc2[1]} [${part}]` : `FC2-PPV-${fc2[1]}` };

        let heyzo = clean.match(/(?<![a-zA-Z0-9])heyzo[- ]*(\d{4})(?![0-9])/i);
        if (heyzo) return { code: `HEYZO-${heyzo[1]}`, part, dedupKey: part ? `HEYZO-${heyzo[1]} [${part}]` : `HEYZO-${heyzo[1]}` };

        let carib = clean.match(/(?<![a-zA-Z0-9])(?:carib|caribbean)[- ]*(\d{6})[- ]*(\d{3})(?![0-9])/i);
        if (carib) return { code: `CARIB-${carib[1]}-${carib[2]}`, part, dedupKey: part ? `CARIB-${carib[1]}-${carib[2]} [${part}]` : `CARIB-${carib[1]}-${carib[2]}` };

        let pondo = clean.match(/(?<![a-zA-Z0-9])(?:1pon|1pondo)[- ]*(\d{6})[- ]*(\d{3})(?![0-9])/i);
        if (pondo) return { code: `1PONDO-${pondo[1]}-${pondo[2]}`, part, dedupKey: part ? `1PONDO-${pondo[1]}-${pondo[2]} [${part}]` : `1PONDO-${pondo[1]}-${pondo[2]}` };

        let tokyo = clean.match(/(?<![a-zA-Z0-9])tokyo[- ]*hot[- ]*(?:ge|k|n)?(\d{3,4})(?![0-9])/i);
        if (tokyo) return { code: `TOKYO-HOT-${tokyo[1]}`, part, dedupKey: part ? `TOKYO-HOT-${tokyo[1]} [${part}]` : `TOKYO-HOT-${tokyo[1]}` };

        let dateCode = clean.match(/(?<!\d)(\d{6})[- ](\d{2,4})(?!\d)/);
        if (dateCode) return { code: `${dateCode[1]}-${dateCode[2]}`, part, dedupKey: part ? `${dateCode[1]}-${dateCode[2]} [${part}]` : `${dateCode[1]}-${dateCode[2]}` };

        // 6. 标准厂商前缀 + 编号 (逐个扫描跳过技术黑名单与自定义屏蔽词)
        let pattern = /(?<![a-zA-Z0-9])([a-zA-Z]{2,10}|\d{1,4}[a-zA-Z]{2,8}|[a-zA-Z]\d{2,3}|s2m)[- ]*([0-9]{1,6})[- ]*(?![0-9])/gi;
        const blacklist = new Set([
            'PART', 'DISC', 'EPISODE', 'SEASON', 'HEVC', 'AAC', 'DTS', 'MKV', 'MP4', 'AVI', 'ISO',
            'FHD', 'UHD', 'X264', 'X265', 'H264', 'H265', 'SHA', 'RAW', 'HDR', 'SAMPLE', 'DEMO',
            'TEST', 'TRAILER', 'PREVIEW', 'CLIP', 'AC3', 'FLAC', 'MP3', 'REMUX', 'BDRIP', 'WEBRIP',
            'DVDRIP', 'AV1', 'FPS', 'VOL', 'WIN',
            ...(options.customBlacklist || []).map(w => String(w).trim().toUpperCase()).filter(Boolean)
        ]);
        for (const m of clean.matchAll(pattern)) {
            let prefix = m[1].toUpperCase();
            let rawNum = m[2];
            if (!blacklist.has(prefix)) {
                let numInt = parseInt(rawNum, 10);
                let normNum = numInt < 1000 ? String(numInt).padStart(3, '0') : String(numInt);
                const code = `${prefix}-${normNum}`;
                return { code, part, dedupKey: part ? `${code} [${part}]` : code };
            }
        }
        return null;
    }

    function buildRenameTags(file) {
        const texts = extractBadges(file.n).map(b => b.text);
        return {
            c: texts.includes('中字') ? '-C' : '',
            uc: texts.includes('无码') ? '-UC' : '',
            tags: texts.map(t => `[${t}]`).join(''),
            badges: texts
        };
    }

    function getStandardAvName(file, templateKey = 'default', customTemplate = '{code}{part}.{ext}') {
        if (!file || !file.n) return '';
        const extRaw = getFileExt(file.n);
        const ext = extRaw ? `.${extRaw}` : '';
        const parsedCode = file.parsedCode;
        if (!parsedCode) return file.n;

        const part = file.partInfo ? `_${file.partInfo}` : '';
        const meta = buildRenameTags(file);

        let pattern = '{code}{part}.{ext}';
        if (templateKey === 'sub_uc') pattern = '{code}{part}{c}{uc}.{ext}';
        else if (templateKey === 'badges') pattern = '{code}{part} {tags}.{ext}';
        else if (templateKey === 'custom' && customTemplate) pattern = customTemplate;

        let stemPattern = pattern.replace(/\.?\{ext\}/gi, '');
        let stem = stemPattern
            .replace(/\{code\}/gi, parsedCode)
            .replace(/\{part\}/gi, part)
            .replace(/\{c\}/gi, meta.c)
            .replace(/\{uc\}/gi, meta.uc)
            .replace(/\{tags\}/gi, meta.tags)
            .replace(/\s+/g, ' ')
            .replace(/[\\/:*?"<>|]/g, '_')
            .trim()
            .replace(/[-_\s]+$/g, '');

        if (!stem) stem = parsedCode + part;
        return `${stem}${ext}`;
    }

    function findPairedSubtitles(videoFile, subtitleFiles, parseOptions = {}) {
        if (!videoFile || !subtitleFiles || subtitleFiles.length === 0) return [];
        const videoCid = String(videoFile.cid || '');
        const videoStem = getFileStem(videoFile.n).toLowerCase();
        const parsedCode = videoFile.parsedCode || '';
        const partInfo = videoFile.partInfo || '';

        const matched = [];
        for (const sub of subtitleFiles) {
            if (String(sub.cid || '') !== videoCid) continue;
            const subStemRaw = getFileStem(sub.n);
            const langMatch = subStemRaw.match(/(\.(?:chs|cht|zh|chi|cn|sc|tc|eng|en|jp|jpn|中文|简体|繁体))$/i);
            const langSuffix = langMatch ? langMatch[1] : '';
            const subPureStem = langMatch ? subStemRaw.slice(0, -langMatch[1].length) : subStemRaw;

            if (subPureStem.toLowerCase() === videoStem) {
                matched.push({ file: sub, langSuffix });
                continue;
            }
            if (parsedCode) {
                const subInfo = parseAvFileInfo(sub.n, parseOptions);
                if (subInfo && subInfo.code === parsedCode && (!partInfo || !subInfo.part || subInfo.part === partInfo)) {
                    matched.push({ file: sub, langSuffix });
                }
            }
        }
        return matched;
    }

    function getPairedSubNewName(subFile, langSuffix, newVideoName) {
        const subExt = getFileExt(subFile.n);
        const videoStem = getFileStem(newVideoName);
        return `${videoStem}${langSuffix || ''}${subExt ? '.' + subExt : ''}`;
    }

    function planBatchRename(targetFiles, allScannedFiles, subtitleFiles, settings) {
        const tplKey = settings ? settings.renameTemplate : 'default';
        const customTpl = settings ? settings.customTemplate : '';
        const syncSub = settings ? settings.syncSubtitles !== false : true;
        const parseOptions = settings ? {
            customPrefixes: settings.customPrefixes || [],
            customBlacklist: settings.customBlacklist || []
        } : {};

        // O(N) 预构建目录文件名与字幕索引
        const dirFileHolderByName = new Map(); // cid -> Map<lowercaseName, fid>
        for (const f of (allScannedFiles || [])) {
            const cid = String(f.cid || '');
            if (!dirFileHolderByName.has(cid)) dirFileHolderByName.set(cid, new Map());
            dirFileHolderByName.get(cid).set(f.n.toLowerCase(), String(f.fid));
        }

        const subsByCid = new Map();
        for (const s of (subtitleFiles || [])) {
            const scid = String(s.cid || '');
            if (!subsByCid.has(scid)) subsByCid.set(scid, []);
            subsByCid.get(scid).push(s);
        }

        const sourceFidsInBatch = new Set(targetFiles.map(f => String(f.fid)));
        const dirClaimedTargets = new Map();

        const renameItems = [];
        const conflictItems = [];
        const pairedSubItems = [];
        let skippedSameCount = 0;

        for (const file of targetFiles) {
            const cid = String(file.cid || '');
            const newName = getStandardAvName(file, tplKey, customTpl);
            if (!newName || newName.toLowerCase() === file.n.toLowerCase()) {
                skippedSameCount++;
                continue;
            }

            const newLower = newName.toLowerCase();
            if (!dirClaimedTargets.has(cid)) dirClaimedTargets.set(cid, new Map());
            const claimedInDir = dirClaimedTargets.get(cid);

            if (claimedInDir.has(newLower)) {
                conflictItems.push({ fid: file.fid, cid, oldName: file.n, newName, reason: '同目录多版本重名冲突' });
                continue;
            }

            const existingMap = dirFileHolderByName.get(cid);
            const holderFid = existingMap ? existingMap.get(newLower) : undefined;
            if (holderFid && !sourceFidsInBatch.has(holderFid)) {
                conflictItems.push({ fid: file.fid, cid, oldName: file.n, newName, reason: '目录内已存在同名文件' });
                continue;
            }

            claimedInDir.set(newLower, String(file.fid));
            renameItems.push({ fid: file.fid, cid, oldName: file.n, newName, isSub: false });

            if (syncSub) {
                const dirSubs = subsByCid.get(cid) || [];
                const subs = findPairedSubtitles(file, dirSubs, parseOptions);
                for (const { file: subFile, langSuffix } of subs) {
                    const subNewName = getPairedSubNewName(subFile, langSuffix, newName);
                    if (subNewName && subNewName.toLowerCase() !== subFile.n.toLowerCase()) {
                        const subLower = subNewName.toLowerCase();
                        if (!claimedInDir.has(subLower) && !(existingMap && existingMap.has(subLower))) {
                            claimedInDir.set(subLower, String(subFile.fid));
                            pairedSubItems.push({ fid: subFile.fid, cid, oldName: subFile.n, newName: subNewName, isSub: true });
                        }
                    }
                }
            }
        }

        return { renameItems, pairedSubItems, conflictItems, skippedSameCount };
    }

    function getArchiveFolderName(file, mode = 'prefix') {
        if (!file || !file.parsedCode) return '';
        const code = file.parsedCode;
        if (mode === 'movie_folder') return code;
        if (code.startsWith('FC2-')) return 'FC2';
        if (code.startsWith('HEYZO-')) return 'HEYZO';
        if (code.startsWith('CARIB-')) return 'CARIB';
        if (code.startsWith('1PONDO-')) return '1PONDO';
        if (code.startsWith('TOKYO-HOT-')) return 'TOKYO-HOT';
        if (/^\d{6}-\d{2,4}$/.test(code)) return '无码日期';
        const dashIdx = code.indexOf('-');
        return dashIdx > 0 ? code.slice(0, dashIdx) : '其他番号';
    }

    // 预规划归档分桶（Set 去重 fid，支持按前缀/一影一夹/指定目标 CID）
    function planArchiveBuckets(targetFiles, subtitleFiles, mode, customTargetCid = '', syncSubtitles = true) {
        const buckets = new Map(); // folderKey -> Set<fid>
        for (const f of targetFiles) {
            if (mode === 'custom_cid') {
                const tc = String(customTargetCid || '').trim();
                if (!tc || String(f.cid) === tc) continue;
                if (!buckets.has(tc)) buckets.set(tc, new Set());
                buckets.get(tc).add(String(f.fid));
                if (syncSubtitles) {
                    findPairedSubtitles(f, subtitleFiles).forEach(({ file: s }) => buckets.get(tc).add(String(s.fid)));
                }
                continue;
            }
            const targetFolderName = getArchiveFolderName(f, mode);
            if (!targetFolderName || f.relPath === `/${targetFolderName}`) continue;
            if (!buckets.has(targetFolderName)) buckets.set(targetFolderName, new Set());
            buckets.get(targetFolderName).add(String(f.fid));
            if (syncSubtitles) {
                findPairedSubtitles(f, subtitleFiles).forEach(({ file: s }) => buckets.get(targetFolderName).add(String(s.fid)));
            }
        }
        return buckets;
    }

    // 过滤空文件夹选中列表：若祖先空目录已被勾选，则剔除后代空子目录（杜绝父子同删报错）
    function filterTopLevelEmptyFolders(selectedCids, emptyFoldersList) {
        const selectedSet = new Set(selectedCids.map(String));
        const folderByCid = new Map();
        for (const f of (emptyFoldersList || [])) folderByCid.set(String(f.cid), f);

        return selectedCids.map(String).filter(cid => {
            let cur = folderByCid.get(cid);
            const visited = new Set([cid]);
            while (cur && cur.pid) {
                const pid = String(cur.pid);
                if (visited.has(pid)) break;
                visited.add(pid);
                if (selectedSet.has(pid)) return false; // 祖先目录也在本次删除列表中，无需重复删子节点
                cur = folderByCid.get(pid);
            }
            return true;
        });
    }

    // 智能挑选每组最值得保留的一个文件 ('smart' | 'smaller' | 'older')
    function pickBestKeeperFile(items, strategy = 'smart') {
        if (!items || items.length === 0) return null;
        if (items.length === 1) return items[0];

        if (strategy === 'smaller') {
            const maxSize = Math.max(...items.map(i => Number(i.s || 0)));
            return items.find(i => Number(i.s || 0) === maxSize) || items[0];
        }
        if (strategy === 'older') {
            const sorted = [...items].sort((a, b) => new Date(b.t || 0).getTime() - new Date(a.t || 0).getTime());
            return sorted[0];
        }

        // 'smart' 综合优劣评分：体积主权重 + 画质/中字权重 + 已在子目录归档权重 + 已规范命名 + 修改时间
        const maxSize = Math.max(...items.map(i => Number(i.s || 0)), 1);
        const scoreItem = (file) => {
            const sizeScore = (Number(file.s || 0) / maxSize) * 1000;
            const badges = extractBadges(file.n).map(b => b.text);
            let bonus = 0;
            if (badges.includes('中字')) bonus += 60;
            if (badges.includes('4K')) bonus += 40;
            if (badges.includes('无码')) bonus += 20;
            if (file.relPath && file.relPath !== '/') bonus += 15; // 已归档子目录优于散落根目录
            if (file.parsedCode && getStandardAvName(file).toLowerCase() === String(file.n || '').toLowerCase()) bonus += 10;
            const timeBonus = Math.min(9, new Date(file.t || 0).getTime() / 1e12);
            return sizeScore + bonus + timeBonus;
        };
        return [...items].sort((a, b) => scoreItem(b) - scoreItem(a))[0];
    }

    // 构建核心索引（纯函数，兼用于首次扫描与本地乐观更新）
    function buildScanIndexes(files, settings = {}) {
        const parseOpts = {
            customPrefixes: settings.customPrefixes || [],
            customBlacklist: settings.customBlacklist || []
        };
        const allGroups = {};
        const duplicateGroups = {};
        const shaDuplicateGroups = {};
        const unparsedFiles = [];
        const subtitleFiles = [];

        const shaMap = {};
        let videoCount = 0;
        let validVideoCount = 0;

        for (const f of (files || [])) {
            if (f.sha && Number(f.s || 0) > 0) {
                const shaKey = `${f.sha}_${f.s}`;
                if (!shaMap[shaKey]) shaMap[shaKey] = [];
                shaMap[shaKey].push(f);
            }
            if (isSubtitleFile(f)) {
                subtitleFiles.push(f);
                unparsedFiles.push(f);
                continue;
            }
            if (!isVideoFile(f)) {
                unparsedFiles.push(f);
                continue;
            }
            videoCount++;
            const info = parseAvFileInfo(f.n, parseOpts);
            if (info) {
                validVideoCount++;
                if (!allGroups[info.dedupKey]) allGroups[info.dedupKey] = [];
                allGroups[info.dedupKey].push({ ...f, parsedCode: info.code, partInfo: info.part });
            } else {
                unparsedFiles.push(f);
            }
        }

        const fidToParsed = new Map();
        for (const items of Object.values(allGroups)) {
            for (const item of items) fidToParsed.set(String(item.fid), item);
        }

        let dupGroupCount = 0;
        let redundantSize = 0;
        for (const [key, items] of Object.entries(allGroups)) {
            if (items.length > 1) {
                duplicateGroups[key] = items;
                dupGroupCount++;
                const maxSize = Math.max(...items.map(i => Number(i.s || 0)));
                items.forEach(i => { if (Number(i.s || 0) !== maxSize) redundantSize += Number(i.s || 0); });
            }
        }

        let shaGroupCount = 0;
        for (const [shaKey, items] of Object.entries(shaMap)) {
            if (items.length > 1) {
                shaGroupCount++;
                shaDuplicateGroups[shaKey] = items.map(f => fidToParsed.get(String(f.fid)) || f);
            }
        }

        return {
            allGroups,
            duplicateGroups,
            shaDuplicateGroups,
            unparsedFiles,
            subtitleFiles,
            videoCount,
            validVideoCount,
            dupGroupCount,
            shaGroupCount,
            redundantSize
        };
    }

    function matchesFilters(item, { searchQuery = '', activeTagFilter = 'all', settings = {}, pairedSubMap = new Map() }) {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const hit = (item.parsedCode && item.parsedCode.toLowerCase().includes(q))
                || (item.n && item.n.toLowerCase().includes(q))
                || (item.relPath && item.relPath.toLowerCase().includes(q))
                || (item.sha && item.sha.toLowerCase().includes(q));
            if (!hit) return false;
        }
        if (activeTagFilter === 'all') return true;
        if (activeTagFilter === 'needRename') {
            if (!item.parsedCode) return false;
            const std = getStandardAvName(item, settings.renameTemplate, settings.customTemplate);
            return Boolean(std && std.toLowerCase() !== String(item.n || '').toLowerCase());
        }
        if (activeTagFilter === 'hasSub') return pairedSubMap.has(String(item.fid));
        if (activeTagFilter === 'damaged') return isDamagedVideoFile(item);
        return extractBadges(item.n).map(b => b.text).includes(activeTagFilter);
    }

    function filterAndSortGroupKeys(targetGroups, { searchQuery = '', activeTagFilter = 'all', currentSort = 'default', settings = {}, pairedSubMap = new Map() }) {
        const q = (searchQuery || '').toLowerCase();
        let keys = Object.keys(targetGroups).filter(k => {
            if (q && k.toLowerCase().includes(q) && activeTagFilter === 'all') return true;
            return targetGroups[k].some(item => matchesFilters(item, { searchQuery: q, activeTagFilter, settings, pairedSubMap }));
        });
        if (currentSort === 'default') return keys;
        return keys.sort((a, b) => {
            const itemsA = targetGroups[a];
            const itemsB = targetGroups[b];
            if (currentSort === 'size-desc') return Math.max(...itemsB.map(i => i.s)) - Math.max(...itemsA.map(i => i.s));
            if (currentSort === 'size-asc') return Math.min(...itemsA.map(i => i.s)) - Math.min(...itemsB.map(i => i.s));
            if (currentSort === 'time-desc') {
                return Math.max(...itemsB.map(i => new Date(i.t || 0).getTime())) - Math.max(...itemsA.map(i => new Date(i.t || 0).getTime()));
            }
            if (currentSort === 'code-asc') return a.localeCompare(b);
            return 0;
        });
    }

    function getJunkCategory(file) {
        const ext = getFileExt(file.n);
        const size = Number(file.s || 0);
        if (SUBTITLE_EXTS.has(ext)) return { label: '外挂字幕(保护)', color: '#15803d', bg: '#dcfce7', isProtected: true };
        if (SIDECAR_EXTS.has(ext)) return { label: '海报/信息文件', color: '#4338ca', bg: '#e0e7ff', isProtected: true };
        if (['html', 'htm', 'url', 'chm'].includes(ext)) return { label: '广告网页', color: '#856404', bg: '#fff3cd', isProtected: false };
        if (['txt', 'nfo', 'torrent', 'doc', 'docx'].includes(ext)) return { label: '文本广告', color: '#0c5460', bg: '#d1ecf1', isProtected: false };
        if (VIDEO_EXTS.has(ext) && size === 0) return { label: '空视频(0B)', color: '#991b1b', bg: '#fee2e2', isProtected: false };
        if (VIDEO_EXTS.has(ext) && size < 50 * 1024 * 1024) return { label: '推广/残损短片', color: '#721c24', bg: '#f8d7da', isProtected: false };
        return { label: '未识别文件', color: '#495057', bg: '#e9ecef', isProtected: false };
    }

    function getMetadataSearchUrl(code, site = 'javbus') {
        if (!code) return '#';
        const cleanCode = encodeURIComponent(code);
        if (site === 'javdb') return `https://javdb.com/search?q=${cleanCode}&f=all`;
        if (site === 'avsox') return `https://avsox.click/cn/search/${cleanCode}`;
        return `https://www.javbus.com/search/${cleanCode}`;
    }

    function compareCodeLibrary(inputText, allGroupsMap, options = {}) {
        if (!inputText || !inputText.trim()) return { owned: [], missing: [] };
        const ownedCodes = new Set();
        for (const items of Object.values(allGroupsMap || {})) {
            for (const f of items) {
                if (f.parsedCode) ownedCodes.add(f.parsedCode.toUpperCase());
            }
        }
        const lines = inputText.split(/[\r\n,;，；]+/).map(s => s.trim()).filter(Boolean);
        const seenInput = new Set();
        const owned = [];
        const missing = [];
        for (const line of lines) {
            const wholeInfo = parseAvFileInfo(line, options);
            if (wholeInfo) {
                const code = wholeInfo.code.toUpperCase();
                if (!seenInput.has(code)) {
                    seenInput.add(code);
                    if (ownedCodes.has(code)) owned.push(code); else missing.push(code);
                }
                continue;
            }
            for (const token of line.split(/\s+/)) {
                const info = parseAvFileInfo(token, options);
                const code = info ? info.code.toUpperCase() : null;
                if (!code || seenInput.has(code)) continue;
                seenInput.add(code);
                if (ownedCodes.has(code)) owned.push(code); else missing.push(code);
            }
        }
        return { owned, missing };
    }

    // 统一响应解析与 WAF 探针
    async function parseSafeResponse(resp) {
        if (resp.status === 429 || resp.status === 403) {
            const err = new Error('115服务器限制了请求频率 (HTTP ' + resp.status + ')');
            err.isRateLimited = true;
            throw err;
        }
        const text = await resp.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (parseErr) {
            const isRateLimitHtml = /频繁|验证|安全验证|滑块|captcha|拒绝访问|waf|forbidden|robot/i.test(text);
            const err = new Error(isRateLimitHtml ? '115接口触发官方安全验证或访问限制' : '115接口返回非JSON数据');
            if (isRateLimitHtml) err.isRateLimited = true;
            throw err;
        }
        if (data && data.state === false) {
            const errMsg = data.msg || data.error || '';
            const errCode = String(data.code || '');
            const isRateLimitedJson = errCode === '99' || errCode === '990001' || /频繁|请稍候|验证|慢一些|操作过快/i.test(errMsg);
            if (isRateLimitedJson) {
                const err = new Error('115频控限制: ' + (errMsg || '访问过于频繁 (Code ' + errCode + ')'));
                err.isRateLimited = true;
                throw err;
            }
        }
        return data;
    }

    async function safeFetchJson(url) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const resp = await fetch(url, { credentials: 'include' });
                return await parseSafeResponse(resp);
            } catch (err) {
                lastErr = err;
                if (err.isRateLimited || attempt === 1) throw err;
                await sleep(300);
            }
        }
        throw lastErr;
    }

    async function safeFetchPostJson(url, body) {
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body,
                credentials: 'include'
            });
            return await parseSafeResponse(resp);
        } catch (err) {
            if (err.isRateLimited) throw err;
            throw new Error(err.message || '写入请求网络异常');
        }
    }

    // 注入全局主题与共享 CSS 样式表（支持 Light / Dark）
    function injectGlobalStyles() {
        if (typeof document === 'undefined' || document.getElementById('av-dedup-global-css')) return;
        const style = document.createElement('style');
        style.id = 'av-dedup-global-css';
        style.textContent = `
            :root, [data-av-theme="light"] {
                --av-bg: #ffffff;
                --av-surface: #f8fafc;
                --av-surface-2: #f1f5f9;
                --av-border: #e2e8f0;
                --av-border-dashed: #f1f5f9;
                --av-text: #0f172a;
                --av-text-secondary: #475569;
                --av-text-muted: #64748b;
                --av-text-soft: #94a3b8;
                --av-hover: #f8fafc;
                --av-input-bg: #ffffff;
            }
            [data-av-theme="dark"] {
                --av-bg: #0f172a;
                --av-surface: #1e293b;
                --av-surface-2: #334155;
                --av-border: #334155;
                --av-border-dashed: #1e293b;
                --av-text: #f1f5f9;
                --av-text-secondary: #cbd5e1;
                --av-text-muted: #94a3b8;
                --av-text-soft: #64748b;
                --av-hover: #1e293b;
                --av-input-bg: #0f172a;
            }
            @keyframes spin { to { transform: rotate(360deg); } }
            .av-ad-prefix { color: var(--av-text-soft); font-weight: 400; font-size: 12px; }
            .av-file-main { color: var(--av-text); font-weight: 500; }
            .file-row { transition: background 0.15s ease; cursor: pointer; }
            .file-row:hover { background: var(--av-hover) !important; }
            .file-row .row-hover-actions { opacity: 0.72; transition: opacity 0.15s ease; }
            .file-row:hover .row-hover-actions { opacity: 1 !important; }
            .file-row .row-open-dir { opacity: 0; visibility: hidden; transition: all 0.15s ease; }
            .file-row:hover .row-open-dir { opacity: 1 !important; visibility: visible !important; color: #0284c7 !important; background: rgba(2,132,199,0.12) !important; border-color: rgba(2,132,199,0.35) !important; }
            .nav-tab { transition: all 0.15s ease; border-bottom: 2px solid transparent; }
            .nav-tab:hover { color: #3b82f6 !important; }
            .tab-badge { font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 10px; background: var(--av-surface-2); color: var(--av-text-soft); font-variant-numeric: tabular-nums; line-height: 1.4; }
            .tab-badge.active { background: #dbeafe !important; color: #2563eb !important; }
            .tab-badge.has-num:not(.active) { background: var(--av-border); color: var(--av-text-secondary); }
            .tool-btn { transition: all 0.15s ease; white-space: nowrap; flex-shrink: 0; }
            .tool-btn:not(:disabled):hover { filter: brightness(0.96); }
            .header-icon-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 10px; border-radius:6px; border:1px solid var(--av-border); background:var(--av-bg); color:var(--av-text-secondary); font-size:12px; font-weight:500; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
            .header-icon-btn:hover { background:var(--av-surface-2); color:var(--av-text); }
            .filter-pill { padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; cursor:pointer; border:1px solid var(--av-border); background:var(--av-bg); color:var(--av-text-muted); transition:all 0.15s; white-space:nowrap; }
            .filter-pill:hover { color:var(--av-text); }
            .filter-pill.active { background:#eff6ff; color:#2563eb; border-color:#93c5fd; }
            .av-modal-surface { background: var(--av-bg); color: var(--av-text); }
            .av-subsurface { background: var(--av-surface); border-color: var(--av-border); }
            .av-input { background: var(--av-input-bg); color: var(--av-text); border: 1px solid var(--av-border); }
        `;
        document.head.appendChild(style);
    }

    // 现代化模态弹窗系统
    function showCustomDialog({
        type = 'confirm', title = '操作提示', subtitle = '', items = [],
        conflictCount = 0, pairedSubCount = 0, totalCount = 0,
        confirmText = '确定', cancelText = '取消', isDanger = false, iconType = 'alert'
    }) {
        applyThemeClass();
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', inset: '0', backgroundColor: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(8px)',
                zIndex: '200000', display: 'flex', justifyContent: 'center', alignItems: 'center',
                opacity: '0', transition: 'opacity 0.2s ease',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
            });

            let iconSvg = ICONS.alert, iconColor = '#f59e0b', iconBg = '#fef3c7';
            if (iconType === 'edit') { iconSvg = ICONS.edit; iconColor = '#4f46e5'; iconBg = '#eef2ff'; }
            else if (iconType === 'folderPlus') { iconSvg = ICONS.folderPlus; iconColor = '#0284c7'; iconBg = '#e0f2fe'; }
            else if (iconType === 'trash' || isDanger) { iconSvg = ICONS.trash; iconColor = '#e11d48'; iconBg = '#ffe4e6'; }
            else if (iconType === 'info') { iconSvg = ICONS.info; iconColor = '#0284c7'; iconBg = '#e0f2fe'; }

            let bodyHtml = '';
            if (type === 'preview-rename') {
                const previewItemsHtml = items.map((item, idx) => `
                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:10px 14px; margin-bottom:8px;">
                        <div style="display:flex; align-items:center; gap:6px; color:var(--av-text-muted); font-size:12px; margin-bottom:6px;">
                            <span style="background:var(--av-surface-2); color:var(--av-text-secondary); font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px;">${item.isSub ? '联动字幕' : '原文件 #' + (idx + 1)}</span>
                            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="${escapeHtml(item.oldName)}">${escapeHtml(item.oldName)}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="color:#6366f1; display:flex; align-items:center;">${ICONS.arrowRight}</span>
                            <span style="background:${item.isSub ? '#dcfce7' : '#eef2ff'}; color:${item.isSub ? '#15803d' : '#4338ca'}; border:1px solid ${item.isSub ? '#bbf7d0' : '#c7d2fe'}; font-family:ui-monospace, monospace; font-size:12px; font-weight:600; padding:2px 8px; border-radius:4px;">${escapeHtml(item.newName)}</span>
                        </div>
                    </div>
                `).join('');

                const moreText = totalCount > items.length
                    ? `<div style="text-align:center; color:var(--av-text-soft); font-size:12px; padding:6px 0;">... 以及另外 <b>${totalCount - items.length}</b> 个项目</div>` : '';
                const conflictWarn = conflictCount > 0
                    ? `<div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:8px 12px; font-size:12px; color:#92400e; margin-top:8px; display:flex; align-items:center; gap:6px;">${ICONS.alert} <span>已安全跳过 <b>${conflictCount}</b> 个同目录重名冲突文件（建议先在「重复番号」去重）。</span></div>` : '';
                const subNotice = pairedSubCount > 0
                    ? `<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 12px; font-size:12px; color:#15803d; margin-top:8px; display:flex; align-items:center; gap:6px;">${ICONS.subtitle} <span>已识别 <b>${pairedSubCount}</b> 个同目录外挂字幕文件，将同步跟进重命名！</span></div>` : '';

                bodyHtml = `
                    <div style="margin-bottom:12px; font-size:13px; color:var(--av-text-secondary);">共准备重命名 <b style="color:#4f46e5; font-size:15px;">${totalCount}</b> 个项目：</div>
                    <div style="max-height:240px; overflow-y:auto; padding-right:4px;">${previewItemsHtml}${moreText}</div>
                    ${subNotice}${conflictWarn}
                    <div style="background:var(--av-surface-2); border:1px solid var(--av-border); border-radius:6px; padding:8px 12px; font-size:11px; color:var(--av-text-muted); margin-top:10px; display:flex; align-items:center; gap:6px;">
                        ${ICONS.shield} <span>已开启 Anti-WAF 写入保护 + 操作完本地乐观刷新（免重复扫盘）+ 撤销快照。</span>
                    </div>
                `;
            } else {
                bodyHtml = `<div style="font-size:13px; color:var(--av-text-secondary); line-height:1.6; white-space:pre-line; max-height:360px; overflow-y:auto;">${escapeHtml(subtitle)}</div>`;
            }

            const btnConfirmBg = isDanger ? 'linear-gradient(135deg, #e11d48 0%, #be123c 100%)' : 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)';
            overlay.innerHTML = `
                <div class="av-dialog-card av-modal-surface" style="width:540px; max-width:92vw; border-radius:14px; border:1px solid var(--av-border); box-shadow:0 20px 48px rgba(0,0,0,0.28); overflow:hidden; transform:scale(0.95); transition:transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
                    <div style="padding:18px 24px; border-bottom:1px solid var(--av-border); display:flex; align-items:center; gap:12px;">
                        <div style="width:36px; height:36px; border-radius:10px; background:${iconBg}; color:${iconColor}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${iconSvg}</div>
                        <h3 style="margin:0; font-size:16px; font-weight:700; flex:1; color:var(--av-text);">${escapeHtml(title)}</h3>
                        <button class="dialog-close-btn" style="border:none; background:transparent; width:28px; height:28px; border-radius:6px; font-size:18px; cursor:pointer; color:var(--av-text-soft);">&times;</button>
                    </div>
                    <div class="av-subsurface" style="padding:18px 24px;">${bodyHtml}</div>
                    <div style="padding:14px 24px; border-top:1px solid var(--av-border); display:flex; justify-content:flex-end; align-items:center; gap:10px;">
                        ${type !== 'alert' ? `<button class="dialog-cancel-btn av-input" style="padding:8px 18px; border-radius:8px; font-size:13px; cursor:pointer;">${escapeHtml(cancelText)}</button>` : ''}
                        <button class="dialog-confirm-btn" style="padding:8px 22px; border-radius:8px; border:none; background:${btnConfirmBg}; color:#fff; font-size:13px; font-weight:600; cursor:pointer;">${escapeHtml(confirmText)}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);
            setTimeout(() => { overlay.style.opacity = '1'; overlay.querySelector('.av-dialog-card').style.transform = 'scale(1)'; }, 10);

            const closeDialog = (result) => {
                document.removeEventListener('keydown', onKey);
                overlay.style.opacity = '0';
                overlay.querySelector('.av-dialog-card').style.transform = 'scale(0.95)';
                setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); resolve(result); }, 200);
            };
            const onKey = (e) => { if (e.key === 'Escape') closeDialog(false); };
            document.addEventListener('keydown', onKey);

            overlay.querySelector('.dialog-close-btn').onclick = () => closeDialog(false);
            const cancelBtn = overlay.querySelector('.dialog-cancel-btn');
            if (cancelBtn) cancelBtn.onclick = () => closeDialog(false);
            overlay.querySelector('.dialog-confirm-btn').onclick = () => closeDialog(true);
            overlay.onclick = (e) => { if (e.target === overlay) closeDialog(false); };
        });
    }

    function uiAlert(subtitle, title = '提示', iconType = 'info') {
        return showCustomDialog({ type: 'alert', title, subtitle, confirmText: '我知道了', iconType });
    }

    function uiConfirm(subtitle, title = '操作确认', isDanger = false, iconType = 'alert') {
        return showCustomDialog({ type: 'confirm', title, subtitle, isDanger, iconType });
    }

    function showBatchProgressModal(title = '正在批量处理...') {
        let aborted = false;
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', backgroundColor: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(8px)',
            zIndex: '210000', display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
        });
        overlay.innerHTML = `
            <div class="av-modal-surface" style="width:440px; max-width:92vw; border-radius:14px; border:1px solid var(--av-border); box-shadow:0 24px 48px rgba(0,0,0,0.28); padding:24px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
                    <div style="display:inline-block; width:20px; height:20px; border:2.5px solid #e0e7ff; border-top-color:#4f46e5; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                    <h3 style="margin:0; font-size:15px; font-weight:700;">${escapeHtml(title)}</h3>
                </div>
                <div id="batch-progress-detail" style="font-size:12px; color:var(--av-text-muted); margin-bottom:10px;">正在准备提交请求...</div>
                <div style="width:100%; height:8px; background:var(--av-surface-2); border-radius:999px; overflow:hidden; margin-bottom:10px;">
                    <div id="batch-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #4f46e5, #06b6d4); border-radius:999px; transition:width 0.2s ease;"></div>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--av-text-secondary);">
                    <span id="batch-progress-count" style="font-variant-numeric:tabular-nums; font-weight:600;">0 / 0</span>
                    <button id="batch-progress-stop" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; padding:5px 14px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; display:flex; align-items:center; gap:5px;">
                        ${ICONS.stop} 停止继续
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const stopBtn = overlay.querySelector('#batch-progress-stop');
        stopBtn.onclick = () => {
            aborted = true;
            stopBtn.disabled = true;
            stopBtn.innerText = '正在收尾停止...';
            stopBtn.style.opacity = '0.6';
        };
        return {
            isAborted: () => aborted,
            update(done, total, detail) {
                const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
                const bar = overlay.querySelector('#batch-progress-bar');
                const cnt = overlay.querySelector('#batch-progress-count');
                const txt = overlay.querySelector('#batch-progress-detail');
                if (bar) bar.style.width = `${pct}%`;
                if (cnt) cnt.innerText = `${done} / ${total} (${pct}%)`;
                if (txt && detail) txt.innerText = detail;
            },
            close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        };
    }

    function getCurrentCid() {
        const url = window.location.href;
        let match = url.match(/[?&]cid=(\d+)/) || url.match(/#category\/(\d+)/) || url.match(/#\/(\d+)(?:\?|$)/) || url.match(/\/(\d+)$/);
        if (match) return match[1];
        if (window.top && window.top.location) {
            match = window.top.location.href.match(/[?&]cid=(\d+)/) || window.top.location.href.match(/#category\/(\d+)/) || window.top.location.href.match(/#\/(\d+)(?:\?|$)/);
            if (match) return match[1];
        }
        return '0';
    }

    function isFolderIgnored(folderCid, folderName, ignoreList) {
        if (!ignoreList || ignoreList.length === 0) return false;
        const lowerName = String(folderName || '').toLowerCase();
        const cidStr = String(folderCid || '');
        return ignoreList.some(rule => {
            const clean = String(rule || '').trim();
            return Boolean(clean && (clean === cidStr || lowerName.includes(clean.toLowerCase())));
        });
    }

    // 支持断点续扫的遍历引擎
    async function fetchFilesAndFolders(startCid, isRecursive, speedMode, ignoreList, onProgress, resumeState = null) {
        let allFiles = resumeState ? [...resumeState.files] : [];
        const seenFids = new Set(allFiles.map(f => String(f.fid)));
        let emptyFolders = resumeState ? [...resumeState.emptyFolders] : [];
        let folderQueue = resumeState ? [...resumeState.remainingQueue] : [startCid];
        let visitedCids = resumeState ? new Set(resumeState.visitedCids) : new Set([startCid]);
        let processedInThisRun = 0;
        let isRateLimited = false;
        let rateLimitMsg = '';
        let isAborted = false;
        let isFolderLimitReached = false;
        const MAX_SAFE_FOLDERS = 150;

        const isRoot = (startCid === '0' || !startCid);
        const folderMap = resumeState ? new Map(resumeState.folderMapEntries) : new Map([
            [startCid, { cid: startCid, pid: '0', n: '当前目录', t: '', path: '', fileCount: 0, subfolders: [] }]
        ]);
        const directSubfolders = resumeState ? [...resumeState.directSubfolders] : [];

        outerFolderLoop: while (folderQueue.length > 0) {
            if (scanState.isAborted) { isAborted = true; break outerFolderLoop; }
            if (isRecursive && processedInThisRun >= MAX_SAFE_FOLDERS) { isFolderLimitReached = true; break outerFolderLoop; }

            const currentCid = folderQueue.shift();
            processedInThisRun++;

            if (isRecursive && processedInThisRun > 1) {
                if (processedInThisRun % 15 === 0) {
                    if (onProgress) onProgress(allFiles.length, processedInThisRun, `🛡️ 防风控动态冷却中 (本批已扫 ${processedInThisRun} 目录)...`);
                    await sleepRandom(speedMode === 'safe' ? 1600 : 800, speedMode === 'safe' ? 2400 : 1200);
                } else {
                    await sleepRandom(speedMode === 'safe' ? 450 : 150, speedMode === 'safe' ? 750 : 250);
                }
            }

            let offset = 0;
            const limit = 1150;
            let currentFolderFiles = 0;
            let currentFolderSubfolders = [];
            let totalCountInFolder = 0;

            const currentFolderObj = folderMap.get(currentCid);
            const currentPath = currentFolderObj ? currentFolderObj.path : '';

            innerPageLoop: while (true) {
                if (scanState.isAborted) { isAborted = true; break outerFolderLoop; }
                const url = `https://webapi.115.com/files?aid=1&cid=${currentCid}&o=user_ptime&asc=0&offset=${offset}&show_dir=1&limit=${limit}&natsort=1&format=json`;
                let data;
                try {
                    data = await safeFetchJson(url);
                } catch (fetchErr) {
                    if (fetchErr.isRateLimited) {
                        isRateLimited = true;
                        rateLimitMsg = fetchErr.message;
                        folderQueue.unshift(currentCid); // 放回队首方便恢复
                        break outerFolderLoop;
                    }
                    break innerPageLoop;
                }

                if (!data || !data.state || !data.data) break innerPageLoop;
                totalCountInFolder = data.count || 0;

                for (let item of data.data) {
                    if (item.fid) {
                        const fidStr = String(item.fid);
                        currentFolderFiles++;
                        if (!seenFids.has(fidStr)) {
                            seenFids.add(fidStr);
                            allFiles.push({
                                fid: fidStr,
                                cid: String(item.cid || currentCid),
                                n: item.n || '',
                                s: Number(item.s || 0),
                                t: item.t || '',
                                sha: item.sha || '',
                                iv: item.iv || 0,
                                thumb: item.thumb || item.u || '',
                                relPath: currentPath || '/'
                            });
                        }
                    } else if (item.cid) {
                        const itemCid = String(item.cid);
                        const itemName = item.n || '未命名文件夹';
                        if (isFolderIgnored(itemCid, itemName, ignoreList)) continue;

                        const itemFolderObj = {
                            cid: itemCid,
                            pid: String(item.pid || currentCid),
                            n: itemName,
                            t: item.t || '',
                            path: currentPath ? `${currentPath}/${itemName}` : `/${itemName}`,
                            fileCount: 0,
                            subfolders: []
                        };
                        folderMap.set(itemCid, itemFolderObj);
                        currentFolderSubfolders.push(itemFolderObj);

                        if (isRecursive) {
                            if (!visitedCids.has(itemCid)) { visitedCids.add(itemCid); folderQueue.push(itemCid); }
                        } else if (currentCid === startCid) {
                            directSubfolders.push(itemFolderObj);
                        }
                    }
                }

                if (onProgress) onProgress(allFiles.length, processedInThisRun);
                if (offset + limit >= data.count || data.data.length === 0) break innerPageLoop;
                offset += limit;
                await sleepRandom(speedMode === 'safe' ? 200 : 80, speedMode === 'safe' ? 350 : 150);
            }

            if (currentFolderObj) {
                currentFolderObj.fileCount = currentFolderFiles;
                currentFolderObj.subfolders = currentFolderSubfolders;
            }

            if (isRecursive && currentCid !== startCid && totalCountInFolder === 0) {
                if (currentFolderObj && !emptyFolders.some(f => f.cid === currentCid)) {
                    emptyFolders.push({ ...currentFolderObj, type: 'direct', reason: '直接空目录 (0项)' });
                }
            }
        }

        if (!isRecursive && !isRateLimited && !isAborted && !isRoot && directSubfolders.length > 0 && !resumeState) {
            const maxCheck = Math.min(directSubfolders.length, 60);
            for (let i = 0; i < maxCheck; i++) {
                if (scanState.isAborted) { isAborted = true; break; }
                const sub = directSubfolders[i];
                if (onProgress) onProgress(allFiles.length, 1, `正在检测空文件夹 (${i + 1}/${maxCheck}): ${sub.n}...`);
                const checkUrl = `https://webapi.115.com/files?aid=1&cid=${sub.cid}&show_dir=1&limit=1&format=json`;
                try {
                    const checkData = await safeFetchJson(checkUrl);
                    if (checkData && checkData.state && checkData.count === 0) {
                        emptyFolders.push({ ...sub, type: 'direct', reason: '直接空目录 (0项)' });
                    }
                } catch (e) {
                    if (e.isRateLimited) { isRateLimited = true; rateLimitMsg = e.message; break; }
                }
                await sleepRandom(speedMode === 'safe' ? 350 : 120, speedMode === 'safe' ? 550 : 200);
            }
        }

        if (isRecursive && folderMap.size > 1) {
            const emptyCidSet = new Set(emptyFolders.map(f => f.cid));
            function isSubtreeEmpty(folderCid) {
                const f = folderMap.get(folderCid);
                if (!f || f.fileCount > 0) return false;
                // 如果子目录还有未出队的（被150限制截断了），不能误判为空！
                if (folderQueue.includes(folderCid)) return false;
                for (const sub of f.subfolders) {
                    if (folderQueue.includes(sub.cid) || !isSubtreeEmpty(sub.cid)) return false;
                }
                return true;
            }
            for (const [cid, f] of folderMap.entries()) {
                if (cid === startCid || emptyCidSet.has(cid) || folderQueue.includes(cid)) continue;
                if (isSubtreeEmpty(cid)) {
                    emptyFolders.push({ ...f, type: 'cascade', reason: `层叠空目录 (含 ${f.subfolders.length} 个空子目录，0 个文件)` });
                    emptyCidSet.add(cid);
                }
            }
        }

        return {
            files: allFiles,
            emptyFolders,
            directSubfolders: Array.from(folderMap.values()).filter(f => f.pid === startCid),
            remainingQueue: folderQueue,
            visitedCids: Array.from(visitedCids),
            folderMapEntries: Array.from(folderMap.entries()),
            isRateLimited,
            rateLimitMsg,
            isAborted,
            isFolderLimitReached,
            processedFolders: processedInThisRun
        };
    }

    async function deleteFiles(fileIds, onProgress, progressModal) {
        const batchSize = 50;
        let deletedCount = 0;
        const completed = [];
        for (let i = 0; i < fileIds.length; i += batchSize) {
            if (progressModal && progressModal.isAborted()) {
                const err = new Error(`操作已手动中止 (已完成 ${deletedCount}/${fileIds.length})`);
                err.completed = completed;
                throw err;
            }
            const chunk = fileIds.slice(i, i + batchSize);
            const body = chunk.map((fid, idx) => `fid[${idx}]=${encodeURIComponent(fid)}`).join('&') + '&ignore_warn=1';
            try {
                const res = await safeFetchPostJson('https://webapi.115.com/rb/delete', body);
                if (!res.state) throw new Error(res.msg || res.error || '删除遇到错误');
            } catch (e) {
                e.completed = completed;
                throw e;
            }
            completed.push(...chunk);
            deletedCount += chunk.length;
            if (onProgress) onProgress(deletedCount, fileIds.length);
            if (i + batchSize < fileIds.length) await sleepRandom(250, 420);
        }
        return completed;
    }

    async function renameFiles(renameList, onProgress, progressModal) {
        const batchSize = 20;
        let renamedCount = 0;
        const completed = [];
        for (let i = 0; i < renameList.length; i += batchSize) {
            if (progressModal && progressModal.isAborted()) {
                const err = new Error(`操作已手动中止 (已完成 ${renamedCount}/${renameList.length})`);
                err.completed = completed;
                throw err;
            }
            const chunk = renameList.slice(i, i + batchSize);
            const body = chunk.map(item => `files_new_name[${encodeURIComponent(item.fid)}]=${encodeURIComponent(item.newName)}`).join('&');
            try {
                const res = await safeFetchPostJson('https://webapi.115.com/files/batch_rename', body);
                if (!res.state) throw new Error(res.msg || res.error || '批量重命名遇到错误');
            } catch (e) {
                e.completed = completed;
                throw e;
            }
            completed.push(...chunk);
            renamedCount += chunk.length;
            if (onProgress) onProgress(renamedCount, renameList.length);
            if (i + batchSize < renameList.length) await sleepRandom(320, 520);
        }
        return completed;
    }

    async function createFolder(parentCid, cname) {
        const body = `pid=${encodeURIComponent(parentCid)}&cname=${encodeURIComponent(cname)}`;
        const res = await safeFetchPostJson('https://webapi.115.com/files/add', body);
        if (!res.state) {
            const err = new Error(res.msg || res.error || `创建目录 "${cname}" 失败`);
            err.errno = res.errno;
            throw err;
        }
        const newCid = String(res.cid || (res.data && res.data.cid) || '');
        if (!newCid) throw new Error(`创建目录 "${cname}" 未返回有效 CID`);
        return newCid;
    }

    // 查找已有目录或在缺失时创建目录（自动解决目录已存在冲突）
    async function ensureFolderCid(parentCid, folderName, existingDirByName) {
        const cached = existingDirByName.get(folderName.toLowerCase());
        if (cached) return cached;
        try {
            const cid = await createFolder(parentCid, folderName);
            existingDirByName.set(folderName.toLowerCase(), cid);
            return cid;
        } catch (err) {
            if (err.isRateLimited) throw err;
            // 若因目录已存在失败，主动查一次父目录第一页子文件夹并复用其 CID
            const listData = await safeFetchJson(`https://webapi.115.com/files?aid=1&cid=${parentCid}&show_dir=1&limit=1150&format=json`);
            if (listData && listData.state && listData.data) {
                for (const item of listData.data) {
                    if (!item.fid && item.cid) {
                        existingDirByName.set(String(item.n || '').toLowerCase(), String(item.cid));
                    }
                }
                const found = existingDirByName.get(folderName.toLowerCase());
                if (found) return found;
            }
            throw err;
        }
    }

    async function moveFiles(fileIds, targetCid, onProgress, progressModal) {
        const batchSize = 30;
        let movedCount = 0;
        const completed = [];
        for (let i = 0; i < fileIds.length; i += batchSize) {
            if (progressModal && progressModal.isAborted()) {
                const err = new Error(`移动已手动中止 (已完成 ${movedCount}/${fileIds.length})`);
                err.completed = completed;
                throw err;
            }
            const chunk = fileIds.slice(i, i + batchSize);
            const body = `pid=${encodeURIComponent(targetCid)}&` + chunk.map((fid, idx) => `fid[${idx}]=${encodeURIComponent(fid)}`).join('&');
            try {
                const res = await safeFetchPostJson('https://webapi.115.com/files/move', body);
                if (!res.state) throw new Error(res.msg || res.error || '移动文件遇到错误');
            } catch (e) {
                e.completed = completed;
                throw e;
            }
            completed.push(...chunk);
            movedCount += chunk.length;
            if (onProgress) onProgress(movedCount, fileIds.length);
            if (i + batchSize < fileIds.length) await sleepRandom(300, 480);
        }
        return completed;
    }

    // 全局工作区状态（数据驱动选区，告别翻页丢勾选）
    let scanState = { isRunning: false, isAborted: false, abort() { this.isAborted = true; } };
    let lastOpenedCid = '';
    let lastScanResultSnapshot = null;
    let lastScanMeta = {};

    let allScannedFiles = [];
    let subtitleFilesList = [];
    let allDirectSubfolders = [];
    let duplicateGroups = {};
    let shaDuplicateGroups = {};
    let allGroups = {};
    let unparsedFiles = [];
    let emptyFoldersList = [];

    let selectedFids = new Set();        // 跨页保留勾选的识别/重复/SHA1 文件 FID
    let selectedJunkFids = new Set();    // 杂项页勾选 FID
    let selectedEmptyCids = new Set();   // 空目录页勾选 CID
    let lastCheckedAnchorFid = null;     // 支持 Shift+点击 连续区间勾选

    let currentTab = 'dups';             // 'dups' | 'sha' | 'all' | 'unparsed' | 'empty-folders'
    let searchQuery = '';
    let activeTagFilter = 'all';
    let currentSort = 'default';
    let currentPage = 1;
    const pageSize = 50;
    const unparsedPageSize = 100;

    function styleActionBtn(btn, enabled, isDanger = false) {
        if (!btn) return;
        btn.disabled = !enabled;
        if (enabled) {
            btn.style.background = isDanger ? '#e11d48' : '#4f46e5';
            btn.style.color = '#fff';
            btn.style.cursor = 'pointer';
            btn.style.boxShadow = isDanger ? '0 4px 12px rgba(225,29,72,0.25)' : '0 4px 12px rgba(79,70,229,0.25)';
        } else {
            btn.style.background = 'var(--av-surface-2)';
            btn.style.color = 'var(--av-text-soft)';
            btn.style.cursor = 'not-allowed';
            btn.style.boxShadow = 'none';
        }
    }

    // ==================== 乐观本地状态刷新（免全盘重扫） ====================
    async function saveSnapshotToCache(cid, isRecursive, snapshot) {
        const settings = getSettings();
        if (!settings.enableCache || !snapshot) return;
        await CacheManager.set(`${cid}_${isRecursive ? 'rec' : 'flat'}`, snapshot);
    }

    function applyOptimisticFileChange(updaterFn) {
        allScannedFiles = updaterFn(allScannedFiles);
        if (lastScanResultSnapshot) {
            lastScanResultSnapshot.files = allScannedFiles;
            const chkRec = document.getElementById('chk-recursive');
            const isRec = getCurrentCid() !== '0' && chkRec && chkRec.checked;
            saveSnapshotToCache(getCurrentCid(), isRec, lastScanResultSnapshot);
        }
        processScanResult(lastScanResultSnapshot || { files: allScannedFiles, emptyFolders: emptyFoldersList }, getCurrentCid() === '0', false, Date.now());
    }

    function applyOptimisticEmptyDelete(deletedCids) {
        const delSet = new Set(deletedCids.map(String));
        // 若删了祖先空目录，联动级联清理其后代空子目录
        let added = true;
        while (added) {
            added = false;
            for (const f of emptyFoldersList) {
                const cid = String(f.cid);
                if (!delSet.has(cid) && f.pid && delSet.has(String(f.pid))) {
                    delSet.add(cid);
                    added = true;
                }
            }
        }
        emptyFoldersList = emptyFoldersList.filter(f => !delSet.has(String(f.cid)));
        if (lastScanResultSnapshot) {
            lastScanResultSnapshot.emptyFolders = emptyFoldersList;
            const chkRec = document.getElementById('chk-recursive');
            const isRec = getCurrentCid() !== '0' && chkRec && chkRec.checked;
            saveSnapshotToCache(getCurrentCid(), isRec, lastScanResultSnapshot);
        }
        selectedEmptyCids.clear();
        processScanResult(lastScanResultSnapshot || { files: allScannedFiles, emptyFolders: emptyFoldersList }, getCurrentCid() === '0', false, Date.now());
    }

    function attachModalCloseBehavior(overlay, closeFn) {
        const onKey = (e) => { if (e.key === 'Escape') closeWithCleanup(); };
        const closeWithCleanup = () => {
            document.removeEventListener('keydown', onKey);
            closeFn();
        };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeWithCleanup(); });
        return closeWithCleanup;
    }

    // ==================== 缩略图悬浮预览 ====================
    function ensureThumbTooltip() {
        let tip = document.getElementById('av-thumb-tooltip');
        if (tip) return tip;
        tip = document.createElement('div');
        tip.id = 'av-thumb-tooltip';
        Object.assign(tip.style, {
            position: 'fixed', zIndex: '250000', width: '260px', borderRadius: '10px',
            boxShadow: '0 16px 40px rgba(15, 23, 42, 0.35)', border: '1px solid var(--av-border)',
            padding: '10px', pointerEvents: 'none', display: 'none',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        });
        tip.className = 'av-modal-surface';
        document.body.appendChild(tip);
        return tip;
    }

    function showThumbTooltip(e, file) {
        const tip = ensureThumbTooltip();
        const thumbUrl = sanitizeHttpUrl(file.thumb || '');
        tip.innerHTML = `
            <div class="av-subsurface" style="width:100%; height:146px; border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center; margin-bottom:8px;">
                ${thumbUrl
                    ? `<img src="${escapeHtml(thumbUrl)}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                       <div style="display:none; flex-direction:column; align-items:center; color:var(--av-text-soft); font-size:11px; text-align:center; padding:10px;">
                           <span>暂无 115 预览缩略图</span><span style="margin-top:4px;">点击外链图标可检索封面</span>
                       </div>`
                    : `<div style="display:flex; flex-direction:column; align-items:center; color:var(--av-text-soft); font-size:11px; text-align:center; padding:10px;">
                           <span>该文件未生成内置预览图</span><span style="margin-top:4px;">点击外链图标检索海报</span>
                       </div>`}
            </div>
            <div style="font-size:12px; font-weight:700; color:var(--av-text); margin-bottom:2px; word-break:break-all;">${escapeHtml(file.parsedCode || file.n)}</div>
            <div style="font-size:11px; color:var(--av-text-muted); display:flex; justify-content:space-between;">
                <span>${formatSize(file.s)}</span><span>${escapeHtml(file.relPath || '/')}</span>
            </div>
        `;
        tip.style.display = 'block';
        moveThumbTooltip(e);
    }

    function moveThumbTooltip(e) {
        const tip = document.getElementById('av-thumb-tooltip');
        if (!tip || tip.style.display === 'none') return;
        let x = e.clientX + 16, y = e.clientY + 16;
        if (x + 270 > window.innerWidth) x = e.clientX - 276;
        if (y + 230 > window.innerHeight) y = Math.max(14, window.innerHeight - 230);
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }

    function hideThumbTooltip() {
        const tip = document.getElementById('av-thumb-tooltip');
        if (tip) tip.style.display = 'none';
    }

    // ==================== 主界面初始化与事件绑定 ====================
    function initUI() {
        injectGlobalStyles();
        applyThemeClass();
        if (document.getElementById('av-dedup-launcher')) return;
        const launchBtn = document.createElement('div');
        launchBtn.id = 'av-dedup-launcher';
        launchBtn.innerHTML = `${ICONS.target}<span style="margin-left:6px;">番号整理助手</span>`;
        Object.assign(launchBtn.style, {
            position: 'fixed', right: '28px', bottom: '88px', zIndex: '99999',
            background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)', color: '#fff',
            padding: '9px 16px', borderRadius: '24px', cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(37,99,235,0.35)', fontSize: '13px', fontWeight: '600',
            display: 'flex', alignItems: 'center', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", userSelect: 'none'
        });
        launchBtn.onmouseenter = () => launchBtn.style.transform = 'translateY(-2px) scale(1.02)';
        launchBtn.onmouseleave = () => launchBtn.style.transform = 'translateY(0) scale(1)';
        launchBtn.onclick = showModal;
        document.body.appendChild(launchBtn);
    }

    function resetSearchAndFilters() {
        searchQuery = '';
        activeTagFilter = 'all';
        currentSort = 'default';
        currentPage = 1;
        selectedFids.clear();
        selectedJunkFids.clear();
        selectedEmptyCids.clear();
        lastCheckedAnchorFid = null;

        const searchEl = document.getElementById('input-search');
        if (searchEl) searchEl.value = '';
        const sortEl = document.getElementById('sel-sort');
        if (sortEl) sortEl.value = 'default';
        document.querySelectorAll('#contextual-subbar .filter-pill').forEach(p => {
            if (p.dataset.filter === 'all') p.classList.add('active'); else p.classList.remove('active');
        });
    }

    function showModal() {
        injectGlobalStyles();
        applyThemeClass();
        const curCid = getCurrentCid();

        let modal = document.getElementById('av-dedup-modal');
        if (modal) {
            modal.style.display = 'flex';
            if (curCid !== lastOpenedCid) {
                resetSearchAndFilters();
                lastOpenedCid = curCid;
            }
            syncRecursiveControl();
            runScan(false);
            return;
        }

        lastOpenedCid = curCid;
        modal = document.createElement('div');
        modal.id = 'av-dedup-modal';
        Object.assign(modal.style, {
            position: 'fixed', inset: '0', backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)',
            zIndex: '100000', display: 'flex', justifyContent: 'center', alignItems: 'center',
            opacity: '0', transition: 'opacity 0.2s ease'
        });

        modal.innerHTML = `
            <div class="av-modal-surface" style="width:1080px; max-width:96vw; height:90vh; border-radius:14px; border:1px solid var(--av-border); display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,0.3); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                
                <!-- 1. 顶栏 -->
                <div style="padding:12px 24px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                        <span style="display:flex; align-items:center; color:#2563eb;">${ICONS.target}</span>
                        <h2 style="margin:0; font-size:15px; font-weight:700;">115 番号智能整理助手 <span style="font-size:11px; color:#0284c7; background:#e0f2fe; padding:2px 7px; border-radius:4px; font-weight:600;">v${APP_VERSION}</span></h2>
                        <div id="dedup-cid-box" class="av-subsurface" style="display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border-radius:6px; border:1px solid var(--av-border); font-size:12px; color:var(--av-text-muted); font-family:ui-monospace, monospace; cursor:pointer; user-select:none;" title="点击复制当前目录 CID">
                            <span>CID: <span id="dedup-folder-info">-</span></span>
                            <span id="dedup-cid-copy-icon" style="display:inline-flex; align-items:center;">${ICONS.copy}</span>
                        </div>
                        <span id="dedup-cache-pill" style="display:none; font-size:11px; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:999px; font-weight:600; align-items:center; gap:4px;"></span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button id="btn-open-export" class="header-icon-btn" title="导出番号库 (TXT/CSV/Markdown) 或查漏比对">${ICONS.download} 导出 / 对比</button>
                        <button id="btn-open-history" class="header-icon-btn" title="查看最近重命名历史并支持一键撤销还原">${ICONS.undo} 撤销记录</button>
                        <button id="btn-open-settings" class="header-icon-btn" title="配置模板、自定义前缀、忽略目录与深色模式">${ICONS.settings} 偏好设置</button>
                        <button id="dedup-close-btn" class="av-subsurface" style="border:1px solid var(--av-border); width:28px; height:28px; border-radius:6px; font-size:16px; cursor:pointer; color:var(--av-text-muted); display:flex; align-items:center; justify-content:center; margin-left:4px;" title="关闭 (快捷键 Esc)">&times;</button>
                    </div>
                </div>

                <!-- 2. 仪表盘卡片 -->
                <div class="av-subsurface" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:10px; padding:10px 24px; border-bottom:1px solid var(--av-border);">
                    <div class="av-modal-surface" style="padding:8px 12px; border-radius:8px; border:1px solid var(--av-border);">
                        <div style="font-size:11px; color:var(--av-text-muted); font-weight:600;">扫描文件总量</div>
                        <div id="card-total-files" style="font-size:18px; font-weight:700; color:var(--av-text-soft); margin-top:2px; font-variant-numeric:tabular-nums;">-</div>
                    </div>
                    <div class="av-modal-surface" style="padding:8px 12px; border-radius:8px; border:1px solid var(--av-border);">
                        <div style="font-size:11px; color:var(--av-text-muted); font-weight:600;">番号识别率</div>
                        <div id="card-recognize-rate" style="font-size:18px; font-weight:700; color:var(--av-text-soft); margin-top:2px; font-variant-numeric:tabular-nums;">-</div>
                    </div>
                    <div class="av-modal-surface" style="padding:8px 12px; border-radius:8px; border:1px solid var(--av-border);">
                        <div style="font-size:11px; color:var(--av-text-muted); font-weight:600;">重复组 (番号 / SHA1)</div>
                        <div id="card-dup-groups" style="font-size:18px; font-weight:700; color:var(--av-text-soft); margin-top:2px; font-variant-numeric:tabular-nums;">-</div>
                    </div>
                    <div class="av-modal-surface" style="padding:8px 12px; border-radius:8px; border:1px solid var(--av-border);">
                        <div style="font-size:11px; color:var(--av-text-muted); font-weight:600;">可释放冗余空间</div>
                        <div id="card-redundant-size" style="font-size:18px; font-weight:700; color:var(--av-text-soft); margin-top:2px; font-variant-numeric:tabular-nums;">-</div>
                    </div>
                    <div class="av-modal-surface" style="padding:8px 12px; border-radius:8px; border:1px solid var(--av-border);">
                        <div style="font-size:11px; color:var(--av-text-muted); font-weight:600;">发现空文件夹</div>
                        <div id="card-empty-folders" style="font-size:18px; font-weight:700; color:var(--av-text-soft); margin-top:2px; font-variant-numeric:tabular-nums;">-</div>
                    </div>
                </div>

                <!-- 3. 主控制栏 -->
                <div style="padding:10px 24px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button id="btn-scan" style="background:#2563eb; color:#fff; border:none; padding:6px 14px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; white-space:nowrap;" title="跳过本地缓存，强制从 115 服务器重新获取最新列表">${ICONS.refresh} 重新扫描</button>
                        <label style="font-size:12px; color:var(--av-text-secondary); display:flex; align-items:center; cursor:pointer; gap:4px; user-select:none; white-space:nowrap;">
                            <input type="checkbox" id="chk-recursive" checked style="width:14px; height:14px; cursor:pointer;"> 包含子目录
                        </label>
                        <select id="sel-scan-speed" class="av-input" style="padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12px; outline:none; height:28px;">
                            <option value="safe">🛡️ 安全防封模式</option>
                            <option value="fast">⚡ 极速模式</option>
                        </select>
                    </div>

                    <div style="position:relative; flex:1; max-width:340px;">
                        <input id="input-search" class="av-input" type="text" placeholder="搜索番号 / 文件名 / 路径 / SHA1 (Ctrl/Cmd+F)..." style="width:100%; box-sizing:border-box; padding:6px 12px 6px 30px; border-radius:6px; font-size:12px; outline:none;">
                        <span style="position:absolute; left:10px; top:7px; color:var(--av-text-soft); display:flex; align-items:center; pointer-events:none;">${ICONS.search}</span>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px;">
                        <button id="btn-batch-rename" class="tool-btn" style="background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; display:flex; align-items:center; gap:5px;" disabled>${ICONS.edit} 批量重命名</button>
                        <button id="btn-batch-archive" class="tool-btn" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; padding:6px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; display:flex; align-items:center; gap:5px;" disabled>${ICONS.folderPlus} 智能归档</button>
                    </div>
                </div>

                <!-- 4. 导航选项卡 -->
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--av-border); padding:0 24px;">
                    <div style="display:flex; gap:4px; overflow-x:auto;">
                        <div id="tab-btn-dups" class="nav-tab" style="padding:9px 14px; cursor:pointer; font-size:13px; font-weight:700; color:#2563eb; border-bottom:2px solid #2563eb; display:flex; align-items:center; gap:6px; white-space:nowrap;">
                            ${ICONS.alert} 重复番号 <span id="count-dups" class="tab-badge active">0</span>
                        </div>
                        <div id="tab-btn-sha" class="nav-tab" style="padding:9px 14px; cursor:pointer; font-size:13px; color:var(--av-text-muted); font-weight:500; border-bottom:2px solid transparent; display:flex; align-items:center; gap:6px; white-space:nowrap;">
                            ${ICONS.sha} 同源(SHA1) <span id="count-sha" class="tab-badge">0</span>
                        </div>
                        <div id="tab-btn-all" class="nav-tab" style="padding:9px 14px; cursor:pointer; font-size:13px; color:var(--av-text-muted); font-weight:500; border-bottom:2px solid transparent; display:flex; align-items:center; gap:6px; white-space:nowrap;">
                            ${ICONS.list} 所有已识别 <span id="count-all" class="tab-badge">0</span>
                        </div>
                        <div id="tab-btn-unparsed" class="nav-tab" style="padding:9px 14px; cursor:pointer; font-size:13px; color:var(--av-text-muted); font-weight:500; border-bottom:2px solid transparent; display:flex; align-items:center; gap:6px; white-space:nowrap;">
                            ${ICONS.trash} 非番号/杂质 <span id="count-unparsed" class="tab-badge">0</span>
                        </div>
                        <div id="tab-btn-empty-folders" class="nav-tab" style="padding:9px 14px; cursor:pointer; font-size:13px; color:var(--av-text-muted); font-weight:500; border-bottom:2px solid transparent; display:flex; align-items:center; gap:6px; white-space:nowrap;">
                            ${ICONS.folder} 空文件夹 <span id="count-empty-folders" class="tab-badge">0</span>
                        </div>
                    </div>
                </div>

                <!-- 5. 特性筛选 & 智能保留策略栏 -->
                <div id="contextual-subbar" class="av-subsurface" style="padding:8px 24px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:11px; color:var(--av-text-muted); font-weight:600; margin-right:2px;">筛选:</span>
                        <button class="filter-pill active" data-filter="all">全部</button>
                        <button class="filter-pill" data-filter="4K">4K</button>
                        <button class="filter-pill" data-filter="中字">中字</button>
                        <button class="filter-pill" data-filter="无码">无码</button>
                        <button class="filter-pill" data-filter="needRename">待规范命名</button>
                        <button class="filter-pill" data-filter="hasSub">有外挂字幕</button>
                        <button class="filter-pill" data-filter="damaged" style="color:#e11d48;" title="识别视频中大小低于 10MB（含 0B）的下载残损伪视频">疑似残损(&lt;10MB)</button>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <select id="sel-sort" class="av-input" style="padding:3px 8px; border-radius:6px; cursor:pointer; font-size:11px; height:26px;">
                            <option value="default">排序: 默认顺序</option>
                            <option value="size-desc">体积: 从大到小</option>
                            <option value="size-asc">体积: 从小到大</option>
                            <option value="time-desc">时间: 最新优先</option>
                            <option value="code-asc">番号: A-Z 升序</option>
                        </select>
                        <span style="border-left:1px solid var(--av-border); height:14px; margin:0 2px;"></span>
                        <button id="btn-select-smart" class="tool-btn av-input" style="padding:3px 9px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:600; display:flex; align-items:center; gap:4px; height:26px; color:#4f46e5;" title="跨页智能优选：综合体积、4K/中字、已归档路径保留最优版，自动勾选其余重复版本" disabled>${ICONS.sparkle} 智能优选</button>
                        <button id="btn-select-smaller" class="tool-btn av-input" style="padding:3px 9px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:500; display:flex; align-items:center; gap:4px; height:26px;" title="跨页全局保留体积最大版，勾选其余小副本" disabled>${ICONS.bolt} 保留最大</button>
                        <button id="btn-select-older" class="tool-btn av-input" style="padding:3px 9px; border-radius:6px; cursor:pointer; font-size:11px; font-weight:500; display:flex; align-items:center; gap:4px; height:26px;" title="跨页全局保留最新时间版，勾选其余旧副本" disabled>${ICONS.clock} 保留最新</button>
                        <button id="btn-clear-selection" class="tool-btn av-input" style="padding:3px 9px; border-radius:6px; cursor:pointer; font-size:11px; height:26px;" disabled>取消全选</button>
                    </div>
                </div>

                <!-- 动态警报横幅 -->
                <div id="dedup-alert-container" class="av-subsurface" style="display:none; padding:10px 24px 0 24px;"></div>

                <!-- 列表内容区 -->
                <div id="dedup-content" class="av-subsurface" style="flex:1; overflow-y:auto; padding:12px 24px;"></div>

                <!-- 6. 底栏 -->
                <div id="footer-dups" class="av-modal-surface" style="padding:10px 24px; border-top:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:12px; padding-left:12px;">
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--av-text-secondary); cursor:pointer; user-select:none; white-space:nowrap;">
                            <input type="checkbox" id="chk-select-page" style="width:14px; height:14px; cursor:pointer;"> 全选当前页 (支持 Shift 连选)
                        </label>
                        <div id="pagination-controls" style="display:none; align-items:center; gap:8px; font-size:12px; color:var(--av-text-muted); margin-left:8px;">
                            <button id="btn-prev-page" class="av-input" style="padding:3px 8px; border-radius:6px; cursor:pointer;">上一页</button>
                            <span id="page-indicator">第 1 页</span>
                            <button id="btn-next-page" class="av-input" style="padding:3px 8px; border-radius:6px; cursor:pointer;">下一页</button>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:16px; margin-left:auto;">
                        <div style="font-size:13px; color:var(--av-text-secondary);">
                            已跨页累计勾选 <b id="selected-count" style="color:var(--av-text-soft); font-size:15px; font-weight:700; font-variant-numeric:tabular-nums;">0</b> 个文件 (释放 <span id="selected-size" style="font-weight:700; color:var(--av-text-soft); font-variant-numeric:tabular-nums;">0 B</span>)
                        </div>
                        <button id="btn-batch-delete" style="background:var(--av-surface-2); color:var(--av-text-soft); border:none; padding:7px 20px; border-radius:6px; cursor:not-allowed; font-size:13px; font-weight:600; display:flex; align-items:center; gap:6px; white-space:nowrap;" disabled>
                            ${ICONS.trash} 批量移至回收站
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        setTimeout(() => modal.style.opacity = '1', 10);

        const closeModal = () => {
            modal.style.display = 'none';
            hideThumbTooltip();
            if (scanState.isRunning) scanState.abort();
        };
        document.getElementById('dedup-close-btn').onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        // 快捷键: Esc 关闭弹窗 / Ctrl+F 或 Cmd+F 聚焦搜索框
        document.addEventListener('keydown', (e) => {
            if (modal.style.display === 'none') return;
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                const searchEl = document.getElementById('input-search');
                if (searchEl) { searchEl.focus(); searchEl.select(); }
            } else if (e.key === 'Escape') {
                const topOverlays = Array.from(document.querySelectorAll('body > div')).filter(d => d !== modal && Number(d.style.zIndex || 0) >= 200000);
                if (topOverlays.length === 0) closeModal();
            }
        });

        document.getElementById('dedup-cid-box').onclick = () => {
            navigator.clipboard.writeText(getCurrentCid()).then(() => {
                const iconSpan = document.getElementById('dedup-cid-copy-icon');
                if (iconSpan) {
                    iconSpan.innerHTML = ICONS.check; iconSpan.style.color = '#10b981';
                    setTimeout(() => { iconSpan.innerHTML = ICONS.copy; iconSpan.style.color = ''; }, 1500);
                }
            }).catch(() => {});
        };

        syncRecursiveControl();
        document.getElementById('chk-recursive').onchange = (e) => {
            if (getCurrentCid() !== '0') localStorage.setItem('av_dedup_recursive', e.target.checked);
            runScan(true);
        };

        const selSpeed = document.getElementById('sel-scan-speed');
        selSpeed.value = localStorage.getItem('av_dedup_speed') || 'safe';
        selSpeed.onchange = () => localStorage.setItem('av_dedup_speed', selSpeed.value);

        document.getElementById('btn-scan').onclick = () => runScan(true);
        document.getElementById('btn-select-smart').onclick = () => smartAutoSelect('smart');
        document.getElementById('btn-select-smaller').onclick = () => smartAutoSelect('smaller');
        document.getElementById('btn-select-older').onclick = () => smartAutoSelect('older');
        document.getElementById('btn-clear-selection').onclick = clearAllSelection;
        document.getElementById('btn-batch-rename').onclick = runBatchRename;
        document.getElementById('btn-batch-archive').onclick = openArchiveDialog;
        document.getElementById('btn-batch-delete').onclick = runDeleteDups;
        document.getElementById('btn-open-settings').onclick = openSettingsDialog;
        document.getElementById('btn-open-export').onclick = openExportDialog;
        document.getElementById('btn-open-history').onclick = openHistoryDialog;

        document.getElementById('chk-select-page').onchange = (e) => {
            const checked = e.target.checked;
            document.querySelectorAll('#dedup-content .file-chk').forEach(chk => {
                chk.checked = checked;
                if (checked) selectedFids.add(String(chk.dataset.fid));
                else selectedFids.delete(String(chk.dataset.fid));
            });
            updateSelectedStats();
        };

        ['dups', 'sha', 'all', 'unparsed', 'empty-folders'].forEach(t => {
            document.getElementById(`tab-btn-${t}`).onclick = () => switchTab(t);
        });

        document.querySelectorAll('#contextual-subbar .filter-pill').forEach(pill => {
            pill.onclick = () => {
                document.querySelectorAll('#contextual-subbar .filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                activeTagFilter = pill.dataset.filter;
                currentPage = 1;
                renderCurrentTab();
            };
        });

        document.getElementById('sel-sort').onchange = (e) => { currentSort = e.target.value; currentPage = 1; renderCurrentTab(); };
        document.getElementById('input-search').oninput = (e) => { searchQuery = e.target.value.trim().toLowerCase(); currentPage = 1; renderCurrentTab(); };
        document.getElementById('btn-prev-page').onclick = () => { if (currentPage > 1) { currentPage--; renderCurrentTab(); } };
        document.getElementById('btn-next-page').onclick = () => { currentPage++; renderCurrentTab(); };

        // ==================== #dedup-content 单层事件委托 ====================
        const contentBox = document.getElementById('dedup-content');
        contentBox.addEventListener('mouseover', (e) => {
            const trigger = e.target.closest('.thumb-trigger');
            if (!trigger) return;
            const fid = String(trigger.dataset.fid);
            const f = allScannedFiles.find(x => String(x.fid) === fid);
            if (f) {
                const info = parseAvFileInfo(f.n, { customPrefixes: getSettings().customPrefixes, customBlacklist: getSettings().customBlacklist });
                showThumbTooltip(e, { ...f, parsedCode: info ? info.code : '' });
            }
        });
        contentBox.addEventListener('mousemove', (e) => { if (e.target.closest('.thumb-trigger')) moveThumbTooltip(e); });
        contentBox.addEventListener('mouseout', (e) => { if (e.target.closest('.thumb-trigger')) hideThumbTooltip(); });

        contentBox.addEventListener('click', (e) => {
            // 1. 警报条继续扫描按钮
            if (e.target.closest('#btn-continue-scan')) {
                runScan(true, true);
                return;
            }
            // 2. 单文件行内快速重命名
            const quickRename = e.target.closest('.quick-rename-file');
            if (quickRename) {
                e.preventDefault();
                e.stopPropagation();
                handleSingleQuickRename(String(quickRename.dataset.fid), quickRename);
                return;
            }
            // 3. 组内保留 / 取消
            const keepBtn = e.target.closest('.quick-keep-one');
            if (keepBtn) {
                const key = keepBtn.dataset.key;
                const map = currentTab === 'sha' ? shaDuplicateGroups : (currentTab === 'dups' ? duplicateGroups : allGroups);
                const items = map[key] || [];
                const keeper = pickBestKeeperFile(items, 'smart');
                items.forEach(f => {
                    if (keeper && String(f.fid) === String(keeper.fid)) selectedFids.delete(String(f.fid));
                    else selectedFids.add(String(f.fid));
                });
                contentBox.querySelectorAll('.file-chk').forEach(chk => {
                    if (chk.dataset.key === key) chk.checked = selectedFids.has(String(chk.dataset.fid));
                });
                updateSelectedStats();
                return;
            }
            const uncheckBtn = e.target.closest('.quick-uncheck');
            if (uncheckBtn) {
                const key = uncheckBtn.dataset.key;
                const map = currentTab === 'sha' ? shaDuplicateGroups : (currentTab === 'dups' ? duplicateGroups : allGroups);
                (map[key] || []).forEach(f => selectedFids.delete(String(f.fid)));
                contentBox.querySelectorAll('.file-chk').forEach(chk => {
                    if (chk.dataset.key === key) chk.checked = false;
                });
                updateSelectedStats();
                return;
            }

            // 4. 整行点击勾选 + Shift 区间连选
            if (e.target.closest('a, button')) return;
            const row = e.target.closest('.clickable-row');
            if (!row) return;
            const chk = row.querySelector('.file-chk, .junk-chk, .empty-chk');
            if (!chk) return;
            const clickedDirectlyOnInput = (e.target === chk);
            const targetState = clickedDirectlyOnInput ? chk.checked : !chk.checked;
            if (!clickedDirectlyOnInput) chk.checked = targetState;

            if (chk.classList.contains('file-chk')) {
                const fid = String(chk.dataset.fid);
                if (e.shiftKey && lastCheckedAnchorFid) {
                    const allChks = Array.from(contentBox.querySelectorAll('.file-chk'));
                    const idxA = allChks.findIndex(c => String(c.dataset.fid) === lastCheckedAnchorFid);
                    const idxB = allChks.findIndex(c => String(c.dataset.fid) === fid);
                    if (idxA !== -1 && idxB !== -1) {
                        const [lo, hi] = [Math.min(idxA, idxB), Math.max(idxA, idxB)];
                        for (let i = lo; i <= hi; i++) {
                            allChks[i].checked = targetState;
                            const id = String(allChks[i].dataset.fid);
                            if (targetState) selectedFids.add(id); else selectedFids.delete(id);
                        }
                    }
                } else {
                    if (targetState) selectedFids.add(fid); else selectedFids.delete(fid);
                }
                lastCheckedAnchorFid = fid;
                updateSelectedStats();
            } else if (chk.classList.contains('junk-chk')) {
                const fid = String(chk.dataset.fid);
                if (targetState) selectedJunkFids.add(fid); else selectedJunkFids.delete(fid);
                if (window._updateJunkStats) window._updateJunkStats();
            } else if (chk.classList.contains('empty-chk')) {
                const cid = String(chk.dataset.cid);
                if (targetState) selectedEmptyCids.add(cid); else selectedEmptyCids.delete(cid);
                if (window._updateEmptyStats) window._updateEmptyStats();
            }
        });

        runScan(false);
    }

    function syncRecursiveControl() {
        const isRoot = (getCurrentCid() === '0');
        const chkRecursive = document.getElementById('chk-recursive');
        if (!chkRecursive) return;
        if (isRoot) {
            chkRecursive.checked = false;
            chkRecursive.disabled = true;
            chkRecursive.parentElement.title = '处于网盘根目录时，为防封禁已禁用全盘穿透；请进入具体子文件夹开启';
        } else {
            chkRecursive.disabled = false;
            chkRecursive.parentElement.title = '递归遍历所有子文件夹查找重复番号与空目录';
            const savedPref = localStorage.getItem('av_dedup_recursive');
            chkRecursive.checked = (savedPref !== null ? savedPref === 'true' : true);
        }
    }

    function switchTab(tab) {
        currentTab = tab;
        currentPage = 1;
        hideThumbTooltip();
        ['dups', 'sha', 'all', 'unparsed', 'empty-folders'].forEach(t => {
            const btn = document.getElementById(`tab-btn-${t}`);
            const badge = btn ? btn.querySelector('.tab-badge') : null;
            if (!btn) return;
            const active = (t === tab);
            btn.style.color = active ? '#2563eb' : 'var(--av-text-muted)';
            btn.style.fontWeight = active ? '700' : '500';
            btn.style.borderBottom = active ? '2px solid #2563eb' : '2px solid transparent';
            if (badge) badge.classList.toggle('active', active);
        });

        const subbar = document.getElementById('contextual-subbar');
        const footerDups = document.getElementById('footer-dups');
        const isGroupTab = (tab === 'dups' || tab === 'sha' || tab === 'all');
        if (subbar) subbar.style.display = isGroupTab ? 'flex' : 'none';
        if (footerDups) footerDups.style.display = isGroupTab ? 'flex' : 'none';

        updateQuickSelectButtons();
        renderCurrentTab();
    }

    function updateQuickSelectButtons() {
        const activeGroupCount = currentTab === 'sha'
            ? Object.keys(shaDuplicateGroups).length
            : (currentTab === 'dups' ? Object.keys(duplicateGroups).length : Object.keys(duplicateGroups).length);
        const allowDupAutoSelect = (currentTab === 'dups' || currentTab === 'sha' || (currentTab === 'all' && activeGroupCount > 0)) && activeGroupCount > 0;

        ['btn-select-smart', 'btn-select-smaller', 'btn-select-older'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = !allowDupAutoSelect;
                btn.style.opacity = allowDupAutoSelect ? '1' : '0.45';
                btn.style.cursor = allowDupAutoSelect ? 'pointer' : 'not-allowed';
            }
        });
        const btnClear = document.getElementById('btn-clear-selection');
        if (btnClear) {
            const hasSel = selectedFids.size > 0;
            btnClear.disabled = !hasSel;
            btnClear.style.opacity = hasSel ? '1' : '0.45';
            btnClear.style.cursor = hasSel ? 'pointer' : 'not-allowed';
        }
    }

    function updateAlertBanner() {
        const bannerBox = document.getElementById('dedup-alert-container');
        if (!bannerBox) return;
        const banners = [];

        if (lastScanMeta.isRoot) {
            banners.push(`<div style="background:#fffbeb; border:1px solid #fde68a; color:#92400e; padding:8px 14px; border-radius:6px; font-size:12px; display:flex; align-items:center; gap:8px;">${ICONS.shield}<span><b>防风控根目录保护生效：</b>处于根目录时已锁定「仅扫描当前一级目录」。建议进入具体子文件夹后再开启递归扫描。</span></div>`);
        }

        const remCount = (lastScanMeta.remainingQueue || []).length;
        if (lastScanMeta.isRateLimited) {
            banners.push(`
                <div style="background:#fff1f2; border:1px solid #fecdd3; color:#be123c; padding:8px 14px; border-radius:6px; font-size:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">${ICONS.alert}<span><b>115 频控熔断生效：</b>${escapeHtml(lastScanMeta.rateLimitMsg)}。已保留当前 <b>${lastScanMeta.filesCount}</b> 个文件，建议静置 3~5 分钟后点击续扫。</span></div>
                    ${remCount > 0 ? `<button id="btn-continue-scan" style="background:#be123c; color:#fff; border:none; padding:4px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">▶ 接力继续 (${remCount} 目录)</button>` : ''}
                </div>
            `);
        } else if (lastScanMeta.isAborted && remCount > 0) {
            banners.push(`
                <div style="background:#fffbeb; border:1px solid #fde68a; color:#92400e; padding:8px 14px; border-radius:6px; font-size:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">${ICONS.alert}<span><b>扫描已主动暂停：</b>已保留 <b>${lastScanMeta.filesCount}</b> 个文件。</span></div>
                    <button id="btn-continue-scan" style="background:#d97706; color:#fff; border:none; padding:4px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">▶ 继续扫描剩余 ${remCount} 个目录</button>
                </div>
            `);
        } else if (lastScanMeta.isFolderLimitReached && remCount > 0) {
            banners.push(`
                <div style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:8px 14px; border-radius:6px; font-size:12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">${ICONS.alert}<span><b>已达单批 150 个子目录安全上限：</b>队列中仍有 <b>${remCount}</b> 个子目录待遍历，可随时分批接力续扫。</span></div>
                    <button id="btn-continue-scan" style="background:#2563eb; color:#fff; border:none; padding:4px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">▶ 接力扫下一批 (150目录)</button>
                </div>
            `);
        }

        if (banners.length > 0) { bannerBox.style.display = 'block'; bannerBox.innerHTML = banners.join('<div style="height:6px;"></div>'); }
        else { bannerBox.style.display = 'none'; bannerBox.innerHTML = ''; }
    }

    function processScanResult(scanResult, isRoot, fromCache = false, cacheTimestamp = 0) {
        lastScanResultSnapshot = scanResult;
        const files = scanResult.files || [];
        allScannedFiles = files;
        allDirectSubfolders = scanResult.directSubfolders || [];
        emptyFoldersList = scanResult.emptyFolders || [];

        lastScanMeta = {
            isRateLimited: Boolean(scanResult.isRateLimited),
            rateLimitMsg: scanResult.rateLimitMsg || '',
            isAborted: Boolean(scanResult.isAborted),
            isFolderLimitReached: Boolean(scanResult.isFolderLimitReached),
            remainingQueue: scanResult.remainingQueue || [],
            filesCount: files.length,
            isRoot,
            fromCache,
            cacheTimestamp
        };

        const cachePill = document.getElementById('dedup-cache-pill');
        if (cachePill) {
            cachePill.style.display = 'inline-flex';
            cachePill.innerHTML = fromCache && cacheTimestamp
                ? `${ICONS.bolt} 本地缓存 · ${formatRelativeTime(cacheTimestamp)}`
                : `${ICONS.check} 实时最新数据`;
        }

        const settings = getSettings();
        const indexes = buildScanIndexes(files, settings);
        allGroups = indexes.allGroups;
        duplicateGroups = indexes.duplicateGroups;
        shaDuplicateGroups = indexes.shaDuplicateGroups;
        unparsedFiles = indexes.unparsedFiles;
        subtitleFilesList = indexes.subtitleFiles;

        const elTotal = document.getElementById('card-total-files');
        const elRate = document.getElementById('card-recognize-rate');
        const elDups = document.getElementById('card-dup-groups');
        const elRedundant = document.getElementById('card-redundant-size');
        const elEmpty = document.getElementById('card-empty-folders');

        if (elTotal) { elTotal.innerText = files.length ? files.length.toLocaleString() : '0'; elTotal.style.color = files.length ? 'var(--av-text)' : 'var(--av-text-soft)'; }
        if (elRate) { elRate.innerText = indexes.videoCount ? `${((indexes.validVideoCount / indexes.videoCount) * 100).toFixed(1)}%` : '0%'; elRate.style.color = indexes.validVideoCount ? '#0284c7' : 'var(--av-text-soft)'; }
        if (elDups) { elDups.innerText = `${indexes.dupGroupCount} / ${indexes.shaGroupCount}`; elDups.style.color = (indexes.dupGroupCount + indexes.shaGroupCount) > 0 ? '#e11d48' : 'var(--av-text-soft)'; }
        if (elRedundant) { elRedundant.innerText = formatSize(indexes.redundantSize); elRedundant.style.color = indexes.redundantSize > 0 ? '#10b981' : 'var(--av-text-soft)'; }
        if (elEmpty) { elEmpty.innerText = emptyFoldersList.length; elEmpty.style.color = emptyFoldersList.length > 0 ? '#d97706' : 'var(--av-text-soft)'; }

        const setTabBadge = (id, count) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.innerText = count;
            el.classList.toggle('has-num', count > 0);
        };
        setTabBadge('count-dups', indexes.dupGroupCount);
        setTabBadge('count-sha', indexes.shaGroupCount);
        setTabBadge('count-all', indexes.validVideoCount);
        setTabBadge('count-unparsed', unparsedFiles.length);
        setTabBadge('count-empty-folders', emptyFoldersList.length);

        ['btn-batch-rename', 'btn-batch-archive'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = indexes.validVideoCount === 0;
                btn.style.opacity = indexes.validVideoCount > 0 ? '1' : '0.45';
                btn.style.cursor = indexes.validVideoCount > 0 ? 'pointer' : 'not-allowed';
            }
        });

        updateQuickSelectButtons();
        updateAlertBanner();
        renderCurrentTab();
    }

    async function runScan(forceRefresh = false, isResume = false) {
        if (scanState.isRunning) {
            scanState.abort();
            await sleep(250);
        }

        const cid = getCurrentCid();
        const isRoot = (cid === '0');
        syncRecursiveControl();

        const chkRecursive = document.getElementById('chk-recursive');
        const isRecursive = isRoot ? false : (chkRecursive ? chkRecursive.checked : false);
        const selSpeed = document.getElementById('sel-scan-speed');
        const speedMode = selSpeed ? selSpeed.value : 'safe';
        const settings = getSettings();
        const cacheKey = `${cid}_${isRecursive ? 'rec' : 'flat'}`;

        document.getElementById('dedup-folder-info').innerText = cid;
        const alertBox = document.getElementById('dedup-alert-container');
        if (alertBox) { alertBox.style.display = 'none'; alertBox.innerHTML = ''; }

        if (!forceRefresh && !isResume && settings.enableCache) {
            const cached = await CacheManager.get(cacheKey, settings.cacheTtlMinutes);
            if (cached && cached.files) {
                processScanResult(cached, isRoot, true, cached.timestamp);
                return;
            }
        }

        if (!isResume) {
            selectedFids.clear();
            selectedJunkFids.clear();
            selectedEmptyCids.clear();
            lastCheckedAnchorFid = null;
        }

        scanState.isRunning = true;
        scanState.isAborted = false;

        const contentBox = document.getElementById('dedup-content');
        contentBox.innerHTML = `
            <div style="text-align:center; padding:80px 0; color:#2563eb;">
                <div style="display:inline-block; width:36px; height:36px; border:3px solid #dbeafe; border-top-color:#2563eb; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                <div id="scan-loading-text" style="font-size:14px; font-weight:600; color:var(--av-text); margin-top:16px;">正在以${speedMode === 'safe' ? '安全防封' : '极速'}模式${isResume ? '接力续扫' : '读取列表'}...</div>
                <div id="scan-loading-subtext" style="font-size:12px; color:var(--av-text-soft); margin-top:6px;">已启用仿生随机延时、忽略目录过滤与动态冷却</div>
                <div style="margin-top:20px;">
                    <button id="btn-abort-scan" style="background:var(--av-bg); color:#e11d48; border:1px solid #fecdd3; padding:6px 16px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
                        ${ICONS.stop} 停止扫描 (保留已搜结果)
                    </button>
                </div>
            </div>
        `;

        const abortBtn = document.getElementById('btn-abort-scan');
        if (abortBtn) abortBtn.onclick = () => { scanState.abort(); abortBtn.innerText = '正在安全收尾停止...'; abortBtn.disabled = true; };

        try {
            const resumeArg = isResume && lastScanResultSnapshot ? lastScanResultSnapshot : null;
            const scanResult = await fetchFilesAndFolders(cid, isRecursive, speedMode, settings.ignoreFolders, (loaded, folders, statusText) => {
                const txt = document.getElementById('scan-loading-text');
                if (txt) txt.innerText = statusText || `正在读取: ${loaded} 个文件 (本轮 ${folders} 个目录)...`;
            }, resumeArg);
            scanState.isRunning = false;

            if (settings.enableCache && !scanResult.isRateLimited && !scanResult.isAborted) {
                await saveSnapshotToCache(cid, isRecursive, scanResult);
            }
            processScanResult(scanResult, isRoot, false, Date.now());
        } catch (err) {
            scanState.isRunning = false;
            contentBox.innerHTML = `<div style="text-align:center; color:#e11d48; padding:60px; font-weight:600;">❌ 扫描异常中断: ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderCurrentTab() {
        hideThumbTooltip();
        if (currentTab === 'dups') renderGroups(duplicateGroups, true, false);
        else if (currentTab === 'sha') renderGroups(shaDuplicateGroups, true, true);
        else if (currentTab === 'all') renderGroups(allGroups, false, false);
        else if (currentTab === 'unparsed') renderUnparsed();
        else if (currentTab === 'empty-folders') renderEmptyFolders();
    }

    function buildPairedSubMap(targetGroups, settings = {}) {
        const pairedSubMap = new Map();
        if (subtitleFilesList.length === 0) return pairedSubMap;
        const parseOptions = {
            customPrefixes: settings.customPrefixes || [],
            customBlacklist: settings.customBlacklist || []
        };
        const subsByCid = new Map();
        for (const s of subtitleFilesList) {
            const scid = String(s.cid || '');
            if (!subsByCid.has(scid)) subsByCid.set(scid, []);
            subsByCid.get(scid).push(s);
        }
        for (const items of Object.values(targetGroups)) {
            for (const f of items) {
                const dirSubs = subsByCid.get(String(f.cid || ''));
                if (!dirSubs || dirSubs.length === 0) continue;
                const subs = findPairedSubtitles(f, dirSubs, parseOptions);
                if (subs.length > 0) pairedSubMap.set(String(f.fid), subs);
            }
        }
        return pairedSubMap;
    }

    function renderGroups(targetGroups, isDupTab, isShaTab) {
        const contentBox = document.getElementById('dedup-content');
        const paginationBox = document.getElementById('pagination-controls');
        const settings = getSettings();
        const pairedSubMap = buildPairedSubMap(targetGroups, settings);

        let keys = filterAndSortGroupKeys(targetGroups, { searchQuery, activeTagFilter, currentSort, settings, pairedSubMap });

        if (keys.length === 0) {
            let emptyMsg = '没有找到匹配筛选条件的结果';
            if (!searchQuery && activeTagFilter === 'all') {
                emptyMsg = isShaTab
                    ? '🎉 完美！未发现任何 SHA1 二进制完全相同的重复文件！'
                    : (isDupTab ? '🎉 该目录下未发现任何重复番号文件！（上下集/分集已独立保护）' : '当前没有已识别的番号视频文件');
            }
            contentBox.innerHTML = `<div style="text-align:center; color:#10b981; margin-top:90px; font-size:14px; font-weight:600;">${emptyMsg}</div>`;
            if (paginationBox) paginationBox.style.display = 'none';
            updateSelectedStats();
            return;
        }

        const totalItems = keys.length;
        const totalPages = Math.ceil(totalItems / pageSize);
        if (totalPages > 1) {
            if (currentPage > totalPages) currentPage = totalPages;
            if (paginationBox) {
                paginationBox.style.display = 'flex';
                document.getElementById('page-indicator').innerText = `第 ${currentPage} / ${totalPages} 页 (共 ${totalItems} 组)`;
                document.getElementById('btn-prev-page').disabled = (currentPage === 1);
                document.getElementById('btn-next-page').disabled = (currentPage === totalPages);
            }
            keys = keys.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        } else if (paginationBox) {
            paginationBox.style.display = 'none';
        }

        const searchSite = settings.preferredSearchSite || 'javbus';

        const renderFileRowHtml = (file, key, isInsideGroupCard, keeperFid) => {
            const badges = extractBadges(file.n);
            const isDamaged = isDamagedVideoFile(file);
            const folderUrl = `https://115.com/?cid=${file.cid}&offset=0&mode=wangpan`;
            const stdName = file.parsedCode ? getStandardAvName(file, settings.renameTemplate, settings.customTemplate) : '';
            const isDifferentName = Boolean(stdName && stdName.toLowerCase() !== file.n.toLowerCase());
            const hasSub = pairedSubMap.has(String(file.fid));
            const isKeeper = isInsideGroupCard && String(file.fid) === String(keeperFid);
            const isChecked = selectedFids.has(String(file.fid));
            const searchUrl = file.parsedCode ? getMetadataSearchUrl(file.parsedCode, searchSite) : '';

            return `
                <div class="file-row clickable-row ${isInsideGroupCard ? '' : 'av-modal-surface'}" style="display:flex; align-items:center; padding:${isInsideGroupCard ? '8px 0' : '7px 12px'}; border:${isInsideGroupCard ? 'none' : '1px solid var(--av-border)'}; border-bottom:${isInsideGroupCard ? '1px dashed var(--av-border-dashed)' : '1px solid var(--av-border)'}; border-radius:${isInsideGroupCard ? '0' : '6px'}; margin-bottom:${isInsideGroupCard ? '0' : '6px'}; font-size:13px;">
                    <input type="checkbox" class="file-chk" data-fid="${file.fid}" data-size="${file.s}" data-key="${escapeHtml(key)}" ${isChecked ? 'checked' : ''} style="margin-right:10px; width:15px; height:15px; cursor:pointer; flex-shrink:0;">

                    ${!isInsideGroupCard ? `
                        <div style="display:inline-flex; align-items:center; gap:4px; margin-right:12px; flex-shrink:0;">
                            <span style="min-width:82px; text-align:center; display:inline-block; box-sizing:border-box; background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; font-family:ui-monospace, monospace; font-size:11px; font-weight:600; padding:2px 7px; border-radius:4px; white-space:nowrap;">${escapeHtml(key)}</span>
                            ${searchUrl ? `<a href="${searchUrl}" target="_blank" style="color:var(--av-text-soft); display:inline-flex; align-items:center; padding:3px;" title="在 ${searchSite.toUpperCase()} 中检索详情">${ICONS.external}</a>` : ''}
                        </div>
                    ` : ''}

                    <div style="flex:1; overflow:hidden; margin-right:10px; min-width:0;">
                        <div style="display:flex; align-items:center; gap:5px; overflow:hidden;">
                            <span class="thumb-trigger" data-fid="${file.fid}" style="color:var(--av-text-soft); display:inline-flex; align-items:center; padding:2px; flex-shrink:0;" title="悬停预览缩略图与详情">${ICONS.eye}</span>
                            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(file.n)}">${formatFileNameHtml(file.n)}</div>
                            ${isDamaged ? `<span style="background:#fee2e2; color:#991b1b; font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; flex-shrink:0;">疑似残损</span>` : ''}
                            ${hasSub ? `<span style="background:#dcfce7; color:#15803d; font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; flex-shrink:0; display:inline-flex; align-items:center; gap:2px;">${ICONS.subtitle} 字幕</span>` : ''}
                            ${badges.map(b => `<span style="background:${b.bg}; color:${b.color}; font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; flex-shrink:0;">${b.text}</span>`).join('')}
                        </div>
                        ${file.relPath && file.relPath !== '/' ? `<div style="font-size:11px; color:var(--av-text-soft); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📁 ${escapeHtml(file.relPath)}</div>` : ''}
                    </div>

                    <div class="row-hover-actions" style="display:flex; align-items:center; gap:6px; margin-right:10px; flex-shrink:0;">
                        ${isDifferentName ? `<a href="javascript:void(0)" class="quick-rename-file" data-fid="${file.fid}" style="color:#4338ca; background:#eef2ff; border:1px solid #c7d2fe; text-decoration:none; font-size:11px; font-weight:600; padding:2px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;" title="规范化重命名为: ${escapeHtml(stdName)}">${ICONS.edit} 改为规范名</a>` : ''}
                        <a href="${folderUrl}" target="_blank" class="row-open-dir" style="color:var(--av-text-muted); text-decoration:none; font-size:11px; font-weight:500; padding:2px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px; border:1px solid transparent;" title="在115网页端打开所在目录">${ICONS.openDir} 打开目录</a>
                    </div>

                    <span style="width:${isInsideGroupCard ? '115px' : '82px'}; text-align:right; font-variant-numeric:tabular-nums; font-weight:${isKeeper ? '700' : '500'}; color:${isKeeper ? '#10b981' : 'var(--av-text-muted)'}; margin-right:14px; font-size:12px; flex-shrink:0;">
                        ${formatSize(file.s)} ${isKeeper ? '<span style="font-size:11px;">(推荐保留)</span>' : ''}
                    </span>
                    <span style="width:118px; text-align:right; font-variant-numeric:tabular-nums; color:var(--av-text-soft); font-size:12px; flex-shrink:0;">
                        ${file.t ? file.t.slice(0, 16) : ''}
                    </span>
                </div>
            `;
        };

        let html = '';
        keys.forEach(key => {
            const items = targetGroups[key];
            const isDup = items.length > 1;
            const keeper = isDup ? pickBestKeeperFile(items, 'smart') : items[0];

            if (!isDup) {
                html += renderFileRowHtml(items[0], key, false, keeper ? keeper.fid : null);
            } else {
                const displayKey = isShaTab ? `SHA1: ${items[0].sha ? items[0].sha.slice(0, 12) : key}...` : key;
                const repCode = items[0].parsedCode || '';
                const searchUrl = repCode ? getMetadataSearchUrl(repCode, searchSite) : '';
                html += `
                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; margin-bottom:10px; overflow:hidden;">
                        <div class="av-subsurface" style="padding:8px 14px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span style="min-width:82px; text-align:center; display:inline-block; box-sizing:border-box; background:${isShaTab ? '#fef3c7' : '#eef2ff'}; color:${isShaTab ? '#92400e' : '#4338ca'}; border:1px solid ${isShaTab ? '#fde68a' : '#c7d2fe'}; font-family:ui-monospace, monospace; font-size:12px; font-weight:600; padding:3px 8px; border-radius:4px;">${escapeHtml(displayKey)}</span>
                                ${searchUrl ? `<a href="${searchUrl}" target="_blank" style="color:var(--av-text-muted); display:inline-flex; align-items:center; gap:3px; font-size:11px; text-decoration:none;">${ICONS.external} 详情</a>` : ''}
                                <span style="font-size:12px; color:var(--av-text-muted); font-weight:500;">(共 ${items.length} 个${isShaTab ? '相同 SHA1 副本' : '同番号版本'})</span>
                            </div>
                            <div style="font-size:12px;">
                                <a href="javascript:void(0)" class="quick-keep-one" data-key="${escapeHtml(key)}" style="color:#2563eb; text-decoration:none; margin-right:12px; font-weight:600;">保留最优项</a>
                                <a href="javascript:void(0)" class="quick-uncheck" data-key="${escapeHtml(key)}" style="color:var(--av-text-muted); text-decoration:none;">取消选择</a>
                            </div>
                        </div>
                        <div style="padding:2px 14px;">
                            ${items.map(file => renderFileRowHtml(file, key, true, keeper ? keeper.fid : null)).join('')}
                        </div>
                    </div>
                `;
            }
        });

        contentBox.innerHTML = html;
        updateSelectedStats();
    }

    async function handleSingleQuickRename(fid, btnEl) {
        const settings = getSettings();
        const fileRaw = allScannedFiles.find(f => String(f.fid) === fid);
        if (!fileRaw) return;
        const info = parseAvFileInfo(fileRaw.n, { customPrefixes: settings.customPrefixes, customBlacklist: settings.customBlacklist });
        const file = { ...fileRaw, parsedCode: info ? info.code : '', partInfo: info ? info.part : '' };

        const plan = planBatchRename([file], allScannedFiles, subtitleFilesList, settings);
        if (plan.conflictItems.length > 0) {
            await uiAlert(`目标文件名 "${plan.conflictItems[0].newName}" 与同目录现存文件重名，已安全禁止直接改名！`, '重名冲突提示', 'alert');
            return;
        }
        const allOps = [...plan.renameItems, ...plan.pairedSubItems];
        if (allOps.length === 0) return;

        const confirmed = await showCustomDialog({
            type: 'preview-rename',
            title: '确认规范重命名',
            items: allOps,
            pairedSubCount: plan.pairedSubItems.length,
            totalCount: allOps.length,
            confirmText: '立即改名',
            cancelText: '取消',
            iconType: 'edit'
        });
        if (!confirmed) return;

        btnEl.innerText = '改名中...';
        btnEl.style.pointerEvents = 'none';
        try {
            const doneItems = await renameFiles(allOps);
            addRenameHistory({ cid: getCurrentCid(), items: doneItems.map(x => ({ fid: x.fid, from: x.oldName, to: x.newName })) });
            const renamedMap = new Map(doneItems.map(x => [String(x.fid), x.newName]));
            applyOptimisticFileChange(files => files.map(f => renamedMap.has(String(f.fid)) ? { ...f, n: renamedMap.get(String(f.fid)) } : f));
            await uiAlert(`已规范重命名 ${doneItems.length} 个文件（已即时更新本地视图）。`, '重命名成功', 'info');
        } catch (err) {
            await uiAlert(`重命名失败: ${err.message}`, '操作失败', 'alert');
            btnEl.innerHTML = `${ICONS.edit} 改为规范名`;
            btnEl.style.pointerEvents = 'auto';
        }
    }

    function renderUnparsed() {
        const contentBox = document.getElementById('dedup-content');
        const paginationBox = document.getElementById('pagination-controls');
        if (paginationBox) paginationBox.style.display = 'none';

        let list = unparsedFiles;
        if (searchQuery) {
            list = list.filter(f => f.n.toLowerCase().includes(searchQuery) || (f.relPath && f.relPath.toLowerCase().includes(searchQuery)));
        }

        if (list.length === 0) {
            contentBox.innerHTML = `<div style="text-align:center; color:#10b981; margin-top:90px; font-size:14px; font-weight:600;">🎉 当前目录下没有任何非番号广告或杂项文件！</div>`;
            return;
        }

        const totalPages = Math.ceil(list.length / unparsedPageSize);
        if (currentPage > totalPages) currentPage = totalPages;
        const shownList = list.slice((currentPage - 1) * unparsedPageSize, currentPage * unparsedPageSize);

        let html = `
            <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:13px; font-weight:600;">
                        共筛选出 <b style="color:#e11d48; font-variant-numeric:tabular-nums;">${list.length}</b> 个杂项/非番号文件：
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <button id="btn-junk-select-ads" class="tool-btn av-input" style="padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500; display:flex; align-items:center; gap:5px;" title="自动跳过外挂字幕与海报">${ICONS.bolt} 勾选全部广告 (&lt;50MB)</button>
                        <button id="btn-junk-select-page" class="tool-btn av-input" style="padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">全选本页</button>
                        <button id="btn-junk-clear" class="tool-btn av-input" style="padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">清空已选</button>
                        <button id="btn-junk-delete" style="background:var(--av-surface-2); color:var(--av-text-soft); border:none; padding:6px 16px; border-radius:6px; cursor:not-allowed; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px;" disabled>${ICONS.trash} 批量移至回收站 (0)</button>
                    </div>
                </div>
                <div style="border-top:1px solid var(--av-border); padding-top:6px;">
                    ${shownList.map(f => {
                        const cat = getJunkCategory(f);
                        const checked = selectedJunkFids.has(String(f.fid));
                        return `
                            <div class="file-row clickable-row" style="display:flex; align-items:center; padding:7px 10px; border-radius:6px; border-bottom:1px dashed var(--av-border-dashed); font-size:13px;">
                                <input type="checkbox" class="junk-chk" data-fid="${f.fid}" data-size="${f.s}" data-protected="${cat.isProtected ? '1' : '0'}" ${checked ? 'checked' : ''} style="margin-right:10px; width:15px; height:15px; cursor:pointer;">
                                <span style="background:${cat.bg}; color:${cat.color}; font-size:11px; padding:2px 7px; border-radius:4px; margin-right:10px; font-weight:600; white-space:nowrap;">${cat.label}</span>
                                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(f.n)}">
                                    ${formatFileNameHtml(f.n)}
                                    ${f.relPath && f.relPath !== '/' ? `<span style="color:var(--av-text-soft); font-size:11px; margin-left:8px;">📁 ${escapeHtml(f.relPath)}</span>` : ''}
                                </span>
                                <span style="width:90px; text-align:right; color:var(--av-text-muted); font-size:12px; margin-left:12px; font-variant-numeric:tabular-nums;">${formatSize(f.s)}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${totalPages > 1 ? `
                    <div style="display:flex; justify-content:center; align-items:center; gap:10px; margin-top:14px; font-size:12px; color:var(--av-text-muted);">
                        <button id="junk-prev" class="av-input" style="padding:4px 12px; border-radius:6px; cursor:pointer;" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
                        <span>第 ${currentPage} / ${totalPages} 页 (共 ${list.length} 项)</span>
                        <button id="junk-next" class="av-input" style="padding:4px 12px; border-radius:6px; cursor:pointer;" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
                    </div>
                ` : ''}
            </div>
        `;
        contentBox.innerHTML = html;

        const btnJunkDel = document.getElementById('btn-junk-delete');
        const updateJunkStats = () => {
            let size = 0;
            const fileMap = new Map(list.map(f => [String(f.fid), Number(f.s || 0)]));
            selectedJunkFids.forEach(fid => { if (fileMap.has(fid)) size += fileMap.get(fid); });
            btnJunkDel.innerHTML = `${ICONS.trash} 批量移至回收站 (${selectedJunkFids.size} 个, ${formatSize(size)})`;
            styleActionBtn(btnJunkDel, selectedJunkFids.size > 0, true);
        };
        window._updateJunkStats = updateJunkStats;
        updateJunkStats();

        document.getElementById('btn-junk-select-ads').onclick = () => {
            list.forEach(f => {
                const cat = getJunkCategory(f);
                if (!cat.isProtected && Number(f.s || 0) < 50 * 1024 * 1024) selectedJunkFids.add(String(f.fid));
            });
            renderUnparsed();
        };
        document.getElementById('btn-junk-select-page').onclick = () => {
            shownList.forEach(f => selectedJunkFids.add(String(f.fid)));
            renderUnparsed();
        };
        document.getElementById('btn-junk-clear').onclick = () => { selectedJunkFids.clear(); renderUnparsed(); };
        const prev = document.getElementById('junk-prev');
        const next = document.getElementById('junk-next');
        if (prev) prev.onclick = () => { if (currentPage > 1) { currentPage--; renderUnparsed(); } };
        if (next) next.onclick = () => { if (currentPage < totalPages) { currentPage++; renderUnparsed(); } };

        btnJunkDel.onclick = async () => {
            const fids = Array.from(selectedJunkFids);
            if (fids.length === 0) return;
            const confirmed = await uiConfirm(`确认将选中的 ${fids.length} 个杂项文件移至 115 回收站？`, '清理杂项确认', true, 'trash');
            if (!confirmed) return;

            const prog = showBatchProgressModal('正在移至 115 回收站...');
            try {
                const doneIds = await deleteFiles(fids, (done, total) => prog.update(done, total, `已移至回收站 ${done} 个`), prog);
                prog.close();
                const delSet = new Set(doneIds.map(String));
                selectedJunkFids.clear();
                applyOptimisticFileChange(files => files.filter(f => !delSet.has(String(f.fid))));
                await uiAlert(`成功清理 ${doneIds.length} 个杂项文件！`, '清理完成', 'info');
            } catch (err) {
                prog.close();
                const delSet = new Set((err.completed || []).map(String));
                if (delSet.size > 0) applyOptimisticFileChange(files => files.filter(f => !delSet.has(String(f.fid))));
                await uiAlert(`清理异常或中止: ${err.message}`, '清理异常', 'alert');
            }
        };
    }

    function renderEmptyFolders() {
        const contentBox = document.getElementById('dedup-content');
        const paginationBox = document.getElementById('pagination-controls');
        if (paginationBox) paginationBox.style.display = 'none';

        let list = emptyFoldersList;
        if (searchQuery) list = list.filter(f => f.n.toLowerCase().includes(searchQuery) || (f.path && f.path.toLowerCase().includes(searchQuery)));

        if (list.length === 0) {
            contentBox.innerHTML = `<div style="text-align:center; color:#10b981; margin-top:90px; font-size:14px; font-weight:600;">🎉 完美！当前扫描范围内未发现任何空文件夹！</div>`;
            return;
        }

        const totalPages = Math.ceil(list.length / unparsedPageSize);
        if (currentPage > totalPages) currentPage = totalPages;
        const shownList = list.slice((currentPage - 1) * unparsedPageSize, currentPage * unparsedPageSize);

        let html = `
            <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:13px; font-weight:600;">
                        共发现 <b style="color:#e11d48; font-variant-numeric:tabular-nums;">${list.length}</b> 个空文件夹 <span style="font-size:11px; color:var(--av-text-muted); font-weight:400;">(已开启父子级联防双删保护)</span>：
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button id="btn-empty-select-all" class="tool-btn av-input" style="padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">全选全部空目录</button>
                        <button id="btn-empty-clear" class="tool-btn av-input" style="padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">取消选择</button>
                        <button id="btn-empty-delete" style="background:var(--av-surface-2); color:var(--av-text-soft); border:none; padding:6px 16px; border-radius:6px; cursor:not-allowed; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px;" disabled>${ICONS.trash} 批量移至回收站 (0)</button>
                    </div>
                </div>
                <div style="border-top:1px solid var(--av-border); padding-top:6px;">
                    ${shownList.map(f => {
                        const isCascade = f.type === 'cascade';
                        const folderUrl = `https://115.com/?cid=${f.pid}&offset=0&mode=wangpan`;
                        const checked = selectedEmptyCids.has(String(f.cid));
                        return `
                            <div class="file-row clickable-row" style="display:flex; align-items:center; padding:8px 10px; border-radius:6px; border-bottom:1px dashed var(--av-border-dashed); font-size:13px;">
                                <input type="checkbox" class="empty-chk" data-cid="${f.cid}" ${checked ? 'checked' : ''} style="margin-right:10px; width:15px; height:15px; cursor:pointer;">
                                <span style="display:flex; align-items:center; color:#d97706; margin-right:8px;">${ICONS.folder}</span>
                                <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:12px;" title="${escapeHtml(f.path || f.n)}">
                                    <span style="font-weight:600;">${escapeHtml(f.n)}</span>
                                    <span style="background:${isCascade ? '#e0e7ff' : '#fef3c7'}; color:${isCascade ? '#3730a3' : '#92400e'}; font-size:11px; padding:2px 7px; border-radius:4px; margin-left:8px; font-weight:600;">${escapeHtml(f.reason || '直接空目录')}</span>
                                    ${f.path ? `<span style="color:var(--av-text-soft); font-size:11px; margin-left:8px;">路径: ${escapeHtml(f.path)}</span>` : ''}
                                </div>
                                <a href="${folderUrl}" target="_blank" class="row-open-dir" style="color:var(--av-text-muted); text-decoration:none; font-size:11px; padding:2px 8px; border-radius:4px; margin-right:10px; display:inline-flex; align-items:center; gap:4px; border:1px solid transparent;">${ICONS.openDir} 打开父目录</a>
                                <span style="width:118px; text-align:right; font-variant-numeric:tabular-nums; color:var(--av-text-soft); font-size:12px;">${f.t ? f.t.slice(0, 16) : ''}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${totalPages > 1 ? `
                    <div style="display:flex; justify-content:center; align-items:center; gap:10px; margin-top:14px; font-size:12px; color:var(--av-text-muted);">
                        <button id="empty-prev" class="av-input" style="padding:4px 12px; border-radius:6px; cursor:pointer;" ${currentPage === 1 ? 'disabled' : ''}>上一页</button>
                        <span>第 ${currentPage} / ${totalPages} 页 (共 ${list.length} 项)</span>
                        <button id="empty-next" class="av-input" style="padding:4px 12px; border-radius:6px; cursor:pointer;" ${currentPage === totalPages ? 'disabled' : ''}>下一页</button>
                    </div>
                ` : ''}
            </div>
        `;
        contentBox.innerHTML = html;

        const btnEmptyDel = document.getElementById('btn-empty-delete');
        const updateEmptyStats = () => {
            const topLevel = filterTopLevelEmptyFolders(Array.from(selectedEmptyCids), emptyFoldersList);
            btnEmptyDel.innerHTML = `${ICONS.trash} 批量移至回收站 (${selectedEmptyCids.size} 项${topLevel.length < selectedEmptyCids.size ? ` -> 仅提交 ${topLevel.length} 顶层` : ''})`;
            styleActionBtn(btnEmptyDel, selectedEmptyCids.size > 0, true);
        };
        window._updateEmptyStats = updateEmptyStats;
        updateEmptyStats();

        document.getElementById('btn-empty-select-all').onclick = () => { list.forEach(f => selectedEmptyCids.add(String(f.cid))); renderEmptyFolders(); };
        document.getElementById('btn-empty-clear').onclick = () => { selectedEmptyCids.clear(); renderEmptyFolders(); };
        const prev = document.getElementById('empty-prev');
        const next = document.getElementById('empty-next');
        if (prev) prev.onclick = () => { if (currentPage > 1) { currentPage--; renderEmptyFolders(); } };
        if (next) next.onclick = () => { if (currentPage < totalPages) { currentPage++; renderEmptyFolders(); } };

        btnEmptyDel.onclick = async () => {
            const rawCids = Array.from(selectedEmptyCids);
            if (rawCids.length === 0) return;
            const cidsToDelete = filterTopLevelEmptyFolders(rawCids, emptyFoldersList);
            const confirmed = await uiConfirm(`确认将选中的 ${rawCids.length} 个空文件夹移至 115 回收站？\n（已合并剔除重复嵌套子目录，实际仅提交 ${cidsToDelete.length} 个顶层目录请求）`, '删除空文件夹确认', true, 'trash');
            if (!confirmed) return;

            const prog = showBatchProgressModal('正在清理空文件夹...');
            try {
                const done = await deleteFiles(cidsToDelete, (d, total) => prog.update(d, total, `已删除 ${d} / ${total} 个顶层空目录`), prog);
                prog.close();
                applyOptimisticEmptyDelete(rawCids);
                await uiAlert(`成功清理 ${rawCids.length} 个空文件夹！`, '清理完成', 'info');
            } catch (err) {
                prog.close();
                if (err.completed && err.completed.length > 0) applyOptimisticEmptyDelete(err.completed);
                await uiAlert(`清理异常或中止: ${err.message}`, '删除异常', 'alert');
            }
        };
    }

    // 跨所有分页的智能选区
    function smartAutoSelect(strategy) {
        const settings = getSettings();
        const activeGroups = currentTab === 'sha' ? shaDuplicateGroups : duplicateGroups;
        const pairedSubMap = buildPairedSubMap(activeGroups, settings);
        const visibleKeys = filterAndSortGroupKeys(activeGroups, { searchQuery, activeTagFilter, currentSort, settings, pairedSubMap });

        for (const key of visibleKeys) {
            const items = activeGroups[key] || [];
            if (items.length <= 1) continue;
            const keeper = pickBestKeeperFile(items, strategy);
            for (const f of items) {
                const fid = String(f.fid);
                if (keeper && fid === String(keeper.fid)) selectedFids.delete(fid);
                else selectedFids.add(fid);
            }
        }

        document.querySelectorAll('#dedup-content .file-chk').forEach(chk => {
            chk.checked = selectedFids.has(String(chk.dataset.fid));
        });
        updateSelectedStats();
    }

    function clearAllSelection() {
        selectedFids.clear();
        lastCheckedAnchorFid = null;
        document.querySelectorAll('#dedup-content .file-chk').forEach(chk => chk.checked = false);
        updateSelectedStats();
    }

    function updateSelectedStats() {
        const sizeMap = new Map(allScannedFiles.map(f => [String(f.fid), Number(f.s || 0)]));
        let totalSize = 0;
        selectedFids.forEach(fid => { if (sizeMap.has(fid)) totalSize += sizeMap.get(fid); });

        const countEl = document.getElementById('selected-count');
        const sizeEl = document.getElementById('selected-size');
        const btnDel = document.getElementById('btn-batch-delete');
        const chkPage = document.getElementById('chk-select-page');
        const hasChecked = selectedFids.size > 0;

        if (countEl) { countEl.innerText = selectedFids.size; countEl.style.color = hasChecked ? '#e11d48' : 'var(--av-text-soft)'; }
        if (sizeEl) { sizeEl.innerText = formatSize(totalSize); sizeEl.style.color = hasChecked ? 'var(--av-text)' : 'var(--av-text-soft)'; }

        const visibleChks = Array.from(document.querySelectorAll('#dedup-content .file-chk'));
        const visibleCheckedCount = visibleChks.filter(c => c.checked).length;
        if (chkPage && visibleChks.length > 0) {
            chkPage.checked = (visibleCheckedCount === visibleChks.length);
            chkPage.indeterminate = (visibleCheckedCount > 0 && visibleCheckedCount < visibleChks.length);
        } else if (chkPage) {
            chkPage.checked = false;
            chkPage.indeterminate = false;
        }
        styleActionBtn(btnDel, hasChecked, true);
        updateQuickSelectButtons();
    }

    // 严格尊重当前 Tab 与搜索/筛选上下文获取目标文件
    function getTargetFilesForBatchAction() {
        const settings = getSettings();
        const activeGroupMap = currentTab === 'dups' ? duplicateGroups : (currentTab === 'sha' ? shaDuplicateGroups : allGroups);
        const fileByFid = new Map();
        for (const items of Object.values(activeGroupMap)) {
            for (const f of items) fileByFid.set(String(f.fid), f);
        }

        if (selectedFids.size > 0) {
            return Array.from(selectedFids).map(fid => fileByFid.get(fid)).filter(Boolean);
        }

        const pairedSubMap = buildPairedSubMap(activeGroupMap, settings);
        const visibleKeys = filterAndSortGroupKeys(activeGroupMap, { searchQuery, activeTagFilter, currentSort, settings, pairedSubMap });
        const result = [];
        const seen = new Set();
        for (const key of visibleKeys) {
            for (const item of activeGroupMap[key]) {
                if (item.parsedCode && !seen.has(String(item.fid))) {
                    seen.add(String(item.fid));
                    result.push(item);
                }
            }
        }
        return result;
    }

    async function runBatchRename() {
        const targetFiles = getTargetFilesForBatchAction();
        if (targetFiles.length === 0) {
            await uiAlert('当前视图或勾选中没有可重命名的已识别番号文件！', '提示', 'info');
            return;
        }
        const settings = getSettings();
        const plan = planBatchRename(targetFiles, allScannedFiles, subtitleFilesList, settings);
        const allOps = [...plan.renameItems, ...plan.pairedSubItems];

        if (allOps.length === 0) {
            const msg = plan.conflictItems.length > 0
                ? `未发现可安全重命名项。拦截到 ${plan.conflictItems.length} 个同目录重名冲突文件（请先完成去重）。`
                : '检查完毕！所选/当前视图的文件均已符合目标命名模板。';
            await uiAlert(msg, '无需重命名', 'info');
            return;
        }

        const previewList = [...plan.renameItems.slice(0, 5), ...plan.pairedSubItems.slice(0, 2)];
        const confirmed = await showCustomDialog({
            type: 'preview-rename', title: '批量规范化重命名预览', items: previewList,
            conflictCount: plan.conflictItems.length, pairedSubCount: plan.pairedSubItems.length,
            totalCount: allOps.length, confirmText: `确认重命名 (${allOps.length}项)`, cancelText: '取消', iconType: 'edit'
        });
        if (!confirmed) return;

        const prog = showBatchProgressModal('正在执行批量规范重命名...');
        try {
            const doneItems = await renameFiles(allOps, (done, total) => prog.update(done, total, `已完成 ${done} / ${total} 个项目`), prog);
            prog.close();
            if (doneItems.length > 0) {
                addRenameHistory({ cid: getCurrentCid(), items: doneItems.map(x => ({ fid: x.fid, from: x.oldName, to: x.newName })) });
                const renamedMap = new Map(doneItems.map(x => [String(x.fid), x.newName]));
                applyOptimisticFileChange(files => files.map(f => renamedMap.has(String(f.fid)) ? { ...f, n: renamedMap.get(String(f.fid)) } : f));
            }
            await uiAlert(`批量重命名完成！成功规范化 ${doneItems.length} 个文件（已保存撤销快照并即时更新视图）。`, '重命名完成', 'info');
        } catch (err) {
            prog.close();
            if (err.completed && err.completed.length > 0) {
                addRenameHistory({ cid: getCurrentCid(), items: err.completed.map(x => ({ fid: x.fid, from: x.oldName, to: x.newName })) });
                const renamedMap = new Map(err.completed.map(x => [String(x.fid), x.newName]));
                applyOptimisticFileChange(files => files.map(f => renamedMap.has(String(f.fid)) ? { ...f, n: renamedMap.get(String(f.fid)) } : f));
            }
            await uiAlert(`批量重命名中断或触发频控: ${err.message}`, '重命名中断', 'alert');
        }
    }

    async function runDeleteDups() {
        const fids = Array.from(selectedFids);
        if (fids.length === 0) return;
        const sizeMap = new Map(allScannedFiles.map(f => [String(f.fid), Number(f.s || 0)]));
        let totalSize = 0;
        fids.forEach(fid => { if (sizeMap.has(fid)) totalSize += sizeMap.get(fid); });

        const confirmed = await uiConfirm(`确认将跨页累计选中的 ${fids.length} 个文件移至 115 回收站？\n（预计释放 ${formatSize(totalSize)}，可在回收站还原）`, '批量删除确认', true, 'trash');
        if (!confirmed) return;

        const prog = showBatchProgressModal('正在移至 115 回收站...');
        try {
            const doneIds = await deleteFiles(fids, (done, total) => prog.update(done, total, `已删除 ${done} / ${total} 个文件`), prog);
            prog.close();
            const delSet = new Set(doneIds.map(String));
            selectedFids.clear();
            applyOptimisticFileChange(files => files.filter(f => !delSet.has(String(f.fid))));
            await uiAlert(`成功将 ${doneIds.length} 个文件移至回收站！`, '删除成功', 'info');
        } catch (err) {
            prog.close();
            const delSet = new Set((err.completed || []).map(String));
            if (delSet.size > 0) {
                err.completed.forEach(id => selectedFids.delete(String(id)));
                applyOptimisticFileChange(files => files.filter(f => !delSet.has(String(f.fid))));
            }
            await uiAlert(`删除异常或中止: ${err.message}`, '删除异常', 'alert');
        }
    }

    // ==================== 辅助功能独立弹窗面板 ====================

    function openSettingsDialog() {
        const settings = getSettings();
        const sampleFile = { n: 'www.98t.la@sdnm-015_jasna5_4K_60fps_C.mp4', parsedCode: 'SDNM-015', partInfo: '' };

        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)',
            zIndex: '200000', display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });

        overlay.innerHTML = `
            <div class="av-modal-surface" style="width:580px; max-width:94vw; border-radius:14px; border:1px solid var(--av-border); overflow:hidden; box-shadow:0 24px 56px rgba(0,0,0,0.28);">
                <div style="padding:18px 24px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700;">${ICONS.settings} 助手偏好设置与规则扩展</div>
                    <button id="set-close" class="av-subsurface" style="border:1px solid var(--av-border); width:28px; height:28px; border-radius:6px; font-size:16px; cursor:pointer; color:var(--av-text-muted);">&times;</button>
                </div>
                <div class="av-subsurface" style="padding:18px 24px; max-height:70vh; overflow-y:auto; display:flex; flex-direction:column; gap:14px;">
                    
                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:14px;">
                        <div style="font-size:13px; font-weight:700; margin-bottom:8px;">1. 规范重命名模板与字幕联动</div>
                        <select id="set-tpl" class="av-input" style="width:100%; padding:7px 10px; border-radius:6px; font-size:12px; margin-bottom:8px;">
                            <option value="default">极简纯番号：{code}{part}.{ext} (推荐)</option>
                            <option value="sub_uc">字幕/无码标识版：{code}{part}{c}{uc}.{ext}</option>
                            <option value="badges">完整画质徽章版：{code}{part} {tags}.{ext}</option>
                            <option value="custom">自定义模板表达式...</option>
                        </select>
                        <div id="set-custom-wrap" style="display:none; margin-bottom:8px;">
                            <input id="set-custom-tpl" class="av-input" type="text" value="${escapeHtml(settings.customTemplate)}" style="width:100%; box-sizing:border-box; padding:6px 10px; border-radius:6px; font-size:12px; font-family:ui-monospace, monospace;">
                            <div style="font-size:11px; color:var(--av-text-soft); margin-top:4px;">可用变量：{code} 番号 / {part} 分集 / {c} 中字 / {uc} 无码 / {tags} 所有徽章</div>
                        </div>
                        <div class="av-subsurface" style="padding:7px 10px; border-radius:6px; font-size:12px; color:var(--av-text-secondary);">
                            效果预览：<b id="set-tpl-preview" style="color:#4f46e5; font-family:ui-monospace, monospace;"></b>
                        </div>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--av-text-secondary); margin-top:10px; cursor:pointer;">
                            <input type="checkbox" id="set-sync-sub" ${settings.syncSubtitles ? 'checked' : ''}> 批量重命名 / 归档时同步联动处理同目录外挂字幕 (.ass/.srt/.ssa)
                        </label>
                    </div>

                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:14px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <div style="font-size:13px; font-weight:700; margin-bottom:6px;">2. 元数据外链站</div>
                            <select id="set-search-site" class="av-input" style="width:100%; padding:7px 10px; border-radius:6px; font-size:12px;">
                                <option value="javbus">JavBus</option>
                                <option value="javdb">JavDB</option>
                                <option value="avsox">AVSOX</option>
                            </select>
                        </div>
                        <div>
                            <div style="font-size:13px; font-weight:700; margin-bottom:6px;">3. 界面主题模式</div>
                            <select id="set-theme" class="av-input" style="width:100%; padding:7px 10px; border-radius:6px; font-size:12px;">
                                <option value="auto">跟随系统 (Auto)</option>
                                <option value="light">浅色清爽 (Light)</option>
                                <option value="dark">深邃夜间 (Dark)</option>
                            </select>
                        </div>
                    </div>

                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:14px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <div style="font-size:12px; font-weight:700; margin-bottom:5px;">4. 自定义厂牌前缀白名单</div>
                            <input id="set-custom-prefixes" class="av-input" type="text" value="${escapeHtml((settings.customPrefixes || []).join(', '))}" style="width:100%; box-sizing:border-box; padding:6px 10px; border-radius:6px; font-size:12px;" placeholder="例如: MYCODE, SERIES">
                            <div style="font-size:11px; color:var(--av-text-soft); margin-top:4px;">逗号分隔，优先匹配此类前缀+数字</div>
                        </div>
                        <div>
                            <div style="font-size:12px; font-weight:700; margin-bottom:5px;">5. 自定义屏蔽词黑名单</div>
                            <input id="set-custom-blacklist" class="av-input" type="text" value="${escapeHtml((settings.customBlacklist || []).join(', '))}" style="width:100%; box-sizing:border-box; padding:6px 10px; border-radius:6px; font-size:12px;" placeholder="例如: BACKUP, CLIP">
                            <div style="font-size:11px; color:var(--av-text-soft); margin-top:4px;">逗号分隔，禁止把这些词误认成番号</div>
                        </div>
                    </div>

                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:14px;">
                        <div style="font-size:13px; font-weight:700; margin-bottom:6px;">6. 忽略扫描目录名单 (名称关键词或 CID，每行一个)</div>
                        <textarea id="set-ignore-folders" class="av-input" rows="2" style="width:100%; box-sizing:border-box; padding:8px 10px; border-radius:6px; font-size:12px;" placeholder="字幕库&#10;个人照片备份">${escapeHtml((settings.ignoreFolders || []).join('\n'))}</textarea>
                    </div>

                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:14px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
                        <div>
                            <div style="font-size:13px; font-weight:700;">7. IndexedDB 本地缓存 &amp; 有效期</div>
                            <div style="display:flex; align-items:center; gap:10px; margin-top:6px; font-size:12px; color:var(--av-text-secondary);">
                                <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="set-enable-cache" ${settings.enableCache ? 'checked' : ''}> 启用缓存</label>
                                <span>过期时间(分钟): <input id="set-cache-ttl" class="av-input" type="number" min="1" max="1440" value="${Number(settings.cacheTtlMinutes || 30)}" style="width:60px; padding:2px 6px; border-radius:4px; font-size:12px;"></span>
                            </div>
                        </div>
                        <button id="set-clear-cache" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">清空缓存</button>
                    </div>
                </div>
                <div style="padding:14px 24px; border-top:1px solid var(--av-border); display:flex; justify-content:flex-end; gap:10px;">
                    <button id="set-cancel" class="av-input" style="padding:7px 16px; border-radius:6px; font-size:13px; cursor:pointer;">取消</button>
                    <button id="set-save" style="padding:7px 20px; border:none; background:#4f46e5; color:#fff; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;">保存配置并刷新</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const selTpl = overlay.querySelector('#set-tpl');
        const customWrap = overlay.querySelector('#set-custom-wrap');
        const customInput = overlay.querySelector('#set-custom-tpl');
        const previewEl = overlay.querySelector('#set-tpl-preview');

        selTpl.value = settings.renameTemplate;
        overlay.querySelector('#set-search-site').value = settings.preferredSearchSite;
        overlay.querySelector('#set-theme').value = settings.theme || 'auto';

        const updatePreview = () => {
            customWrap.style.display = selTpl.value === 'custom' ? 'block' : 'none';
            previewEl.innerText = getStandardAvName(sampleFile, selTpl.value, customInput.value);
        };
        selTpl.onchange = updatePreview;
        customInput.oninput = updatePreview;
        updatePreview();

        const close = attachModalCloseBehavior(overlay, () => overlay.remove());
        overlay.querySelector('#set-close').onclick = close;
        overlay.querySelector('#set-cancel').onclick = close;

        overlay.querySelector('#set-clear-cache').onclick = async () => {
            await CacheManager.clearAll();
            await uiAlert('所有本地目录扫描缓存已清空！', '缓存已清空', 'info');
        };

        overlay.querySelector('#set-save').onclick = () => {
            const parseList = (str) => str.split(/[\r\n,，]+/).map(s => s.trim()).filter(Boolean);
            saveSettings({
                renameTemplate: selTpl.value,
                customTemplate: customInput.value.trim() || DEFAULT_SETTINGS.customTemplate,
                syncSubtitles: overlay.querySelector('#set-sync-sub').checked,
                preferredSearchSite: overlay.querySelector('#set-search-site').value,
                theme: overlay.querySelector('#set-theme').value,
                customPrefixes: parseList(overlay.querySelector('#set-custom-prefixes').value),
                customBlacklist: parseList(overlay.querySelector('#set-custom-blacklist').value),
                ignoreFolders: parseList(overlay.querySelector('#set-ignore-folders').value),
                enableCache: overlay.querySelector('#set-enable-cache').checked,
                cacheTtlMinutes: Math.max(1, parseInt(overlay.querySelector('#set-cache-ttl').value, 10) || 30)
            });
            close();
            if (lastScanResultSnapshot) {
                processScanResult(lastScanResultSnapshot, getCurrentCid() === '0', lastScanMeta.fromCache, lastScanMeta.cacheTimestamp);
            } else {
                renderCurrentTab();
            }
        };
    }

    async function openArchiveDialog() {
        const targetFiles = getTargetFilesForBatchAction();
        if (targetFiles.length === 0) {
            await uiAlert('当前视图或勾选中没有可归档的已识别番号视频！', '提示', 'info');
            return;
        }
        const settings = getSettings();
        const startCid = getCurrentCid();

        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)',
            zIndex: '200000', display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });

        const subFolderOpts = allDirectSubfolders.map(d => `<option value="${escapeHtml(d.cid)}">${escapeHtml(d.n)} (CID: ${d.cid})</option>`).join('');

        overlay.innerHTML = `
            <div class="av-modal-surface" style="width:580px; max-width:94vw; border-radius:14px; border:1px solid var(--av-border); overflow:hidden; box-shadow:0 24px 56px rgba(0,0,0,0.28);">
                <div style="padding:18px 24px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700;">${ICONS.folderPlus} 智能建夹归档 &amp; 集中提取移动</div>
                    <button id="arc-close" class="av-subsurface" style="border:1px solid var(--av-border); width:28px; height:28px; border-radius:6px; font-size:16px; cursor:pointer; color:var(--av-text-muted);">&times;</button>
                </div>
                <div class="av-subsurface" style="padding:20px 24px;">
                    <div style="font-size:13px; margin-bottom:12px;">待处理视频：<b style="color:#15803d;">${targetFiles.length}</b> 个（已遵循当前筛选条件与勾选）</div>
                    <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:12px; margin-bottom:12px;">
                        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; margin-bottom:10px; cursor:pointer;">
                            <input type="radio" name="arc-mode" value="prefix" ${settings.archiveMode === 'prefix' ? 'checked' : ''} style="margin-top:2px;">
                            <div><b>按片商/前缀目录分类</b><div style="color:var(--av-text-muted); font-size:11px;">例如 <code>SSIS-023.mp4</code> ➔ 移入 <code>/SSIS/</code></div></div>
                        </label>
                        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; margin-bottom:10px; cursor:pointer;">
                            <input type="radio" name="arc-mode" value="movie_folder" ${settings.archiveMode === 'movie_folder' ? 'checked' : ''} style="margin-top:2px;">
                            <div><b>一影一夹模式（推荐 Emby / Kodi / Infuse）</b><div style="color:var(--av-text-muted); font-size:11px;">每部影片独占同名目录 <code>/SSIS-023/</code></div></div>
                        </label>
                        <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
                            <input type="radio" name="arc-mode" value="custom_cid" ${settings.archiveMode === 'custom_cid' ? 'checked' : ''} style="margin-top:2px;">
                            <div style="flex:1;">
                                <b>集中汇总到指定目标目录 (跨子目录提取)</b>
                                <div id="arc-custom-cid-wrap" style="display:none; margin-top:6px;">
                                    ${allDirectSubfolders.length > 0 ? `<select id="arc-select-cid" class="av-input" style="width:100%; padding:5px 8px; border-radius:6px; font-size:12px; margin-bottom:6px;"><option value="">-- 可快捷选择当前一级子目录 --</option>${subFolderOpts}</select>` : ''}
                                    <input id="arc-input-cid" class="av-input" type="text" placeholder="或直接粘贴目标文件夹 115 CID (如 2987654321)" style="width:100%; box-sizing:border-box; padding:5px 8px; border-radius:6px; font-size:12px; font-family:ui-monospace, monospace;">
                                </div>
                            </div>
                        </label>
                    </div>
                    <div id="arc-summary" class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:10px 14px; font-size:12px; max-height:170px; overflow-y:auto;"></div>
                </div>
                <div style="padding:14px 24px; border-top:1px solid var(--av-border); display:flex; justify-content:flex-end; gap:10px;">
                    <button id="arc-cancel" class="av-input" style="padding:7px 16px; border-radius:6px; font-size:13px; cursor:pointer;">取消</button>
                    <button id="arc-run" style="padding:7px 20px; border:none; background:#15803d; color:#fff; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;">开始执行归档</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const close = attachModalCloseBehavior(overlay, () => overlay.remove());
        overlay.querySelector('#arc-close').onclick = close;
        overlay.querySelector('#arc-cancel').onclick = close;

        const existingDirByName = new Map();
        for (const d of allDirectSubfolders) existingDirByName.set(d.n.toLowerCase(), d.cid);

        const selCid = overlay.querySelector('#arc-select-cid');
        const inputCid = overlay.querySelector('#arc-input-cid');
        const customWrap = overlay.querySelector('#arc-custom-cid-wrap');

        const renderPlan = () => {
            const mode = overlay.querySelector('input[name="arc-mode"]:checked').value;
            customWrap.style.display = mode === 'custom_cid' ? 'block' : 'none';
            const tc = inputCid.value.trim();
            const buckets = planArchiveBuckets(targetFiles, subtitleFilesList, mode, tc, settings.syncSubtitles);
            const sumBox = overlay.querySelector('#arc-summary');
            const totalMoves = Array.from(buckets.values()).reduce((a, b) => a + b.size, 0);

            if (mode === 'custom_cid' && (!tc || !/^\d+$/.test(tc) || tc === '0')) {
                sumBox.innerHTML = '<div style="color:#d97706;">请选择现有目录或输入有效的纯数字目标目录 CID（不支持根目录 0）</div>';
                overlay.querySelector('#arc-run').disabled = true;
                return;
            }
            if (buckets.size === 0) {
                sumBox.innerHTML = '<div style="color:#10b981; font-weight:600;">✅ 所选文件均已在对应目标目录中，无需移动！</div>';
                overlay.querySelector('#arc-run').disabled = true;
                return;
            }
            overlay.querySelector('#arc-run').disabled = false;
            const samples = Array.from(buckets.entries()).slice(0, 8).map(([name, fidSet]) => {
                if (mode === 'custom_cid') return `<div>📁 目标 CID <b>${escapeHtml(name)}</b> ➔ 集中汇总移入 ${fidSet.size} 个文件</div>`;
                const exists = existingDirByName.has(name.toLowerCase());
                return `<div style="margin-bottom:4px;">📁 <b>${escapeHtml(name)}</b> <span style="color:var(--av-text-soft);">(${exists ? '复用现有目录' : '自动新建目录'})</span> ➔ 移入 ${fidSet.size} 个文件</div>`;
            }).join('');
            sumBox.innerHTML = `<div style="margin-bottom:6px; font-weight:600;">预计操作 <b>${buckets.size}</b> 个目标目录，共移动 <b>${totalMoves}</b> 个文件：</div>${samples}${buckets.size > 8 ? `<div style="color:var(--av-text-soft);">... 另有 ${buckets.size - 8} 个目标目录</div>` : ''}`;
        };

        if (selCid) selCid.onchange = () => { inputCid.value = selCid.value; renderPlan(); };
        inputCid.oninput = renderPlan;
        overlay.querySelectorAll('input[name="arc-mode"]').forEach(r => r.onchange = renderPlan);
        renderPlan();

        overlay.querySelector('#arc-run').onclick = async () => {
            const mode = overlay.querySelector('input[name="arc-mode"]:checked').value;
            const tc = inputCid.value.trim();
            saveSettings({ archiveMode: mode });
            const buckets = planArchiveBuckets(targetFiles, subtitleFilesList, mode, tc, settings.syncSubtitles);
            close();

            const totalFiles = Array.from(buckets.values()).reduce((a, b) => a + b.size, 0);
            let doneCount = 0;
            const movedFidToTarget = new Map();
            const prog = showBatchProgressModal('正在智能归档并移动文件...');

            try {
                for (const [folderKey, fidSet] of buckets.entries()) {
                    const fids = Array.from(fidSet);
                    if (prog.isAborted()) throw new Error(`已手动中止 (已完成移动 ${doneCount}/${totalFiles})`);
                    let targetCid = mode === 'custom_cid' ? folderKey : await ensureFolderCid(startCid, folderKey, existingDirByName);
                    prog.update(doneCount, totalFiles, `正在移动到目标目录 (${folderKey})...`);
                    const done = await moveFiles(fids, targetCid, (d) => prog.update(doneCount + d, totalFiles, `正在移动到 ${folderKey} (${doneCount + d}/${totalFiles})`), prog);
                    done.forEach(fid => movedFidToTarget.set(String(fid), { targetCid, folderKey }));
                    doneCount += done.length;
                }
                prog.close();
                applyOptimisticFileChange(files => files.map(f => {
                    const m = movedFidToTarget.get(String(f.fid));
                    if (!m) return f;
                    return { ...f, cid: String(m.targetCid), relPath: mode === 'custom_cid' ? `/CID:${m.targetCid}` : `/${m.folderKey}` };
                }));
                await uiAlert(`智能归档完成！成功归类移动 ${doneCount} 个文件至 ${buckets.size} 个目标目录。`, '归档成功', 'info');
            } catch (err) {
                prog.close();
                if (movedFidToTarget.size > 0) {
                    applyOptimisticFileChange(files => files.map(f => {
                        const m = movedFidToTarget.get(String(f.fid));
                        return m ? { ...f, cid: String(m.targetCid), relPath: mode === 'custom_cid' ? `/CID:${m.targetCid}` : `/${m.folderKey}` } : f;
                    }));
                }
                await uiAlert(`归档异常或中止: ${err.message}`, '归档提示', 'alert');
            }
        };
    }

    function openExportDialog() {
        const settings = getSettings();
        const allItems = Object.values(allGroups).flat();
        const uniqueCodes = Array.from(new Set(allItems.map(i => i.parsedCode))).sort();

        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)',
            zIndex: '200000', display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });

        overlay.innerHTML = `
            <div class="av-modal-surface" style="width:640px; max-width:95vw; border-radius:14px; border:1px solid var(--av-border); overflow:hidden; box-shadow:0 24px 56px rgba(0,0,0,0.28);">
                <div style="padding:16px 24px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700;">${ICONS.download} 清单导出 &amp; 外部列表查漏比对</div>
                    <button id="exp-close" class="av-subsurface" style="border:1px solid var(--av-border); width:28px; height:28px; border-radius:6px; font-size:16px; cursor:pointer; color:var(--av-text-muted);">&times;</button>
                </div>
                <div style="display:flex; border-bottom:1px solid var(--av-border); padding:0 24px; gap:16px;">
                    <div id="exp-tab-export" style="padding:10px 4px; font-size:13px; font-weight:700; color:#2563eb; border-bottom:2px solid #2563eb; cursor:pointer;">📤 导出当前番号库 (${uniqueCodes.length} 部)</div>
                    <div id="exp-tab-diff" style="padding:10px 4px; font-size:13px; font-weight:500; color:var(--av-text-muted); border-bottom:2px solid transparent; cursor:pointer;">🔍 外部清单查重 / 补漏比对</div>
                </div>
                <div id="exp-body-export" class="av-subsurface" style="padding:18px 24px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:10px;">
                        <select id="exp-format" class="av-input" style="padding:6px 10px; border-radius:6px; font-size:12px;">
                            <option value="txt">纯番号清单 (.txt) - 适合离线核对</option>
                            <option value="csv">Excel 详细报表 (.csv) - 含文件名/体积/标签/SHA1/路径</option>
                            <option value="md">Markdown 整理清单 (.md)</option>
                        </select>
                        <div style="display:flex; gap:8px;">
                            <button id="exp-copy" class="av-input" style="padding:6px 14px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;">${ICONS.copy} 复制全文</button>
                            <button id="exp-download" style="padding:6px 14px; background:#2563eb; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:5px;">${ICONS.download} 下载文件</button>
                        </div>
                    </div>
                    <textarea id="exp-preview" class="av-input" readonly rows="10" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; font-family:ui-monospace, monospace; font-size:12px;"></textarea>
                </div>
                <div id="exp-body-diff" class="av-subsurface" style="display:none; padding:18px 24px;">
                    <div style="font-size:12px; color:var(--av-text-secondary); margin-bottom:8px;">粘贴外部资源名或番号列表，快速分离出你网盘里<b>已经拥有</b>和<b>缺失待补</b>的番号：</div>
                    <textarea id="diff-input" class="av-input" rows="5" style="width:100%; box-sizing:border-box; padding:10px; border-radius:8px; font-size:12px;" placeholder="SSIS-001.mp4&#10;4k2.com@IPX-999&#10;FC2-PPV-1234567"></textarea>
                    <div style="display:flex; justify-content:flex-end; margin-top:8px;">
                        <button id="diff-run" style="padding:6px 16px; background:#4f46e5; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">立即比对分析</button>
                    </div>
                    <div id="diff-result" style="display:none; margin-top:12px; grid-template-columns:1fr 1fr; gap:10px;">
                        <div class="av-modal-surface" style="border:1px solid #fecdd3; border-radius:8px; padding:10px;">
                            <div style="font-size:12px; font-weight:700; color:#e11d48; margin-bottom:6px;" id="diff-owned-title">网盘已存在 (0)</div>
                            <textarea id="diff-owned-list" class="av-input" readonly rows="5" style="width:100%; box-sizing:border-box; border:none; font-size:11px; font-family:ui-monospace, monospace; resize:none;"></textarea>
                        </div>
                        <div class="av-modal-surface" style="border:1px solid #bbf7d0; border-radius:8px; padding:10px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                <span style="font-size:12px; font-weight:700; color:#15803d;" id="diff-missing-title">网盘缺失 (0)</span>
                                <a href="javascript:void(0)" id="diff-copy-missing" style="font-size:11px; color:#2563eb; text-decoration:none;">复制缺失</a>
                            </div>
                            <textarea id="diff-missing-list" class="av-input" readonly rows="5" style="width:100%; box-sizing:border-box; border:none; font-size:11px; font-family:ui-monospace, monospace; resize:none;"></textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const close = attachModalCloseBehavior(overlay, () => overlay.remove());
        overlay.querySelector('#exp-close').onclick = close;

        const tabExp = overlay.querySelector('#exp-tab-export');
        const tabDiff = overlay.querySelector('#exp-tab-diff');
        const bodyExp = overlay.querySelector('#exp-body-export');
        const bodyDiff = overlay.querySelector('#exp-body-diff');

        tabExp.onclick = () => {
            tabExp.style.color = '#2563eb'; tabExp.style.borderBottom = '2px solid #2563eb'; tabExp.style.fontWeight = '700';
            tabDiff.style.color = 'var(--av-text-muted)'; tabDiff.style.borderBottom = '2px solid transparent'; tabDiff.style.fontWeight = '500';
            bodyExp.style.display = 'block'; bodyDiff.style.display = 'none';
        };
        tabDiff.onclick = () => {
            tabDiff.style.color = '#2563eb'; tabDiff.style.borderBottom = '2px solid #2563eb'; tabDiff.style.fontWeight = '700';
            tabExp.style.color = 'var(--av-text-muted)'; tabExp.style.borderBottom = '2px solid transparent'; tabExp.style.fontWeight = '500';
            bodyDiff.style.display = 'block'; bodyExp.style.display = 'none';
        };

        const generateContent = (fmt) => {
            if (fmt === 'txt') return uniqueCodes.join('\n');
            if (fmt === 'md') {
                return `# 115 网盘番号整理清单 (共 ${uniqueCodes.length} 部)\n\n` +
                    allItems.map(i => `- \`${i.parsedCode}\`${i.partInfo ? ` [${i.partInfo}]` : ''} — ${i.n} (${formatSize(i.s)})`).join('\n');
            }
            const csvEsc = (v) => `"${String(v || '').replace(/"/g, '""')}"`;
            const header = ['番号', '分集', '文件名', '大小', '修改时间', '特征标签', 'SHA1', '目录路径'].map(csvEsc).join(',');
            const rows = allItems.map(i => [
                i.parsedCode, i.partInfo || '', i.n, formatSize(i.s), i.t || '',
                extractBadges(i.n).map(b => b.text).join('/'), i.sha || '', i.relPath || '/'
            ].map(csvEsc).join(','));
            return '\uFEFF' + [header, ...rows].join('\n');
        };

        const fmtSel = overlay.querySelector('#exp-format');
        const previewArea = overlay.querySelector('#exp-preview');
        const refreshExp = () => { previewArea.value = generateContent(fmtSel.value); };
        fmtSel.onchange = refreshExp;
        refreshExp();

        overlay.querySelector('#exp-copy').onclick = () => {
            navigator.clipboard.writeText(previewArea.value).then(() => {
                const btn = overlay.querySelector('#exp-copy');
                btn.innerHTML = `${ICONS.check} 已复制`;
                setTimeout(() => btn.innerHTML = `${ICONS.copy} 复制全文`, 1500);
            });
        };

        overlay.querySelector('#exp-download').onclick = () => {
            const fmt = fmtSel.value;
            const blob = new Blob([previewArea.value], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `115-av-list-${getCurrentCid()}.${fmt}`;
            a.click();
            URL.revokeObjectURL(a.href);
        };

        overlay.querySelector('#diff-run').onclick = () => {
            const res = compareCodeLibrary(overlay.querySelector('#diff-input').value, allGroups, {
                customPrefixes: settings.customPrefixes, customBlacklist: settings.customBlacklist
            });
            overlay.querySelector('#diff-result').style.display = 'grid';
            overlay.querySelector('#diff-owned-title').innerText = `网盘已存在 (${res.owned.length}) · 勿重复下载`;
            overlay.querySelector('#diff-missing-title').innerText = `网盘缺失 (${res.missing.length}) · 待补`;
            overlay.querySelector('#diff-owned-list').value = res.owned.join('\n');
            overlay.querySelector('#diff-missing-list').value = res.missing.join('\n');
        };
        overlay.querySelector('#diff-copy-missing').onclick = () => navigator.clipboard.writeText(overlay.querySelector('#diff-missing-list').value);
    }

    function openHistoryDialog() {
        const list = getRenameHistory();
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', backgroundColor: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(6px)',
            zIndex: '200000', display: 'flex', justifyContent: 'center', alignItems: 'center',
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        });

        const rowsHtml = list.length === 0
            ? '<div style="text-align:center; padding:40px 0; color:var(--av-text-soft); font-size:13px;">暂无重命名历史记录（每次重命名后会自动保存还原快照）</div>'
            : list.map(batch => `
                <div class="av-modal-surface" style="border:1px solid var(--av-border); border-radius:8px; padding:12px 14px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="font-size:12px; font-weight:700;">${new Date(batch.time).toLocaleString()} · 共 <b style="color:#4f46e5;">${batch.count}</b> 个文件</div>
                        <div style="display:flex; gap:8px;">
                            <button class="hist-export-btn av-input" data-id="${batch.id}" style="padding:4px 10px; border-radius:6px; font-size:11px; cursor:pointer;">导出映射</button>
                            <button class="hist-undo-btn" data-id="${batch.id}" style="padding:4px 10px; background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">↩️ 一键撤销还原</button>
                        </div>
                    </div>
                    <div style="font-size:11px; color:var(--av-text-muted); line-height:1.5;">
                        ${batch.items.slice(0, 3).map(it => `<div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><code>${escapeHtml(it.to)}</code> ↩ <code>${escapeHtml(it.from)}</code></div>`).join('')}
                        ${batch.items.length > 3 ? `<div>... 等共 ${batch.items.length} 项</div>` : ''}
                    </div>
                </div>
            `).join('');

        overlay.innerHTML = `
            <div class="av-modal-surface" style="width:560px; max-width:94vw; border-radius:14px; border:1px solid var(--av-border); overflow:hidden; box-shadow:0 24px 56px rgba(0,0,0,0.28);">
                <div style="padding:16px 24px; border-bottom:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; align-items:center; gap:8px; font-size:15px; font-weight:700;">${ICONS.undo} 重命名历史记录 &amp; 撤销还原</div>
                    <button id="hist-close" class="av-subsurface" style="border:1px solid var(--av-border); width:28px; height:28px; border-radius:6px; font-size:16px; cursor:pointer; color:var(--av-text-muted);">&times;</button>
                </div>
                <div class="av-subsurface" style="padding:18px 24px; max-height:60vh; overflow-y:auto;">${rowsHtml}</div>
                <div style="padding:12px 24px; border-top:1px solid var(--av-border); display:flex; justify-content:space-between; align-items:center;">
                    <button id="hist-clear" style="background:transparent; border:none; color:var(--av-text-soft); font-size:12px; cursor:pointer;">清空历史记录</button>
                    <button id="hist-ok" style="padding:6px 18px; background:#2563eb; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">关闭</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        const close = attachModalCloseBehavior(overlay, () => overlay.remove());
        overlay.querySelector('#hist-close').onclick = close;
        overlay.querySelector('#hist-ok').onclick = close;
        overlay.querySelector('#hist-clear').onclick = () => { clearRenameHistory(); close(); };

        overlay.querySelectorAll('.hist-export-btn').forEach(btn => {
            btn.onclick = () => {
                const batch = list.find(b => b.id === btn.dataset.id);
                if (!batch) return;
                const blob = new Blob([batch.items.map(it => `${it.from}\t->\t${it.to}`).join('\n')], { type: 'text/plain;charset=utf-8' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `115-rename-map-${batch.id}.txt`;
                a.click();
                URL.revokeObjectURL(a.href);
            };
        });

        overlay.querySelectorAll('.hist-undo-btn').forEach(btn => {
            btn.onclick = async () => {
                const batch = list.find(b => b.id === btn.dataset.id);
                if (!batch) return;
                const conf = await uiConfirm(`确认将本次批次的 ${batch.count} 个文件全部恢复为改名前的原始文件名？`, '撤销重命名确认', true, 'undo');
                if (!conf) return;
                close();
                const undoOps = batch.items.map(it => ({ fid: it.fid, oldName: it.to, newName: it.from }));
                const prog = showBatchProgressModal('正在撤销还原原文件名...');
                try {
                    const done = await renameFiles(undoOps, (d, total) => prog.update(d, total, `已还原 ${d} / ${total}`), prog);
                    prog.close();
                    removeRenameHistory(batch.id);
                    const map = new Map(done.map(x => [String(x.fid), x.newName]));
                    applyOptimisticFileChange(files => files.map(f => map.has(String(f.fid)) ? { ...f, n: map.get(String(f.fid)) } : f));
                    await uiAlert(`已成功还原 ${done.length} 个文件至原文件名！`, '撤销成功', 'info');
                } catch (err) {
                    prog.close();
                    if (err.completed && err.completed.length > 0) {
                        const map = new Map(err.completed.map(x => [String(x.fid), x.newName]));
                        applyOptimisticFileChange(files => files.map(f => map.has(String(f.fid)) ? { ...f, n: map.get(String(f.fid)) } : f));
                    }
                    await uiAlert(`撤销还原过程出错: ${err.message}`, '撤销异常', 'alert');
                }
            };
        });
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        window.addEventListener('load', () => setTimeout(initUI, 1500));
        setInterval(() => { if (!document.getElementById('av-dedup-launcher')) initUI(); }, 2500);
    }

    if (typeof window === 'undefined' && typeof module !== 'undefined' && module.exports) {
        module.exports = {
            APP_VERSION,
            parseAvFileInfo,
            extractBadges,
            getStandardAvName,
            findPairedSubtitles,
            getPairedSubNewName,
            planBatchRename,
            planArchiveBuckets,
            getArchiveFolderName,
            filterTopLevelEmptyFolders,
            pickBestKeeperFile,
            buildScanIndexes,
            filterAndSortGroupKeys,
            getJunkCategory,
            getMetadataSearchUrl,
            compareCodeLibrary,
            isVideoFile,
            isSubtitleFile,
            isDamagedVideoFile,
            isFolderIgnored,
            sanitizeHttpUrl
        };
    }
})();
