const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
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
    sanitizeHttpUrl,
    isForumSiteContext,
    parseForumUrlParams,
    extractTidFromHref,
    isForumAttachmentHref,
    extractThreadResources,
    filterForumPostByTime,
    resolvePosterUrl,
    normalizeSearchCodeForSite,
    isMatchingAvCode,
    parseJavBusHtml,
    parseJavDbHtml,
    parseAvsoxHtml,
    parseJav321Html,
    parseAiravHtml,
    parse123AvHtml,
    parseJavTrailersHtml,
    parseFc2PageHtml,
    buildDmmCandidatePosterUrls,
    buildPosterFetchPlan,
    compareSemver,
    parseUserscriptVersionFromMeta
} = require('../115-av-dedup-helper.user.js');

test('版本号导出校验', () => {
    assert.equal(APP_VERSION, '5.4.0');
});

test('标准有码、特异片商及自定义前缀/屏蔽词识别', () => {
    assert.deepEqual(parseAvFileInfo('www.98t.la@ABW-015(蓝光Remux)_restored.mp4'), {
        code: 'ABW-015', part: '', dedupKey: 'ABW-015'
    });
    assert.deepEqual(parseAvFileInfo('hhd800.com@sone00290_4K60fps_restored.mp4'), {
        code: 'SONE-290', part: '', dedupKey: 'SONE-290'
    });
    assert.equal(parseAvFileInfo('259LUXU-1234.mkv').code, '259LUXU-1234');
    assert.equal(parseAvFileInfo('[MIDE-360] 测试标题 1080P.mp4').code, 'MIDE-360');

    // 自定义前缀优先匹配与自定义屏蔽词
    assert.equal(
        parseAvFileInfo('MYSTUDIO9999.mp4', { customPrefixes: ['MYSTUDIO'] }).code,
        'MYSTUDIO-9999'
    );
    assert.equal(
        parseAvFileInfo('MYTAG-001.mp4', { customBlacklist: ['MYTAG'] }),
        null
    );
});

test('FC2 与无码特殊格式识别', () => {
    assert.equal(parseAvFileInfo('FC2-PPV-3456789_4K.mp4').code, 'FC2-PPV-3456789');
    assert.equal(parseAvFileInfo('heyzo-1234.mp4').code, 'HEYZO-1234');
    assert.equal(parseAvFileInfo('caribbean-102412-001.mp4').code, 'CARIB-102412-001');
    assert.equal(parseAvFileInfo('1pondo_010215_001.mp4').code, '1PONDO-010215-001');
    assert.equal(parseAvFileInfo('tokyo-hot-k1234.mkv').code, 'TOKYO-HOT-1234');
});

test('分集独立保护（绝不误判上下集为重复，且不误判单位数编号为分集）', () => {
    const p1 = parseAvFileInfo('SVVRT-084-CD1.mp4');
    const p2 = parseAvFileInfo('SVVRT-084-CD2.mp4');
    assert.equal(p1.dedupKey, 'SVVRT-084 [PART1]');
    assert.equal(p2.dedupKey, 'SVVRT-084 [PART2]');
    assert.notEqual(p1.dedupKey, p2.dedupKey);
    assert.equal(parseAvFileInfo('IPX-100_上集.mp4').part, 'PART1');
    assert.equal(parseAvFileInfo('IPX-100_下集.mp4').part, 'PART3');
    assert.equal(parseAvFileInfo('IPZ-405-2.mp4').part, 'PART2');
    assert.equal(parseAvFileInfo('ABP-5.mp4').part, '');
    assert.equal(parseAvFileInfo('RED-1.mp4').part, '');
});

test('技术黑名单防误识别 & 特征徽章精准提取（不把 Part-C 误标为中字）', () => {
    assert.equal(parseAvFileInfo('sample_x264-10.mp4'), null);
    assert.equal(parseAvFileInfo('demo_h265-8.mkv'), null);
    assert.equal(parseAvFileInfo('checksum_sha-256.txt'), null);
    assert.equal(parseAvFileInfo('demo_x264-10_ABW-015.mp4').code, 'ABW-015');

    const chBadges = extractBadges('ABW-015-C_4K.mp4').map(b => b.text);
    assert.ok(chBadges.includes('中字'));
    assert.ok(chBadges.includes('4K'));

    const partCBadges = extractBadges('ABW-015_Part-C.mp4').map(b => b.text);
    assert.ok(!partCBadges.includes('中字'), '分集 Part-C 不应误判为中字');
});

test('自定义重命名模板与外挂字幕匹配改名', () => {
    const file = { fid: '1', cid: '10', n: 'www.98t.la@sdnm-015_jasna5_4K_C.mp4', parsedCode: 'SDNM-015', partInfo: '' };
    assert.equal(getStandardAvName(file, 'default'), 'SDNM-015.mp4');
    assert.equal(getStandardAvName(file, 'sub_uc'), 'SDNM-015-C.mp4');
    assert.equal(getStandardAvName(file, 'badges'), 'SDNM-015 [4K][中字].mp4');
    assert.equal(getStandardAvName(file, 'custom', '[{code}]{c}.{ext}'), '[SDNM-015]-C.mp4');

    const subs = [{ fid: '2', cid: '10', n: 'www.98t.la@sdnm-015_jasna5_4K_C.chs.srt' }];
    const paired = findPairedSubtitles(file, subs);
    assert.equal(paired.length, 1);
    assert.equal(paired[0].langSuffix, '.chs');
    assert.equal(getPairedSubNewName(paired[0].file, paired[0].langSuffix, 'SDNM-015.mp4'), 'SDNM-015.chs.srt');
});

test('同目录重名冲突预检测 + 字幕联动', () => {
    const allFiles = [
        { fid: '1', cid: '100', n: 'www.98t.la@sdnm-015_4K.mp4', parsedCode: 'SDNM-015', partInfo: '' },
        { fid: '2', cid: '100', n: 'sdnm-015_1080p.mp4', parsedCode: 'SDNM-015', partInfo: '' },
        { fid: '3', cid: '100', n: 'www.98t.la@sdnm-015_4K.chs.ass' },
        { fid: '4', cid: '200', n: 'abw-015_restored.mp4', parsedCode: 'ABW-015', partInfo: '' },
        { fid: '5', cid: '200', n: 'ABW-015.mp4', parsedCode: 'ABW-015', partInfo: '' }
    ];
    const subs = [{ fid: '3', cid: '100', n: 'www.98t.la@sdnm-015_4K.chs.ass' }];
    const plan = planBatchRename([allFiles[0], allFiles[1], allFiles[3]], allFiles, subs, {
        renameTemplate: 'default', syncSubtitles: true
    });

    assert.equal(plan.renameItems.length, 1);
    assert.equal(plan.renameItems[0].fid, '1');
    assert.equal(plan.pairedSubItems.length, 1);
    assert.equal(plan.pairedSubItems[0].newName, 'SDNM-015.chs.ass');
    assert.equal(plan.conflictItems.length, 2);
});

test('SHA1 二进制同源建索引 + 残损小视频与外挂字幕过滤', () => {
    const files = [
        { fid: '1', cid: '1', n: 'SSIS-001.mp4', s: 5e9, sha: 'AAA111' },
        { fid: '2', cid: '2', n: 'random_renamed_clip.mp4', s: 5e9, sha: 'AAA111' },
        { fid: '3', cid: '1', n: 'SSIS-001.ass', s: 40000, sha: 'BBB' },
        { fid: '4', cid: '1', n: 'IPX-999.mp4', s: 0, sha: '' }
    ];
    const idx = buildScanIndexes(files, {});
    assert.equal(idx.shaGroupCount, 1);
    assert.equal(idx.shaDuplicateGroups['AAA111_5000000000'].length, 2);
    assert.equal(idx.subtitleFiles.length, 1);
    assert.equal(isDamagedVideoFile(files[3]), true);
    assert.equal(isDamagedVideoFile(files[0]), false);
    assert.equal(getJunkCategory(files[3]).label, '空视频(0B)');
    assert.equal(getJunkCategory(files[2]).isProtected, true);
});

test('空文件夹父子防双删过滤 + 智能优选保留 + 归档分桶去重', () => {
    const emptyTree = [
        { cid: '10', pid: '0', n: 'ParentEmpty', type: 'cascade' },
        { cid: '11', pid: '10', n: 'ChildEmpty', type: 'direct' },
        { cid: '12', pid: '11', n: 'GrandChildEmpty', type: 'direct' },
        { cid: '20', pid: '0', n: 'IndependentEmpty', type: 'direct' }
    ];
    const dedupedCids = filterTopLevelEmptyFolders(['10', '11', '12', '20'], emptyTree);
    assert.deepEqual(dedupedCids, ['10', '20']);

    const candidates = [
        { fid: 'a', n: 'SDNM-015.mp4', s: 4e9, t: '2026-01-01', relPath: '/' },
        { fid: 'b', n: 'SDNM-015_4K_C.mp4', s: 4e9, t: '2026-01-02', relPath: '/SDNM', parsedCode: 'SDNM-015' }
    ];
    assert.equal(pickBestKeeperFile(candidates, 'smart').fid, 'b');

    const subs = [{ fid: 'sub1', cid: '1', n: 'SDNM-015.ass' }];
    const targets = [
        { fid: 'v1', cid: '1', n: 'SDNM-015_4K.mp4', parsedCode: 'SDNM-015', relPath: '/' },
        { fid: 'v2', cid: '1', n: 'SDNM-015_1080p.mp4', parsedCode: 'SDNM-015', relPath: '/' }
    ];
    const buckets = planArchiveBuckets(targets, subs, 'prefix', '', true);
    assert.equal(buckets.get('SDNM').size, 3); // v1, v2, sub1 (sub1 仅计入一次，无重复)

    const customBuckets = planArchiveBuckets(targets, subs, 'custom_cid', '999', true);
    assert.equal(customBuckets.get('999').size, 3);

    const customPrefTargets = [{ fid: 'v9', cid: '2', n: 'MYSTUDIO9999.mp4', parsedCode: 'MYSTUDIO-9999', relPath: '/' }];
    const customPrefSubs = [{ fid: 's9', cid: '2', n: 'MYSTUDIO9999.chs.ass' }];
    const customPrefBuckets = planArchiveBuckets(customPrefTargets, customPrefSubs, 'prefix', '', true, { customPrefixes: ['MYSTUDIO'] });
    assert.equal(customPrefBuckets.get('MYSTUDIO').size, 2);
});

test('筛选排序键、外链 URL、忽略目录及清单补漏对比', () => {
    const groups = {
        'ABW-015': [{ fid: '1', n: 'ABW-015_4K.mp4', parsedCode: 'ABW-015', s: 2e9, t: '2026-05-01', relPath: '/' }],
        'SSIS-001': [{ fid: '2', n: 'SSIS-001.mp4', parsedCode: 'SSIS-001', s: 8e9, t: '2026-06-01', relPath: '/SSIS' }]
    };
    const filtered4K = filterAndSortGroupKeys(groups, { activeTagFilter: '4K' });
    assert.deepEqual(filtered4K, ['ABW-015']);

    const sortedSizeDesc = filterAndSortGroupKeys(groups, { currentSort: 'size-desc' });
    assert.deepEqual(sortedSizeDesc, ['SSIS-001', 'ABW-015']);

    assert.equal(getArchiveFolderName({ parsedCode: 'SSIS-023' }, 'prefix'), 'SSIS');
    assert.equal(getMetadataSearchUrl('SSIS-023', 'javbus'), 'https://www.javbus.com/search/SSIS-023');
    assert.equal(isFolderIgnored('999', '我的字幕库', ['字幕库']), true);

    const diff = compareCodeLibrary('SSIS 001.mp4\nIPX-999', groups);
    assert.deepEqual(diff.owned, ['SSIS-001']);
    assert.deepEqual(diff.missing, ['IPX-999']);

    // URL 安全过滤与自定义模板末尾连字符清理
    assert.equal(sanitizeHttpUrl('javascript:alert(1)'), '');
    assert.equal(sanitizeHttpUrl('https://thumb.115.com/abc.jpg'), 'https://thumb.115.com/abc.jpg');
    assert.equal(getStandardAvName({ n: 'sdnm-015.mp4', parsedCode: 'SDNM-015', partInfo: '' }, 'custom', '{code}-{part}.{ext}'), 'SDNM-015.mp4');
});

test('98堂/色花堂 站点识别与 URL 参数/TID 解析', () => {
    assert.equal(isForumSiteContext('98堂 - 首页', 'https://115.com/?ct=file'), false);
    assert.equal(isForumSiteContext('Google', 'https://www.google.com/'), false);
    assert.equal(isForumSiteContext('亚洲无码原创 - 色花堂', 'https://mirror-example.com/forum-36-1.html'), true);
    assert.equal(isForumSiteContext('98堂', 'https://example.org/forum.php'), true);
    assert.equal(isForumSiteContext('Forum', 'https://www.sehuatang.org/forum.php?mod=forumdisplay&fid=36'), true);

    assert.deepEqual(
        parseForumUrlParams('https://www.sehuatang.org/forum.php?mod=forumdisplay&fid=36&page=2'),
        { mod: 'forumdisplay', fid: '36', page: '2' }
    );
    assert.deepEqual(
        parseForumUrlParams('https://www.sehuatang.org/forum-103-5.html'),
        { mod: 'forumdisplay', fid: '103', page: '5' }
    );

    assert.equal(extractTidFromHref('forum.php?mod=viewthread&tid=223344&extra=page%3D1'), '223344');
    assert.equal(extractTidFromHref('thread-998877-1-1.html'), '998877');
    assert.equal(extractTidFromHref('', 'normalthread_556677'), '556677');
});

test('帖子资源提取（代码块磁力/Base32磁力/ed2k/附件大小写与防重复）', () => {
    const html = `
        <div class="t_f">
            <div class="blockcode"><div><ol>
                <li>magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&amp;dn=sample</li>
                <li>不是链接的普通文本</li>
            </ol></div></div>
            <p>内联 Base32 磁力：magnet:?xt=urn:btih:MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U 下载</p>
            <p>重复的 40位 Hash（不应重复提取）：magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567</p>
            <a id="ed2k_1" href="ed2k://|file|SSIS-001.mp4|1024|abcdef0123456789abcdef0123456789|/">下载</a>
            <a>无href安全占位</a>
            <a href="forum.php?mod=attachment&aid=1001">SSIS-001.TORRENT</a>
            <a href="forum.php?mod=attachment&aid=1002">preview.png</a>
        </div>
        <div class="pattl">
            <a href="forum.php?mod=attachment&aid=1003">subtitle.Zip</a>
        </div>
    `;
    const res = extractThreadResources(html, {
        baseOrigin: 'https://www.sehuatang.org',
        includeAttachments: true
    });
    assert.equal(res.links.length, 3);
    assert.equal(res.links[0], 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=sample');
    assert.equal(res.links[1], 'ed2k://|file|SSIS-001.mp4|1024|abcdef0123456789abcdef0123456789|/');
    assert.equal(res.links[2], 'magnet:?xt=urn:btih:MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U');

    assert.equal(res.attachments.length, 2);
    assert.equal(res.attachments[0].url, 'https://www.sehuatang.org/forum.php?mod=attachment&aid=1001');
    assert.equal(res.attachments[1].url, 'https://www.sehuatang.org/forum.php?mod=attachment&aid=1003');

    assert.equal(isForumAttachmentHref('forum.php?mod=attachment&aid=1', 'a.RAR'), true);
    assert.equal(isForumAttachmentHref('', 'a.zip'), false);
    assert.equal(isForumAttachmentHref('forum.php?mod=attachment&aid=1', 'cover.jpg'), false);
});

test('本地日期时间筛选（防跨时区偏移、中文相对时间与无效日期兜底）', () => {
    const now = new Date(2026, 10, 18, 15, 30, 0); // 2026-11-18 local
    assert.equal(filterForumPostByTime('2026-11-18', 1, now), true);
    assert.equal(filterForumPostByTime('2026-11-17', 1, now), false);
    assert.equal(filterForumPostByTime('2026-11-17', 2, now), true);
    assert.equal(filterForumPostByTime('2026-11-16', 2, now), false);
    assert.equal(filterForumPostByTime('刚刚', 1, now), true);
    assert.equal(filterForumPostByTime('15 分钟前', 1, now), true);
    assert.equal(filterForumPostByTime('昨天 22:10', 1, now), false);
    assert.equal(filterForumPostByTime('昨天 22:10', 2, now), true);
    assert.equal(filterForumPostByTime('前天 10:00', 2, now), false);
    assert.equal(filterForumPostByTime('前天 10:00', 3, now), true);
    assert.equal(filterForumPostByTime('3 天前', 3, now), false);
    assert.equal(filterForumPostByTime('3 天前', 7, now), true);
    assert.equal(filterForumPostByTime('无效日期', 7, now), false);
});

test('高清海报检索计划、番号精确边界匹配与相对 URL 解析', () => {
    assert.equal(resolvePosterUrl('//www.javbus.com/pics/cover/12ab_b.jpg', 'https://www.javbus.com/IPZ-405'), 'https://www.javbus.com/pics/cover/12ab_b.jpg');
    assert.equal(resolvePosterUrl('/pics/cover/12ab_b.jpg', 'https://www.javbus.com/IPZ-405'), 'https://www.javbus.com/pics/cover/12ab_b.jpg');
    assert.equal(resolvePosterUrl('/images/none.gif', 'https://www.javbus.com/IPZ-405'), '');

    assert.equal(isMatchingAvCode('IPZ-405 示例电影', 'IPZ-405'), true);
    assert.equal(isMatchingAvCode('IPZ-405 示例电影', 'IPZ-40'), false);
    assert.equal(isMatchingAvCode('1PONDO 010215_001', '1PONDO-010215-001'), true);

    assert.deepEqual(normalizeSearchCodeForSite('CARIB-102412-001'), {
        queryCode: '102412-001', isUncensored: true, isFc2: false
    });
    assert.deepEqual(normalizeSearchCodeForSite('FC2-PPV-3456789'), {
        queryCode: 'FC2-PPV-3456789', isUncensored: true, isFc2: true
    });

    const stdPlan = buildPosterFetchPlan('IPZ-405', 'javbus');
    assert.equal(stdPlan[0].url, 'https://www.javbus.com/IPZ-405');
    assert.equal(stdPlan[1].url, 'https://www.javbus.com/search/IPZ-405');
    assert.equal(stdPlan[2].site, 'javdb');
    assert.equal(stdPlan[3].site, 'avsox');
    assert.equal(stdPlan[4].site, 'jav321');
    assert.equal(stdPlan[4].method, 'POST');
    assert.equal(stdPlan[5].site, 'airav');
    assert.equal(stdPlan[6].site, '123av');
    assert.equal(stdPlan[7].site, 'javtrailers');

    const fc2Plan = buildPosterFetchPlan('FC2-PPV-3456789', 'javbus');
    assert.equal(fc2Plan[0].site, 'javdb'); // FC2 自动跳过 JavBus 直达 JavDB/AVSOX/FC2DB
    assert.equal(fc2Plan[2].site, 'fc2ppvdb');
    assert.equal(fc2Plan[2].url, 'https://fc2ppvdb.com/articles/3456789');
    assert.equal(fc2Plan[3].site, 'fc2cmadb');
    assert.equal(fc2Plan[4].site, '123av');

    assert.equal(getMetadataSearchUrl('IPZ-405', 'airav'), 'https://www.airav.wiki/cn/search?keyword=IPZ-405');
    assert.equal(getMetadataSearchUrl('IPZ-405', '123av'), 'https://123av.com/zh/search?keyword=IPZ-405');
    assert.equal(getMetadataSearchUrl('IPZ-405', 'javtrailers'), 'https://javtrailers.com/search/IPZ-405');
});

test('JavBus / JavDB / AVSOX 高清封面与搜索结果 HTML 解析', () => {
    const jbDetail = parseJavBusHtml(
        `<html><body><h3>IPZ-405 示例作品名</h3><a class="bigImage" href="/pics/cover/4abc_b.jpg"><img src="/pics/cover/4abc_b.jpg"></a><p><span class="header">發行日期:</span> 2014-06-01</p></body></html>`,
        'https://www.javbus.com/IPZ-405',
        'IPZ-405'
    );
    assert.equal(jbDetail.kind, 'detail');
    assert.equal(jbDetail.posterUrl, 'https://www.javbus.com/pics/cover/4abc_b.jpg');
    assert.equal(jbDetail.date, '2014-06-01');

    const jbSearch = parseJavBusHtml(
        `<a class="movie-box" href="/IPZ-40"><img src="/pics/thumb/bad.jpg"><date>IPZ-40</date></a>
         <a class="movie-box" href="https://www.javbus.com/IPZ-405"><img src="/pics/thumb/good.jpg"><date>IPZ-405</date></a>`,
        'https://www.javbus.com/search/IPZ-405',
        'IPZ-405'
    );
    assert.equal(jbSearch.kind, 'search_hit');
    assert.equal(jbSearch.detailUrl, 'https://www.javbus.com/IPZ-405');
    assert.equal(jbSearch.fallbackPosterUrl, 'https://www.javbus.com/pics/cover/good_b.jpg');

    const jdbSearch = parseJavDbHtml(
        `<a class="box" href="/v/xyz123" title="IPZ-405 标题"><img data-src="https://c0.jdbstatic.com/thumbs/xy/xyz123.jpg"><strong>IPZ-405</strong></a>`,
        'https://javdb.com/search?q=IPZ-405&f=all',
        'IPZ-405'
    );
    assert.equal(jdbSearch.kind, 'search_hit');
    assert.equal(jdbSearch.detailUrl, 'https://javdb.com/v/xyz123');
    assert.equal(jdbSearch.fallbackPosterUrl, 'https://c0.jdbstatic.com/covers/xy/xyz123.jpg');

    const jdbDetail = parseJavDbHtml(
        `<strong class="current-title">IPZ-405 HD Title</strong><img class="video-cover" src="https://c0.jdbstatic.com/covers/xy/xyz123.jpg">`,
        'https://javdb.com/v/xyz123',
        'IPZ-405'
    );
    assert.equal(jdbDetail.kind, 'detail');
    assert.equal(jdbDetail.posterUrl, 'https://c0.jdbstatic.com/covers/xy/xyz123.jpg');

    const avsoxSearch = parseAvsoxHtml(
        `<a class="movie-box" href="//avsox.click/cn/movie/abc"><img src="https://jp.netcdn.space/digital/video/h_001/cover.jpg"><date>HEYZO-1234</date></a>`,
        'https://avsox.click/cn/search/HEYZO-1234',
        'HEYZO-1234'
    );
    assert.equal(avsoxSearch.kind, 'search_hit');
    assert.equal(avsoxSearch.source, 'AVSOX');
    assert.equal(avsoxSearch.detailUrl, 'https://avsox.click/cn/movie/abc');

    const j321Detail = parseJav321Html(
        `<div class="col-md-12"><img class="img-responsive" src="https://pics.dmm.co.jp/digital/video/1start00668/1start00668ps.jpg"></div>`,
        'https://www.jav321.com/video/1start00668',
        'START-668'
    );
    assert.equal(j321Detail.kind, 'detail');
    assert.equal(j321Detail.source, 'Jav321');
    assert.equal(j321Detail.posterUrl, 'https://pics.dmm.co.jp/digital/video/1start00668/1start00668pl.jpg');

    const j321SearchExact = parseJav321Html(
        `<div class="panel-heading"><h3>初恋の養護教諭 jur-956 風間ゆみ</h3></div><div class="panel-body"><img class="img-responsive" src="http://pics.dmm.co.jp/mono/movie/adult/jur956/jur956ps.jpg"><video poster="http://pics.dmm.co.jp//digital/video/jur00956/jur00956pl.jpg"></video><span>2026-11-06</span></div>`,
        'https://www.jav321.com/search',
        'JUR-956'
    );
    assert.equal(j321SearchExact.kind, 'detail');
    assert.equal(j321SearchExact.source, 'Jav321');
    assert.equal(j321SearchExact.posterUrl, 'https://pics.dmm.co.jp/digital/video/jur00956/jur00956pl.jpg');
    assert.equal(j321SearchExact.date, '2026-11-06');

    const dmmUrls = buildDmmCandidatePosterUrls('JUR-956');
    assert.ok(dmmUrls.includes('https://pics.dmm.co.jp/digital/video/jur00956/jur00956pl.jpg'));
    assert.ok(dmmUrls.includes('https://pics.dmm.co.jp/mono/movie/adult/jur956/jur956pl.jpg'));
    assert.deepEqual(buildDmmCandidatePosterUrls('FC2-PPV-1234567'), []);

    const blocked = parseJavBusHtml('<html><title>Just a moment...</title></html>', 'https://www.javbus.com/IPZ-405', 'IPZ-405');
    assert.equal(blocked.kind, 'blocked');
    const jbVerify = parseJavBusHtml('<html><title>Age Verification JavBus</title><body>driver-verify</body></html>', 'https://www.javbus.com/JUR-956', 'JUR-956');
    assert.equal(jbVerify.kind, 'blocked');

    const airavSearch = parseAiravHtml(
        `<a href="/cn/video/IPZ-405"><img data-src="https://wiki-img.airav.wiki/storage/big_pic/ipz-405.jpg"><h5>IPZ-405 示例标题</h5></a>`,
        'https://www.airav.wiki/cn/search?keyword=IPZ-405',
        'IPZ-405'
    );
    assert.equal(airavSearch.kind, 'search_hit');
    assert.equal(airavSearch.source, 'AirAV');
    assert.equal(airavSearch.detailUrl, 'https://www.airav.wiki/cn/video/IPZ-405');
    assert.equal(airavSearch.fallbackPosterUrl, 'https://wiki-img.airav.wiki/storage/big_pic/ipz-405.jpg');

    const airavDetail = parseAiravHtml(
        `<html><head><meta property="og:image" content="https://wiki-img.airav.wiki/storage/big_pic/ipz-405.jpg"></head><body><h1>IPZ-405 作品标题</h1><span>2024-03-15</span></body></html>`,
        'https://www.airav.wiki/cn/video/IPZ-405',
        'IPZ-405'
    );
    assert.equal(airavDetail.kind, 'detail');
    assert.equal(airavDetail.source, 'AirAV');
    assert.equal(airavDetail.posterUrl, 'https://wiki-img.airav.wiki/storage/big_pic/ipz-405.jpg');
    assert.equal(airavDetail.date, '2024-03-15');

    const av123Search = parse123AvHtml(
        `<a href="/zh/v/start-668" title="START-668 标题"><img data-src="https://cdn.123av.com/thumb/start668.jpg"></a>`,
        'https://123av.com/zh/search?keyword=START-668',
        'START-668'
    );
    assert.equal(av123Search.kind, 'search_hit');
    assert.equal(av123Search.source, '123AV');
    assert.equal(av123Search.detailUrl, 'https://123av.com/zh/v/start-668');
    assert.equal(av123Search.fallbackPosterUrl, 'https://cdn.123av.com/thumb/start668.jpg');

    const av123Detail = parse123AvHtml(
        `<video poster="https://cdn.123av.com/poster/start668.jpg"></video><h1>START-668 标题</h1>`,
        'https://123av.com/zh/v/start-668',
        'START-668'
    );
    assert.equal(av123Detail.kind, 'detail');
    assert.equal(av123Detail.posterUrl, 'https://cdn.123av.com/poster/start668.jpg');

    const jtSearch = parseJavTrailersHtml(
        `<a href="/video/1start00668"><img alt="START-668" src="https://pics.dmm.co.jp/digital/video/1start00668/1start00668ps.jpg"></a>`,
        'https://javtrailers.com/search/START-668',
        'START-668'
    );
    assert.equal(jtSearch.kind, 'search_hit');
    assert.equal(jtSearch.source, 'JavTrailers');
    assert.equal(jtSearch.detailUrl, 'https://javtrailers.com/video/1start00668');

    const fc2Detail = parseFc2PageHtml(
        `<html><head><meta property="og:image" content="https://fc2ppvdb.com/imgs/3456789.jpg"></head><body><h1>FC2PPV 3456789</h1><span>2025-01-20</span></body></html>`,
        'https://fc2ppvdb.com/articles/3456789',
        'FC2-PPV-3456789',
        'FC2PPVDB'
    );
    assert.equal(fc2Detail.kind, 'detail');
    assert.equal(fc2Detail.source, 'FC2PPVDB');
    assert.equal(fc2Detail.posterUrl, 'https://fc2ppvdb.com/imgs/3456789.jpg');

    const fc2Search = parseFc2PageHtml(
        `<a href="/articles/34567890">FC2-PPV-34567890 干扰项</a><a href="/articles/3456789"><img src="/thumbs/3456789.jpg">FC2PPV 3456789</a>`,
        'https://fc2cmadb.com/?s=FC2-PPV-3456789',
        'FC2-PPV-3456789',
        'FC2CMADB'
    );
    assert.equal(fc2Search.kind, 'search_hit');
    assert.equal(fc2Search.source, 'FC2CMADB');
    assert.equal(fc2Search.detailUrl, 'https://fc2cmadb.com/articles/3456789');
});

test('自动更新语义版本比对与 .meta.js 元信息同步校验', () => {
    assert.equal(compareSemver('5.3.0', '5.2.9'), 1);
    assert.equal(compareSemver('5.3.1', '5.3.0'), 1);
    assert.equal(compareSemver('5.3.0', '5.3.0'), 0);
    assert.equal(compareSemver('5.2.1', '5.3.0'), -1);
    assert.equal(compareSemver('v5.10.0', '5.3.0'), 1);

    const metaPath = path.join(__dirname, '..', '115-av-dedup-helper.meta.js');
    const userPath = path.join(__dirname, '..', '115-av-dedup-helper.user.js');
    const metaText = fs.readFileSync(metaPath, 'utf8').trim();
    const userText = fs.readFileSync(userPath, 'utf8');
    const userHeaderMatch = userText.match(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/);

    assert.ok(userHeaderMatch, '主脚本应包含完整 UserScript 头部注释');
    assert.equal(metaText, userHeaderMatch[0].trim(), '.meta.js 必须与 .user.js 头部元信息保持完全一致');
    assert.equal(parseUserscriptVersionFromMeta(metaText), APP_VERSION);
});
