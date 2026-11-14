"""存档量一下速度：摆一个很大的存档（4 个角色各 6000 条聊天、3 本书各 60 章、日记、壁纸、表情包），
看启动要多久、他每冒一个气泡写一次盘要多久。python3 bench_store.py"""
import asyncio, json, sys
from harness import Phone

BIG = r'''async () => { const { S, D } = __xsj;
  const acc = D.curAccount().id, t0 = Date.now() - 86400000 * 200;
  // 随机的字（真存档压缩不了那么多）
  const rc = (n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(0x4e00 + Math.floor(Math.random() * 6000)); return s; };
  const pool = Array.from({ length: 4000 }, () => rc(34));
  let pi = 0; const L = () => pool[(pi++) % pool.length];
  const line = rc(34);
  for (let c = 0; c < 4; c++) {
    D.saveChar({ ...D.newChar(), id: 'c' + c, name: '角色' + c });
    const msgs = [];
    for (let i = 0; i < 6000; i++) msgs.push({ id: 'm' + c + '_' + i, role: i % 2 ? 'them' : 'me', ts: t0 + i * 60000, alts: [[{ t: 'text', text: L() }, { t: 'text', text: L().slice(0, 20) }]], cur: 0 });
    S.set('msgs.c' + c, msgs);
    const ds = [];
    for (let i = 0; i < 300; i++) ds.push({ id: 'd' + i, date: '2026-01-01', text: L() + L() + L() + L() + L() + L() + L() + L() + L() + L(), inner: L() + L() + L(), keys: ['咖啡', '猫'], ts: t0 + i * 86400000, upto: t0 });
    S.set('diary.c' + c, ds);
    S.set('memo.c' + c, Array.from({ length: 120 }, (_, i) => ({ id: 'x' + i, text: line, ts: t0 })));
  }
  
  const books = [];
  for (let b = 0; b < 3; b++) {
    books.push({ id: 'b' + b, acc, title: '书' + b, reach: 1, createdAt: t0, lastTs: t0 });
    S.set('bookch.b' + b, Array.from({ length: 60 }, (_, ci) => ({ id: 'ch' + ci, title: '第' + ci + '章', ts: t0, paras: Array.from({ length: 40 }, (_, k) => ({ id: 'p' + k, text: L() + L() + L() + L() })) })));
  }
  S.set('books', books);
  const img = 'data:image/jpeg;base64,' + btoa(Array.from({ length: 300000 }, () => String.fromCharCode(Math.random() * 256 | 0)).join(''));
  S.set('file.wallLock', img); S.set('file.wallHome', img);
  S.set('stickers', Array.from({ length: 60 }, (_, i) => ({ id: 's' + i, name: '表情' + i, src: 'data:image/png;base64,' + btoa(Array.from({ length: 22000 }, () => String.fromCharCode(Math.random() * 256 | 0)).join('')) })));
  await S.flush();
  return JSON.stringify(Object.fromEntries(Object.entries({ msgs: S.get('msgs.c0'), book: S.get('bookch.b0') }).map(([k, v]) => [k, JSON.stringify(v).length])));
}'''

MEASURE = r'''async () => {
  // 整张表读一遍（= 启动时 S.boot 做的）
  const db = await new Promise((res) => { const r = indexedDB.open('xsj', 1); r.onsuccess = () => res(r.result); });
  let t = performance.now();
  await new Promise((res) => { const c = db.transaction('kv').objectStore('kv').openCursor(); c.onsuccess = () => { if (c.result) c.result.continue(); else res(); }; });
  const readAll = performance.now() - t;
  // 冒一个气泡：整份 msgs 写一遍
  const { S } = __xsj, w = [];
  for (let i = 0; i < 5; i++) { S.get('msgs.c0').push({ id: 'n' + i, role: 'them', ts: Date.now(), alts: [[{ t: 'text', text: '好' }]], cur: 0 }); S.touch('msgs.c0'); t = performance.now(); await S.flush(); w.push(performance.now() - t); }
  // 读书：存一章（整本书的章节写一遍）
  S.touch('bookch.b0'); t = performance.now(); await S.flush(); const bookW = performance.now() - t;
  return { readAll: Math.round(readAll), msgWrite: w.map(Math.round), bookWrite: Math.round(bookW), est: await navigator.storage.estimate().then((e) => Math.round(e.usage / 1e6) + 'MB') };
}'''

async def main():
    async with Phone() as ph:
        await ph.setup()
        print('大小（字符）', await ph.page.evaluate(BIG))
        for i in range(2):
            await ph.page.evaluate('performance.mark("x")')
            t = await ph.page.evaluate('performance.now()')
            await ph.page.reload(); await ph.page.wait_for_function('window.__xsj')
            boot = await ph.page.evaluate('performance.now()')
            print('重新打开到能用', round(boot), 'ms')
        print(await ph.page.evaluate(MEASURE))
        # 手机慢 4 倍
        cdp = await ph.ctx.new_cdp_session(ph.page)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        await ph.page.reload(); await ph.page.wait_for_function('window.__xsj', timeout=60000)
        print('CPU 慢 4 倍：重新打开到能用', round(await ph.page.evaluate('performance.now()')), 'ms')
        print('CPU 慢 4 倍：', await ph.page.evaluate(MEASURE))

asyncio.run(main())
