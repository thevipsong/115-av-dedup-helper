// ==UserScript==
// @name         115网盘番号查重与非番号清理助手
// @namespace    https://github.com/songjiawei/115-av-dedup-helper
// @version      4.1.0
// @description  专为115网盘设计的番号查重与清理神器：支持分集独立保护（杜绝上下集被误删）、万级文件极速扫描、防限流节流、广告杂质文件一键批量删除、特征标签提取与目录定位直达。
// @author       songjiawei
// @license      MIT
// @match        https://115.com/*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    function formatSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // 智能提取视频特征标签 (4K / 60FPS / 中文字幕 / 无码)
    function extractBadges(name) {
        const badges = [];
        if (/4k|2160p/i.test(name)) badges.push({ text: '4K', color: '#6f42c1', bg: '#f3e8ff' });
        if (/60fps|060fps/i.test(name)) badges.push({ text: '60FPS', color: '#0d6efd', bg: '#e7f1ff' });
        if (/1080p|fhd/i.test(name)) badges.push({ text: '1080P', color: '#0dcaf0', bg: '#cff4fc' });
        if (/中文字幕|[-_](c|ch)\b|破解/i.test(name)) badges.push({ text: '中字', color: '#198754', bg: '#d1e7dd' });
        if (/uncensored|无码|leak|流出|[-_]uc\b/i.test(name)) badges.push({ text: '无码', color: '#fd7e14', bg: '#ffe5d0' });
        return badges;
    }

    // 安全网络请求 (防限流重试机制)
    async function safeFetchJson(url, retries = 2) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const resp = await fetch(url, { credentials: 'include' });
                const text = await resp.text();
                try {
                    return JSON.parse(text);
                } catch (jsonErr) {
                    if (attempt < retries) {
                        await sleep(1000 * (attempt + 1));
                        continue;
                    }
                    if (text.includes('频繁') || text.includes('验证')) {
                        throw new Error('115接口请求过于频繁，请稍候再试');
                    }
                    throw new Error('115接口返回异常');
                }
            } catch (err) {
                if (attempt < retries) {
                    await sleep(1000 * (attempt + 1));
                    continue;
                }
                throw err;
            }
        }
    }

    // 番号与分集提取逻辑
    function parseAvFileInfo(filename) {
        if (!filename) return null;
        let name = filename.replace(/\.[a-zA-Z0-9]{2,5}$/, '');

        // 1. 安全剥离发布站网址前缀与后缀
        name = name.replace(/^[^@\s]+@/, '');
        name = name.replace(/[-_ ]*(?:www\.)?[a-zA-Z0-9]+\.(?:com|net|org|la|xyz|cc|top|me|tv|vip|club|app|site|live|link|info)[-_ ]*/gi, ' ');

        // 2. 深度分集识别提取 (CD1/CD2, Part1/Part2, 4KS1/4KS2, 上集/下集 等)
        let part = '';
        const mPartNum = name.match(/[-_ ](?:4ks|ks|s|ep|episode|disc|part|cd|分卷|卷|集)[-_ ]?([0-9]+)(?![0-9])/i);
        if (mPartNum) {
            part = 'PART' + parseInt(mPartNum[1], 10);
        } else if (/[-_ ]?(上集|上卷|前篇|上)\b/i.test(name)) {
            part = 'PART1';
        } else if (/[-_ ]?(中集|中卷|中)\b/i.test(name)) {
            part = 'PART2';
        } else if (/[-_ ]?(下集|下卷|后篇|下)\b/i.test(name)) {
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

        // 3. 将括号与下划线替换为空格，完整保留内部番号
        let s = name.replace(/[\[\]\(\)\{\}【】（）_]+/g, ' ');

        // 4. 清理画质技术标签
        let clean = s.replace(/(?:^|[\s\-_])(?:4k\d*fps|4ks\d*|4k|2k|8k|\d{3,4}fps|\d{3,4}p|fhd|uhd|hd|x264|x265|h264|h265|hevc|aac|dts|uncensored|leaked|中文字幕|无码流出|破解|ai修复|uc)(?=[\s\-_]|$)/gi, ' ');
        clean = clean.replace(/[- ]+(?:c|ch|cd\d*|part\d*)[- ]*$/gi, ' ');

        // 5. FC2 特殊格式
        let fc2 = clean.match(/(?<![a-zA-Z0-9])fc2[- ]*(?:ppv)?[- ]*(\d{5,8})(?![0-9])/i);
        if (fc2) return { code: `FC2-PPV-${fc2[1]}`, part, dedupKey: part ? `FC2-PPV-${fc2[1]} [${part}]` : `FC2-PPV-${fc2[1]}` };

        // 6. Heyzo
        let heyzo = clean.match(/(?<![a-zA-Z0-9])heyzo[- ]*(\d{4})(?![0-9])/i);
        if (heyzo) return { code: `HEYZO-${heyzo[1]}`, part, dedupKey: part ? `HEYZO-${heyzo[1]} [${part}]` : `HEYZO-${heyzo[1]}` };

        // 7. 一本道 / 加勒比
        let carib = clean.match(/(?<![a-zA-Z0-9])(?:carib|caribbean)[- ]*(\d{6})[- ]*(\d{3})(?![0-9])/i);
        if (carib) return { code: `CARIB-${carib[1]}-${carib[2]}`, part, dedupKey: part ? `CARIB-${carib[1]}-${carib[2]} [${part}]` : `CARIB-${carib[1]}-${carib[2]}` };

        let pondo = clean.match(/(?<![a-zA-Z0-9])(?:1pon|1pondo)[- ]*(\d{6})[- ]*(\d{3})(?![0-9])/i);
        if (pondo) return { code: `1PONDO-${pondo[1]}-${pondo[2]}`, part, dedupKey: part ? `1PONDO-${pondo[1]}-${pondo[2]} [${part}]` : `1PONDO-${pondo[1]}-${pondo[2]}` };

        // 8. 东京热
        let tokyo = clean.match(/(?<![a-zA-Z0-9])tokyo[- ]*hot[- ]*(?:ge|k|n)?(\d{3,4})(?![0-9])/i);
        if (tokyo) return { code: `TOKYO-HOT-${tokyo[1]}`, part, dedupKey: part ? `TOKYO-HOT-${tokyo[1]} [${part}]` : `TOKYO-HOT-${tokyo[1]}` };

        // 9. 无码六位日期
        let dateCode = clean.match(/(?<!\d)(\d{6})[- ](\d{2,4})(?!\d)/);
        if (dateCode) return { code: `${dateCode[1]}-${dateCode[2]}`, part, dedupKey: part ? `${dateCode[1]}-${dateCode[2]} [${part}]` : `${dateCode[1]}-${dateCode[2]}` };

        // 10. 厂商前缀 + 编号 (支持标准字母、1-4位数字前导片商如 237nacr, 259LUXU, 013ONEX 等)
        let pattern = /(?<![a-zA-Z0-9])([a-zA-Z]{2,10}|\d{1,4}[a-zA-Z]{2,8}|[a-zA-Z]\d{2,3}|s2m)[- ]*([0-9]{1,6})[- ]*(?![0-9])/i;
        let m = clean.match(pattern);
        if (m) {
            let prefix = m[1].toUpperCase();
            let rawNum = m[2];
            const blacklist = ['PART', 'DISC', 'HEVC', 'AAC', 'DTS', 'MKV', 'MP4', 'AVI', 'ISO', 'FHD', 'UHD'];
            if (!blacklist.includes(prefix)) {
                let numInt = parseInt(rawNum, 10);
                let normNum = numInt < 1000 ? String(numInt).padStart(3, '0') : String(numInt);
                const code = `${prefix}-${normNum}`;
                const dedupKey = part ? `${code} [${part}]` : code;
                return { code, part, dedupKey };
            }
        }
        return null;
    }

    function getJunkCategory(file) {
        const ext = (file.n.split('.').pop() || '').toLowerCase();
        const size = file.s || 0;
        if (['html', 'htm', 'url', 'chm'].includes(ext)) return { label: '广告网页', color: '#856404', bg: '#fff3cd' };
        if (['txt', 'nfo', 'torrent', 'doc', 'docx'].includes(ext)) return { label: '文本广告', color: '#0c5460', bg: '#d1ecf1' };
        if (['mp4', 'mkv', 'avi', 'wmv', 'ts', 'flv'].includes(ext) && size < 50 * 1024 * 1024) return { label: '推广短片', color: '#721c24', bg: '#f8d7da' };
        return { label: '未识别文件', color: '#495057', bg: '#e9ecef' };
    }

    function getCurrentCid() {
        const url = window.location.href;
        let match = url.match(/[?&]cid=(\d+)/) || url.match(/#category\/(\d+)/) || url.match(/\/(\d+)$/);
        if (match) return match[1];
        if (window.top && window.top.location) {
            match = window.top.location.href.match(/[?&]cid=(\d+)/) || window.top.location.href.match(/#category\/(\d+)/);
            if (match) return match[1];
        }
        return '0';
    }

    async function fetchFileList(startCid, isRecursive, onProgress) {
        let allFiles = [];
        let folderQueue = [startCid];
        let visitedCids = new Set([startCid]);
        let processedFolders = 0;

        while (folderQueue.length > 0) {
            const currentCid = folderQueue.shift();
            processedFolders++;
            let offset = 0;
            const limit = 1150;

            if (isRecursive && processedFolders > 1) await sleep(150);

            while (true) {
                const url = `https://webapi.115.com/files?aid=1&cid=${currentCid}&o=user_ptime&asc=0&offset=${offset}&show_dir=${isRecursive ? 1 : 0}&limit=${limit}&natsort=1&format=json`;
                let data;
                try {
                    data = await safeFetchJson(url);
                } catch (fetchErr) {
                    console.warn(`[115查重] 读取目录失败，跳过:`, fetchErr);
                    break;
                }

                if (!data || !data.state || !data.data) break;

                for (let item of data.data) {
                    if (item.fid) {
                        allFiles.push(item);
                    } else if (isRecursive && item.cid && !visitedCids.has(item.cid)) {
                        visitedCids.add(item.cid);
                        folderQueue.push(item.cid);
                    }
                }

                if (onProgress) onProgress(allFiles.length, processedFolders);
                if (offset + limit >= data.count || data.data.length === 0) break;
                offset += limit;
                await sleep(100);
            }
        }
        return allFiles;
    }

    async function deleteFiles(fileIds, onProgress) {
        const batchSize = 50;
        let deletedCount = 0;
        for (let i = 0; i < fileIds.length; i += batchSize) {
            const chunk = fileIds.slice(i, i + batchSize);
            const body = chunk.map((fid, idx) => `fid[${idx}]=${fid}`).join('&') + '&ignore_warn=1';
            const resp = await fetch('https://webapi.115.com/rb/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: body,
                credentials: 'include'
            });
            const res = await resp.json();
            if (!res.state) throw new Error(res.msg || res.error || '删除遇到错误');
            deletedCount += chunk.length;
            if (onProgress) onProgress(deletedCount, fileIds.length);
            await sleep(150);
        }
    }

    let duplicateGroups = {};
    let allGroups = {};
    let unparsedFiles = [];
    let currentTab = 'dups';
    let searchQuery = '';
    let currentPage = 1;
    const pageSize = 50;

    function initUI() {
        if (document.getElementById('av-dedup-launcher')) return;

        const launchBtn = document.createElement('div');
        launchBtn.id = 'av-dedup-launcher';
        launchBtn.innerHTML = `
            <svg style="width:16px;height:16px;margin-right:6px;fill:currentColor;" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            番号查重助手
        `;
        Object.assign(launchBtn.style, {
            position: 'fixed',
            right: '28px',
            bottom: '88px',
            zIndex: '99999',
            background: 'linear-gradient(135deg, #0d6efd 0%, #0b5ed7 100%)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '30px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(13,110,253,0.35)',
            fontSize: '13px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            userSelect: 'none',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        });
        launchBtn.onmouseenter = () => launchBtn.style.transform = 'translateY(-2px) scale(1.02)';
        launchBtn.onmouseleave = () => launchBtn.style.transform = 'translateY(0) scale(1)';
        launchBtn.onclick = showModal;
        document.body.appendChild(launchBtn);
    }

    function showModal() {
        let modal = document.getElementById('av-dedup-modal');
        if (modal) {
            modal.style.display = 'flex';
            return;
        }

        modal = document.createElement('div');
        modal.id = 'av-dedup-modal';
        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            zIndex: '100000',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: '0',
            transition: 'opacity 0.2s ease'
        });

        modal.innerHTML = `
            <div style="background:#ffffff; width:1000px; max-width:95vw; height:88vh; border-radius:16px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 24px 64px rgba(0,0,0,0.28); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                
                <!-- 顶栏 -->
                <div style="padding:16px 24px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#ffffff;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:18px;">🎯</span>
                        <h2 style="margin:0; font-size:16px; font-weight:700; color:#0f172a;">115 番号智能整理助手 <span style="font-size:11px; color:#0284c7; background:#e0f2fe; padding:2px 8px; border-radius:12px; font-weight:600;">v4.1</span></h2>
                        <span id="dedup-folder-info" style="font-size:12px; color:#64748b; background:#f8fafc; padding:3px 10px; border-radius:6px; border:1px solid #e2e8f0;"></span>
                    </div>
                    <button id="dedup-close-btn" style="border:none; background:#f1f5f9; width:30px; height:30px; border-radius:50%; font-size:18px; cursor:pointer; color:#64748b; display:flex; align-items:center; justify-content:center; transition:all 0.2s;">&times;</button>
                </div>

                <!-- 仪表盘统计卡片 -->
                <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; padding:14px 24px; background:#f8fafc; border-bottom:1px solid #e2e8f0;">
                    <div style="background:#fff; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
                        <div style="font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">扫描文件总量</div>
                        <div id="card-total-files" style="font-size:20px; font-weight:700; color:#0f172a; margin-top:2px;">-</div>
                    </div>
                    <div style="background:#fff; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
                        <div style="font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">番号识别率</div>
                        <div id="card-recognize-rate" style="font-size:20px; font-weight:700; color:#0284c7; margin-top:2px;">-</div>
                    </div>
                    <div style="background:#fff; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
                        <div style="font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">发现真实重复</div>
                        <div id="card-dup-groups" style="font-size:20px; font-weight:700; color:#e11d48; margin-top:2px;">-</div>
                    </div>
                    <div style="background:#fff; padding:10px 14px; border-radius:10px; border:1px solid #e2e8f0;">
                        <div style="font-size:11px; color:#64748b; font-weight:600; text-transform:uppercase;">可释放冗余空间</div>
                        <div id="card-redundant-size" style="font-size:20px; font-weight:700; color:#10b981; margin-top:2px;">-</div>
                    </div>
                </div>

                <!-- 控制栏与搜索框 -->
                <div style="padding:10px 24px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; background:#ffffff; gap:12px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <button id="btn-scan" style="background:#0d6efd; color:#fff; border:none; padding:7px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px;">
                            <span>🔍</span> 重新扫描
                        </button>
                        <label style="font-size:12px; color:#475569; display:flex; align-items:center; cursor:pointer; gap:4px; margin-left:4px;">
                            <input type="checkbox" id="chk-recursive"> 穿透子文件夹(递归)
                        </label>
                        <span style="border-left:1px solid #e2e8f0; height:16px; margin:0 4px;"></span>
                        <button id="btn-select-smaller" style="background:#fff; color:#334155; border:1px solid #cbd5e1; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:500;" disabled>⚡ 保留最大 (勾选较小者)</button>
                        <button id="btn-select-older" style="background:#fff; color:#334155; border:1px solid #cbd5e1; padding:6px 12px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:500;" disabled>🕒 保留最新 (勾选较旧者)</button>
                        <button id="btn-clear-selection" style="background:#fff; color:#64748b; border:1px solid #cbd5e1; padding:6px 10px; border-radius:8px; cursor:pointer; font-size:12px;" disabled>清空</button>
                    </div>

                    <div style="position:relative; width:220px;">
                        <input id="input-search" type="text" placeholder="实时过滤番号/文件名..." style="width:100%; box-sizing:border-box; padding:6px 10px 6px 28px; border:1px solid #cbd5e1; border-radius:20px; font-size:12px; outline:none; transition:border 0.2s;">
                        <span style="position:absolute; left:9px; top:6px; font-size:12px; color:#94a3b8;">🔎</span>
                    </div>
                </div>

                <!-- 导航选项卡 -->
                <div style="display:flex; border-bottom:1px solid #e2e8f0; background:#fff; padding:0 24px;">
                    <div id="tab-btn-dups" class="nav-tab" style="padding:10px 18px; cursor:pointer; font-size:13px; font-weight:700; color:#0d6efd; border-bottom:2px solid #0d6efd;">⚠️ 重复番号 (<span id="count-dups">0</span>)</div>
                    <div id="tab-btn-all" class="nav-tab" style="padding:10px 18px; cursor:pointer; font-size:13px; color:#64748b;">📋 所有已识别 (<span id="count-all">0</span>)</div>
                    <div id="tab-btn-unparsed" class="nav-tab" style="padding:10px 18px; cursor:pointer; font-size:13px; color:#64748b;">🗑️ 非番号/杂质文件 (<span id="count-unparsed">0</span>)</div>
                </div>

                <!-- 列表容器 -->
                <div id="dedup-content" style="flex:1; overflow-y:auto; padding:16px 24px; background:#f8fafc;"></div>

                <!-- 底栏 -->
                <div id="footer-dups" style="padding:12px 24px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; background:#ffffff;">
                    <div id="pagination-controls" style="display:none; align-items:center; gap:8px; font-size:12px; color:#64748b;">
                        <button id="btn-prev-page" style="padding:4px 10px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer;">上一页</button>
                        <span id="page-indicator">第 1 页</span>
                        <button id="btn-next-page" style="padding:4px 10px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer;">下一页</button>
                    </div>
                    <div style="display:flex; align-items:center; gap:16px; margin-left:auto;">
                        <div id="selection-stats" style="font-size:13px; color:#475569;">
                            已勾选 <b id="selected-count" style="color:#e11d48; font-size:16px; font-weight:700;">0</b> 个重复副本 (预计释放 <span id="selected-size" style="font-weight:700; color:#0f172a;">0 B</span>)
                        </div>
                        <button id="btn-batch-delete" style="background:#e11d48; color:#fff; border:none; padding:8px 24px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:700; box-shadow:0 4px 14px rgba(225,29,72,0.3);" disabled>
                            🗑️ 批量移至回收站
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        setTimeout(() => modal.style.opacity = '1', 10);

        document.getElementById('dedup-close-btn').onclick = () => modal.style.display = 'none';
        modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

        document.getElementById('btn-scan').onclick = runScan;
        document.getElementById('btn-select-smaller').onclick = () => smartAutoSelect('smaller');
        document.getElementById('btn-select-older').onclick = () => smartAutoSelect('older');
        document.getElementById('btn-clear-selection').onclick = clearAllSelection;
        document.getElementById('btn-batch-delete').onclick = runDeleteDups;

        document.getElementById('tab-btn-dups').onclick = () => switchTab('dups');
        document.getElementById('tab-btn-all').onclick = () => switchTab('all');
        document.getElementById('tab-btn-unparsed').onclick = () => switchTab('unparsed');

        document.getElementById('input-search').oninput = (e) => {
            searchQuery = e.target.value.trim().toLowerCase();
            currentPage = 1;
            renderCurrentTab();
        };

        document.getElementById('btn-prev-page').onclick = () => {
            if (currentPage > 1) { currentPage--; renderCurrentTab(); }
        };
        document.getElementById('btn-next-page').onclick = () => {
            currentPage++; renderCurrentTab();
        };

        runScan();
    }

    function switchTab(tab) {
        currentTab = tab;
        currentPage = 1;
        ['dups', 'all', 'unparsed'].forEach(t => {
            const btn = document.getElementById(`tab-btn-${t}`);
            if (t === tab) {
                btn.style.color = '#0d6efd';
                btn.style.fontWeight = '700';
                btn.style.borderBottom = '2px solid #0d6efd';
            } else {
                btn.style.color = '#64748b';
                btn.style.fontWeight = '500';
                btn.style.borderBottom = 'none';
            }
        });

        const footerDups = document.getElementById('footer-dups');
        if (footerDups) footerDups.style.display = (tab === 'unparsed') ? 'none' : 'flex';
        renderCurrentTab();
    }

    async function runScan() {
        const cid = getCurrentCid();
        const isRecursive = document.getElementById('chk-recursive').checked;
        const contentBox = document.getElementById('dedup-content');
        document.getElementById('dedup-folder-info').innerText = `CID: ${cid}`;

        contentBox.innerHTML = `
            <div style="text-align:center; padding:80px 0; color:#0d6efd;">
                <div style="display:inline-block; width:32px; height:32px; border:3px solid #e0f2fe; border-top-color:#0d6efd; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
                <div id="scan-loading-text" style="font-size:14px; font-weight:600; color:#334155; margin-top:14px;">正在以安全模式读取文件列表...</div>
            </div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;

        try {
            const files = await fetchFileList(cid, isRecursive, (loaded, folders) => {
                const txt = document.getElementById('scan-loading-text');
                if (txt) txt.innerText = `正在读取: ${loaded} 个文件 (已检索 ${folders} 个目录)...`;
            });

            allGroups = {};
            duplicateGroups = {};
            unparsedFiles = [];
            let validCount = 0;

            files.forEach(f => {
                const info = parseAvFileInfo(f.n);
                if (info) {
                    validCount++;
                    if (!allGroups[info.dedupKey]) allGroups[info.dedupKey] = [];
                    allGroups[info.dedupKey].push({ ...f, parsedCode: info.code, partInfo: info.part });
                } else {
                    unparsedFiles.push(f);
                }
            });

            let dupGroupCount = 0;
            let redundantSize = 0;
            for (const [key, items] of Object.entries(allGroups)) {
                if (items.length > 1) {
                    duplicateGroups[key] = items;
                    dupGroupCount++;
                    const maxSize = Math.max(...items.map(i => i.s));
                    items.forEach(i => { if (i.s !== maxSize) redundantSize += i.s; });
                }
            }

            document.getElementById('card-total-files').innerText = files.length.toLocaleString();
            document.getElementById('card-recognize-rate').innerText = files.length ? `${((validCount / files.length) * 100).toFixed(1)}%` : '0%';
            document.getElementById('card-dup-groups').innerText = dupGroupCount;
            document.getElementById('card-redundant-size').innerText = formatSize(redundantSize);

            document.getElementById('count-dups').innerText = dupGroupCount;
            document.getElementById('count-all').innerText = validCount;
            document.getElementById('count-unparsed').innerText = unparsedFiles.length;

            const hasDups = dupGroupCount > 0;
            document.getElementById('btn-select-smaller').disabled = !hasDups;
            document.getElementById('btn-select-older').disabled = !hasDups;
            document.getElementById('btn-clear-selection').disabled = !hasDups;

            renderCurrentTab();

        } catch (err) {
            contentBox.innerHTML = `<div style="text-align:center; color:#e11d48; padding:60px; font-weight:600;">❌ 扫描中断: ${err.message}</div>`;
        }
    }

    function renderCurrentTab() {
        const contentBox = document.getElementById('dedup-content');
        if (currentTab === 'dups') {
            renderGroups(duplicateGroups, true);
        } else if (currentTab === 'all') {
            renderGroups(allGroups, false);
        } else if (currentTab === 'unparsed') {
            renderUnparsed();
        }
    }

    function renderGroups(targetGroups, isDupOnly) {
        const contentBox = document.getElementById('dedup-content');
        const paginationBox = document.getElementById('pagination-controls');
        
        let keys = Object.keys(targetGroups);

        if (searchQuery) {
            keys = keys.filter(k => {
                if (k.toLowerCase().includes(searchQuery)) return true;
                return targetGroups[k].some(item => item.n.toLowerCase().includes(searchQuery));
            });
        }

        if (keys.length === 0) {
            contentBox.innerHTML = `
                <div style="text-align:center; color:#10b981; margin-top:90px; font-size:14px; font-weight:600;">
                    ${isDupOnly ? '🎉 该目录下未发现任何重复文件！（上下集/分集均已独立保护）' : '没有找到匹配的番号结果'}
                </div>`;
            if (paginationBox) paginationBox.style.display = 'none';
            updateSelectedStats();
            return;
        }

        const totalItems = keys.length;
        const totalPages = Math.ceil(totalItems / pageSize);
        if (!isDupOnly && totalPages > 1) {
            if (currentPage > totalPages) currentPage = totalPages;
            if (paginationBox) {
                paginationBox.style.display = 'flex';
                document.getElementById('page-indicator').innerText = `第 ${currentPage} / ${totalPages} 页 (共 ${totalItems} 组)`;
                document.getElementById('btn-prev-page').disabled = (currentPage === 1);
                document.getElementById('btn-next-page').disabled = (currentPage === totalPages);
            }
            const start = (currentPage - 1) * pageSize;
            keys = keys.slice(start, start + pageSize);
        } else {
            if (paginationBox) paginationBox.style.display = 'none';
        }

        let html = '';
        keys.forEach(key => {
            const items = targetGroups[key];
            const maxSize = Math.max(...items.map(i => i.s));
            const isDup = items.length > 1;

            html += `
                <div class="dup-group" style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                    <div style="padding:10px 16px; background:#f8fafc; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background:${isDup ? '#0d6efd' : '#64748b'}; color:#fff; font-weight:700; font-size:12px; padding:3px 9px; border-radius:6px; letter-spacing:0.3px;">${key}</span>
                            <span style="font-size:12px; color:#64748b; font-weight:500;">(共 ${items.length} 个文件版本)</span>
                        </div>
                        ${isDup ? `
                        <div style="font-size:12px;">
                            <a href="javascript:void(0)" class="quick-keep-max" data-key="${key}" style="color:#0d6efd; text-decoration:none; margin-right:12px; font-weight:600;">保留最高画质</a>
                            <a href="javascript:void(0)" class="quick-uncheck" data-key="${key}" style="color:#64748b; text-decoration:none;">取消选择</a>
                        </div>` : ''}
                    </div>
                    <div style="padding:4px 16px;">
            `;

            items.forEach(file => {
                const isMax = file.s === maxSize && isDup;
                const badges = extractBadges(file.n);
                const folderUrl = `https://115.com/?cid=${file.cid}&offset=0&mode=wangpan`;

                html += `
                    <div style="display:flex; align-items:center; padding:9px 0; border-bottom:1px dashed #f1f5f9; font-size:13px;">
                        <input type="checkbox" class="file-chk" data-fid="${file.fid}" data-size="${file.s}" data-key="${key}" style="margin-right:12px; width:16px; height:16px; cursor:pointer;">
                        
                        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-right:12px;" title="${file.n}">
                            <span style="color:#1e293b; font-weight:500;">${file.n}</span>
                            <span style="margin-left:6px;">
                                ${badges.map(b => `<span style="background:${b.bg}; color:${b.color}; font-size:10px; font-weight:700; padding:1px 5px; border-radius:4px; margin-right:4px;">${b.text}</span>`).join('')}
                            </span>
                        </div>

                        <a href="${folderUrl}" target="_blank" style="color:#0284c7; text-decoration:none; font-size:11px; font-weight:600; background:#f0f9ff; padding:3px 9px; border-radius:6px; margin-right:16px; display:flex; align-items:center; gap:4px; border:1px solid #bae6fd; transition:all 0.2s;" title="在115网页端新标签页打开该文件所在文件夹">
                            <span>📂</span> 打开目录
                        </a>

                        <span style="width:110px; text-align:right; font-weight:${isMax ? '700' : '500'}; color:${isMax ? '#10b981' : '#64748b'}; margin-right:16px;">
                            ${formatSize(file.s)} ${isMax ? '<span style="font-size:11px; color:#10b981;">(建议保留)</span>' : ''}
                        </span>
                        <span style="width:125px; text-align:right; color:#94a3b8; font-size:12px;">
                            ${file.t ? file.t.slice(0, 16) : ''}
                        </span>
                    </div>
                `;
            });

            html += `</div></div>`;
        });

        contentBox.innerHTML = html;

        contentBox.querySelectorAll('.file-chk').forEach(chk => chk.onchange = updateSelectedStats);

        contentBox.querySelectorAll('.quick-keep-max').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.key;
                const items = targetGroups[key];
                const maxSize = Math.max(...items.map(i => i.s));
                contentBox.querySelectorAll(`.file-chk[data-key="${key}"]`).forEach(chk => {
                    chk.checked = (Number(chk.dataset.size) !== maxSize);
                });
                updateSelectedStats();
            };
        });

        contentBox.querySelectorAll('.quick-uncheck').forEach(btn => {
            btn.onclick = () => {
                const key = btn.dataset.key;
                contentBox.querySelectorAll(`.file-chk[data-key="${key}"]`).forEach(chk => chk.checked = false);
                updateSelectedStats();
            };
        });

        updateSelectedStats();
    }

    function renderUnparsed() {
        const contentBox = document.getElementById('dedup-content');
        const paginationBox = document.getElementById('pagination-controls');
        if (paginationBox) paginationBox.style.display = 'none';

        let list = unparsedFiles;
        if (searchQuery) list = list.filter(f => f.n.toLowerCase().includes(searchQuery));

        if (list.length === 0) {
            contentBox.innerHTML = `
                <div style="text-align:center; color:#10b981; margin-top:90px; font-size:14px; font-weight:600;">
                    🎉 完美！当前目录下没有任何非番号杂质文件，全部文件均已归类！
                </div>`;
            return;
        }

        let html = `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; box-shadow:0 1px 3px rgba(0,0,0,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:13px; color:#334155; font-weight:600;">
                        共筛选出 <b style="color:#e11d48;">${list.length}</b> 个非番号广告/杂质文件：
                    </div>
                    <div style="display:flex; gap:8px; align-items:center;">
                        <button id="btn-junk-select-ads" style="background:#fff; color:#334155; border:1px solid #cbd5e1; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:500;">⚡ 勾选广告小文件 (<50MB)</button>
                        <button id="btn-junk-select-all" style="background:#fff; color:#334155; border:1px solid #cbd5e1; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">全选</button>
                        <button id="btn-junk-clear" style="background:#fff; color:#64748b; border:1px solid #cbd5e1; padding:5px 12px; border-radius:6px; cursor:pointer; font-size:12px;">清空</button>
                        <button id="btn-junk-delete" style="background:#e11d48; color:#fff; border:none; padding:6px 16px; border-radius:6px; cursor:pointer; font-size:12px; font-weight:700;" disabled>🗑️ 批量移至回收站 (0)</button>
                    </div>
                </div>

                <div style="border-top:1px solid #f1f5f9; padding-top:8px;">
        `;

        list.forEach(f => {
            const cat = getJunkCategory(f);
            html += `
                <label style="display:flex; align-items:center; padding:8px 0; border-bottom:1px dashed #f1f5f9; cursor:pointer; font-size:13px;">
                    <input type="checkbox" class="junk-chk" data-fid="${f.fid}" data-size="${f.s}" style="margin-right:12px; width:16px; height:16px; cursor:pointer;">
                    <span style="background:${cat.bg}; color:${cat.color}; font-size:11px; padding:2px 7px; border-radius:4px; margin-right:10px; font-weight:700; white-space:nowrap;">
                        ${cat.label}
                    </span>
                    <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#1e293b;" title="${f.n}">
                        ${f.n}
                    </span>
                    <span style="width:100px; text-align:right; color:#64748b; font-size:12px; margin-left:12px;">
                        ${formatSize(f.s)}
                    </span>
                </label>
            `;
        });

        html += `</div></div>`;
        contentBox.innerHTML = html;

        const junkCheckboxes = contentBox.querySelectorAll('.junk-chk');
        const btnJunkDel = document.getElementById('btn-junk-delete');

        function updateJunkStats() {
            const checked = contentBox.querySelectorAll('.junk-chk:checked');
            let size = 0;
            checked.forEach(c => size += Number(c.dataset.size || 0));
            btnJunkDel.innerText = `🗑️ 批量移至回收站 (${checked.length} 个, ${formatSize(size)})`;
            btnJunkDel.disabled = checked.length === 0;
        }

        junkCheckboxes.forEach(chk => chk.onchange = updateJunkStats);

        document.getElementById('btn-junk-select-ads').onclick = () => {
            junkCheckboxes.forEach(chk => chk.checked = (Number(chk.dataset.size || 0) < 50 * 1024 * 1024));
            updateJunkStats();
        };
        document.getElementById('btn-junk-select-all').onclick = () => {
            junkCheckboxes.forEach(chk => chk.checked = true);
            updateJunkStats();
        };
        document.getElementById('btn-junk-clear').onclick = () => {
            junkCheckboxes.forEach(chk => chk.checked = false);
            updateJunkStats();
        };

        document.getElementById('btn-junk-delete').onclick = async () => {
            const checked = Array.from(contentBox.querySelectorAll('.junk-chk:checked'));
            if (checked.length === 0) return;
            const fids = checked.map(c => c.dataset.fid);
            if (!confirm(`确认将选中的 ${fids.length} 个非番号广告/杂质文件移至回收站吗？`)) return;

            btnJunkDel.disabled = true;
            btnJunkDel.innerText = '正在删除...';
            try {
                await deleteFiles(fids, (done, total) => btnJunkDel.innerText = `正在删除 (${done}/${total})...`);
                alert(`✅ 成功清理 ${fids.length} 个杂质文件！`);
                runScan();
            } catch (err) {
                alert(`❌ 删除失败: ${err.message}`);
                btnJunkDel.disabled = false;
                updateJunkStats();
            }
        };
    }

    function smartAutoSelect(type) {
        const contentBox = document.getElementById('dedup-content');
        for (const [key, items] of Object.entries(duplicateGroups)) {
            if (type === 'smaller') {
                const maxSize = Math.max(...items.map(i => i.s));
                contentBox.querySelectorAll(`.file-chk[data-key="${key}"]`).forEach(chk => {
                    chk.checked = (Number(chk.dataset.size) !== maxSize);
                });
            } else if (type === 'older') {
                const sorted = [...items].sort((a, b) => new Date(b.t) - new Date(a.t));
                const newestFid = sorted[0].fid;
                contentBox.querySelectorAll(`.file-chk[data-key="${key}"]`).forEach(chk => {
                    chk.checked = (chk.dataset.fid !== newestFid);
                });
            }
        }
        updateSelectedStats();
    }

    function clearAllSelection() {
        document.querySelectorAll('.file-chk').forEach(chk => chk.checked = false);
        updateSelectedStats();
    }

    function updateSelectedStats() {
        const checkedList = document.querySelectorAll('.file-chk:checked');
        let totalSize = 0;
        checkedList.forEach(c => totalSize += Number(c.dataset.size || 0));

        const countEl = document.getElementById('selected-count');
        const sizeEl = document.getElementById('selected-size');
        const btnDel = document.getElementById('btn-batch-delete');

        if (countEl) countEl.innerText = checkedList.length;
        if (sizeEl) sizeEl.innerText = formatSize(totalSize);
        if (btnDel) btnDel.disabled = checkedList.length === 0;
    }

    async function runDeleteDups() {
        const checkedList = Array.from(document.querySelectorAll('.file-chk:checked'));
        if (checkedList.length === 0) return;

        const count = checkedList.length;
        let totalSize = 0;
        checkedList.forEach(c => totalSize += Number(c.dataset.size || 0));

        const conf = confirm(`⚠️ 确认将选中的 ${count} 个重复副本移至 115 回收站？\n（合计 ${formatSize(totalSize)}，可在 115 网页回收站随时还原）`);
        if (!conf) return;

        const btnDel = document.getElementById('btn-batch-delete');
        btnDel.disabled = true;
        btnDel.innerText = '正在删除...';

        const fids = checkedList.map(c => c.dataset.fid);
        try {
            await deleteFiles(fids, (deleted, total) => btnDel.innerText = `正在删除 (${deleted}/${total})...`);
            alert(`✅ 成功将 ${fids.length} 个重复副本移至回收站！`);
            runScan();
        } catch (err) {
            alert(`❌ 删除失败: ${err.message}`);
        } finally {
            btnDel.disabled = false;
            btnDel.innerText = '🗑️ 批量移至回收站';
        }
    }

    window.addEventListener('load', () => setTimeout(initUI, 1500));
    setInterval(() => {
        if (!document.getElementById('av-dedup-launcher')) initUI();
    }, 2500);
})();
