"""动态里角色的反应：接口出错了不丢，放回去过会儿再试，试几次还不行才算了"""
import asyncio, json, sys
from harness import Phone, check

async def main():
    async with Phone() as ph:
        await ph.setup(chars=1)
        await ph.page.evaluate('''() => { const { D } = __xsj;
            D.saveMoment({ id: 'm1', acc: D.curAccount().id, who: 'me', text: '今天下雨', photos: [], likes: [], comments: [], ts: Date.now(), jobs: [{ kind: 'react', who: 'c0', due: Date.now() - 1000 }] }); }''')
        tick = "import('./js/core/life.js').then(m => m.tick())"
        ph.api.script = lambda b: [('http', 500, '坏了')]
        await ph.page.evaluate(tick); await asyncio.sleep(0.5)
        m = await ph.page.evaluate("__xsj.D.moments().find(x => x.id === 'm1')")
        jobs = m['jobs']
        check(len(jobs) == 1 and jobs[0]['tries'] == 1 and jobs[0]['due'] > m['ts'] + 5 * 60000, f'出错了放回去、过会儿再试：{jobs}')
        # 到时间了、接口好了 → 评论来了
        await ph.page.evaluate("() => { const m = __xsj.D.moments().find(x => x.id === 'm1'); m.jobs[0].due = Date.now() - 1; __xsj.D.saveMoment(m); }")
        ph.api.script = lambda b: [('content', json.dumps({'like': True, 'comment': '注意别着凉'}, ensure_ascii=False)), ('finish', 'stop')]
        await ph.page.evaluate(tick); await asyncio.sleep(0.5)
        m = await ph.page.evaluate("__xsj.D.moments().find(x => x.id === 'm1')")
        check(not m['jobs'] and m['comments'] and m['comments'][0]['text'] == '注意别着凉' and m['likes'] == ['c0'], '再试成功：点赞 + 评论')
        # 一直失败：试 4 次就算了
        await ph.page.evaluate("() => { const m = __xsj.D.moments().find(x => x.id === 'm1'); m.jobs = [{ kind: 'react', who: 'c0', due: Date.now() - 1, tries: 3 }]; __xsj.D.saveMoment(m); }")
        ph.api.script = lambda b: [('http', 500, '坏了')]
        await ph.page.evaluate(tick); await asyncio.sleep(0.5)
        m = await ph.page.evaluate("__xsj.D.moments().find(x => x.id === 'm1')")
        check(not m['jobs'], '第 4 次还失败就不再试了')
        check(not [e for e in ph.errors if '500' not in e], f'控制台没别的报错 {ph.errors[:3]}')

asyncio.run(main())
sys.exit(1 if check.failed else 0)
