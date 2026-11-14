"""阅读（第七版改版）：没有一起读了；每章右上角分享 → 聊天卡片 + 跳过去，他只读分享的那章、写段评和梗概；
书名下面「笔记」→ 名单 → 笔记页（一章一行，左滑删；点进去 ⭕ 改 ✅ 直接存）；铅笔写全书梗概（只留全书的）；读完自己决定写不写阅读日记"""
import asyncio, json, re, sys
from harness import Phone, check
from fakeapi import text_of

def script(b):
    t = text_of(b)
    m = re.search(r'现在读：第 (\d+) 章', t)
    if m:
        return [('content', json.dumps({'comments': [{'p': 1, 'quote': '', 'text': f'第{m.group(1)}章这段好'}], 'replies': [], 'note': f'第{m.group(1)}章的梗概'}, ensure_ascii=False)), ('finish', 'stop')]
    if '合成一篇全书梗概' in t:
        return [('content', json.dumps({'summary': '全书梗概：一个人去了雪国。'}, ensure_ascii=False)), ('finish', 'stop')]
    if '这本书你读完了' in t:
        return [('content', json.dumps({'write': False, 'diary': '', 'memo_add': ['她喜欢下雪天读书']}, ensure_ascii=False)), ('finish', 'stop')]
    return [('content', '好，我去看看'), ('finish', 'stop')]

async def main(size):
    async with Phone(size=size) as ph:
        await ph.setup(chars=2)
        ph.api.script = script
        await ph.page.evaluate('''async () => { const { D } = __xsj; const R = await import('./js/core/read.js');
          D.saveBook({ id: 'b1', acc: D.curAccount().id, title: '雪国', createdAt: Date.now(), lastTs: Date.now() });
          for (const [t, x] of [['一', '穿过县界长长的隧道。'], ['二', '火车停了下来。'], ['三', '雪下了一夜。']]) R.saveChapter('b1', { title: t, text: x });
          const ch = D.chapters('b1');
          // 老存档：阿二原来在「一起读」，读过第一章、有笔记
          D.setReaders('b1', { c1: { joined: Date.now() - 1e6, read: [ch[0].id], notes: { [ch[0].id]: '旧的笔记' }, part: null } }); }''')
        tick = "import('./js/core/read.js').then(m => m.readTick())"
        await ph.open('read', {'book': 'b1'}); await asyncio.sleep(0.6)
        check(await ph.top('.bk-notes').count() == 1 and await ph.top('.bk-rd').count() == 0, '书页：书名下面有「笔记」，没有一起读的人')
        await ph.shot(f'read8_book_{size[0]}')
        # 读第二章 → 分享给阿一
        await ph.page.evaluate("__xsj.openApp('read', { book: 'b1', ch: __xsj.D.chapters('b1')[1].id })"); await asyncio.sleep(1)
        await ph.shot(f'read8_reader_{size[0]}')
        await ph.top('button[aria-label="分享这一章"]').click(); await asyncio.sleep(0.5)
        await ph.page.locator('.sheet .pick-it').first.click(); await asyncio.sleep(1.2)
        check(await ph.page.evaluate('__xsj.currentApp()') == 'social', '分享完跳到聊天')
        parts = await ph.page.evaluate("__xsj.D.msgs('c0').flatMap(r => __xsj.D.partsOf(r))")
        check(parts and parts[0]['t'] == 'chapter' and parts[0]['no'] == 2, f'聊天里是章节卡片：{parts[:1]}')
        check(await ph.top('.card.bookc').count() == 1, '卡片显示出来了')
        await asyncio.sleep(3)
        await ph.shot(f'read8_card_{size[0]}')
        # 他读：只读第二章
        for _ in range(3): await ph.page.evaluate(tick); await asyncio.sleep(0.6)
        rd = await ph.page.evaluate("__xsj.D.readers('b1')")
        chs = await ph.page.evaluate("__xsj.D.chapters('b1').map(c => c.id)")
        c0 = rd.get('c0', {})
        check(c0.get('read') == [chs[1]] and not c0.get('queue') and c0.get('notes', {}).get(chs[1]) == '第2章的梗概', f'阿一只读了第二章、写了梗概：{c0.get("read")}')
        check(rd['c1']['read'] == [chs[0]], '阿二（老的一起读）不会自己接着读')
        reads = [c for c in ph.api.calls if '现在读：第' in text_of(c)]
        check(len(reads) == 1 and '分享给你看' in text_of(reads[0]) and '雪下了一夜' not in text_of(reads[0]), '读的时候只给这一章的原文')
        cm = await ph.page.evaluate("__xsj.D.bookCmts('b1').map(x => x.who + ':' + x.text)")
        check('c0:第2章这段好' in cm, f'写了段评：{cm}')
        # 再分享第一章：读的时候带着第二章的梗概
        await ph.page.evaluate("import('./js/core/read.js').then(R => R.share('b1', __xsj.D.chapters('b1')[0].id, 'c0'))")
        await ph.page.evaluate(tick); await asyncio.sleep(0.8)
        last = [c for c in ph.api.calls if '现在读：第 1 章' in text_of(c)]
        check(last and '第2章的梗概' in text_of(last[-1]), '跳着分享：读第一章时带着读过的第二章梗概')
        # 笔记：名单 → 阿一 → 列表
        await ph.open('read', {'book': 'b1'}); await asyncio.sleep(0.6)
        await ph.top('.bk-notes').click(); await asyncio.sleep(0.5)
        names = await ph.page.locator('.sheet .pick-it b').all_inner_texts()
        check(sorted(names) == ['阿一', '阿二'], f'笔记名单（只有名字）：{names}')
        await ph.page.locator('.sheet .pick-it', has_text='阿一').click(); await asyncio.sleep(0.6)
        rows = await ph.top('.nt-row b').all_inner_texts()
        check(rows == ['一', '二'], f'一章一行：{rows}')
        check(await ph.top('button[aria-label="写全书梗概"]').is_hidden(), '没读完：没有铅笔')
        await ph.shot(f'read8_notes_{size[0]}')
        # 点进去改：⭕ → 打字 → ✅ 直接存
        await ph.top('.nt-row').nth(1).click(); await asyncio.sleep(0.6)
        await ph.top('button.mode').click(); await asyncio.sleep(0.3)
        await ph.top('textarea.tp-ta').fill('我改过的梗概')
        await ph.top('button.mode').click(); await asyncio.sleep(0.3)
        check(await ph.page.locator('.dlg').count() == 0, '✅ 没弹问')
        got = await ph.page.evaluate("__xsj.D.readers('b1').c0.notes[__xsj.D.chapters('b1')[1].id]")
        check(got == '我改过的梗概', f'存上了：{got}')
        await ph.shot(f'read8_one_{size[0]}')
        await ph.page.evaluate("document.querySelector('.win .pg:last-child .bar .bk')?.click()"); await asyncio.sleep(0.6)
        # 左滑删第一章那行
        box = await ph.top('.nt-row').first.bounding_box()
        y = box['y'] + box['height'] / 2
        await ph.page.mouse.move(box['x'] + box['width'] - 20, y); await ph.page.mouse.down()
        for i in range(8): await ph.page.mouse.move(box['x'] + box['width'] - 20 - 15 * (i + 1), y); await asyncio.sleep(0.02)
        await ph.page.mouse.up(); await asyncio.sleep(0.4)
        await ph.top('.sw-del').first.click(); await asyncio.sleep(0.4)
        check(await ph.page.locator('.dlg').count() == 0 and await ph.top('.nt-row b').all_inner_texts() == ['二'], '左滑点红色就删了，不弹确认')
        # 读完整本 → 铅笔出来 → 全书梗概，各章的删掉
        await ph.page.evaluate("import('./js/core/read.js').then(R => { R.share('b1', __xsj.D.chapters('b1')[0].id, 'c0'); R.share('b1', __xsj.D.chapters('b1')[2].id, 'c0'); })")
        for _ in range(3): await ph.page.evaluate(tick); await asyncio.sleep(0.6)
        pen = ph.top('button[aria-label="写全书梗概"]')
        check(await pen.is_visible(), '读完了：右上角有铅笔')
        await pen.click(); await asyncio.sleep(0.3)
        await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(1.5)
        c0 = (await ph.page.evaluate("__xsj.D.readers('b1')"))['c0']
        check(c0.get('summary', '').startswith('全书梗概') and not c0.get('notes'), '写好全书梗概，各章的删掉了')
        check(await ph.top('.nt-row b').all_inner_texts() == ['全书'], '列表只剩「全书」')
        # 标完结 → 他自己决定不写阅读日记，但记住了一件事
        await ph.page.evaluate("__xsj.D.saveBook({ ...__xsj.D.bookById('b1'), done: true })")
        await ph.page.evaluate(tick); await asyncio.sleep(0.8)
        c0 = (await ph.page.evaluate("__xsj.D.readers('b1')"))['c0']
        memo = await ph.page.evaluate("__xsj.D.memos('c0').map(m => m.text)")
        diaries = await ph.page.evaluate("__xsj.D.diaries('c0').length")
        check(c0.get('review') == 'none' and diaries == 0 and '她喜欢下雪天读书' in memo, '不写阅读日记也行，要记的进了备忘录')
        # 聊天时他知道读过哪几章
        await ph.open('social', {'chat': 'c0'})
        await ph.top('textarea.ch-in').fill('看完了吗'); await ph.top('.ch-send').click(); await asyncio.sleep(3.5)
        tail = ph.api.calls[-1]['messages'][-1]['content']
        check('你读过第 1、2、3 章' in tail and '全书梗概' in tail, '聊天时知道读过哪几章、全书梗概')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (390, 844), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split('x')))]:
    print(size); asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
