"""整版缓存（sw.js）：装好以后没网也能打开；推了新版，打开时在锁屏上整版换掉"""
import asyncio, os, sys
from harness import Phone, check, ROOT
from stamp import stamp

CSS = os.path.join(ROOT, 'css', 'base.css')

async def ver_of(ph):
    return await ph.page.evaluate("caches.keys().then(ks => ks.filter(k => k.startsWith('xsj-')))")

async def main():
    orig = open(CSS, encoding='utf-8').read()
    try:
        async with Phone() as ph:
            v0, _ = stamp()
            for _ in range(30):
                if await ph.page.evaluate('!!navigator.serviceWorker.controller'): break
                await asyncio.sleep(0.2)
            check(await ph.page.evaluate('!!navigator.serviceWorker.controller'), '装好了、管着这一页')
            check(await ver_of(ph) == ['xsj-' + v0], f'缓存是这一版：{await ver_of(ph)}')
            # 没网也能打开
            await ph.ctx.set_offline(True)
            await ph.page.reload(); await ph.page.wait_for_function('window.__xsj', timeout=8000)
            check(True, '没网也打开了')
            await ph.ctx.set_offline(False)
            # 推了新版：打开时在锁屏上换掉
            open(CSS, 'a', encoding='utf-8').write('\n/* test-new-version */\n')
            v1, _ = stamp()
            check(v1 != v0, '文件变了版本号跟着变')
            await ph.page.reload(); await ph.page.wait_for_function('window.__xsj')
            ok = False
            for _ in range(50):
                try:
                    vs = await ver_of(ph)
                    css = await ph.page.evaluate("fetch('css/base.css').then(r => r.text())")
                    if vs == ['xsj-' + v1] and 'test-new-version' in css: ok = True; break
                except Exception:
                    pass
                await asyncio.sleep(0.2)
            check(ok, f'换成了新版（只剩新的缓存）：{await ver_of(ph)}')
            await ph.page.wait_for_function('window.__xsj')
            check(await ph.page.evaluate("document.body.classList.contains('locked')"), '换完还在锁屏上')
            # 开着 App 的时候不换（等下次打开）
            await ph.unlock(); await ph.open('memo'); await asyncio.sleep(16)
            open(CSS, 'w', encoding='utf-8').write(orig)
            v2, _ = stamp()
            await ph.page.evaluate("navigator.serviceWorker.getRegistration().then(r => r.update())"); await asyncio.sleep(2.5)
            check(await ph.page.evaluate("document.body.classList.contains('in-app')") or await ph.page.evaluate("!!__xsj.currentApp()"), '开着 App 没被打断')
            waiting = await ph.page.evaluate("navigator.serviceWorker.getRegistration().then(r => !!r.waiting)")
            check(waiting, '新版下好了在等')
            bad = [e for e in ph.errors if 'ERR_INTERNET_DISCONNECTED' not in e]
            check(not bad, f'控制台没报错 {bad[:3]}')
    finally:
        open(CSS, 'w', encoding='utf-8').write(orig)
        stamp()

asyncio.run(main())
sys.exit(1 if check.failed else 0)
