"""游戏：主页面只有两张卡，右上角 ☰ = 玩过的（按游戏分组）"""
import asyncio, sys, time
from harness import Phone, check

async def main(size):
    async with Phone(size=size) as ph:
        await ph.setup(chars=2)
        now = int(time.time() * 1000)
        await ph.page.evaluate('''(now) => { const { S, D } = __xsj; const acc = D.curAccount().id;
          const g = (id, char, game, mode, t, extra) => ({ id, acc, char, game, mode, ts: t, lastTs: t, over: true, win: 'me', log: [], ...extra });
          S.set('games', [g('g1', 'c0', 'draw', 'me', now - 3000, { ans: '猫' }), g('g2', 'c1', 'soup', 'him', now - 2000, { soup: { title: '汤', face: '一个人', bottom: '答案' } }), g('g3', 'c1', 'draw', 'him', now - 1000, { ans: '树' })]); D.emit('game'); }''', now)
        await ph.open('game')
        check(await ph.top('.gm-tile').count() == 2 and await ph.top('.gm-it').count() == 0, '主页面只有两张卡')
        await ph.shot(f'game_home_{size[0]}')
        await ph.top('button[aria-label="玩过的"]').click(); await asyncio.sleep(0.6)
        heads = await ph.top('.gm-past-t').all_inner_texts()
        items = await ph.top('.gm-it-t b').all_inner_texts()
        check(heads == ['你画我猜', '海龟汤'], f'按游戏分组：{heads}')
        check(items[:2] == ['阿二 · 他来画', '阿一 · 我来画'] and len(items) == 3, f'组里新的在上面：{items}')
        await ph.shot(f'game_past_{size[0]}')
        await ph.top('.gm-it').first.click(); await asyncio.sleep(0.6)
        check(await ph.top('.gm-stage').count() == 1, '点一局进去')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (375, 667)]:
    print(size); asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
