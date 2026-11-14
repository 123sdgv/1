"""阅读（第七版）：聊天加号里没有「一起读」；书页「一起读的人」最后一个 ＋ 邀请；聊天里提到《书名》他就知道这本书；你回他的段评，他可以不回"""
import asyncio, json, sys
from harness import Phone, check

async def main(size):
    async with Phone(size=size) as ph:
        await ph.setup(chars=2)
        await ph.page.evaluate('''async () => { const { D } = __xsj; const R = await import('./js/core/read.js');
          D.saveBook({ id: 'b1', acc: D.curAccount().id, title: '雪国', reach: 2, createdAt: Date.now(), lastTs: Date.now() });
          R.saveChapter('b1', { title: '一', text: '穿过县界长长的隧道，便是雪国。\\n夜空下一片白茫茫。' });
          R.saveChapter('b1', { title: '二', text: '火车在信号所前停了下来。' });
          const ch = D.chapters('b1')[0];
          D.setBookCmts('b1', [{ id: 'x1', ch: ch.id, p: ch.paras[0].id, who: 'me', text: '开头好安静', ts: Date.now() }]); }''')
        # 聊天加号面板：没有一起读
        await ph.open('social', {'chat': 'c0'})
        await ph.top('.ch-plus').click(); await asyncio.sleep(0.5)
        tiles = await ph.page.locator('.ch-tile').evaluate_all('ts => ts.map(t => t.getAttribute("aria-label"))')
        check('一起读' not in tiles, f'加号面板：{tiles}')
        await ph.page.mouse.click(200, 100); await asyncio.sleep(0.4)
        # 聊天里提到《雪国》：他知道这本书
        ph.api.script = lambda b: [('content', '嗯'), ('finish', 'stop')]
        await ph.top('textarea.ch-in').fill('我最近在读《雪国》')
        await ph.top('.ch-send').click(); await asyncio.sleep(3.5)
        last = ph.api.calls[-1]['messages'][-1]['content']
        check('聊天里提到的书' in last and '《雪国》' in last and '读到第 2 章' in last and '开头好安静' in last, '提到《雪国》：尾巴里有书名、读到哪、你的段评')
        n0 = len(ph.api.calls)
        await ph.top('textarea.ch-in').fill('雪国这个名字真好听')
        await ph.page.evaluate("__xsj.D.setMsgs('c0', [])")
        await ph.top('.ch-send').click(); await asyncio.sleep(3.5)
        last = ph.api.calls[-1]['messages'][-1]['content']
        check('聊天里提到的书' not in last, '没有书名号不算')
        # 书页：＋ 邀请
        await ph.open('read', {'book': 'b1'}); await asyncio.sleep(0.6)
        await ph.shot(f'read7_book_{size[0]}')
        await ph.top('button[aria-label="邀请一起读"]').click(); await asyncio.sleep(0.5)
        await ph.page.locator('.sheet .pick-it').first.click(); await asyncio.sleep(0.6)
        rd = await ph.page.evaluate("__xsj.D.readers('b1')")
        check(list(rd.keys()) == ['c0'], f'邀请了阿一：{list(rd.keys())}')
        await ph.shot(f'read7_joined_{size[0]}')
        # 他在读、又提到书名：上面「你在读的书」已经说了，不重复
        await ph.open('social', {'chat': 'c0'})
        await ph.top('textarea.ch-in').fill('《雪国》第二章你看了吗'); await ph.top('.ch-send').click(); await asyncio.sleep(3.5)
        last = [c for c in ph.api.calls if c['messages'][0]['role'] == 'system' and '雪国' in c['messages'][-1]['content']][-1]['messages'][-1]['content']
        check('你在读的书' in last and '聊天里提到的书' not in last, '在读的书不重复写两遍')
        # 你回他的段评：不一定排回复（大概八成）
        cnt = await ph.page.evaluate('''async () => { const { D } = __xsj; const R = await import('./js/core/read.js'); const ch = D.chapters('b1')[0];
          let n = 0; for (let i = 0; i < 200; i++) { D.setBookJobs([]); const his = { id: 'h' + i, ch: ch.id, p: ch.paras[0].id, who: 'c0', text: '嗯', ts: Date.now() };
            D.setBookCmts('b1', [...D.bookCmts('b1'), his]); R.addMyComment('b1', { ch: ch.id, p: ch.paras[0].id, to: his.id, text: '对' });
            if (D.bookJobs().some((j) => j.kind === 'reply')) n++; } D.setBookJobs([]); return n; }''')
        check(120 < cnt < 195, f'你回他的段评，他大概八成会回（200 次里 {cnt} 次）')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (375, 667)]:
    print(size); asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
