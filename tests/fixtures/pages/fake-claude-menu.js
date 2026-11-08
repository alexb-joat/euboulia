// A stand-in for claude.ai's model menu, built from the signed-in capture of 8 Nov 2026: a picker button that opens
// a role="menu" of role="menuitemradio" models (data-model-id = API id, aria-checked), an "Effort" submenu of
// data-effort-id items and a "More models" submenu. Like the real one (Base UI), a submenu trigger toggles on
// pointerdown and again on click, opens on a plain click or a hover, and Escape closes one level at a time.
// Used by tests/dom (imported, then installFakeClaudeMenu(button)) and by switch.html (auto-installs).
(function () {
  const MAIN = [['claude-fable-5-1', 'Fable 5.1'], ['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-haiku-5-5', 'Haiku 5.5']];
  const MORE = [['claude-opus-4-8', 'Opus 4.8'], ['claude-sonnet-4-6', 'Sonnet 4.6']];
  const EFFORTS = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'Extra'], ['max', 'Max']];
  const name = id => [...MAIN, ...MORE].find(m => m[0] === id)[1];

  /** opts.broken: the menu never opens (a changed site). Returns a handle for tests: state, select(), open(). */
  function install(button, opts = {}) {
    const state = { model: 'claude-opus-5-5', effort: { 'claude-opus-5-5': 'xhigh' } };
    const effortOf = m => state.effort[m] ?? 'medium';
    const label = () => `${name(state.model)} ${EFFORTS.find(e => e[0] === effortOf(state.model))[1]}`;
    button.id = button.id || 'base-ui-fake';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const paint = () => {
      button.innerHTML = `<span>${name(state.model)}</span><span> ${EFFORTS.find(e => e[0] === effortOf(state.model))[1]}</span>`;
      button.setAttribute('aria-label', `Model: ${label()}`);
    };
    paint();
    let menu = null;
    const subs = [];

    const item = (role, attrs, text) => {
      const el = document.createElement('div');
      el.setAttribute('role', role);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      el.innerHTML = `<span>${text}</span>`;
      el.style.cssText = 'padding:6px 10px;cursor:default';
      return el;
    };
    const menuEl = (side, labelledby) => {
      const m = document.createElement('div');
      m.setAttribute('role', 'menu');
      m.setAttribute('data-side', side);
      m.setAttribute('aria-labelledby', labelledby);
      m.style.cssText = 'position:fixed;background:#fff;border:1px solid #ccc;min-width:200px;z-index:10';
      return m;
    };
    const closeAll = () => {
      while (subs.length) closeSub();
      menu?.remove(); menu = null;
      button.setAttribute('aria-expanded', 'false');
    };
    const closeSub = () => {
      const s = subs.pop();
      s.menu.remove();
      s.trigger.setAttribute('aria-expanded', 'false');
    };
    const choose = (kind, id) => {
      if (kind === 'model') state.model = id; else state.effort[state.model] = id;
      closeAll();
      setTimeout(paint, 30);   // the real button repaints a little after the menu closes
    };
    const radios = (list, kind, current) => {
      const g = document.createElement('div');
      g.setAttribute('role', 'group');
      for (const [id, text] of list) {
        const el = item('menuitemradio', { [kind === 'model' ? 'data-model-id' : 'data-effort-id']: id, 'aria-checked': String(id === current) }, text);
        el.addEventListener('click', () => choose(kind, id));
        g.append(el);
      }
      return g;
    };
    const trigger = (text, build) => {
      const t = item('menuitem', { 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, text);
      const open = () => {
        if (t.getAttribute('aria-expanded') === 'true') return;
        while (subs.length) closeSub();
        const m = menuEl('inline-end', `${button.id}-sub`);
        m.append(build());
        const r = t.getBoundingClientRect();
        m.style.left = `${r.right + 2}px`; m.style.top = `${r.top}px`;
        document.body.append(m);
        subs.push({ menu: m, trigger: t });
        t.setAttribute('aria-expanded', 'true');
      };
      const toggle = () => { if (t.getAttribute('aria-expanded') === 'true') closeSub(); else open(); };
      t.addEventListener('pointerdown', toggle);
      t.addEventListener('click', toggle);
      t.addEventListener('mouseover', () => setTimeout(open, 100));
      return t;
    };
    const open = () => {
      if (opts.broken) return;
      menu = menuEl('bottom', button.id);
      menu.append(radios(MAIN, 'model', state.model));
      menu.append(trigger(`Effort <span>${EFFORTS.find(e => e[0] === effortOf(state.model))[1]}</span>`, () => radios(EFFORTS, 'effort', effortOf(state.model))));
      menu.append(trigger('More models', () => radios(MORE, 'model', state.model)));
      const r = button.getBoundingClientRect();
      menu.style.left = `${r.left}px`; menu.style.top = `${r.bottom + 4}px`;
      document.body.append(menu);
      button.setAttribute('aria-expanded', 'true');
    };
    // Base UI's trigger opens on click; a second click closes.
    button.addEventListener('click', () => { if (menu) closeAll(); else open(); });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !menu) return;
      if (subs.length) closeSub(); else closeAll();
    });
    return {
      state, label,
      /** A person's own pick, as if made in the open menu. */
      select(model, effort) { state.model = model; if (effort) state.effort[model] = effort; closeAll(); paint(); },
    };
  }

  window.installFakeClaudeMenu = install;
  if (document.currentScript) {
    const go = () => { const b = document.querySelector('[data-testid="model-selector-dropdown"]'); if (b) window.fakeClaudeMenu = install(b, { broken: /broken/.test(location.search) }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
})();
