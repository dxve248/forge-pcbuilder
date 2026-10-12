// All DOM rendering: category tabs, part lists (with search + sort),
// price/power summary, compatibility checks, spec comparison and the
// selected-part HUD.

import { CATEGORIES, PARTS } from './data/parts.js';
import { evaluateCompatibility } from './data/rules.js';
import { formatPrice } from './currency.js';
import { buyLinks } from './retailers.js';

function fmtCapacity(gb) {
  return gb >= 1000 ? `${(gb / 1000).toFixed(gb % 1000 === 0 ? 0 : 1)}TB` : `${gb}GB`;
}

const SPEC_FMT = {
  cpu: p => `${p.cores} cores · ${p.clock} · ${p.socket} · ${p.power}W`,
  motherboard: p => `${p.socket} · ${p.ramType} · ${p.formFactor} · ${p.m2Slots}× M.2`,
  cooler: p => p.type === 'Air' ? `Air · ${p.height}mm · ${p.sockets.join('/')}` : `${p.type} · ${p.radiator}mm · ${p.sockets.join('/')}`,
  ram: p => `${p.ramType} · ${p.capacity}GB · ${p.speed}MHz · ${p.sticks}× stick`,
  gpu: p => `${p.vram}GB VRAM · ${p.length}mm · ${p.power}W`,
  storage: p => `${p.interface} · ${fmtCapacity(p.capacity)} · ${p.form}`,
  psu: p => `${p.wattage}W · ${p.efficiency} · ${p.modular} modular`,
  case: p => `${p.formFactors.join('/')} · GPU ≤${p.maxGpuLength}mm · Cooler ≤${p.maxCoolerHeight}mm · ${p.fans} fans`
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
    this.activeCategory = 'case';
    this.selected = null; // { category, partId }
    this.query = '';
    this.sort = 'recommended';
    this.compareIds = [];

    this.el = {
      tabs: document.getElementById('categories'),
      list: document.getElementById('partlist'),
      search: document.getElementById('part-search'),
      sort: document.getElementById('part-sort'),
      compare: document.getElementById('compare'),
      totalPrice: document.getElementById('total-price'),
      partCount: document.getElementById('part-count'),
      powerFill: document.getElementById('power-fill'),
      powerText: document.getElementById('power-text'),
      compat: document.getElementById('compat'),
      buildList: document.getElementById('build-list'),
      buy: document.getElementById('buy'),
      hud: document.getElementById('hud')
    };

    this._buildTabs();
    this._wireControls();
    store.subscribe(() => this.render());
  }

  _buildTabs() {
    this.el.tabs.innerHTML = '';
    for (const cat of CATEGORIES) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.category = cat.id;
      btn.innerHTML = `
        <span class="tab-icon">${cat.icon}</span>
        <span class="tab-label">${cat.label}</span>
        <span class="tab-dot" data-dot="${cat.id}"></span>`;
      btn.addEventListener('click', () => {
        this.activeCategory = cat.id;
        this.selected = null;
        this._clearFilters();
        this.viewer.highlight(null);
        this.viewer.focusOn(null);
        this.render();
      });
      this.el.tabs.appendChild(btn);
    }
  }

  _wireControls() {
    document.getElementById('btn-reset').addEventListener('click', () => this.store.reset());
    document.getElementById('btn-random').addEventListener('click', () => this.store.random());
    document.getElementById('btn-view').addEventListener('click', () => this.viewer.resetView());
    const spin = document.getElementById('toggle-spin');
    spin.addEventListener('change', () => this.viewer.setAutoRotate(spin.checked));
    const shadow = document.getElementById('toggle-shadow');
    shadow.addEventListener('change', () => this.viewer.setQuality({ ao: shadow.checked }));
    const glow = document.getElementById('toggle-glow');
    glow.addEventListener('change', () => this.viewer.setQuality({ bloom: glow.checked }));
    const panel = document.getElementById('toggle-panel');
    panel.addEventListener('change', () => this.viewer.setSidePanel(panel.checked));

    this.el.search.addEventListener('input', () => {
      this.query = this.el.search.value.trim().toLowerCase();
      this._renderList();
    });
    this.el.sort.addEventListener('change', () => {
      this.sort = this.el.sort.value;
      this._renderList();
    });

    // selecting a part in the 3D view focuses its category
    this.viewer.onSelect = category => {
      if (!category) { this.selected = null; this.viewer.highlight(null); this.render(); return; }
      this.activeCategory = category;
      this._clearFilters();
      const part = this.store.build[category];
      this.selected = part ? { category, partId: part.id } : null;
      this.viewer.highlight(category);
      this.viewer.focusOn(category);
      this.render();
    };
  }

  /** Reset the per-category search + comparison selection. */
  _clearFilters() {
    this.compareIds = [];
    this.query = '';
    this.el.search.value = '';
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

    this._renderList();
    this._renderCompare();
    this._renderSummary();
    this._renderBuy();
    this._renderHud();
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
    header.innerHTML = `<span>${CATEGORIES.find(c => c.id === cat).label}</span>
      ${installed ? `<button class="link-btn" data-remove="${cat}">Remove</button>` : ''}`;
    this.el.list.appendChild(header);

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'list-empty';
      empty.textContent = 'No parts match your search.';
      this.el.list.appendChild(empty);
      return;
    }

    for (const part of list) {
      const isInstalled = installed && installed.id === part.id;
      const inCompare = this.compareIds.includes(part.id);
      const card = document.createElement('button');
      card.className = 'part-card' + (isInstalled ? ' installed' : '') + (inCompare ? ' comparing' : '');
      card.innerHTML = `
        <div class="part-main">
          <span class="part-name">${part.name}</span>
          <span class="part-spec">${SPEC_FMT[cat] ? SPEC_FMT[cat](part) : ''}</span>
        </div>
        <span class="part-price">${formatPrice(part.price)}</span>
        <span class="cmp-toggle${inCompare ? ' on' : ''}" title="Add to comparison" role="button" tabindex="0">⇄</span>`;
      card.addEventListener('click', () => this._install(cat, part.id));
      const toggle = card.querySelector('.cmp-toggle');
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        this._toggleCompare(part.id);
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

  _toggleCompare(partId) {
    const i = this.compareIds.indexOf(partId);
    if (i >= 0) {
      this.compareIds.splice(i, 1);
    } else {
      this.compareIds.push(partId);
      if (this.compareIds.length > MAX_COMPARE) this.compareIds.shift();
    }
    this._renderList();
    this._renderCompare();
  }

  _compatIssues(category, part) {
    const build = { ...this.store.build, [category]: part };
    return evaluateCompatibility(build).filter(c => c.level === 'error' || c.level === 'warn');
  }

  _renderCompare() {
    const box = this.el.compare;
    const cat = this.activeCategory;
    const parts = this.compareIds
      .map(id => (PARTS[cat] || []).find(p => p.id === id))
      .filter(Boolean);

    if (parts.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;

    const fields = COMPARE_FIELDS[cat] || [];
    const cheapest = Math.min(...parts.map(p => p.price));

    const head = document.createElement('div');
    head.className = 'compare-head';
    head.innerHTML = `<span class="cmp-title">⇄ Compare ${parts.length}</span>
      <button class="cmp-clear" type="button">Clear</button>`;

    const table = document.createElement('table');
    table.className = 'compare-table';

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    hr.innerHTML = '<th class="cmp-rowlabel"></th>';
    for (const p of parts) {
      const issues = this._compatIssues(cat, p);
      const badge = issues.length
        ? `<span class="cmp-badge ${issues.some(i => i.level === 'error') ? 'error' : 'warn'}" title="${issues.map(i => `${i.label}: ${i.detail}`).join('\n')}">${issues.length} issue${issues.length > 1 ? 's' : ''}</span>`
        : '';
      const th = document.createElement('th');
      th.innerHTML = `
        <button class="cmp-pick" type="button" title="Install ${p.name}">
          <span class="cmp-name">${p.name}</span>
          <span class="cmp-price${p.price === cheapest ? ' cheap' : ''}">${formatPrice(p.price)}</span>
          ${badge}
        </button>
        <button class="cmp-drop" type="button" title="Remove from comparison">×</button>`;
      th.querySelector('.cmp-pick').addEventListener('click', () => this._install(cat, p.id));
      th.querySelector('.cmp-drop').addEventListener('click', () => this._toggleCompare(p.id));
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const [label, get] of fields) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<th class="cmp-rowlabel">${label}</th>`;
      const values = parts.map(get);
      for (let i = 0; i < parts.length; i++) {
        const td = document.createElement('td');
        td.textContent = values[i];
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    box.innerHTML = '';
    box.appendChild(head);
    box.appendChild(table);
    head.querySelector('.cmp-clear').addEventListener('click', () => {
      this.compareIds = [];
      this._renderList();
      this._renderCompare();
    });
  }

  _renderSummary() {
    const { store } = this;
    this.el.totalPrice.textContent = formatPrice(store.totalPrice);

    const installedCount = store.categories.filter(c => store.build[c]).length;
    this.el.partCount.textContent = `${installedCount} / ${store.categories.length} parts`;

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
    this.el.powerText.textContent = cap ? `${draw} W / ${cap} W` : `${draw} W estimated`;

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
        <span class="build-name">${part ? part.name : 'Not selected'}</span>
        <span class="build-price">${part ? formatPrice(part.price) : '—'}</span>`;
      row.addEventListener('click', () => {
        this.activeCategory = cat;
        this._clearFilters();
        this.selected = part ? { category: cat, partId: part.id } : null;
        if (part) this.viewer.highlight(cat);
        this.viewer.focusOn(cat);
        this.render();
      });
      this.el.buildList.appendChild(row);
    }
  }

  _renderBuy() {
    const { store } = this;
    const box = this.el.buy;
    const missing = store.categories.filter(c => !store.build[c]);

    if (missing.length) {
      const names = missing.map(id => CATEGORIES.find(c => c.id === id).label).join(' · ');
      box.innerHTML = `
        <div class="buy-intro">Finish your build to see where to buy every part in the UAE.</div>
        <div class="buy-missing"><b>Still needed:</b> ${names}</div>`;
      return;
    }

    const errors = store.compatibility.filter(c => c.level === 'error');
    const warnings = store.compatibility.filter(c => c.level === 'warn');
    let notice;
    if (errors.length) {
      notice = `<div class="buy-intro bad">⚠ ${errors.length} compatibility issue${errors.length > 1 ? 's' : ''} — fix before ordering.</div>`;
    } else if (warnings.length) {
      notice = `<div class="buy-intro warn">Complete build with ${warnings.length} warning${warnings.length > 1 ? 's' : ''}.</div>`;
    } else {
      notice = `<div class="buy-intro ok">✓ Build complete &amp; compatible — shop the list below.</div>`;
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
      <div class="buy-total"><span>Parts subtotal</span><span>${formatPrice(store.totalPrice)}</span></div>
      <div class="buy-disclaimer">Indicative UAE retail prices in AED (incl. VAT). Availability and final price vary by retailer.</div>`;
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
    hud.classList.add('visible');
    hud.innerHTML = `
      <div class="hud-tag">${meta.icon} ${meta.label}</div>
      <div class="hud-name">${part.name}</div>
      <div class="hud-spec">${SPEC_FMT[category] ? SPEC_FMT[category](part) : ''}</div>
      <div class="hud-row">
        <span class="hud-price">${formatPrice(part.price)}</span>
        <button class="hud-remove" id="hud-remove">Remove</button>
      </div>`;
    hud.querySelector('#hud-remove').addEventListener('click', () => {
      this.store.clear(category);
      this.selected = null;
      this.viewer.highlight(null);
    });
  }
}
