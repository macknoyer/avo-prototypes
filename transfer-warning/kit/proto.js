/* Runtime прототипа. Источник — .claude/skills/proto/kit/. В папке прототипа лежит копия, её не правим.
   Разметка:
     <section class="screen" id="s-<id>" data-title="…" data-theme-color="#f1f2f5">…</section>
     data-go="<id>"        — push на экран            data-back           — назад
     data-reset="<id>"     — на экран, стек сброшен   data-sheet="<id>"   — открыть #sheet-<id>
     data-close            — закрыть шторку           data-act="<name>"   — Proto.on(name, fn)
   Состояния для карты экранов и сверки: Proto.states([{id, title, group, node, apply}])
   Режимы: телефон / компьютер (только экран 390 px) / ?mode=figma (кадр Figma для сверки).
   ?map=1 — показать кнопку ☰ с картой состояний; ссылка на состояние: #@<id>. */
(function () {
  const html = document.documentElement;
  const qs = new URLSearchParams(location.search);
  const KIT = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
  const phone = matchMedia('(max-width: 600px)').matches ||
    (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
  const mode = qs.get('mode') || (phone ? 'phone' : 'desk');
  html.classList.add('m-' + mode);
  if (qs.get('map') === '1') html.classList.add('with-map');
  if (qs.get('still') === '1') html.classList.add('m-still');  // без анимаций: скриншоты конечного состояния

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
  // тост сверху экрана: <div class="toast" id="toast-<id>">…</div>, скрывается сам
  P.toast = (id, ms = 2000) => {
    const el = document.getElementById('toast-' + id); if (!el) return;
    clearTimeout(el._t); el.classList.remove('is-shown'); void el.offsetWidth; el.classList.add('is-shown');
    el._t = setTimeout(() => el.classList.remove('is-shown'), ms);
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

  /* ---------- клавиатура ---------- */
  const KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ']];
  // Поле ввода — к верху видимой области: снизу клавиатура и кнопка, поле не должно за ними прятаться.
  // Запас снизу (.kb-spacer внутри контента) нужен, чтобы короткий экран тоже можно было прокрутить до поля.
  function scrollToField(input, smooth) {
    const sc = input.closest('.scroll'); if (!sc) return;
    let sp = sc.querySelector(':scope > .kb-spacer');
    if (!sp) { sp = document.createElement('div'); sp.className = 'kb-spacer'; sc.appendChild(sp); }
    sp.style.height = P.$('.device').clientHeight + 'px';
    const anchor = input.closest('[data-scroll-anchor], .input') || input;
    const top = sc.scrollTop + anchor.getBoundingClientRect().top - sc.getBoundingClientRect().top - 16;
    sc.scrollTo({ top: Math.max(0, top), behavior: smooth && animOn() ? 'smooth' : 'auto' });
  }
  function releaseScroll(sc) {
    const sp = sc && sc.querySelector(':scope > .kb-spacer'); if (!sp) return;
    const max = sc.scrollHeight - sp.offsetHeight - sc.clientHeight;
    if (sc.scrollTop > max) sc.scrollTo({ top: Math.max(0, max), behavior: animOn() ? 'smooth' : 'auto' });
    setTimeout(() => sp.remove(), animOn() ? 360 : 0);
  }
  P.keyboard = {
    show(input) {
      const d = P.$('.device'); clearTimeout(d._kbT); d.classList.remove('kb-closing'); d.classList.add('kb-open'); if (mode !== 'phone') d.classList.add('kb-fake');
      P.kbInput = input; const box = input.closest('.input-text, .input-uzs'); if (box) box.classList.add('is-focused');
      requestAnimationFrame(() => scrollToField(input, true));
      setTimeout(() => { if (P.kbInput === input) scrollToField(input, true); }, 380);  // после выезда клавиатуры
    },
    hide() {
      const d = P.$('.device'); d.classList.remove('kb-open');
      if (P.kbInput) releaseScroll(P.kbInput.closest('.scroll'));
      P.$$('.is-focused').forEach(b => b.classList.remove('is-focused')); P.kbInput = null;
      if (d.classList.contains('kb-fake') && P.animOn()) {
        d.classList.add('kb-closing');
        clearTimeout(d._kbT); d._kbT = setTimeout(() => d.classList.remove('kb-fake', 'kb-closing'), 300);
      } else d.classList.remove('kb-fake', 'kb-closing');
    },
  };
  function typeInto(input, key) {
    input.value = key === 'del' ? input.value.slice(0, -1) : input.value + key;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function wireKeyboard() {
    const inputs = P.$$('input[data-kb]'); if (!inputs.length) return;
    if (mode !== 'phone') {
      const kb = document.createElement('div'); kb.className = 'fake-kb';
      const row = (keys, top) => `<div class="row" style="top:${top}px">${keys}</div>`;
      const key = ([d, l]) => `<button class="key" data-key="${d}"><span class="d">${d}</span>${l ? `<span class="l">${l}</span>` : ''}</button>`;
      kb.innerHTML = `<div class="ios-numpad">` + row(KEYS.slice(0, 3).map(key).join(''), 6) + row(KEYS.slice(3, 6).map(key).join(''), 59) +
        row(KEYS.slice(6, 9).map(key).join(''), 112) +
        row(`<span class="key empty"></span><button class="key zero" data-key="0"><span class="d">0</span></button><button class="key del" data-key="del" aria-label="Стереть"><img src="${KIT}icons/kb-delete.svg" alt=""></button>`, 165) +
        `<div class="home-indicator"></div></div>`;
      P.$('.device').appendChild(kb);
      kb.addEventListener('pointerdown', e => e.preventDefault());
      kb.addEventListener('click', e => { const k = e.target.closest('[data-key]'); if (k && P.kbInput) typeInto(P.kbInput, k.dataset.key); });
    }
    inputs.forEach(inp => {
      if (mode !== 'phone') inp.setAttribute('inputmode', 'none');
      inp.addEventListener('focus', () => P.keyboard.show(inp));
      inp.addEventListener('blur', () => setTimeout(() => {
        if (document.activeElement === inp) return;
        P.keyboard.hide(); inp.dispatchEvent(new CustomEvent('proto:done', { bubbles: true }));
      }, 200));
    });
  }
  // Телефон: экран = видимая область (visualViewport), чтобы низ с кнопкой вставал над системной клавиатурой
  function fitViewport() {
    if (mode !== 'phone' || !window.visualViewport) return;
    const vv = visualViewport;
    let t;
    const fit = () => {
      html.style.setProperty('--vvh', vv.height + 'px'); html.style.setProperty('--vvt', vv.offsetTop + 'px');
      clearTimeout(t); t = setTimeout(() => { if (P.kbInput) scrollToField(P.kbInput, true); }, 120);  // системная клавиатура доехала
    };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); fit();
  }

  /* ---------- анимации: списки и значения ---------- */
  const animOn = () => mode !== 'figma' && !html.classList.contains('m-still') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  P.animOn = animOn;
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  // Список с ключами. Новые элементы раскрываются, лишние схлопываются, соседи сдвигаются плавно.
  // Внутри элемента data-swap="<значение>" — при смене значения элемент проигрывает p-swap-in (или data-swap-anim="pop").
  P.list = (box, items, keyFn, htmlFn) => {
    const anim = animOn() && box.dataset.ready === '1';
    const gap = parseFloat(getComputedStyle(box).rowGap) || 0;
    const old = new Map(P.$$(':scope > .p-item[data-key]', box).map(el => [el.dataset.key, el]));
    const keep = new Set(items.map(it => String(keyFn(it))));
    old.forEach((el, k) => {
      if (keep.has(k)) return;
      el.removeAttribute('data-key');
      if (!anim) return el.remove();
      el.style.height = el.offsetHeight + 'px'; void el.offsetHeight;
      el.classList.add('p-leave'); el.style.height = '0px'; el.style.marginBottom = -gap + 'px';
      setTimeout(() => el.remove(), 380);
    });
    let prev = null;
    items.forEach(it => {
      const k = String(keyFn(it)), html = htmlFn(it);
      let el = old.get(k);
      if (el) {
        const before = P.$$('[data-swap]', el).map(n => n.dataset.swap);
        if (el.innerHTML !== html) {
          el.innerHTML = html;
          if (anim) P.$$('[data-swap]', el).forEach((n, i) => { if (before[i] !== n.dataset.swap) restart(n, n.dataset.swapAnim === 'pop' ? 'p-pop' : 'p-swap-in'); });
        }
      } else {
        el = document.createElement('div'); el.className = 'p-item'; el.dataset.key = k; el.innerHTML = html;
        if (anim) {
          el.classList.add('p-enter'); el.style.height = '0px'; el.style.marginBottom = -gap + 'px';
          requestAnimationFrame(() => {
            el.style.transition = 'height var(--t3) var(--ease), margin var(--t3) var(--ease)';
            el.style.height = el.scrollHeight + 'px'; el.style.marginBottom = '0px';
            setTimeout(() => { el.classList.remove('p-enter'); el.style.height = el.style.marginBottom = el.style.transition = ''; }, 380);
          });
        }
      }
      box.insertBefore(el, prev ? prev.nextSibling : box.firstChild); prev = el;
    });
    box.dataset.ready = '1';
  };
  // Смена текста/разметки элемента с анимацией появления
  P.swap = (el, html, cls = 'p-swap-in') => { if (el.innerHTML === html) return; el.innerHTML = html; if (animOn()) restart(el, cls); };

  // Тап мимо поля убирает фокус и клавиатуру. Слушаем pointerdown: на iOS click по пустому месту не приходит,
  // а у цифровой клавиатуры iOS нет кнопки «Готово».
  document.addEventListener('pointerdown', e => {
    const ae = document.activeElement;
    if (ae && ae.matches && ae.matches('input[data-kb]') && !e.target.closest('.input-text, .input-uzs, .fake-kb')) ae.blur();
  }, true);

  /* ---------- состояния: карта экранов и сверка с Figma ---------- */
  P.states = list => { P._states = list; return P; };
  P.applyState = id => {
    const s = P._states.find(x => x.id === id); if (!s) return false;
    P.closeSheet(true); P.hideNotifications(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); P.keyboard.hide();
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

  /* ---------- старт ---------- */
  P.start = (first) => {
    P.$$('.statusbar').forEach(fillStatusBar);
    P.$$('.sheet-layer').forEach(wireSheetDrag);
    P.$$('.sheet-layer .sheet-scrim').forEach(s => s.addEventListener('click', () => P.closeSheet()));
    buildMap(); wireKeyboard(); fitViewport();
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('@') && P.applyState(h.slice(1))) return;
    const id = h && screenEl(h) ? h : first;
    P.stack = [id]; show(id); history.replaceState({ d: 1 }, '', '#' + id);
  };
})();
