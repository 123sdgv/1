"""模型参数不让设了（温度 0.85、不发 max_tokens、带 40 条）；资料 ⭕ 里「隔断记忆」在「删除这个角色」上面：
点了聊天里出一条线，他回消息只看线下面的；线上面的还在，写日记照样写进去；长按那条线删掉就不隔断了"""
import asyncio, json, sys, time
from harness import Phone, check
from fakeapi import text_of

async def main(size):
    async with Phone(size=size) as ph:
        await ph.setup(chars=1)
        now = int(time.time() * 1000)
        await ph.page.evaluate('''(now) => { const { D } = __xsj;
          D.setMsgs('c0', [
            { id: 'a', role: 'me', ts: now - 60000, alts: [[{ t: 'text', text: '旧的话：我叫小白' }]], cur: 0 },
            { id: 'b', role: 'them', ts: now - 50000, alts: [[{ t: 'text', text: '记住啦' }]], cur: 0 }]);
          // 老存档里存过的模型参数：不管了
          D.saveChar({ ...D.charById('c0'), gen: { temperature: 1.6, maxTokens: 300, histLen: 10 } }); }''', now)
        await ph.open('social', {'chat': 'c0'}); await asyncio.sleep(0.8)
        await ph.top('button[aria-label="资料"]').click(); await asyncio.sleep(0.6)
        txt = await ph.top('.scroll').inner_text()
        check('温度' not in txt and 'Token' not in txt and '上下文' not in txt and '模型' not in txt, '资料里没有温度、Token、上下文了')
        await ph.top('button.mode').click(); await asyncio.sleep(0.5)
        rows = await ph.top('.row.center').all_inner_texts()
        check(rows[-2:] == ['隔断记忆', '删除这个角色'], f'改的时候：隔断记忆在删除角色上面：{rows}')
        await ph.shot(f'cut_profile_{size[0]}')
        await ph.top('.row.center:has-text("隔断记忆")').click(); await asyncio.sleep(0.4)
        check(await ph.top('.row.center:has-text("隔断记忆")').count() == 0, '点了这一行就没了')
        check(await ph.page.evaluate("__xsj.D.isCut(__xsj.D.msgs('c0').at(-1))"), '聊天里加了一条隔断')
        await ph.top('button.mode').click(); await asyncio.sleep(0.4)
        if await ph.page.locator('.dlg').count(): await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(0.4)
        await ph.page.evaluate("document.querySelector('.win .pg:last-child .bar .bk')?.click()"); await asyncio.sleep(0.6)
        check(await ph.top('.ch-cut').count() == 1 and '旧的话' in await ph.top('.scroll').inner_text(), '聊天页：一条线，上面的还看得到')
        # 发一句：他只看线下面的
        ph.api.calls.clear()
        await ph.top('textarea.ch-in').fill('早'); await ph.top('.ch-send').click(); await asyncio.sleep(3.5)
        await ph.shot(f'cut_chat_{size[0]}')
        call = [c for c in ph.api.calls if c.get('stream')][-1]
        hist = '\n'.join(str(m['content']) for m in call['messages'][1:])
        check('旧的话' not in hist and '早' in hist, '他回消息只看线下面的')
        check(call.get('temperature') == 0.85 and 'max_tokens' not in call, f'温度 0.85、不发 Token 上限：{call.get("temperature")} {call.get("max_tokens")}')
        # 写日记：线上面的还没写进日记，照样写进去
        log = await ph.page.evaluate("import('./js/core/context.js').then(C => C.diaryLog(__xsj.D.charById('c0'), 0).text)")
        check('旧的话' in log and '早' in log and '（系统）：\n' not in log, '写日记的素材里线上面的还在')
        # 长按那条线 → 删掉 → 不隔断了
        b = await ph.top('.ch-cut').bounding_box()
        await ph.longpress(b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
        await ph.page.locator('.popbar button[aria-label="删除"]').click(); await asyncio.sleep(0.4)
        check(await ph.top('.ch-cut').count() == 0, '长按删掉那条线')
        msgs = await ph.page.evaluate("import('./js/core/context.js').then(C => C.buildChat(__xsj.D.charById('c0')).map(m => m.content).join('\\n'))")
        check('旧的话' in msgs, '删了线：他又看得到前面的了')
        # 线下自己写的一段：设置里也没有模型参数
        await ph.open('offline'); await asyncio.sleep(0.6)
        plus = ph.top('button[aria-label="新的一段"]')
        if await plus.count():
            await plus.click(); await asyncio.sleep(0.6)
            t = await ph.page.locator('.win .pg').last.inner_text()
            check('温度' not in t and 'Token' not in t, '线下自己写的一段：没有模型参数')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

async def calwg(size):
    """日历小组件：放得下几条就放几条，不管隔多远（以前只看 60 天内的，所以只出一条）"""
    async with Phone(size=size) as ph:
        await ph.setup()
        await ph.page.evaluate('''() => { const { S, D } = __xsj;
          const d = (n) => { const t = new Date(Date.now() + n * 86400000); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
          D.setEvents([30, 70, 100, 200, 400].map((n, i) => ({ id: 'e' + i, date: d(n), title: '事情' + (i + 1), note: '', yearly: false, done: [] })));
          S.set('layout', { pages: [[{ k: 'w:cal', x: 0, y: 0 }]], dock: ['app:social', 'app:album', 'app:calendar', 'app:settings'], widgets: { 'w:cal': { type: 'calendar', w: 4, h: 2, conf: {} } } }); }''')
        await ph.flush(); await ph.load(); await ph.unlock(); await asyncio.sleep(0.6)
        items = await ph.page.locator('#home .wg-cal .wg-ag-t').all_inner_texts()
        check(items == ['事情1', '事情2', '事情3', '事情4'], f'日历小组件：接下来四件都出来了：{items}')
        await ph.shot(f'calwg_{size[0]}')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (390, 844), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split('x')))]:
    print(size); asyncio.run(main(size)); asyncio.run(calwg(size))
sys.exit(1 if check.failed else 0)
