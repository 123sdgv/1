"""每个 App 打开看一眼：不报错、截图。python3 t_smoke.py [宽x高]"""
import asyncio, re, os, sys
from harness import Phone, check, ROOT

APPS = re.findall(r"id: '([a-z]+)'", open(os.path.join(ROOT, 'js/phone/apps.js'), encoding='utf-8').read())

async def main(size):
    async with Phone(size=size) as ph:
        await ph.setup(chars=2)
        await ph.shot(f'smoke_home_{size[0]}')
        for a in APPS:
            await ph.open(a); await asyncio.sleep(0.5)
            await ph.shot(f'smoke_{a}_{size[0]}')
            await ph.page.evaluate("import('./js/phone/window.js').then(m => m.closeApp && m.closeApp())"); await asyncio.sleep(0.5)
        check(not ph.errors, f'{len(APPS)} 个 App 都打开了，控制台没报错 {ph.errors[:3]}')

for size in [(393, 852), (390, 844), (375, 667)] if len(sys.argv) < 2 else [tuple(map(int, sys.argv[1].split('x')))]:
    print(size); asyncio.run(main(size))
sys.exit(1 if check.failed else 0)
