// All DOM rendering: category tabs, part lists (with search + sort),
// price/power summary, compatibility checks, spec comparison and the
// selected-part HUD.

import { CATEGORIES, PARTS } from './data/parts.js';
import { evaluateCompatibility } from './data/rules.js';
import { formatPrice } from './currency.js';
import { buyLinks } from './retailers.js';
import { priceMeta } from './prices.js';
import { getSettings, updateSettings } from './settings.js';
import { t, categoryLabel, categoryLabelById, isArabic, applyDocumentLang, specLabel } from './i18n.js';
import { encodeBuild } from './build.js';
import { listBuilds, saveBuild, getBuild, deleteBuild } from './saved.js';
import { planBudgetBuild } from './advisor.js';

// label -> category for attributing compatibility errors to the offending
// installed part (drives the red selection outline in the 3D view).
const ISSUE_CATEGORY = {
  'CPU socket': 'cpu',
  'Memory type': 'ram',
  'Cooler mount': 'cooler',
  'Cooler capacity': 'cooler',
  'Memory slots': 'ram',
  'Form factor': 'motherboard',
  'GPU clearance': 'gpu',
  'Cooler clearance': 'cooler',
  'Radiator fit': 'cooler',
  'Power supply': 'psu',
  'PSU connector': 'psu',
  'Storage': 'storage'
};

function fmtCapacity(gb) {
  return gb >= 1000 ? `${(gb / 1000).toFixed(gb % 1000 === 0 ? 0 : 1)}TB` : `${gb}GB`;
}

const SPEC_FMT = {
  cpu: p => `${p.cores} ${t('unitCores')} · ${p.clock} · ${p.socket} · ${p.power}W`,
  motherboard: p => `${p.socket} · ${p.ramType} · ${p.formFactor} · ${p.m2Slots}× M.2`,
  cooler: p => p.type === 'Air'
    ? `${t('coolerAir')} · ${p.height}mm · ${p.sockets.join('/')}`
    : `${p.type} · ${p.radiator}mm · ${p.sockets.join('/')}`,
  ram: p => `${p.ramType} · ${p.capacity}GB · ${p.speed}MHz · ${t('sticksFmt', { n: p.sticks })}`,
  gpu: p => `${p.vram}GB VRAM · ${p.length}mm · ${p.power}W`,
  storage: p => `${p.interface} · ${fmtCapacity(p.capacity)} · ${p.form}`,
  psu: p => `${p.wattage}W · ${p.efficiency} · ${p.modular} ${t('unitModular')}`,
  case: p => `${p.formFactors.join('/')} · GPU ≤${p.maxGpuLength}mm · ${t('coolerShort')} ≤${p.maxCoolerHeight}mm · ${t('fansFmt', { n: p.fans })}`
};

// Rows shown in the comparison table, per category.
const COMPARE_FIELDS = {
  case: [
    ['Form factors', p => p.formFactors.join('/')],
    ['Max GPU', p => `${p.maxGpuLength} mm`],
    ['Max cooler', p => `${p.maxCoolerHeight} mm`],
    ['Max radiator', p => `${p.maxRadiator} mm`],
    ['Fans', p => p.fans]
  ],
  motherboard: [
    ['Socket', p => p.socket],
    ['Memory', p => p.ramType],
    ['Form factor', p => p.formFactor],
    ['M.2 slots', p => p.m2Slots]
  ],
  cpu: [
    ['Cores', p => p.cores],
    ['Clock', p => p.clock],
    ['Socket', p => p.socket],
    ['TDP', p => `${p.power} W`]
  ],
  cooler: [
    ['Type', p => p.type],
    ['Size', p => p.type === 'Air' ? `${p.height} mm` : `${p.radiator} mm`],
    ['Sockets', p => p.sockets.join('/')],
    ['Power', p => `${p.power} W`]
  ],
  ram: [
    ['Type', p => p.ramType],
    ['Capacity', p => `${p.capacity} GB`],
    ['Speed', p => `${p.speed} MHz`],
    ['Sticks', p => p.sticks]
  ],
  gpu: [
    ['VRAM', p => `${p.vram} GB`],
    ['Length', p => `${p.length} mm`],
    ['TDP', p => `${p.power} W`]
  ],
  storage: [
    ['Interface', p => p.interface],
    ['Capacity', p => fmtCapacity(p.capacity)],
    ['Form', p => p.form]
  ],
  psu: [
    ['Wattage', p => `${p.wattage} W`],
    ['Efficiency', p => p.efficiency],
    ['Modular', p => p.modular]
  ]
};

const MAX_COMPARE = 3;

export class UI {
  constructor(store, viewer) {
    this.store = store;
    this.viewer = viewer;
    this.activeCategory = getSettings().category || 'case';
    this.selected = null; // { category, partId }
    this.query = '';
    this.sort = getSettings().sort || 'recommended';
    this.compareItems = []; // [{ category, partId }] — works across categories

    this.el = {
      tabs: document.getElementById('categories'),
      list: document.getElementById('partlist'),
      search: document.getElementById('part-search'),
      sort: document.getElementById('part-sort'),
      compare: document.getElementById('compare'),
      totalPrice: document.getElementById('total-price'),
      partCount: document.getElementById('part-count'),
      priceMeta: document.getElementById('price-meta'),
      powerFill: document.getElementById('power-fill'),
      powerText: document.getElementById('power-text'),
      compat: document.getElementById('compat'),
      buildList: document.getElementById('build-list'),
      buy: document.getElementById('buy'),
      hud: document.getElementById('hud'),
      pickTip: document.getElementById('pick-tip'),
      toast: document.getElementById('toast'),
      currency: document.getElementById('sel-currency'),
      vat: document.getElementById('toggle-vat'),
      lang: document.getElementById('btn-lang'),
      undo: document.getElementById('btn-undo'),
      redo: document.getElementById('btn-redo'),
      saves: document.getElementById('btn-saves'),
      savesMenu: document.getElementById('saves-menu'),
      budgetInput: document.getElementById('budget-input'),
      budgetBtn: document.getElementById('btn-budget')
    };

    this.el.sort.value = this.sort;

    this._buildTabs();
    this._wireControls();
    store.subscribe(() => this.render());
    this._applyI18n();
  }

  /** Localise toolbar/sidebar chrome for the active language. */
  _applyI18n() {
    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    const label = (id, text) => {
      const el = document.getElementById(id);
      if (el) { el.title = text; el.setAttribute('aria-label', text); }
    };
    set('brand-sub', t('brandSub'));
    set('btn-random', t('random'));
    set('btn-reset', t('reset'));
    set('btn-saves', '🗂 ' + t('builds'));
    set('btn-budget', t('buildToBudget'));
    set('total-label', t('total'));
    set('power-title', t('powerTitle'));
    set('compat-title', t('compatTitle'));
    set('build-title', t('yourBuild'));
    set('buy-title', t('whereToBuy'));
    label('btn-undo', t('undo'));
    label('btn-redo', t('redo'));
    label('btn-view', t('resetView'));
    label('btn-share', t('share'));
    label('btn-shot', t('screenshot'));
    const budgetLabel = document.querySelector('label[for="budget-input"]');
    if (budgetLabel) budgetLabel.textContent = t('budget');
    if (this.el.budgetInput) this.el.budgetInput.placeholder = t('budgetPh');
    const spin = document.getElementById('toggle-spin-label');
    const panel = document.getElementById('toggle-panel-label');
    if (spin) spin.textContent = ' ' + t('autoRotate');
    if (panel) panel.textContent = ' ' + t('sidePanels');
    this.el.search.placeholder = t('searchPlaceholder');
    for (const o of this.el.sort.options) {
      o.textContent = { recommended: t('sortRecommended'), 'price-asc': t('sortAsc'), 'price-desc': t('sortDesc'), name: t('sortName') }[o.value] || o.textContent;
    }
    const hint = document.querySelector('.viewer-hint');
    if (hint) hint.textContent = t('viewerHint');

    const setAria = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('aria-label', text);
    };
    setAria('hud', t('selectedPart'));
    setAria('compare', t('comparisonTitle'));
    setAria('partlist', categoryLabelById(this.activeCategory));
  }

  /** Disable the 3D-only controls when running in 2D-only fallback mode. */
  _applyFallbackUI() {
    if (!this.viewer.isFallback) return;
    for (const id of ['btn-view', 'btn-shot', 'toggle-spin', 'toggle-panel']) {
      const c = document.getElementById(id);
      if (c) {
        c.disabled = true;
        const box = c.closest('.toggle');
        if (box) box.title = t('webglUnavailable');
      }
    }
  }

  _buildTabs() {
    this.el.tabs.innerHTML = '';
    const buttons = [];
    for (const cat of CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('aria-controls', 'partlist');
      btn.tabIndex = -1;
      btn.id = `tab-${cat.id}`;
      btn.dataset.category = cat.id;
      btn.innerHTML = `
        <span class="tab-icon" aria-hidden="true">${cat.icon}</span>
        <span class="tab-label">${categoryLabel(cat)}</span>
        <span class="tab-dot" data-dot="${cat.id}"></span>`;
      btn.addEventListener('click', () => this._activateCategory(cat.id));
      btn.addEventListener('keydown', e => this._onTabKey(e, cat.id));
      this.el.tabs.appendChild(btn);
      buttons.push(btn);
    }
    this._syncTabAria();
  }

  _activateCategory(id) {
    this.activeCategory = id;
    updateSettings({ category: id });
    this.selected = null;
    this._clearFilters();
    this.viewer.highlight(null);
    this.viewer.focusOn(null);
    this.render();
    const tab = document.getElementById(`tab-${id}`);
    if (tab) tab.focus();
  }

  /** Roving-tabindex keyboard navigation between category tabs. */
  _onTabKey(e, id) {
    const ids = CATEGORIES.map(c => c.id);
    const i = ids.indexOf(id);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = ids[(i + 1) % ids.length];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = ids[(i - 1 + ids.length) % ids.length];
    else if (e.key === 'Home') next = ids[0];
    else if (e.key === 'End') next = ids[ids.length - 1];
    if (!next) return;
    e.preventDefault();
    this._activateCategory(next);
  }

  _syncTabAria() {
    for (const btn of this.el.tabs.children) {
      const active = btn.dataset.category === this.activeCategory;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    }
    if (this.el.list) this.el.list.setAttribute('aria-label', categoryLabelById(this.activeCategory));
  }

  _wireControls() {
    document.getElementById('btn-reset').addEventListener('click', () => this.store.reset());
    document.getElementById('btn-random').addEventListener('click', () => this.store.random());
    document.getElementById('btn-view').addEventListener('click', () => this.viewer.resetView());

    this.el.undo.addEventListener('click', () => this.store.undo());
    this.el.redo.addEventListener('click', () => this.store.redo());

    const spin = document.getElementById('toggle-spin');
    spin.checked = getSettings().autoRotate !== false;
    this.viewer.setAutoRotate(spin.checked);
    spin.addEventListener('change', () => {
      updateSettings({ autoRotate: spin.checked });
      this.viewer.setAutoRotate(spin.checked);
    });

    const panel = document.getElementById('toggle-panel');
    panel.checked = getSettings().sidePanels !== false;
    this.viewer.setSidePanel(panel.checked);
    panel.addEventListener('change', () => {
      updateSettings({ sidePanels: panel.checked });
      this.viewer.setSidePanel(panel.checked);
    });

    document.getElementById('btn-share').addEventListener('click', () => this._shareBuild());
    document.getElementById('btn-shot').addEventListener('click', () => this._screenshot());

    // saved-builds library dropdown
    this.el.saves.addEventListener('click', e => { e.stopPropagation(); this._toggleSavesMenu(); });
    this.el.savesMenu.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => this._closeSavesMenu());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this._closeSavesMenu(); });

    // budget advisor
    this.el.budgetBtn.addEventListener('click', () => this._applyBudget());
    this.el.budgetInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._applyBudget(); });

    this.el.currency.value = getSettings().currency;
    this.el.currency.addEventListener('change', () => {
      updateSettings({ currency: this.el.currency.value });
      this._clearFilters();
      this.render();
    });

    this.el.vat.checked = getSettings().vat;
    this.el.vat.addEventListener('change', () => {
      updateSettings({ vat: this.el.vat.checked });
      this.render();
    });

    this.el.lang.addEventListener('click', () => {
      updateSettings({ lang: isArabic() ? 'en' : 'ar' });
      applyDocumentLang();
      this._buildTabs();
      this._applyI18n();
      this.render();
    });

    this.el.search.addEventListener('input', () => {
      this.query = this.el.search.value.trim().toLowerCase();
      this._renderList();
    });
    this.el.sort.addEventListener('change', () => {
      this.sort = this.el.sort.value;
      updateSettings({ sort: this.sort });
      this._renderList();
    });

    // selecting a part in the 3D view focuses its category
    this.viewer.onSelect = category => {
      if (!category) { this.selected = null; this.viewer.highlight(null); this.render(); return; }
      this.activeCategory = category;
      updateSettings({ category });
      this._clearFilters();
      const part = this.store.build[category];
      this.selected = part ? { category, partId: part.id } : null;
      this.viewer.highlight(category);
      this.viewer.focusOn(category);
      this.render();
    };

    // hover tooltip over 3D parts — positioned at the cursor because the
    // viewer only reports world-space hit points.
    this.viewer.onHover = info => {
      const tip = this.el.pickTip;
      if (!info) { tip.hidden = true; return; }
      const part = (PARTS[info.category] || []).find(p => p.id === info.partId);
      const name = part ? part.name : categoryLabelById(info.category);
      tip.textContent = name;
      const rect = this.viewer.renderer.domElement.getBoundingClientRect();
      const cur = this._cursor;
      tip.hidden = false;
      if (cur) {
        tip.style.left = (cur.clientX - rect.left + 14) + 'px';
        tip.style.top = (cur.clientY - rect.top - 30) + 'px';
      } else {
        tip.style.left = '50%';
        tip.style.top = '12px';
      }
    };
    const can = this.viewer.renderer.domElement;
    can.addEventListener('pointermove', e => { this._cursor = { clientX: e.clientX, clientY: e.clientY }; });
    can.addEventListener('pointerleave', () => { this._cursor = null; });

    this._applyFallbackUI();
  }

  _toast(text) {
    const box = this.el.toast;
    if (!box) return;
    box.textContent = text;
    box.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { box.hidden = true; }, 2200);
  }

  async _shareBuild() {
    try {
      const map = this.store.toObject();
      const url = new URL(location.href);
      url.searchParams.set('build', encodeBuild(map));
      // Reflect the shareable link in the address bar so a manual copy/reload
      // reproduces this exact build (autosave alone wouldn't survive a reset).
      try { history.replaceState(null, '', url.href); } catch { /* ignore */ }
      try { await navigator.clipboard.writeText(url.href); } catch { /* clipboard blocked */ }
      this._toast(t('copied'));
    } catch {
      this._toast(t('copied'));
    }
  }

  _screenshot() {
    try {
      const url = this.viewer.screenshot(2);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'forgepc-build.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      this._toast(t('shotDone'));
    } catch (e) {
      console.warn('screenshot failed', e);
    }
  }

  /** Reset the per-category search + comparison selection. */
  _clearFilters() {
    this.compareItems = [];
    this.query = '';
    this.el.search.value = '';
  }

  // -- saved builds -----------------------------------------------------------

  _toggleSavesMenu() {
    const open = this.el.savesMenu.hidden;
    if (open) this._renderSavesMenu();
    this.el.savesMenu.hidden = !open;
    this.el.saves.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  _closeSavesMenu() {
    if (this.el.savesMenu.hidden) return;
    this.el.savesMenu.hidden = true;
    this.el.saves.setAttribute('aria-expanded', 'false');
  }

  _renderSavesMenu() {
    const list = listBuilds();
    const menu = this.el.savesMenu;
    menu.replaceChildren();

    const head = document.createElement('div');
    head.className = 'saves-head';
    const title = document.createElement('span');
    title.textContent = t('builds');
    const newBtn = document.createElement('button');
    newBtn.className = 'save-new';
    newBtn.type = 'button';
    newBtn.textContent = '＋ ' + t('saveCurrent');
    newBtn.addEventListener('click', () => this._promptSaveName());
    head.append(title, newBtn);
    menu.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'saves-list';
    if (!list.length) {
      const empty = document.createElement('li');
      empty.className = 'save-empty';
      empty.textContent = t('noSaved');
      ul.appendChild(empty);
    } else {
      for (const b of list) {
        const count = Object.keys(b.map || {}).length;
        const date = new Date(b.at || Date.now());
        const when = Number.isNaN(date.getTime()) ? '' :
          new Intl.DateTimeFormat(isArabic() ? 'ar' : 'en', { day: 'numeric', month: 'short' }).format(date);

        const li = document.createElement('li');
        li.className = 'save-item';
        li.dataset.id = b.id;

        const load = document.createElement('button');
        load.className = 'save-load';
        load.type = 'button';
        const name = document.createElement('span');
        name.className = 'save-name';
        name.textContent = b.name; // user text — never innerHTML
        const meta = document.createElement('span');
        meta.className = 'save-meta';
        meta.textContent = `${t('partsShort', { n: count })} · ${when}`;
        load.append(name, meta);
        load.addEventListener('click', () => this._loadSaved(b.id));

        const del = document.createElement('button');
        del.className = 'save-del';
        del.type = 'button';
        del.title = t('delete');
        del.setAttribute('aria-label', t('delete'));
        del.textContent = '🗑';
        del.addEventListener('click', () => {
          deleteBuild(b.id);
          this._renderSavesMenu();
          this._toast(t('deleted'));
        });

        li.append(load, del);
        ul.appendChild(li);
      }
    }
    menu.appendChild(ul);

    const hint = document.createElement('div');
    hint.className = 'saves-hint';
    hint.textContent = t('savesHint');
    menu.appendChild(hint);
  }

  /** Reveal the inline name field for saving the current build. */
  _promptSaveName() {
    const menu = this.el.savesMenu;
    const existing = menu.querySelector('.save-name-input');
    if (existing) { existing.focus(); return; }

    const row = document.createElement('div');
    row.className = 'save-name-row';
    const input = document.createElement('input');
    input.className = 'save-name-input';
    input.type = 'text';
    input.placeholder = t('saveNamePrompt');
    input.maxLength = 60;
    input.setAttribute('aria-label', t('saveNamePrompt'));

    const save = document.createElement('button');
    save.className = 'save-confirm';
    save.type = 'button';
    save.textContent = t('save');
    const cancel = document.createElement('button');
    cancel.className = 'save-cancel';
    cancel.type = 'button';
    cancel.textContent = t('cancel');

    const commit = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      this._commitSave(name);
    };
    save.addEventListener('click', commit);
    cancel.addEventListener('click', () => this._renderSavesMenu());
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); this._renderSavesMenu(); }
    });

    row.append(input, save, cancel);
    const head = menu.querySelector('.saves-head');
    head ? head.after(row) : menu.prepend(row);
    input.focus();
  }

  /** Persist the current build under a (already validated) name. */
  _commitSave(name) {
    const map = this.store.toObject();
    if (!Object.keys(map).length) { this._toast(t('nothingToSave')); return; }
    saveBuild(name, map);
    this._renderSavesMenu();
    this._toast(t('saved'));
  }

  _loadSaved(id) {
    const entry = getBuild(id);
    if (!entry) return;
    this.activeCategory = 'case';
    updateSettings({ category: 'case' });
    this.selected = null;
    this.compareItems = [];
    this.store.load(entry.map);
    this.viewer.highlight(null);
    this._closeSavesMenu();
    this._toast(t('loaded'));
  }

  // -- budget advisor ---------------------------------------------------------

  _applyBudget() {
    const budget = Number(this.el.budgetInput.value);
    if (!Number.isFinite(budget) || budget <= 0) {
      this._toast(t('budgetInvalid'));
      return;
    }
    const plan = planBudgetBuild(budget);
    if (!plan) {
      this._toast(t('budgetTooLow'));
      return;
    }
    this.activeCategory = 'case';
    updateSettings({ category: 'case' });
    this.selected = null;
    this.compareItems = [];
    this.store.load(plan.build && Object.fromEntries(
      Object.entries(plan.build).map(([cat, part]) => [cat, part ? part.id : null])
    ));
    this.viewer.highlight(null);
    this._toast(plan.withinBudget
      ? t('budgetApplied', { total: formatPrice(plan.total) })
      : t('budgetOver', { total: formatPrice(plan.total) }));
  }

  /** Install (or toggle off) a part and reflect it in the HUD immediately. */
  _install(category, partId) {
    this.store.select(category, partId);
    const now = this.store.build[category];
    this.selected = now ? { category, partId: now.id } : null;
    if (now) { this.viewer.highlight(category); this.viewer.focusOn(category); }
    // store.select() already emitted once (before we knew the new selection),
    // so render again to sync the HUD.
    this.render();
  }

  render() {
    const build = this.store.build;

    // tabs: active state + installed dot
    for (const btn of this.el.tabs.children) {
      const cat = btn.dataset.category;
      btn.classList.toggle('active', cat === this.activeCategory);
      const dot = btn.querySelector('.tab-dot');
      dot.classList.toggle('on', !!build[cat]);
    }
    this._syncTabAria();

    // undo/redo affordances
    if (this.el.undo) this.el.undo.disabled = !this.store.canUndo;
    if (this.el.redo) this.el.redo.disabled = !this.store.canRedo;

    this._renderList();
    this._renderCompare();
    this._renderSummary();
    this._renderBuy();
    this._renderHud();

    // red selection outline for installed parts with compatibility errors
    const bad = new Set();
    for (const c of this.store.compatibility) {
      if (c.level === 'error' && ISSUE_CATEGORY[c.label]) {
        const cat = ISSUE_CATEGORY[c.label];
        if (this.store.build[cat]) bad.add(cat);
      }
    }
    this.viewer.markBad([...bad]);
  }

  _visibleParts() {
    const cat = this.activeCategory;
    let list = (PARTS[cat] || []).slice();

    if (this.query) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(this.query) ||
        (p.brand || '').toLowerCase().includes(this.query) ||
        (p.socket || '').toLowerCase().includes(this.query));
    }

    switch (this.sort) {
      case 'price-asc': list.sort((a, b) => a.price - b.price); break;
      case 'price-desc': list.sort((a, b) => b.price - a.price); break;
      case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return list;
  }

  _renderList() {
    const cat = this.activeCategory;
    const list = this._visibleParts();
    const installed = this.store.build[cat];
    this.el.list.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'list-header';
    header.innerHTML = `<span>${categoryLabelById(cat)}</span>
      ${installed ? `<button class="link-btn" data-remove="${cat}">${t('remove')}</button>` : ''}`;
    this.el.list.appendChild(header);

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = t('noMatch');
      this.el.list.appendChild(empty);
      return;
    }

    for (const part of list) {
      const isInstalled = installed && installed.id === part.id;
      const inCompare = this.compareItems.some(i => i.category === cat && i.partId === part.id);
      const issues = this._compatIssues(cat, part);
      const hasError = issues.some(i => i.level === 'error');
      const hasIssue = issues.length > 0;
      const card = document.createElement('button');
      card.className = 'part-card' +
        (isInstalled ? ' installed' : '') +
        (inCompare ? ' comparing' : '') +
        (hasIssue ? (hasError ? ' has-error' : ' has-warn') : '');
      card.innerHTML = `
        <div class="part-main">
          <span class="part-name">${part.name}${hasIssue ? `<span class="issue-badge" title="${issues.map(i => `${i.label}: ${i.detail}`).join('\n')}">⚠ ${issues.length}</span>` : ''}</span>
          <span class="part-spec">${SPEC_FMT[cat] ? SPEC_FMT[cat](part) : ''}</span>
        </div>
        <span class="part-price">${formatPrice(part.price)}</span>
        <span class="cmp-toggle${inCompare ? ' on' : ''}" title="${t('compare')}" role="button" tabindex="0">⇄</span>`;
      card.addEventListener('click', () => this._install(cat, part.id));
      const toggle = card.querySelector('.cmp-toggle');
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        this._toggleCompare(cat, part.id);
      });
      toggle.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          this._toggleCompare(cat, part.id);
        }
      });
      this.el.list.appendChild(card);
    }

    const removeBtn = this.el.list.querySelector('[data-remove]');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.store.clear(cat);
        this.selected = null;
        this.viewer.highlight(null);
      });
    }
  }

  _toggleCompare(category, partId) {
    const i = this.compareItems.findIndex(it => it.category === category && it.partId === partId);
    if (i >= 0) {
      this.compareItems.splice(i, 1);
    } else {
      // cap at MAX_COMPARE per category, keeping the shelf across categories
      const sameCat = this.compareItems.filter(it => it.category === category);
      if (sameCat.length >= MAX_COMPARE) {
        const drop = this.compareItems.findIndex(it => it.category === category);
        if (drop >= 0) this.compareItems.splice(drop, 1);
      }
      this.compareItems.push({ category, partId });
    }
    this._renderList();
    this._renderCompare();
  }

  _compatIssues(category, part) {
    const build = { ...this.store.build, [category]: part };
    return evaluateCompatibility(build).filter(c => c.level === 'error' || c.level === 'warn');
  }

  /** Side-by-side spec table, grouped by category (compare across tabs). */
  _renderCompare() {
    const box = this.el.compare;
    const groups = {};
    for (const it of this.compareItems) {
      const part = (PARTS[it.category] || []).find(p => p.id === it.partId);
      if (part) (groups[it.category] ||= []).push(part);
    }
    const cats = Object.keys(groups).filter(c => groups[c].length >= 2);

    if (!cats.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;

    const total = cats.reduce((n, c) => n + groups[c].length, 0);
    const head = document.createElement('div');
    head.className = 'compare-head';
    head.innerHTML = `<span class="cmp-title">${t('compare')} ${total}</span>
      <button class="cmp-clear" type="button">${t('clear')}</button>`;

    const frag = document.createElement('div');
    frag.className = 'compare-groups';

    for (const cat of cats) {
      const parts = groups[cat];
      const fields = COMPARE_FIELDS[cat] || [];
      const cheapest = Math.min(...parts.map(p => p.price));

      const wrap = document.createElement('div');
      wrap.className = 'cmp-group';
      const title = document.createElement('div');
      title.className = 'cmp-group-title';
      title.textContent = categoryLabelById(cat);
      wrap.appendChild(title);

      const table = document.createElement('table');
      table.className = 'compare-table';
      const caption = document.createElement('caption');
      caption.className = 'sr-only';
      caption.textContent = `${categoryLabelById(cat)} — ${t('comparisonTitle')}`;
      table.appendChild(caption);

      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'cmp-rowlabel';
      corner.scope = 'col';
      hr.appendChild(corner);
      for (const p of parts) {
        const issues = this._compatIssues(cat, p);
        const badge = issues.length
          ? `<span class="cmp-badge ${issues.some(i => i.level === 'error') ? 'error' : 'warn'}" title="${issues.map(i => `${i.label}: ${i.detail}`).join('\n')}">${t('issueFmt', { n: issues.length, s: issues.length > 1 ? 's' : '' })}</span>`
          : '';
        const th = document.createElement('th');
        th.scope = 'col';
        th.innerHTML = `
          <button class="cmp-pick" type="button" title="Install ${p.name}">
            <span class="cmp-name">${p.name}</span>
            <span class="cmp-price${p.price === cheapest ? ' cheap' : ''}">${formatPrice(p.price)}</span>
            ${badge}
          </button>
          <button class="cmp-drop" type="button" title="Remove from comparison">×</button>`;
        th.querySelector('.cmp-pick').addEventListener('click', () => this._install(cat, p.id));
        th.querySelector('.cmp-drop').addEventListener('click', () => this._toggleCompare(cat, p.id));
        hr.appendChild(th);
      }
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (const [label, get] of fields) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<th class="cmp-rowlabel" scope="row">${specLabel(label)}</th>`;
        const values = parts.map(get);
        for (let i = 0; i < parts.length; i++) {
          const td = document.createElement('td');
          td.textContent = values[i];
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      frag.appendChild(wrap);
    }

    box.innerHTML = '';
    box.appendChild(head);
    box.appendChild(frag);
    head.querySelector('.cmp-clear').addEventListener('click', () => {
      this.compareItems = [];
      this._renderList();
      this._renderCompare();
    });
  }

  _renderSummary() {
    const { store } = this;
    this.el.totalPrice.textContent = formatPrice(store.totalPrice);
    if (this.el.priceMeta) {
      const live = priceMeta.mode === 'live';
      this.el.priceMeta.classList.toggle('live', live);
      this.el.priceMeta.textContent = this._priceMetaText();
      this.el.priceMeta.title = live
        ? `${t('priceLiveHint')} ${t('asOf').replace(/:$/, '')} ${this._priceMetaDate() || ''}`.trim()
        : t('priceEstimateHint');
    }

    const installedCount = store.categories.filter(c => store.build[c]).length;
    this.el.partCount.textContent = t('partsFmt', { a: installedCount, b: store.categories.length });

    // power bar
    const draw = store.power;
    const cap = store.psuCapacity;
    const pct = cap ? Math.min(100, (draw / cap) * 100) : Math.min(100, draw / 4);
    this.el.powerFill.style.width = `${pct}%`;
    let level = 'good';
    if (cap && draw > cap) level = 'over';
    else if (pct > 85) level = 'high';
    else if (pct > 65) level = 'mid';
    this.el.powerFill.className = `power-fill ${level}`;
    this.el.powerText.textContent = cap ? `${draw} W / ${cap} W` : `${draw} W ${t('powerEst')}`;

    // compatibility
    const checks = store.compatibility;
    this.el.compat.innerHTML = '';
    for (const c of checks) {
      const row = document.createElement('div');
      row.className = `check ${c.level}`;
      const icon = { ok: '✓', warn: '!', error: '✕', info: 'i' }[c.level];
      row.innerHTML = `<span class="check-icon">${icon}</span>
        <span class="check-body"><b>${c.label}</b><i>${c.detail}</i></span>`;
      this.el.compat.appendChild(row);
    }

    // build list
    this.el.buildList.innerHTML = '';
    for (const cat of store.categories.slice().reverse()) {
      const part = store.build[cat];
      const meta = CATEGORIES.find(c => c.id === cat);
      const row = document.createElement('button');
      row.className = 'build-row' + (part ? '' : ' empty');
      row.innerHTML = `
        <span class="build-icon">${meta.icon}</span>
        <span class="build-name">${part ? part.name : t('notSelected')}</span>
        <span class="build-price">${part ? formatPrice(part.price) : '—'}</span>`;
      row.addEventListener('click', () => {
        this.activeCategory = cat;
        updateSettings({ category: cat });
        this._clearFilters();
        this.selected = part ? { category: cat, partId: part.id } : null;
        if (part) this.viewer.highlight(cat);
        this.viewer.focusOn(cat);
        this.render();
      });
      this.el.buildList.appendChild(row);
    }
  }

  /** Localised price freshness badge without importing priceMetaText. */
  _priceMetaText() {
    if (priceMeta.mode === 'live' && priceMeta.checkedAt) {
      const d = this._priceMetaDate();
      if (d) return `${t('priceLive', { n: priceMeta.applied })} · ${t('asOf')} ${d}`;
      return t('latestSync');
    }
    return t('estimateTag');
  }

  /** Formatted last-sync date, or null when unknown. */
  _priceMetaDate() {
    if (!priceMeta.checkedAt) return null;
    const d = new Date(priceMeta.checkedAt + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return null;
    const locale = isArabic() ? 'ar' : 'en';
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }

  _renderBuy() {
    const { store } = this;
    const box = this.el.buy;
    const missing = store.categories.filter(c => !store.build[c]);

    if (missing.length) {
      const names = missing.map(id => categoryLabelById(id)).join(t('sep'));
      box.innerHTML = `
        <div class="buy-intro">${t('buyIntro')}</div>
        <div class="buy-missing"><b>${t('stillNeeded')}</b> ${names}</div>`;
      return;
    }

    const errors = store.compatibility.filter(c => c.level === 'error');
    const warnings = store.compatibility.filter(c => c.level === 'warn');
    let notice;
    if (errors.length) {
      notice = `<div class="buy-intro bad">${errors.length === 1 ? t('buyErr1', { n: errors.length }) : t('buyErrN', { n: errors.length })}</div>`;
    } else if (warnings.length) {
      notice = `<div class="buy-intro warn">${warnings.length === 1 ? t('buyWarn1', { n: warnings.length }) : t('buyWarnN', { n: warnings.length })}</div>`;
    } else {
      notice = `<div class="buy-intro ok">${t('buyOk')}</div>`;
    }

    const rows = store.categories.slice().reverse().map(cat => {
      const part = store.build[cat];
      const meta = CATEGORIES.find(c => c.id === cat);
      const chips = buyLinks(part).map(l =>
        `<a class="buy-chip" href="${l.url}" target="_blank" rel="noopener noreferrer" title="Search ${part.name} on ${l.name}">${l.name}</a>`
      ).join('');
      return `
        <div class="buy-row">
          <div class="buy-head">
            <span class="build-icon">${meta.icon}</span>
            <span class="buy-name">${part.name}</span>
            <span class="buy-price">${formatPrice(part.price)}</span>
          </div>
          <div class="buy-links">${chips}</div>
        </div>`;
    }).join('');

    box.innerHTML = `
      ${notice}
      <div class="buy-list">${rows}</div>
      <div class="buy-total"><span>${t('subtotal')}</span><span>${formatPrice(store.totalPrice)}</span></div>
      <div class="buy-disclaimer">${this._priceMetaText()} · ${t('buyDisclaimer', { vat: t(getSettings().vat ? 'incVat' : 'excVat') })}</div>`;
  }

  _renderHud() {
    const hud = this.el.hud;
    if (!this.selected) {
      hud.classList.remove('visible');
      return;
    }
    const { category, partId } = this.selected;
    const part = (PARTS[category] || []).find(p => p.id === partId);
    if (!part) { hud.classList.remove('visible'); return; }

    const meta = CATEGORIES.find(c => c.id === category);
    const issues = this._compatIssues(category, part);
    const bad = issues.filter(i => i.level === 'error');
    const warn = issues.filter(i => i.level === 'warn');
    hud.classList.add('visible');
    hud.innerHTML = `
      <div class="hud-tag">${meta.icon} ${categoryLabel(meta)}</div>
      <div class="hud-name">${part.name}</div>
      <div class="hud-spec">${SPEC_FMT[category] ? SPEC_FMT[category](part) : ''}</div>
      ${bad.length || warn.length ? `<div class="hud-warn${bad.length ? ' error' : ''}">⚠ ${t('hudIssues', { n: issues.length, s: issues.length > 1 ? 's' : '' })}</div>` : ''}
      <div class="hud-row">
        <span class="hud-price">${formatPrice(part.price)}</span>
        <button class="hud-remove" id="hud-remove">${t('remove')}</button>
      </div>`;
    hud.querySelector('#hud-remove').addEventListener('click', () => {
      this.store.clear(category);
      this.selected = null;
      this.viewer.highlight(null);
    });
  }
}
