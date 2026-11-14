"""音乐 App：加歌（导 .lrc、封面）→ 播放页（两句歌词、进度、点一下只看歌词、点一句跳过去）→ 歌单（收藏、推荐、长按）→
推荐给他 = 聊天里歌卡片 + 跳过去，点卡片到评论区 → 路人来评论、他来评论 / 回复 / 点赞 → 你回他、他回你 → 喜欢不喜欢 → 聊天里《歌名》他知道"""
import asyncio, json, os, re, sys, tempfile
from harness import Phone, check
from fakeapi import text_of

LRC = """[ti:夜航]
[ar:无名乐队]
[00:00.00]作词 : 小白
[00:01.00]作曲 : 小黑
[00:10.00]第一句歌词
[00:20.50]第二句歌词
[00:31.00]第三句歌词
"""

def script(b):
    t = text_of(b)
    if '个在音乐软件评论区随手留言的陌生人' in t:
        return [('content', json.dumps({'comments': [{'who': 1, 'text': '路人甲来了', 'reply': 0}, {'who': 2, 'text': '同感', 'reply': 1}]}, ensure_ascii=False)), ('finish', 'stop')]
    if '看了看下面的评论区' in t:
        return [('content', json.dumps({'comments': ['他写的一条'], 'replies': [{'to': 1, 'text': '他回路人'}], 'likes': [1, 2]}, ensure_ascii=False)), ('finish', 'stop')]
    if '刚刚回复了你' in t and '你是「' in t:
        return [('content', json.dumps({'reply': '他回你', 'like': True}, ensure_ascii=False)), ('finish', 'stop')]
    return [('content', '好听'), ('finish', 'stop')]

TICK = "import('./js/core/music.js').then(m => m.musicTick())"
DUE = "__xsj.S ? 0 : 0; (() => { const D = __xsj.D; D.setSongJobs(D.songJobs().map(j => ({ ...j, due: Date.now() - 1 }))); })()"

async def main(size):
    tmp = tempfile.mkdtemp()
    lrc = os.path.join(tmp, '夜航.lrc'); open(lrc, 'w', encoding='utf-8').write(LRC)
    png = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icon-192.png')
    async with Phone(size=size) as ph:
        await ph.setup(chars=2)
        ph.api.script = script
        await ph.open('music'); await asyncio.sleep(0.8)
        check('还没有歌' in await ph.top('.mu-ttl').inner_text(), '没歌：播放页写「还没有歌」')
        await ph.shot(f'music_empty_{size[0]}')
        # ☰ → 我的 + 歌单
        await ph.top('button[aria-label="歌单"]').click(); await asyncio.sleep(0.6)
        name = await ph.top('.mu-me b').inner_text()
        check(re.fullmatch(r'[A-Za-z]+_?\d*', name) is not None, f'匿名名字是字母 + 数字：{name}')
        check(await ph.top('.mu-me svg').count() == 1, '匿名头像')
        # ＋ → 加歌：导 .lrc、放封面
        await ph.top('button[aria-label="加歌"]').click(); await asyncio.sleep(0.6)
        async with ph.page.expect_file_chooser() as fc:
            await ph.top('.row:has-text("导入 .lrc")').click()
        await (await fc.value).set_files(lrc); await asyncio.sleep(0.6)
        vals = await ph.top('.row input').evaluate_all('xs => xs.map(x => x.value)')
        check(vals[:2] == ['夜航', '无名乐队'], f'lrc 里的歌名歌手填上了：{vals}')
        if os.path.exists(png):
            async with ph.page.expect_file_chooser() as fc:
                await ph.top('.mu-ecv-b').click()
            await (await fc.value).set_files(png); await asyncio.sleep(0.8)
        await ph.top('.row input[type="url"]').fill('https://example.com/song')
        await ph.shot(f'music_edit_{size[0]}')
        await ph.top('button[aria-label="存好"]').click(); await asyncio.sleep(0.8)
        s = await ph.page.evaluate('__xsj.D.songs()[0]')
        check(s and s['title'] == '夜航' and s['lyricist'] == '小白' and s['composer'] == '小黑' and len(s['lines']) == 5 and s['lines'][2]['t'] == 10, f'存好的歌：{s and {k: s[k] for k in ("title", "lyricist", "composer")}}')
        check(s['dur'] == 43, f'长度按最后一句 + 12 秒：{s["dur"]}')
        jobs = await ph.page.evaluate('__xsj.D.songJobs()')
        check(any(j['kind'] == 'pass' for j in jobs), '新歌：排了路人来评论')
        rows = await ph.top('.mu-row b').all_inner_texts()
        check(rows == ['夜航'], f'歌单：{rows}')
        await ph.shot(f'music_list_{size[0]}')
        # 收藏
        await ph.top('.mu-row button[aria-label="收藏"]').click(); await asyncio.sleep(0.3)
        check(await ph.page.evaluate('__xsj.D.songs()[0].fav') is True and await ph.top('.mu-row .ibtn.on').count() == 1, '点爱心 = 收藏（实心）')
        # 点一行 → 回播放页、开始放
        await ph.top('.mu-row').click(); await asyncio.sleep(0.8)
        check(await ph.top('.mu-ttl').inner_text() == '夜航' and await ph.top('.mu-art').inner_text() == '无名乐队', '播放页：歌名歌手')
        two = await ph.top('.mu-two p').all_inner_texts()
        check(two[0].startswith('作词'), f'封面下面两句（开头是作词作曲）：{two}')
        check(await ph.page.evaluate("document.body.classList.contains('app-dark')"), '播放页：底色是深的')
        playing = await ph.page.evaluate("import('./js/core/music.js').then(m => m.nowPlaying())")
        check(playing['playing'], '点歌就开始放')
        await asyncio.sleep(1.2)
        check(await ph.top('.mu-times small').first.inner_text() in ('0:01', '0:02'), '进度在走')
        await ph.shot(f'music_player_{size[0]}')
        # 拖进度条到中间
        box = await ph.top('.mu-track').bounding_box()
        await ph.page.mouse.click(box['x'] + box['width'] * 0.5, box['y'] + 2); await asyncio.sleep(0.4)
        pos = (await ph.page.evaluate("import('./js/core/music.js').then(m => m.nowPlaying())"))['pos']
        check(20 <= pos <= 24, f'点进度条跳过去：{pos:.1f}')
        two = await ph.top('.mu-two p').all_inner_texts()
        check(two[0] == '第二句歌词', f'两句歌词跟着走：{two}')
        # 点封面 → 只看歌词，点一句跳过去
        await ph.top('.mu-cvbox').click(); await asyncio.sleep(0.5)
        check(await ph.top('.mu-player.lyr').count() == 1 or await ph.page.locator('.mu-player.lyr').count() == 1, '点一下：只看歌词')
        check(await ph.page.locator('.mu-ly.on').inner_text() == '第二句歌词', '现在那句是亮的')
        await ph.page.locator('.mu-ly', has_text='第三句歌词').click(); await asyncio.sleep(0.4)
        pos = (await ph.page.evaluate("import('./js/core/music.js').then(m => m.nowPlaying())"))['pos']
        check(31 <= pos <= 32.5, f'点一句跳过去：{pos:.1f}')
        await ph.shot(f'music_lyrics_{size[0]}')
        await ph.page.locator('.mu-stage').click(position={'x': 10, 'y': 10}); await asyncio.sleep(0.3)
        check(await ph.page.locator('.mu-player.lyr').count() == 0, '再点空白处回到封面')
        await ph.page.evaluate("import('./js/core/music.js').then(m => { if (m.nowPlaying().playing) m.toggle(); })")
        # 路人来评论
        await ph.page.evaluate(DUE); await ph.page.evaluate(TICK); await asyncio.sleep(0.8)
        cms = await ph.page.evaluate("__xsj.D.songCmts(__xsj.D.songs()[0].id)")
        check(len(cms) == 2 and all(c['who'].startswith('p.') for c in cms) and cms[1]['to'] == cms[0]['id'], f'路人来了两条，第二条回第一条：{[c["text"] for c in cms]}')
        check(await ph.top('.mu-cmb .mu-n').inner_text() == '2', '评论图标上是真的条数')
        # 推荐给阿一：歌单里推荐 → 选人 → 聊天卡片、跳过去
        await ph.top('button[aria-label="歌单"]').click(); await asyncio.sleep(0.6)
        await ph.top('.mu-row button[aria-label="推荐"]').click(); await asyncio.sleep(0.5)
        await ph.page.locator('.sheet .pick-it', has_text='阿一').click(); await asyncio.sleep(1.2)
        check(await ph.page.evaluate('__xsj.currentApp()') == 'social', '推荐完跳到聊天')
        parts = await ph.page.evaluate("__xsj.D.msgs('c0').flatMap(r => __xsj.D.partsOf(r))")
        check(parts and parts[0]['t'] == 'song' and parts[0]['title'] == '夜航', f'聊天里是歌卡片：{parts[:1]}')
        check(await ph.top('.card.songc').count() == 1, '卡片显示出来了')
        await asyncio.sleep(3)
        await ph.shot(f'music_card_{size[0]}')
        sent = [c for c in ph.api.calls if '[推荐歌] 《夜航》' in text_of(c)]
        check(sent and '音乐 App 里推荐给你的歌' in text_of(sent[-1]) and '歌词节选' in text_of(sent[-1]), '他回消息时知道这首歌（规则 + 歌词节选）')
        # 他去评论区
        await ph.page.evaluate(DUE); await ph.page.evaluate(TICK); await asyncio.sleep(0.8)
        cms = await ph.page.evaluate("__xsj.D.songCmts(__xsj.D.songs()[0].id)")
        his = [c for c in cms if c['who'] == 'c0']
        check(len(his) == 2 and any(c['to'] == cms[0]['id'] and c['text'] == '他回路人' for c in his), f'他写了一条、回了路人：{[c["text"] for c in his]}')
        check('c0' in cms[0]['likes'] and 'c0' in cms[1]['likes'], '他给路人点了赞')
        ask = [c for c in ph.api.calls if '看了看下面的评论区' in text_of(c)][-1]
        check('推荐给了你' in text_of(ask) and '第一句歌词' in text_of(ask), '他看到的：谁推荐的、歌词、评论')
        # 点聊天里的卡片 → 那首歌的评论区
        await ph.top('.card.songc').click(); await asyncio.sleep(1.4)
        check(await ph.page.evaluate('__xsj.currentApp()') == 'music', '点卡片到音乐')
        check(await ph.page.locator('.sheet.mu-cms').count() == 1, '直接打开评论区')
        texts = await ph.page.locator('.mu-cms .cm-main p').all_inner_texts()
        check('他写的一条' in texts and '路人甲来了' in texts, f'评论区：{texts}')
        names = await ph.page.locator('.mu-cms .cm-main b').all_inner_texts()
        check('阿一' not in ''.join(names), f'都是匿名：{names}')
        # 喜欢 / 不喜欢
        first = ph.page.locator('.mu-cms .mu-cm').first
        await first.locator('button[aria-label="喜欢"]').click(); await asyncio.sleep(0.3)
        c0 = (await ph.page.evaluate("__xsj.D.songCmts(__xsj.D.songs()[0].id)"))[0]
        check('me' in c0['likes'], '点喜欢')
        await ph.page.locator('.mu-cms .mu-cm').first.locator('button[aria-label="不喜欢"]').click(); await asyncio.sleep(0.3)
        c0 = (await ph.page.evaluate("__xsj.D.songCmts(__xsj.D.songs()[0].id)"))[0]
        check('me' not in c0['likes'] and 'me' in c0['dislikes'], '喜欢和不喜欢只能选一个')
        # 回他那条 → 他回你、点赞
        await ph.page.evaluate('Math.random = () => 0.1')
        await ph.page.locator('.mu-cms .mu-cm', has_text='他写的一条').click(); await asyncio.sleep(0.3)
        check(await ph.page.locator('.mu-cms .ch-aux').is_visible(), '点一条 = 回复它')
        await ph.page.locator('.mu-cms textarea.ch-in').fill('我也觉得')
        await ph.page.locator('.mu-cms .ch-send').click(); await asyncio.sleep(0.4)
        await ph.shot(f'music_comments_{size[0]}')
        jobs = await ph.page.evaluate('__xsj.D.songJobs()')
        check(any(j['kind'] == 'reply' and j['who'] == 'c0' for j in jobs), '你回了他：排了他回你')
        await ph.page.evaluate(DUE); await ph.page.evaluate(TICK); await asyncio.sleep(0.8)
        cms = await ph.page.evaluate("__xsj.D.songCmts(__xsj.D.songs()[0].id)")
        mine = [c for c in cms if c['who'] == 'me'][0]
        check(any(c['who'] == 'c0' and c['to'] == mine['id'] and c['text'] == '他回你' for c in cms) and 'c0' in mine['likes'], '他回你了、给你点了赞')
        reply_ask = [c for c in ph.api.calls if '刚刚回复了你' in text_of(c)][-1]
        check('他写的一条' in text_of(reply_ask) and '我也觉得' in text_of(reply_ask), '他知道你回的是哪条')
        await ph.shot(f'music_comments2_{size[0]}')
        # 聊天里用《歌名》提到：阿二也知道了
        await ph.page.evaluate("__xsj.D.setMsgs('c1', [{ id: 'm1', role: 'me', ts: Date.now(), alts: [[{ t: 'text', text: '你听过《夜航》吗' }]], cur: 0 }])")
        await ph.page.evaluate(TICK); await asyncio.sleep(0.5)
        know = await ph.page.evaluate("__xsj.D.songs()[0].know")
        check('c1' in know, '聊天里《歌名》：他知道了')
        jobs = await ph.page.evaluate('__xsj.D.songJobs()')
        check(any(j['kind'] == 'char' and j['who'] == 'c1' for j in jobs), '过一会儿他也会去评论区')
        # 匿名名字固定（重新打开还是同一个）
        n1 = await ph.page.evaluate("import('./js/core/music.js').then(m => m.anonOf('c0').name)")
        await ph.flush(); await ph.load(); await ph.unlock(); await asyncio.sleep(0.5)
        n2 = await ph.page.evaluate("import('./js/core/music.js').then(m => m.anonOf('c0').name)")
        check(n1 == n2, f'匿名名字固定：{n1} / {n2}')
        # 搜索
        await ph.open('music'); await asyncio.sleep(0.8)
        await ph.top('button[aria-label="搜索"]').click(); await asyncio.sleep(0.5)
        await ph.top('input.sr-in').fill('第三句'); await asyncio.sleep(0.3)
        check(await ph.top('.mu-row b').all_inner_texts() == ['夜航'], '按歌词搜到')
        await ph.shot(f'music_search_{size[0]}')
        # 长按删
        await ph.page.evaluate("document.querySelector('.win .pg:last-child .bar .bk')?.click()"); await asyncio.sleep(0.5)
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (390, 844), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split('x')))]:
    print(size); asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
