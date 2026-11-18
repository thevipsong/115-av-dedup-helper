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
    sanitizeHttpUrl
} = require('../115-av-dedup-helper.user.js');

test('版本号导出校验', () => {
    assert.equal(APP_VERSION, '5.1.0');
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

test('分集独立保护（绝不误判上下集为重复）', () => {
    const p1 = parseAvFileInfo('SVVRT-084-CD1.mp4');
    const p2 = parseAvFileInfo('SVVRT-084-CD2.mp4');
    assert.equal(p1.dedupKey, 'SVVRT-084 [PART1]');
    assert.equal(p2.dedupKey, 'SVVRT-084 [PART2]');
    assert.notEqual(p1.dedupKey, p2.dedupKey);
    assert.equal(parseAvFileInfo('IPX-100_上集.mp4').part, 'PART1');
    assert.equal(parseAvFileInfo('IPX-100_下集.mp4').part, 'PART3');
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
