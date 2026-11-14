"""相册 + 聊天发真图片：发图时写一句（他只读这句），相册 ☰ 角色名单看你们俩的照片，相册里删不影响聊天，两边都不用了图才删"""
import asyncio, os, sys
from PIL import Image
from harness import Phone, check, SHOTS

async def main(size):
    img = os.path.join(SHOTS, 'test_photo.jpg')
    Image.new('RGB', (900, 1200), (190, 120, 90)).save(img)
    async with Phone(size=size) as ph:
        await ph.setup(chars=2)
        ph.api.script = lambda b: [('content', '好看'), ('finish', 'stop')]
        await ph.open('social', {'chat': 'c0'})
        async def send_img(desc):
            await ph.top('.ch-plus').click(); await asyncio.sleep(0.5)
            await ph.page.locator('.ch-tile[aria-label="相册"]').click(); await asyncio.sleep(0.5)
            async with ph.page.expect_file_chooser() as fc:
                await ph.page.locator('.ph-add').click()
            await (await fc.value).set_files(img); await asyncio.sleep(1)
            await ph.page.locator('.img-send textarea').fill(desc)
            await ph.page.locator('.img-send .btn').click(); await asyncio.sleep(0.4)
        await send_img('窗外的晚霞')
        await asyncio.sleep(3.5)
        await ph.shot(f'album_chat_{size[0]}')
        parts = await ph.page.evaluate("__xsj.D.msgs('c0').flatMap(r => __xsj.D.partsOf(r))")
        im = [p for p in parts if p['t'] == 'img']
        check(len(im) == 1 and im[0]['desc'] == '窗外的晚霞' and im[0]['w'] == 900, f'聊天里发了真图片：{[(p["t"], p.get("desc")) for p in parts]}')
        check(await ph.top('.bub-img img').count() == 1, '气泡里是图')
        user = [m for m in ph.api.calls[-1]['messages'] if m['role'] == 'user'][-1]['content']
        check('[图片] 窗外的晚霞' in user, '他读到的是那句')
        await send_img('')
        await asyncio.sleep(3.5)
        users = '\n'.join(m['content'] for m in ph.api.calls[-1]['messages'] if m['role'] == 'user')
        check('没说拍的是什么' in users, '没写的话他只知道发了张图')
        ph_ = await ph.page.evaluate('__xsj.D.photos()')
        check(len(ph_) == 2 and all(p.get('file') and p.get('char') == 'c0' for p in ph_), f'都进了相册、记着是跟谁的（{len(ph_)}）')
        # 从相册挑一张发：不再存一遍
        await ph.top('.ch-plus').click(); await asyncio.sleep(0.5)
        await ph.page.locator('.ch-tile[aria-label="相册"]').click(); await asyncio.sleep(0.5)
        await ph.page.locator('.sheet .ph-grid .ph.img').first.click(); await asyncio.sleep(3.5)
        check(len(await ph.page.evaluate('__xsj.D.photos()')) == 2, '从相册挑的不重复存')

        # 相册：☰ → 阿一
        await ph.page.evaluate('() => { __xsj.D.addPhoto({ desc: "自己拍的天空", who: "me" }); }')
        await ph.open('album')
        check(await ph.top('.ph-grid .ph').count() == 3, '相册里三张（两张真图 + 一张文字）')
        await ph.shot(f'album_all_{size[0]}')
        await ph.top('button[aria-label="角色"]').click(); await asyncio.sleep(0.5)
        names = await ph.page.locator('.sheet .pick-it > div > b').all_inner_texts()
        check(names == ['阿一', '阿二'], f'☰ 是角色名单：{names}')
        await ph.shot(f'album_people_{size[0]}')
        await ph.page.locator('.sheet .pick-it').first.click(); await asyncio.sleep(0.6)
        check(await ph.top('.ph-grid .ph').count() == 2, '阿一那页：你们俩之间的两张')
        await ph.top('.ph-grid .ph').first.click(); await asyncio.sleep(0.5)
        await ph.shot(f'album_view_{size[0]}')
        await ph.page.mouse.click(10, 10); await asyncio.sleep(0.5)
        # 相册里删一张：聊天里还在、图还在
        n_img = lambda: ph.page.evaluate("__xsj.S.keys('file.img.').length")
        box = await ph.top('.ph-grid .ph').first.bounding_box()
        await ph.longpress(box['x'] + 30, box['y'] + 30)
        await ph.page.locator('.menu button', has_text='删除').click(); await asyncio.sleep(0.3)
        await ph.page.locator('.dlg-btns button.danger').click(); await asyncio.sleep(2)
        check(len(await ph.page.evaluate('__xsj.D.photos()')) == 2 and await n_img() == 2, '相册删一张：文件还在（聊天在用）')
        # 聊天里全删：两边都不用了的图删掉
        await ph.page.evaluate("import('./js/core/chat.js').then(m => m.clearChat('c0'))"); await asyncio.sleep(2)
        check(await n_img() == 1, f'聊天也删了 → 那张图删掉，相册还在用的留着（{await n_img()}）')
        check(not ph.errors, f'控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (390, 844), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split('x')))]:
    print(size); asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
