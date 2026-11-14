"""日记：一页一篇像翻书（往右划翻回前一篇、往左划翻到后一篇）、右下角日期点了选一天翻过去、⭕ 改这一页、长按删；
写日记：模型回的 JSON 不规矩（字符串里换行、没转义的引号、被截断）也能收下，真没成会说是哪种没成。
塔罗追问、游戏里的消息：长按 → 编辑 / 删除（你的、他的都行）"""
import asyncio, json, sys, time
from harness import Phone, check

DIARIES = [('2026-11-10', '第一篇。下雨。'), ('2026-11-12', '第二篇。她说想吃面。'), ('2026-11-15', '第三篇。今天他又问我那首歌。')]

async def drag(ph, x0, x1, y, steps=10):
    await ph.page.mouse.move(x0, y); await ph.page.mouse.down()
    for i in range(1, steps + 1):
        await ph.page.mouse.move(x0 + (x1 - x0) * i / steps, y); await asyncio.sleep(0.02)
    await ph.page.mouse.up(); await asyncio.sleep(0.6)

async def cur_text(ph):
    return await ph.page.evaluate("[...document.querySelectorAll('.dy-bk .dy-pg')].pop()?.querySelector('.dy-text').innerText")

async def main(size):
    async with Phone(size=size) as ph:
        await ph.setup(chars=1)
        now = int(time.time() * 1000)
        await ph.page.evaluate('''([ds, now]) => { const { D } = __xsj;
          D.setDiaries('c0', ds.map(([date, text], i) => ({ id: 'd' + i, date, text, inner: i === 2 ? '其实我很在意' : '', keys: ['歌'], ts: now - (3 - i) * 1000, upto: now - (3 - i) * 1000 }))); }''', [DIARIES, now])
        await ph.open('diary', {'char': 'c0'}); await asyncio.sleep(0.8)
        check(await ph.top('.dy-pg').count() == 1, '一页只有一篇')
        check((await cur_text(ph)).startswith('第三篇'), '打开是最新那篇')
        date = await ph.top('.dy-date span').inner_text()
        check(date.startswith('11月15日'), f'日期在右下角：{date}')
        box = await ph.top('.dy-date').bounding_box(); bk = await ph.top('.dy-bk').bounding_box()
        check(box['x'] + box['width'] > bk['x'] + bk['width'] - 40 and box['y'] > bk['y'] + bk['height'] - 60, '日期的位置是右下角')
        await ph.shot(f'diary_page_{size[0]}')
        # 往右划：翻回前一篇（翻到一半截一张）
        bk = await ph.top('.dy-bk').bounding_box()
        y = bk['y'] + bk['height'] / 2
        await ph.page.mouse.move(bk['x'] + 80, y); await ph.page.mouse.down()
        for i in range(1, 8): await ph.page.mouse.move(bk['x'] + 80 + 22 * i, y); await asyncio.sleep(0.02)
        await ph.shot(f'diary_turning_{size[0]}')
        check(await ph.top('.dy-pg.turning').count() == 1, '翻到一半：有一页在转')
        for i in range(8, 14): await ph.page.mouse.move(bk['x'] + 80 + 22 * i, y); await asyncio.sleep(0.02)
        await ph.page.mouse.up(); await asyncio.sleep(0.7)
        check((await cur_text(ph)).startswith('第二篇') and await ph.top('.dy-pg').count() == 1, '往右划翻回前一篇')
        # 往左划：翻到后一篇
        await drag(ph, bk['x'] + bk['width'] - 40, bk['x'] + 60, y)
        check((await cur_text(ph)).startswith('第三篇'), '往左划翻到后一篇')
        # 划一点点就松手：不翻
        await drag(ph, bk['x'] + 200, bk['x'] + 230, y, steps=3)
        check((await cur_text(ph)).startswith('第三篇') and await ph.top('.dy-pg').count() == 1, '划一点点不翻')
        # 最后一篇往左划：没有下一篇，不动
        await drag(ph, bk['x'] + bk['width'] - 40, bk['x'] + 60, y)
        check((await cur_text(ph)).startswith('第三篇'), '最后一篇再往后翻不动')
        # 点日期选一天：翻到那天
        await ph.page.evaluate("(() => { const i = [...document.querySelectorAll('.dy-bk .dy-pg')].pop().querySelector('.dy-date-in'); i.value = '2026-11-10'; i.dispatchEvent(new Event('change')); })()"); await asyncio.sleep(0.8)
        check((await cur_text(ph)).startswith('第一篇'), '选 11 月 10 日：翻到那天')
        await ph.page.evaluate("(() => { const i = [...document.querySelectorAll('.dy-bk .dy-pg')].pop().querySelector('.dy-date-in'); i.value = '2026-11-13'; i.dispatchEvent(new Event('change')); })()"); await asyncio.sleep(0.8)
        check((await cur_text(ph)).startswith('第二篇'), '那天没写：翻到最近的一篇（11 月 12 日）')
        # ⭕ 改这一页
        await ph.top('button.mode').click(); await asyncio.sleep(0.4)
        await ph.top('.dy-text').evaluate("e => { e.innerText = '第二篇改过了'; }")
        await ph.shot(f'diary_edit_{size[0]}')
        await ph.top('button.mode').click(); await asyncio.sleep(0.4)
        await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(0.5)
        got = await ph.page.evaluate("__xsj.D.diaries('c0').find(d => d.id === 'd1').text")
        check(got == '第二篇改过了' and (await cur_text(ph)).startswith('第二篇改过了'), f'改好存上了，还停在这页：{got}')
        # 让他写一篇：模型回的 JSON 里有换行、有没转义的引号
        await ph.page.evaluate("__xsj.D.setMsgs('c0', [{ id: 'm1', role: 'me', ts: Date.now(), alts: [[{ t: 'text', text: '晚安' }]], cur: 0 }])")
        bad = '{"date": "2026-11-16", "diary": "她说"晚安"。\n\n我想了很久。", "inner": "嗯", "keywords": ["晚安"], "memo_add": [], "memo_remove": [],}'
        ph.api.script = lambda b: [('content', bad), ('finish', 'stop')]
        await ph.top('button[aria-label="让他现在写一篇"]').click(); await asyncio.sleep(0.3)
        await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(1.5)
        ds = await ph.page.evaluate("__xsj.D.diaries('c0')")
        check(len(ds) == 4 and ds[-1]['text'] == '她说"晚安"。\n\n我想了很久。', f'JSON 不规矩也收下了：{ds[-1]["text"]!r}')
        check((await cur_text(ph)).startswith('她说'), '写好了翻到新的那篇')
        calls = [c for c in ph.api.calls if '写一篇日记' in json.dumps(c, ensure_ascii=False)]
        check(calls and 'max_tokens' not in calls[-1] and calls[-1].get('temperature') == 0.85, f'日记：Token 不限、温度 0.85：{calls and calls[-1].get("max_tokens")}')
        # 被截断（还没写就没了）：说清楚
        await ph.page.evaluate("__xsj.D.setMsgs('c0', [...__xsj.D.msgs('c0'), { id: 'm2', role: 'me', ts: Date.now(), alts: [[{ t: 'text', text: '早' }]], cur: 0 }])")
        ph.api.script = lambda b: [('finish', 'length')]
        await ph.top('button[aria-label="让他现在写一篇"]').click(); await asyncio.sleep(0.3)
        await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(1.2)
        msg = await ph.page.locator('.toast').last.inner_text()
        check('Token 上限' in msg, f'没写成会说为什么：{msg}')
        # 长按 → 删除这篇
        bk = await ph.top('.dy-bk').bounding_box()
        await ph.longpress(bk['x'] + 120, bk['y'] + 60)
        await ph.page.locator('.menu button', has_text='删除这篇').click(); await asyncio.sleep(0.3)
        await ph.page.locator('.dlg-btns button.danger').click(); await asyncio.sleep(0.6)
        check(len(await ph.page.evaluate("__xsj.D.diaries('c0')")) == 3 and (await cur_text(ph)).startswith('第三篇'), '长按删了这篇，翻到旁边那篇')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

async def bubbles(size):
    async with Phone(size=size) as ph:
        await ph.setup(chars=1)
        # 游戏：一局里你一句他一句
        now = int(time.time() * 1000)
        await ph.page.evaluate('''(now) => { const { S, D } = __xsj;
          S.set('games', [{ id: 'g1', acc: D.curAccount().id, char: 'c0', game: 'draw', mode: 'him', ts: now, lastTs: now, over: true, win: 'me', ans: '树', lines: [[10,10,90,90]],
            log: [{ id: 'e1', ts: now, who: 'me', text: '是树吗' }, { id: 'e2', ts: now, who: 'them', text: '猜对啦' }] }]); D.emit('game'); }''', now)
        await ph.open('game')
        await ph.top('button[aria-label="玩过的"]').click(); await asyncio.sleep(0.6)
        await ph.top('.gm-it').first.click(); await asyncio.sleep(0.8)
        for who, new in [('them', '猜对啦！你好厉害'), ('me', '是不是树')]:
            b = await ph.top(f'.rec.{who} .bub').first.bounding_box()
            await ph.longpress(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
            labels = await ph.page.locator('.popbar button').evaluate_all('bs => bs.map(b => b.getAttribute("aria-label"))')
            check(labels == ['编辑', '删除'], f'游戏：长按{"他" if who == "them" else "我"}的消息出 编辑·删除：{labels}')
            await ph.page.locator('.popbar button[aria-label="编辑"]').click(); await asyncio.sleep(0.4)
            await ph.top('.bub.ie-on').evaluate('(e, t) => { e.innerText = t; }', new)
            if who == 'them': await ph.shot(f'game_edit_{size[0]}')
            await ph.top('.ie-bar .ok').click(); await asyncio.sleep(0.4)
        log = await ph.page.evaluate("__xsj.D.gameById('g1').log.map(e => e.text)")
        check(log == ['是不是树', '猜对啦！你好厉害'], f'游戏：改好了：{log}')
        b = await ph.top('.rec.them .bub').first.bounding_box()
        await ph.longpress(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        await ph.page.locator('.popbar button[aria-label="删除"]').click(); await asyncio.sleep(0.4)
        check(await ph.page.evaluate("__xsj.D.gameById('g1').log.map(e => e.who)") == ['me'] and await ph.top('.rec.them .bub').count() == 0, '游戏：删了他那句')
        # 塔罗追问：一来一回以后长按
        await ph.page.evaluate('''(now) => { const { D } = __xsj;
          D.saveTarot({ id: 't1', acc: D.curAccount().id, q: '这周', spread: Object.keys({ single: 1 })[0], seed: 1, tf: 'night', cards: [{ pos: '现在', card: '星星', up: true }], text: '解好的', ts: now,
            chat: [{ id: 'q1', who: 'me', text: '再讲讲', ts: now }, { id: 'a1', who: 'them', text: '这张牌是希望', ts: now }] }); }''', now)
        await ph.open('tarot'); await asyncio.sleep(0.6)
        spread_ok = await ph.page.evaluate("import('./js/core/tarot.js').then(m => Object.keys(m.SPREADS || {}))")
        if spread_ok and 'single' not in spread_ok:
            await ph.page.evaluate(f"__xsj.D.saveTarot({{ ...__xsj.D.tarots().find(t => t.id === 't1'), spread: '{spread_ok[0]}' }})")
        await ph.top('.sw-front').first.click(); await asyncio.sleep(0.8)
        box = await ph.top('.ta-out').bounding_box()
        await ph.longpress(box['x'] + 40, box['y'] + 20)
        await ph.page.locator('.popbar button[aria-label="聊天"]').click(); await asyncio.sleep(0.7)
        for who, new in [('them', '这张牌是希望，也是休息'), ('me', '能再讲讲吗')]:
            b = await ph.top(f'.rec.{who} .bub').first.bounding_box()
            await ph.longpress(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
            labels = await ph.page.locator('.popbar button').evaluate_all('bs => bs.map(b => b.getAttribute("aria-label"))')
            check(labels == ['编辑', '删除'], f'塔罗：长按{"他" if who == "them" else "我"}的消息出 编辑·删除：{labels}')
            await ph.page.locator('.popbar button[aria-label="编辑"]').click(); await asyncio.sleep(0.4)
            await ph.top('.bub.ie-on').evaluate('(e, t) => { e.innerText = t; }', new)
            if who == 'me': await ph.shot(f'tarot_edit_{size[0]}')
            await ph.top('.ie-bar .ok').click(); await asyncio.sleep(0.4)
        chat = await ph.page.evaluate("__xsj.D.tarots().find(t => t.id === 't1').chat.map(m => m.text)")
        check(chat == ['能再讲讲吗', '这张牌是希望，也是休息'], f'塔罗：改好了：{chat}')
        b = await ph.top('.rec.me .bub').first.bounding_box()
        await ph.longpress(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        await ph.page.locator('.popbar button[aria-label="删除"]').click(); await asyncio.sleep(0.4)
        check(await ph.page.evaluate("__xsj.D.tarots().find(t => t.id === 't1').chat.map(m => m.who)") == ['them'], '塔罗：删了我那句')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (390, 844), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split('x')))]:
    print(size); asyncio.run(main(size)); asyncio.run(bubbles(size))
sys.exit(1 if check.failed else 0)
