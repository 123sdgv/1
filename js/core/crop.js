// 选图 + 裁剪：头像（方的，预览成圆）、壁纸（手机屏幕的比例，可以调模糊）、动态封面。
// 拖动挪位置，双指（或滚轮、下面的滑条）缩放。返回 { src: 裁好的 dataURL, blur }，取消返回 null。
import { h, toast } from './ui.js';

/** 弹出系统选图，选好进裁剪。aspect = 宽/高；width = 输出宽度；blur = 带模糊滑条（初始值） */
export function pickCrop({ aspect = 1, width = 480, round = false, blur = null, title = '裁剪', quality = 0.88 } = {}) {
  return new Promise((res) => {
    const inp = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    document.body.append(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return res(null);
      const url = URL.createObjectURL(f);
      try {
        const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
        res(await cropper(img, { aspect, width, round, blur, title, quality }));
      } catch { toast('这张图读不出来'); res(null); }
      finally { URL.revokeObjectURL(url); }
    });
    inp.click();
  });
}

function cropper(img, { aspect, width, round, blur, title, quality }) {
  return new Promise((res) => {
    const IW = img.naturalWidth, IH = img.naturalHeight;
    const pic = h('img', { class: 'cr-img', src: img.src, alt: '', draggable: 'false' });
    const frame = h('div', { class: 'cr-frame' + (round ? ' round' : '') });
    const stage = h('div', { class: 'cr-stage' }, pic, frame);
    const zoom = h('input', { type: 'range', min: 0, max: 100, value: 0, class: 'cr-range', 'aria-label': '缩放' });
    const blurIn = blur != null ? h('input', { type: 'range', min: 0, max: 30, value: blur, class: 'cr-range', 'aria-label': '模糊' }) : null;
    const blurVal = h('em', { text: blur ? String(blur) : '0' });
    const done = (v) => { wrap.classList.remove('on'); setTimeout(() => wrap.remove(), 250); res(v); };
    const wrap = h('div', { class: 'crop' },
      h('header', { class: 'cr-head' },
        h('button', { text: '取消', onclick: () => done(null) }),
        h('b', { text: title }),
        h('button', { class: 'main', text: '完成', onclick: () => done(output()) })),
      stage,
      h('div', { class: 'cr-foot' },
        h('label', {}, h('span', { text: '缩放' }), zoom),
        blurIn ? h('label', {}, h('span', { text: '模糊' }), blurIn, blurVal) : null,
        h('small', { text: '拖动挪位置，两根手指缩放' })));
    document.getElementById('sheets').append(wrap);
    requestAnimationFrame(() => wrap.classList.add('on'));

    // 框的位置（在 stage 里），图的缩放 s 和左上角 (tx, ty)
    let FW = 0, FH = 0, fx = 0, fy = 0, s = 1, smin = 1, tx = 0, ty = 0, DW = 1, ready = false;
    const SMAX = () => smin * 6;
    function layoutFrame() {
      const r = stage.getBoundingClientRect();
      const pad = 22;
      FW = Math.min(r.width - pad * 2, (r.height - pad * 2) * aspect);
      FH = FW / aspect;
      fx = (r.width - FW) / 2; fy = (r.height - FH) / 2;
      Object.assign(frame.style, { left: fx + 'px', top: fy + 'px', width: FW + 'px', height: FH + 'px' });
      smin = Math.max(FW / IW, FH / IH);
      if (!ready || s < smin) { ready = true; s = smin; tx = fx + (FW - IW * s) / 2; ty = fy + (FH - IH * s) / 2; }
      DW = document.getElementById('device').clientWidth || 390;
      clamp(); paint();
    }
    function clamp() {
      s = Math.max(smin, Math.min(SMAX(), s));
      tx = Math.min(fx, Math.max(fx + FW - IW * s, tx));
      ty = Math.min(fy, Math.max(fy + FH - IH * s, ty));
    }
    function paint() {
      pic.style.width = IW + 'px';
      pic.style.height = IH + 'px';
      pic.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      // 预览模糊：壁纸上的 N px 换算到框里
      if (blurIn) pic.style.filter = `blur(${(+blurIn.value * FW) / DW / s}px)`;
      zoom.value = String(Math.round((Math.log(s / smin) / Math.log(6)) * 100));
    }
    // 以 (cx, cy) 为中心缩放到 ns
    function zoomAt(ns, cx, cy) {
      ns = Math.max(smin, Math.min(SMAX(), ns));
      tx = cx - ((cx - tx) * ns) / s;
      ty = cy - ((cy - ty) * ns) / s;
      s = ns;
      clamp(); paint();
    }

    const pts = new Map();
    let last = null; // { x, y, d }
    const local = (e) => { const r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const snap = () => {
      const ps = [...pts.values()];
      if (ps.length >= 2) return { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2, d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) };
      return ps[0] ? { ...ps[0], d: 0 } : null;
    };
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, local(e)); last = snap(); });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, local(e));
      const now = snap();
      if (!now || !last) return;
      if (now.d && last.d) zoomAt((s * now.d) / last.d, now.x, now.y);
      tx += now.x - last.x; ty += now.y - last.y;
      clamp(); paint();
      last = now;
    });
    const up = (e) => { pts.delete(e.pointerId); last = snap(); };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(s * Math.exp(-e.deltaY / 400), p.x, p.y); }, { passive: false });
    zoom.addEventListener('input', () => zoomAt(smin * Math.pow(6, +zoom.value / 100), fx + FW / 2, fy + FH / 2));
    blurIn?.addEventListener('input', () => { blurVal.textContent = blurIn.value; paint(); });

    function output() {
      const sx = (fx - tx) / s, sy = (fy - ty) / s, sw = FW / s, sh = FH / s;
      const OW = Math.round(Math.max(160, Math.min(width, sw))), OH = Math.round(OW / aspect);
      const cv = h('canvas', { width: OW, height: OH });
      const g = cv.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, OW, OH);
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, sx, sy, sw, sh, 0, 0, OW, OH);
      return { src: cv.toDataURL('image/jpeg', quality), blur: blurIn ? +blurIn.value : 0 };
    }

    const ro = new ResizeObserver(layoutFrame);
    ro.observe(stage);
    const obs = new MutationObserver(() => { if (!wrap.isConnected) { ro.disconnect(); obs.disconnect(); } });
    obs.observe(document.getElementById('sheets'), { childList: true });
  });
}
