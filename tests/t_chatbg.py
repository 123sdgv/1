"""聊天背景：角色资料里 ⭕ 改的时候选图、裁剪、大小·模糊·淡，存了以后聊天页铺上"""
import asyncio, os, sys
from PIL import Image, ImageDraw
from harness import Phone, check, SHOTS

async def main(size):
    img = os.path.join(SHOTS, 'test_bg.jpg')
    im = Image.new('RGB', (800, 1600), (60, 90, 140)); d = ImageDraw.Draw(im)
    for i in range(0, 1600, 80): d.rectangle([0, i, 800, i + 40], fill=(200, 160, 90))
    im.save(img)
    async with Phone(size=size) as ph:
        await ph.setup(chars=1)
        await ph.page.evaluate("() => { const { D } = __xsj; D.addMsg('c0', { role: 'them', alts: [[{ t: 'text', text: '在吗' }]] }); D.addMsg('c0', { role: 'me', alts: [[{ t: 'text', text: '在的' }]] }); }")
        await ph.open('social', {'chat': 'c0'})
        await ph.top('button[aria-label="资料"]').click(); await asyncio.sleep(0.6)
        check(await ph.top('.cb-pre').count() == 0, '只能看、没设过：没有聊天背景这一组')
        await ph.top('button.mode').click(); await asyncio.sleep(0.4)
        async with ph.page.expect_file_chooser() as fc:
            await ph.top('.cb-pre').click()
        await (await fc.value).set_files(img); await asyncio.sleep(1)
        await ph.shot(f'chatbg_crop_{size[0]}')
        await ph.page.locator('.cr-head button.main').click(); await asyncio.sleep(0.6)
        check(await ph.top('.cb-pre.on').count() == 1 and await ph.top('.slide-row').count() >= 6, '选好了：预览 + 大小·模糊·淡')
        # 调滑条：淡 60%
        sl = ph.top('.slide-row', ).filter(has_text='淡').locator('input')
        await sl.evaluate("(r) => { r.value = 60; r.dispatchEvent(new Event('input')); }")
        await ph.shot(f'chatbg_prof_{size[0]}')
        await ph.top('button.mode').click(); await asyncio.sleep(0.4)
        await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(0.5)
        c = await ph.page.evaluate("__xsj.D.charById('c0')")
        has = await ph.page.evaluate("!!__xsj.D.file('chatbg.c0')")
        check(has and abs(c['bg']['veil'] - 0.6) < 1e-6, f'存了：图 + 淡 {c["bg"]}')
        await ph.page.evaluate("document.querySelector('.win .pg:last-child .bar .bk')?.click()"); await asyncio.sleep(0.7)
        cls = await ph.top().get_attribute('class')
        check('has-bg' in cls, '聊天页铺上了背景')
        await ph.shot(f'chatbg_chat_{size[0]}')
        # 去掉
        await ph.top('button[aria-label="资料"]').click(); await asyncio.sleep(0.6)
        await ph.top('button.mode').click(); await asyncio.sleep(0.3)
        await ph.top('button[aria-label="去掉聊天背景"]').click(); await asyncio.sleep(0.2)
        await ph.top('button.mode').click(); await asyncio.sleep(0.3)
        await ph.page.locator('.dlg-btns button.main').click(); await asyncio.sleep(0.4)
        check(not await ph.page.evaluate("!!__xsj.D.file('chatbg.c0')"), '去掉了')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split('x')))]:
    print(size); asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
