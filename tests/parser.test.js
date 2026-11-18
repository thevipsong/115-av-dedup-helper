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
    getArchiveFolderName,
    getJunkCategory,
    getMetadataSearchUrl,
    compareCodeLibrary,
    isVideoFile,
    isSubtitleFile,
    isFolderIgnored
} = require('../115-av-dedup-helper.user.js');

test('版本号与核心导出校验', () => {
    assert.equal(APP_VERSION, '5.0.0');
});

test('标准有码与特异片商番号识别', () => {
    assert.deepEqual(parseAvFileInfo('www.98t.la@ABW-015(蓝光Remux)_restored.mp4'), {
        code: 'ABW-015',
        part: '',
        dedupKey: 'ABW-015'
    });
    assert.deepEqual(parseAvFileInfo('hhd800.com@sone00290_4K60fps_restored.mp4'), {
        code: 'SONE-290',
        part: '',
        dedupKey: 'SONE-290'
    });
    assert.deepEqual(parseAvFileInfo('259LUXU-1234.mkv'), {
        code: '259LUXU-1234',
        part: '',
        dedupKey: '259LUXU-1234'
    });
    assert.deepEqual(parseAvFileInfo('[MIDE-360] 测试标题 1080P.mp4'), {
        code: 'MIDE-360',
        part: '',
        dedupKey: 'MIDE-360'
    });
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
    assert.equal(parseAvFileInfo('IPX-200-4KS1.mp4').part, 'PART1');
});

test('技术黑名单防误识别（杜绝把 X264/H265/SHA 等当成番号）', () => {
    assert.equal(parseAvFileInfo('sample_x264-10.mp4'), null);
    assert.equal(parseAvFileInfo('demo_h265-8.mkv'), null);
    assert.equal(parseAvFileInfo('checksum_sha-256.txt'), null);
    assert.equal(parseAvFileInfo('demo_x264-10_ABW-015.mp4').code, 'ABW-015');
});

test('自定义重命名模板与扩展名保留', () => {
    const file = { n: 'www.98t.la@sdnm-015_jasna5_4K_C.mp4', parsedCode: 'SDNM-015', partInfo: '' };
    assert.equal(getStandardAvName(file, 'default'), 'SDNM-015.mp4');
    assert.equal(getStandardAvName(file, 'sub_uc'), 'SDNM-015-C.mp4');
    assert.equal(getStandardAvName(file, 'badges'), 'SDNM-015 [4K][中字].mp4');
    assert.equal(getStandardAvName(file, 'custom', '[{code}]{c}.{ext}'), '[SDNM-015]-C.mp4');

    const partFile = { n: 'SSIS-001_CD2_4K.mkv', parsedCode: 'SSIS-001', partInfo: 'PART2' };
    assert.equal(getStandardAvName(partFile, 'default'), 'SSIS-001_PART2.mkv');
});

test('同目录重名冲突预检测 + 外挂字幕联动重命名', () => {
    const allFiles = [
        { fid: '1', cid: '100', n: 'www.98t.la@sdnm-015_4K.mp4', parsedCode: 'SDNM-015', partInfo: '' },
        { fid: '2', cid: '100', n: 'sdnm-015_1080p.mp4', parsedCode: 'SDNM-015', partInfo: '' },
        { fid: '3', cid: '100', n: 'www.98t.la@sdnm-015_4K.chs.ass' },
        { fid: '4', cid: '200', n: 'abw-015_restored.mp4', parsedCode: 'ABW-015', partInfo: '' },
        { fid: '5', cid: '200', n: 'ABW-015.mp4', parsedCode: 'ABW-015', partInfo: '' }
    ];
    const subs = [{ fid: '3', cid: '100', n: 'www.98t.la@sdnm-015_4K.chs.ass' }];
    const targets = [allFiles[0], allFiles[1], allFiles[3]];

    const plan = planBatchRename(targets, allFiles, subs, {
        renameTemplate: 'default',
        syncSubtitles: true
    });

    // fid 1 可正常改名，fid 2 与 fid 1 在同目录 100 撞车被安全拦截，fid 4 与现存文件 fid 5 撞车被安全拦截
    assert.equal(plan.renameItems.length, 1);
    assert.equal(plan.renameItems[0].fid, '1');
    assert.equal(plan.renameItems[0].newName, 'SDNM-015.mp4');

    // 同目录 100 匹配的外挂字幕联动改名并保留 .chs 语言后缀
    assert.equal(plan.pairedSubItems.length, 1);
    assert.equal(plan.pairedSubItems[0].newName, 'SDNM-015.chs.ass');

    // 2 个冲突全部被提前捕获
    assert.equal(plan.conflictItems.length, 2);
});

test('视频与字幕文件分类及广告保护', () => {
    assert.equal(isVideoFile({ n: 'SSIS-001.mp4' }), true);
    assert.equal(isVideoFile({ n: 'SSIS-001.ass' }), false);
    assert.equal(isSubtitleFile({ n: 'SSIS-001.srt' }), true);

    const subCat = getJunkCategory({ n: 'SSIS-001.ass', s: 50000 });
    assert.equal(subCat.isProtected, true);
    assert.equal(subCat.label, '外挂字幕(保护)');

    const adCat = getJunkCategory({ n: '宣传短片.mp4', s: 1024 * 1024 * 10 });
    assert.equal(adCat.isProtected, false);
    assert.equal(adCat.label, '推广短片');
});

test('智能归档目录推导、外链检索、忽略目录与清单比对', () => {
    assert.equal(getArchiveFolderName({ parsedCode: 'SSIS-023' }, 'prefix'), 'SSIS');
    assert.equal(getArchiveFolderName({ parsedCode: 'FC2-PPV-123456' }, 'prefix'), 'FC2');
    assert.equal(getArchiveFolderName({ parsedCode: 'SDNM-015' }, 'movie_folder'), 'SDNM-015');

    assert.equal(getMetadataSearchUrl('SSIS-023', 'javbus'), 'https://www.javbus.com/search/SSIS-023');
    assert.equal(getMetadataSearchUrl('SSIS-023', 'javdb'), 'https://javdb.com/search?q=SSIS-023&f=all');

    assert.equal(isFolderIgnored('999', '我的字幕库', ['字幕库']), true);
    assert.equal(isFolderIgnored('888', '普通电影', ['字幕库']), false);

    const diff = compareCodeLibrary('SSIS-023.mp4\nIPX-999\nABW-015', {
        'SSIS-023': [{ parsedCode: 'SSIS-023' }],
        'ABW-015': [{ parsedCode: 'ABW-015' }]
    });
    assert.deepEqual(diff.owned, ['SSIS-023', 'ABW-015']);
    assert.deepEqual(diff.missing, ['IPX-999']);
});
