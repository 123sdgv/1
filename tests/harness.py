"""测试用的手机：起静态服务器 + 假接口 + Chrome（Playwright），解锁、开 App、长按、截图。

    from harness import Phone
    async with Phone(size=(393, 852)) as ph:     # ph.page / ph.api（FakeApi）/ ph.errors（控制台报错）
        await ph.setup()                           # 填好假接口、建一个身份
        await ph.open('tarot')
        await ph.shot('tarot1')                    # 存到 tests/shots/（不进仓库）

跑：cd tests && python3 t_tarot.py
"""
import asyncio, os, socket, subprocess, sys
from playwright.async_api import async_playwright
from fakeapi import FakeApi
from stamp import stamp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'tests', 'shots')
WEB = 8765


def ensure_web():
    s = socket.socket()
    try:
        s.connect(('127.0.0.1', WEB)); return
    except OSError:
        subprocess.Popen([sys.executable, '-m', 'http.server', str(WEB)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        import time; time.sleep(0.8)
    finally:
        s.close()


class Phone:
    def __init__(self, size=(393, 852), api_port=8766):
        self.size, self.api_port = size, api_port
        self.errors = []

    async def __aenter__(self):
        stamp()  # sw.js 的版本号跟着文件内容走
        ensure_web()
        os.makedirs(SHOTS, exist_ok=True)
        self.api = FakeApi(self.api_port).start()
        self.pw = await async_playwright().start()
        self.browser = await self.pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        self.ctx = await self.browser.new_context(viewport={'width': self.size[0], 'height': self.size[1]}, has_touch=True, device_scale_factor=2)
        await self.ctx.route('https://api.open-meteo.com/**', lambda r: r.fulfill(json={}))
        self.page = await self.ctx.new_page()
        self.page.on('console', lambda m: m.type == 'error' and self.errors.append(m.text))
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        await self.load()
        return self

    async def __aexit__(self, *a):
        await self.browser.close(); await self.pw.stop(); self.api.close()

    async def load(self):
        await self.page.goto(f'http://localhost:{WEB}/')
        await self.page.wait_for_function('window.__xsj')
        await asyncio.sleep(0.4)

    async def setup(self, chars=0):
        """填好假接口；chars = 建几个角色（名字 阿一、阿二…）"""
        await self.page.evaluate('''([base, n]) => { const { S, D } = __xsj;
            S.set('api', { base, model: 'fake-model' }); S.set('secret.apiKey', 'k');
            const names = ['阿一', '阿二', '阿三'];
            for (let i = 0; i < n; i++) if (!D.chars().some((c) => c.name === names[i])) D.saveChar({ ...D.newChar(), id: 'c' + i, name: names[i] });
        }''', [self.api.base, chars])
        await self.unlock()

    async def unlock(self):
        box = await self.page.locator('#lock').bounding_box()
        if not box or await self.page.evaluate('document.getElementById("lock").hidden'): return
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] - 10
        await self.page.mouse.move(x, y); await self.page.mouse.down()
        for i in range(10):
            await self.page.mouse.move(x, y - 30 * (i + 1)); await asyncio.sleep(0.02)
        await self.page.mouse.up(); await asyncio.sleep(0.6)

    async def open(self, app, arg=None):
        await self.page.evaluate('([a, b]) => __xsj.openApp(a, b)', [app, arg]); await asyncio.sleep(0.6)

    def top(self, sel=''):
        """页面栈最上面那页（底下的页还在 DOM 里）"""
        return self.page.locator('.win .pg').last.locator(sel) if sel else self.page.locator('.win .pg').last

    async def longpress(self, x, y, ms=0.75):
        await self.page.mouse.move(x, y); await self.page.mouse.down(); await asyncio.sleep(ms); await self.page.mouse.up()

    async def shot(self, name):
        await self.page.screenshot(path=os.path.join(SHOTS, name + '.png'))

    async def flush(self):
        await self.page.evaluate('__xsj.S.flush()')


def check(cond, msg):
    print(('  ok  ' if cond else '  FAIL ') + msg)
    if not cond: check.failed = True
check.failed = False
