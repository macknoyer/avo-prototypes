/* Runtime прототипа. Источник — .claude/skills/figma-prototype/kit/. В папке прототипа лежит копия, её не правим.
   Разметка:
     <section class="screen" id="s-<id>" data-title="…" data-theme-color="#f1f2f5">…</section>
     data-go="<id>"        — push на экран            data-back           — назад
     data-reset="<id>"     — на экран, стек сброшен   data-sheet="<id>"   — открыть #sheet-<id>
     data-close            — закрыть шторку           data-act="<name>"   — Proto.on(name, fn)
   Состояния для карты экранов и сверки: Proto.states([{id, title, group, node, apply}])
   Режимы: телефон / компьютер (рамка + QR) / ?mode=figma (кадр Figma для сверки) */
(function () {
  const html = document.documentElement;
  const qs = new URLSearchParams(location.search);
  const KIT = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
  const phone = matchMedia('(max-width: 600px)').matches ||
    (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
  const mode = qs.get('mode') || (phone ? 'phone' : 'desk');
  html.classList.add('m-' + mode);

  const P = window.Proto = {
    mode, stack: [], handlers: {}, _states: [], sheet: null,
    $: (s, r) => (r || document).querySelector(s),
    $$: (s, r) => Array.from((r || document).querySelectorAll(s)),
    fmt(n) { return String(n).replace(/\D/g, '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' '); },
    num(s) { return Number(String(s || '').replace(/\D/g, '')) || 0; },
    on(name, fn) { P.handlers[name] = fn; return P; },
  };

  /* ---------- статус-бар ---------- */
  const BARS = [
    ['bar-empty', '75.47% 0.05% 0.06% 83.23%'], ['bar4', '0 0 0.06% 83.25%'],
    ['bar-empty', '75.47% 27.78% 0.06% 55.5%'], ['bar3', '22.74% 27.76% 0.06% 55.52%'],
    ['bar-empty', '75.47% 55.51% 0.06% 27.77%'], ['bar2', '43.58% 55.52% 0.06% 27.76%'],
    ['bar-empty', '75.47% 83.28% 0.06% 0'], ['bar1', '61.6% 83.28% 0.06% 0']];
  function fillStatusBar(el) {
    const t = el.classList.contains('on-dark') ? 'light' : 'dark';
    const src = n => `${KIT}statusbar/${t}-${n}.svg`;
    el.innerHTML =
      `<div class="sb-left"><span class="sb-time">9:41</span></div>` +
      `<div class="sb-right"><div class="sb-icons">` +
      `<div class="sb-cell"><div class="bars">${BARS.map(([n, i]) => `<i style="inset:${i}"><img src="${src(n)}" alt=""></i>`).join('')}</div></div>` +
      `<div class="sb-wifi"><img src="${src('wifi')}" alt=""></div>` +
      `<div class="sb-batt"><img src="${src('battery')}" alt=""></div></div></div>`;
  }

  /* ---------- навигация ---------- */
  const screenEl = id => document.getElementById('s-' + id);
  function setThemeColor(el) {
    let m = P.$('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = el.dataset.themeColor || '#f1f2f5';
  }
  function show(id, anim) {
    const next = screenEl(id); if (!next) return console.warn('нет экрана', id);
    const prev = P.$('.screen.is-active');
    if (prev === next) return;
    P.$$('.screen').forEach(s => s.classList.remove('is-leaving', 'anim-push-in', 'anim-push-out', 'anim-pop-in', 'anim-pop-out', 'anim-fade-in'));
    if (prev) { prev.classList.remove('is-active'); if (anim && mode !== 'figma') prev.classList.add('is-leaving', anim === 'push' ? 'anim-push-out' : anim === 'pop' ? 'anim-pop-out' : 'is-leaving'); }
    next.classList.add('is-active');
    if (anim && mode !== 'figma') next.classList.add(anim === 'push' ? 'anim-push-in' : anim === 'pop' ? 'anim-pop-in' : 'anim-fade-in');
    const sc = next.querySelector('.scroll'); if (sc && anim !== 'pop') sc.scrollTop = 0;
    setThemeColor(next);
    clearTimeout(show._t); show._t = setTimeout(() => P.$$('.screen.is-leaving').forEach(s => s.classList.remove('is-leaving')), 380);
    next.dispatchEvent(new CustomEvent('proto:enter', { bubbles: true }));
    P.current = id;
  }
  P.go = (id, anim = 'push') => { P.closeSheet(true); P.stack.push(id); show(id, anim); history.pushState({ d: P.stack.length }, '', '#' + id); };
  P.replace = (id, anim = 'fade') => { P.closeSheet(true); P.stack[P.stack.length - 1] = id; show(id, anim); history.replaceState({ d: P.stack.length }, '', '#' + id); };
  P.reset = (id, anim = 'pop') => { P.closeSheet(true); P.stack = [id]; show(id, anim); history.replaceState({ d: 1 }, '', '#' + id); };
  P.back = (fromPop) => {
    if (P.sheet) return P.closeSheet();
    if (P.stack.length < 2) return flashHotspots();
    P.stack.pop(); show(P.stack[P.stack.length - 1], 'pop');
    if (!fromPop) history.back();
  };
  addEventListener('popstate', e => {
    const d = (e.state && e.state.d) || 1;
    if (d < P.stack.length) { if (P.sheet) P.closeSheet(); P.stack.pop(); show(P.stack[P.stack.length - 1] || P.stack[0], 'pop'); }
  });

  /* ---------- шторка ---------- */
  P.openSheet = id => {
    const layer = document.getElementById('sheet-' + id); if (!layer) return;
    P.sheet = layer; layer.classList.add('is-open');
  };
  P.closeSheet = (instant) => {
    const layer = P.sheet; if (!layer) return;
    P.sheet = null;
    const sheet = layer.querySelector('.sheet');
    if (instant) { sheet.style.transition = 'none'; layer.classList.remove('is-open'); sheet.offsetHeight; sheet.style.transition = ''; }
    else layer.classList.remove('is-open');
    sheet.style.transform = '';
  };
  function wireSheetDrag(layer) {
    const sheet = layer.querySelector('.sheet'); let y0 = null, dy = 0;
    sheet.addEventListener('touchstart', e => { if (sheet.scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; sheet.classList.add('is-dragging'); }, { passive: true });
    sheet.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sheet.addEventListener('touchend', () => {
      if (y0 === null) return; y0 = null; sheet.classList.remove('is-dragging');
      if (dy > 90) P.closeSheet(); else sheet.style.transform = '';
    });
  }

  /* ---------- пуш ---------- */
  P.notify = (id, { delay = 900, hide = 5000 } = {}) => {
    const el = document.getElementById('push-' + id); if (!el) return;
    clearTimeout(el._t1); clearTimeout(el._t2);
    el._t1 = setTimeout(() => el.classList.add('is-shown'), delay);
    if (hide) el._t2 = setTimeout(() => el.classList.remove('is-shown'), delay + hide);
  };
  P.hideNotifications = () => P.$$('.push').forEach(el => { clearTimeout(el._t1); clearTimeout(el._t2); el.classList.remove('is-shown'); });

  /* ---------- клики и хотспоты ---------- */
  let flashT;
  function flashHotspots() {
    if (mode === 'figma') return;
    const d = P.$('.device'); d.classList.add('show-hotspots');
    clearTimeout(flashT); flashT = setTimeout(() => d.classList.remove('show-hotspots'), 650);
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-back],[data-reset],[data-sheet],[data-close],[data-act],.push,input,textarea,label,.proto-fab,.proto-map,.no-hint');
    if (!t) { if (e.target.closest('.device')) flashHotspots(); return; }
    if (t.classList.contains('push')) { t.classList.remove('is-shown'); return; }
    if (t.dataset.go) return P.go(t.dataset.go, t.dataset.anim || 'push');
    if (t.dataset.reset) return P.reset(t.dataset.reset);
    if ('back' in t.dataset) return P.back();
    if (t.dataset.sheet) return P.openSheet(t.dataset.sheet);
    if ('close' in t.dataset) return P.closeSheet();
    if (t.dataset.act) { const fn = P.handlers[t.dataset.act]; if (fn) fn(t, e); else flashHotspots(); }
  });

  /* ---------- состояния: карта экранов и сверка с Figma ---------- */
  P.states = list => { P._states = list; return P; };
  P.applyState = id => {
    const s = P._states.find(x => x.id === id); if (!s) return false;
    P.closeSheet(true); P.hideNotifications();
    s.apply(P);
    if (s.height) html.style.setProperty('--frame-h', s.height + 'px'); else html.style.removeProperty('--frame-h');
    history.replaceState({ d: P.stack.length }, '', '#@' + id);
    return true;
  };
  function buildMap() {
    const fab = document.createElement('button'); fab.className = 'proto-fab'; fab.textContent = '☰'; fab.title = 'Карта экранов';
    const map = document.createElement('div'); map.className = 'proto-map';
    const groups = [];
    P._states.forEach(s => { const g = s.group || 'Экраны'; if (!groups.includes(g)) groups.push(g); });
    map.innerHTML = `<div class="panel"><h3>Карта экранов</h3><div class="hint">Тап мимо кнопок подсвечивает, куда можно нажать. Ссылка на состояние копируется долгим тапом.</div>` +
      groups.map(g => `<div class="group">${g}</div>` + P._states.filter(s => (s.group || 'Экраны') === g)
        .map(s => `<button class="item" data-state="${s.id}"><span>${s.title}</span><small>${s.figma || ''}</small></button>`).join('')).join('') +
      `<div class="row"><button data-map="restart">Сначала</button><button data-map="hide">Скрыть кнопку</button></div></div>`;
    const dev = P.$('.device'); dev.appendChild(fab); dev.appendChild(map);
    fab.addEventListener('click', () => { P.$$('.item', map).forEach(b => b.classList.toggle('is-current', location.hash === '#@' + b.dataset.state)); map.classList.add('is-open'); });
    map.addEventListener('click', e => {
      const it = e.target.closest('[data-state]'), btn = e.target.closest('[data-map]');
      if (it) { P.applyState(it.dataset.state); map.classList.remove('is-open'); }
      else if (btn && btn.dataset.map === 'restart') { P._states[0] && P.applyState(P._states[0].id); map.classList.remove('is-open'); }
      else if (btn && btn.dataset.map === 'hide') { fab.remove(); map.classList.remove('is-open'); }
      else if (e.target === map) map.classList.remove('is-open');
    });
    let lp; map.addEventListener('touchstart', e => { const it = e.target.closest('[data-state]'); if (!it) return;
      lp = setTimeout(() => { const u = location.href.split('#')[0] + '#@' + it.dataset.state; navigator.clipboard && navigator.clipboard.writeText(u); it.querySelector('small').textContent = 'ссылка скопирована'; }, 600); }, { passive: true });
    map.addEventListener('touchend', () => clearTimeout(lp));
  }

  /* ---------- десктоп: подпись и QR ---------- */
  function buildDeskAside() {
    if (mode !== 'desk') return;
    const url = location.href.split('#')[0].replace(/[?&]mode=[^&]*/, '');
    const aside = document.createElement('aside'); aside.className = 'desk-aside';
    const desc = (P.$('meta[name="description"]') || {}).content || '';
    aside.innerHTML = `<h1>${document.title}</h1><p>${desc}</p><div class="qr" id="proto-qr"></div><p style="margin-top:12px">Наведите камеру телефона, чтобы открыть прототип на весь экран.<br><a href="${url}">${url}</a></p>`;
    document.body.appendChild(aside);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';
    s.onload = () => { try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); P.$('#proto-qr').innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch (e) { } };
    document.head.appendChild(s);
  }

  /* ---------- старт ---------- */
  P.start = (first) => {
    P.$$('.statusbar').forEach(fillStatusBar);
    P.$$('.sheet-layer').forEach(wireSheetDrag);
    P.$$('.sheet-layer .sheet-scrim').forEach(s => s.addEventListener('click', () => P.closeSheet()));
    buildMap(); buildDeskAside();
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('@') && P.applyState(h.slice(1))) return;
    const id = h && screenEl(h) ? h : first;
    P.stack = [id]; show(id); history.replaceState({ d: 1 }, '', '#' + id);
  };
})();
