"""塔罗：自动翻牌、自动解、长按黑条（重试 / 删除 / 聊天）、追问、卡住能停、重试一定有反应"""
import asyncio, sys
from harness import Phone, check

TAROT = 'm => m'
async def recs(ph):
    return await ph.page.evaluate('__xsj.D.tarots()')

async def draw(ph, q='这周该不该换个方向'):
    await ph.top('button[aria-label="抽牌"]').click(); await asyncio.sleep(0.5)
    await ph.top('textarea').fill(q)
    await ph.top('.btn.wide').click()

async def main(size):
    async with Phone(size=size) as ph:
        await ph.setup()
        await ph.open('tarot')
        await draw(ph)
        await asyncio.sleep(1.2)
        await ph.shot(f'tarot_deal_{size[0]}')
        # 不点牌：自己翻完、自己开始解
        for _ in range(40):
            r = (await recs(ph))[0]
            if r.get('text'): break
            await asyncio.sleep(0.25)
        opened = await ph.top('.ta-card.open').count()
        check(opened == 3, f'三张牌自己翻开了（{opened}）')
        check(bool(r.get('text')), '翻完自己解完了')
        await ph.shot(f'tarot_done_{size[0]}')

        # 长按解牌 → 黑条三个图标
        box = await ph.top('.ta-out').bounding_box()
        await ph.longpress(box['x'] + 60, box['y'] + 40)
        labels = await ph.page.locator('.popbar button').evaluate_all('bs => bs.map(b => b.getAttribute("aria-label"))')
        check(labels == ['重试', '删除', '聊天'], f'长按出黑条：{labels}')
        await ph.shot(f'tarot_pop_{size[0]}')
        await ph.page.locator('.popbar button[aria-label="聊天"]').click(); await asyncio.sleep(0.6)
        # 追问
        await ph.top('textarea.ch-in').fill('第二张能再讲讲吗')
        await ph.top('.ch-send').click()
        for _ in range(30):
            r = (await recs(ph))[0]
            if len(r.get('chat') or []) >= 2: break
            await asyncio.sleep(0.2)
        chat = r.get('chat') or []
        check([m['who'] for m in chat] == ['me', 'them'], f'追问一来一回存进这一局（{[m["who"] for m in chat]}）')
        last = ph.api.calls[-1]
        sysmsg = last['messages'][0]['content']
        check('客观、理性的塔罗师' in sysmsg and r['text'][:10] in sysmsg and '这周该不该换个方向' in sysmsg, '追问只带问题、牌和解牌原文')
        check(last['messages'][-1]['content'] == '第二张能再讲讲吗', '最后一条是你问的')
        await ph.shot(f'tarot_chat_{size[0]}')
        # 他回的时候又问一句：回完接着回，顺序对
        ph.api.script = lambda b: [('content', '先'), ('sleep', 1.2), ('content', '说这个。'), ('finish', 'stop')]
        await ph.top('textarea.ch-in').fill('一'); await ph.top('.ch-send').click(); await asyncio.sleep(0.4)
        await ph.top('textarea.ch-in').fill('二'); await ph.top('.ch-send').click()
        for _ in range(40):
            r = (await recs(ph))[0]
            if len(r['chat']) >= 6: break
            await asyncio.sleep(0.2)
        seq = [(m['who'], m['text'][:2]) for m in r['chat']][2:]
        check(seq == [('me', '一'), ('them', '先说'), ('me', '二'), ('them', '先说')], f'连着问两句顺序对：{seq}')
        ph.api.script = None
        # 回去，长按 → 删除：只删解牌和追问
        await ph.page.evaluate('document.querySelector(".win .pg:last-child .bar button, .win .pg:last-child [aria-label=返回]")?.click()')
        await asyncio.sleep(0.6)
        box = await ph.top('.ta-out').bounding_box()
        await ph.longpress(box['x'] + 60, box['y'] + 40)
        await ph.page.locator('.popbar button[aria-label="删除"]').click(); await asyncio.sleep(0.4)
        r = (await recs(ph))[0]
        check(not r['text'] and not r.get('chat') and len(r['cards']) == 3 and r['q'], '删除只删了解牌和追问，牌和问题还在')
        check(await ph.top('.ta-go').count() == 1, '下面出了「解牌」')

        # 卡住：只有 keep-alive 和思考、一直没正文 → 停下，出重试
        await ph.page.evaluate("import('./js/core/tarot.js').then(m => { m.LIMITS.first = 2500; m.LIMITS.idle = 2000; })")
        ph.api.script = lambda b: [('reason', '想一想'), ('hang',)]
        await ph.top('.ta-go').click()
        await asyncio.sleep(4)
        r = (await recs(ph))[0]
        check('没开始写' in (r.get('error') or ''), f'一直没正文 → 停了：{r.get("error")}')
        err = ph.top('.ta-err')
        check(await err.count() == 1, '出了重试')
        await ph.shot(f'tarot_stall_{size[0]}')
        # 写了一半没动静 → 停，留着写了一半的，点了接着解
        ph.api.script = lambda b: [('content', '【整体能量】\n写到一半'), ('hang',)]
        await err.click(); await asyncio.sleep(3.5)
        r = (await recs(ph))[0]
        check('写到一半' in (r.get('part') or '') and '没动静' in (r.get('error') or ''), f'写一半卡住 → 留着：{r.get("part")!r} {r.get("error")}')
        ph.api.script = None
        await ph.top('.ta-err').click()
        for _ in range(40):
            r = (await recs(ph))[0]
            if r.get('text'): break
            await asyncio.sleep(0.25)
        msgs = ph.api.calls[-1]['messages']
        check(r.get('text', '').startswith('【整体能量】\n写到一半') and msgs[1]['role'] == 'assistant', '接着解：带着写了一半的接上')

        # 正在解、半天没新字：点子下面出重试，点了一定有反应（停掉旧的重新来）
        await ph.page.evaluate("import('./js/core/tarot.js').then(m => { m.LIMITS.first = 60000; m.LIMITS.idle = 60000; m.STALE.ms = 1500; })")
        ph.api.script = lambda b: [('hang',)]
        box = await ph.top('.ta-out').bounding_box()
        await ph.longpress(box['x'] + 60, box['y'] + 40)
        await ph.page.locator('.popbar button[aria-label="重试"]').click(); await asyncio.sleep(0.4)
        await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(3.5)
        rb = ph.top('.ta-retry')
        check(await rb.count() == 1, '半天没新字 → 出了重试图标')
        await ph.shot(f'tarot_stale_{size[0]}')
        n0 = len(ph.api.calls)
        ph.api.script = None
        await rb.click()
        for _ in range(40):
            r = (await recs(ph))[0]
            if r.get('text'): break
            await asyncio.sleep(0.25)
        check(bool(r.get('text')) and len(ph.api.calls) == n0 + 1, '点了重试：重新解完了')

        # 列表左滑能删整局
        await ph.page.evaluate('document.querySelector(".win .pg:last-child .bar button")?.click()'); await asyncio.sleep(0.6)
        check(await ph.top('.ta-it').count() == 1, '列表里一局')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (390, 844), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split("x")))]:
    print(size)
    asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
