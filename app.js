/* ============================================================================
   Despensa — App
   Estado mínimo, render direto, persistência em localStorage por compra.
   ============================================================================ */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Estado
  // -------------------------------------------------------------------------
  const state = {
    purchases: [],          // [{ filename, label, date, parsed? }]
    currentPurchaseIdx: 0,
    parsed: null,           // resultado do parser pra compra atual
    listState: {},          // { [code]: { inStock, toBuy } } — persistido
    filter: 'all',
    search: ''
  };

  const MONTHS_PT = {
    JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5,
    JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11
  };
  const MONTHS_PT_FULL = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
  ];
  const MONTHS_PT_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const fmtBRL = v => `R$ ${(v ?? 0).toFixed(2).replace('.', ',')}`;
  const fmtQty = (qty, unit) => {
    if (unit === 'KG') return `${qty.toFixed(3).replace('.', ',')} kg`;
    if (qty === Math.floor(qty)) return `${qty} ${unit.toLowerCase()}`;
    return `${qty.toFixed(2).replace('.', ',')} ${unit.toLowerCase()}`;
  };

  function parseFilenameLabel(filename) {
    // Padrão esperado: compra_28MAR.pdf -> { day: 28, month: 2 (MAR) }
    const m = filename.match(/compra_(\d{1,2})([A-Z]{3})(?:_?(\d{4}))?\.pdf$/i);
    if (!m) return { label: filename.replace('.pdf', ''), day: null, month: null, year: null };
    const day = parseInt(m[1], 10);
    const monthKey = m[2].toUpperCase();
    const month = MONTHS_PT[monthKey];
    const year = m[3] ? parseInt(m[3], 10) : null;
    return {
      label: `${day} de ${MONTHS_PT_FULL[month] ?? monthKey.toLowerCase()}${year ? ' de ' + year : ''}`,
      shortLabel: `${day} ${MONTHS_PT_SHORT[month] ?? monthKey.toLowerCase()}`,
      day,
      month,
      year
    };
  }

  function ensurePdfJsReady() {
    return new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve();
      // Polling defensivo: o bundle vendorado deveria carregar antes de app.js,
      // mas em caso de hiccup esperamos até 5s antes de falhar
      let waited = 0;
      const interval = setInterval(() => {
        if (window.pdfjsLib) {
          clearInterval(interval);
          resolve();
        } else if ((waited += 100) >= 5000) {
          clearInterval(interval);
          reject(new Error('PDF.js não carregou. Verifique se vendor/pdfjs/ existe.'));
        }
      }, 100);
    });
  }

  function showState(name) {
    document.getElementById('loadingState').hidden = name !== 'loading';
    document.getElementById('emptyState').hidden = name !== 'empty';
    document.getElementById('errorState').hidden = name !== 'error';
    document.getElementById('purchaseView').hidden = name !== 'view';
  }

  function showToast(msg, ms = 2200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, ms);
  }

  // -------------------------------------------------------------------------
  // Persistência
  // -------------------------------------------------------------------------
  function listStateKey(filename) { return `despensa:list:${filename}`; }

  function loadListState(filename) {
    try {
      const raw = localStorage.getItem(listStateKey(filename));
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
  function saveListState(filename, st) {
    try { localStorage.setItem(listStateKey(filename), JSON.stringify(st)); } catch {}
  }

  // -------------------------------------------------------------------------
  // Carregamento de manifest e PDFs
  // -------------------------------------------------------------------------
  async function loadManifest() {
    const res = await fetch('compras/manifest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`manifest.json não encontrado (${res.status})`);
    const data = await res.json();
    const files = Array.isArray(data) ? data : (data.files || []);
    return files.map(f => {
      const fname = typeof f === 'string' ? f : f.filename;
      const meta = parseFilenameLabel(fname);
      return {
        filename: fname,
        ...meta,
        // sortKey: ano (ou ano atual) + mês + dia
        sortKey: `${meta.year ?? new Date().getFullYear()}-${String((meta.month ?? 0) + 1).padStart(2, '0')}-${String(meta.day ?? 0).padStart(2, '0')}`
      };
    }).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }

  async function fetchAndParse(filename) {
    const res = await fetch(`compras/${filename}`, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`Não consegui baixar ${filename}`);
    const ab = await res.arrayBuffer();
    return window.NFCeParser.parseNFCe(ab);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  function render() {
    if (!state.parsed) return;
    renderHeader();
    renderSummary();
    renderCategories();
    renderFab();
  }

  function renderHeader() {
    const p = state.purchases[state.currentPurchaseIdx];
    document.getElementById('currentPurchaseLabel').textContent = p?.shortLabel ?? p?.label ?? '—';
  }

  function renderSummary() {
    const items = state.parsed.items;
    const total = items.reduce((s, it) => s + it.totalValue, 0);
    const occurrences = state.parsed.stats.rawCount;
    document.getElementById('summaryTotal').textContent = fmtBRL(total);
    document.getElementById('summaryItemsCount').textContent =
      `${items.length} produtos · ${occurrences} unidades`;

    const toBuyAgg = computeToBuyTotals();
    document.getElementById('summaryToBuy').textContent = fmtBRL(toBuyAgg.totalValue);
    document.getElementById('summaryToBuyCount').textContent =
      `${toBuyAgg.itemCount} ${toBuyAgg.itemCount === 1 ? 'item' : 'itens'} para repor`;
  }

  function computeToBuyTotals() {
    let total = 0, count = 0;
    for (const it of state.parsed.items) {
      const st = state.listState[it.code] ?? defaultItemState(it);
      if (st.toBuy > 0) {
        total += st.toBuy * it.avgUnitValue;
        count += 1;
      }
    }
    return { totalValue: total, itemCount: count };
  }

  function defaultItemState(item) {
    // por padrão, "pra comprar" = quantidade comprada na última vez (arredonda
    // para cima pra unidades; mantém decimal para KG)
    const previousQty = item.unit === 'KG' ? item.qty : Math.round(item.qty);
    return { inStock: 0, toBuy: previousQty };
  }

  function getItemState(item) {
    if (!state.listState[item.code]) {
      state.listState[item.code] = defaultItemState(item);
    }
    return state.listState[item.code];
  }

  function setItemState(item, patch) {
    const cur = getItemState(item);
    state.listState[item.code] = { ...cur, ...patch };
    const p = state.purchases[state.currentPurchaseIdx];
    saveListState(p.filename, state.listState);
  }

  function renderCategories() {
    const container = document.getElementById('categoriesContainer');
    container.innerHTML = '';

    // agrupar por categoria
    const groups = new Map();
    for (const item of state.parsed.items) {
      const cat = window.NCMCategories.categorize(item);
      if (!groups.has(cat.id)) groups.set(cat.id, { cat, items: [] });
      groups.get(cat.id).items.push(item);
    }

    // ordenar categorias
    const ordered = [...groups.values()].sort((a, b) =>
      window.NCMCategories.categoryOrder(a.cat.id) - window.NCMCategories.categoryOrder(b.cat.id)
    );

    const search = state.search.toLowerCase().trim();
    const fragment = document.createDocumentFragment();

    for (const group of ordered) {
      const visibleItems = group.items.filter(item => itemMatchesFilter(item, search));
      if (visibleItems.length === 0) continue;

      const catEl = document.createElement('section');
      catEl.className = 'category';

      const header = document.createElement('div');
      header.className = 'category__header';
      header.innerHTML = `
        <span class="category__icon">${group.cat.icon}</span>
        <span class="category__name">${escapeHtml(group.cat.name)}</span>
        <span class="category__count">${visibleItems.length}</span>
      `;
      catEl.appendChild(header);

      const ul = document.createElement('ul');
      ul.className = 'items';
      for (const item of visibleItems) ul.appendChild(renderItem(item));
      catEl.appendChild(ul);

      fragment.appendChild(catEl);
    }

    container.appendChild(fragment);

    if (!container.children.length) {
      const empty = document.createElement('div');
      empty.className = 'state-panel';
      empty.innerHTML = `<p style="color:var(--ink-muted)">Nenhum item corresponde à busca.</p>`;
      container.appendChild(empty);
    }
  }

  function itemMatchesFilter(item, search) {
    if (search && !item.description.toLowerCase().includes(search)) return false;
    const st = getItemState(item);
    if (state.filter === 'pending' && st.toBuy <= 0) return false;
    if (state.filter === 'ok' && st.toBuy > 0) return false;
    return true;
  }

  function renderItem(item) {
    const st = getItemState(item);
    const isOk = st.toBuy <= 0;

    const li = document.createElement('li');
    li.className = 'item' + (isOk ? ' is-ok' : '');
    li.dataset.code = item.code;

    const isKg = item.unit === 'KG';
    const stepStr = isKg ? '0,1' : '1';

    li.innerHTML = `
      <div class="item__main">
        <div class="item__name ${isOk ? 'is-struck' : ''}">${escapeHtml(item.description)}</div>
        <div class="item__meta">
          <span>Comprou <strong>${fmtQty(item.qty, item.unit)}</strong></span>
          <span>·</span>
          <span><strong>${fmtBRL(item.avgUnitValue)}</strong>/${isKg ? 'kg' : 'un'}</span>
        </div>
        <span class="item__status ${isOk ? 'item__status--ok' : 'item__status--pending'}">
          ${isOk ? '✓ Tenho suficiente' : `Comprar ${fmtQty(st.toBuy, item.unit)}`}
        </span>
      </div>
      <div class="item__controls">
        <div class="qty-control" data-role="toBuy">
          <button class="qty-control__btn" data-action="dec" aria-label="Diminuir">−</button>
          <input class="qty-control__input" type="text" inputmode="decimal" value="${formatInput(st.toBuy, isKg)}" />
          <button class="qty-control__btn" data-action="inc" aria-label="Aumentar">+</button>
        </div>
        <span class="qty-label">comprar</span>
      </div>
    `;

    // listeners
    const ctrl = li.querySelector('.qty-control');
    const input = ctrl.querySelector('.qty-control__input');
    ctrl.querySelector('[data-action="dec"]').addEventListener('click', () => {
      const cur = parseInputValue(input.value);
      const next = Math.max(0, +(cur - (isKg ? 0.1 : 1)).toFixed(3));
      setItemState(item, { toBuy: next });
      render();
    });
    ctrl.querySelector('[data-action="inc"]').addEventListener('click', () => {
      const cur = parseInputValue(input.value);
      const next = +(cur + (isKg ? 0.1 : 1)).toFixed(3);
      setItemState(item, { toBuy: next });
      render();
    });
    input.addEventListener('change', () => {
      const v = Math.max(0, parseInputValue(input.value));
      setItemState(item, { toBuy: v });
      render();
    });
    input.addEventListener('focus', () => input.select());

    return li;
  }

  function formatInput(v, isKg) {
    if (isKg) return v.toString().replace('.', ',');
    return Number.isInteger(v) ? String(v) : v.toString().replace('.', ',');
  }
  function parseInputValue(s) {
    const v = parseFloat(String(s).replace(',', '.'));
    return isNaN(v) ? 0 : v;
  }

  function renderFab() {
    const fab = document.getElementById('btnViewList');
    const totals = computeToBuyTotals();
    document.getElementById('fabCount').textContent = totals.itemCount;
    fab.dataset.empty = totals.itemCount === 0 ? 'true' : 'false';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // -------------------------------------------------------------------------
  // Modais
  // -------------------------------------------------------------------------
  function openModal(id) {
    const m = document.getElementById(id);
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const m = document.getElementById(id);
    m.hidden = true;
    document.body.style.overflow = '';
  }

  function renderPurchaseList() {
    const ul = document.getElementById('purchaseList');
    ul.innerHTML = '';
    state.purchases.forEach((p, idx) => {
      const li = document.createElement('li');
      li.className = 'purchase-list__item' + (idx === state.currentPurchaseIdx ? ' is-active' : '');
      li.innerHTML = `
        <div class="purchase-list__date">
          <span class="purchase-list__day">${p.day ?? '?'}</span>
          <span class="purchase-list__month">${MONTHS_PT_SHORT[p.month] ?? '—'}</span>
        </div>
        <div class="purchase-list__info">
          <div class="purchase-list__name">${escapeHtml(p.label)}</div>
          <div class="purchase-list__meta">${escapeHtml(p.filename)}</div>
        </div>
      `;
      li.addEventListener('click', async () => {
        closeModal('purchaseModal');
        if (idx === state.currentPurchaseIdx) return;
        await selectPurchase(idx);
      });
      ul.appendChild(li);
    });
  }

  function renderShoppingList() {
    const container = document.getElementById('shoppingListContent');
    container.innerHTML = '';

    const lines = [];
    for (const item of state.parsed.items) {
      const st = getItemState(item);
      if (st.toBuy > 0) {
        lines.push({
          item,
          state: st,
          cat: window.NCMCategories.categorize(item)
        });
      }
    }

    if (lines.length === 0) {
      container.innerHTML = `
        <div class="shopping-list__empty">
          <div class="shopping-list__empty-icon">✨</div>
          <p>Sua despensa está cheia! Nenhum item para comprar agora.</p>
        </div>
      `;
      return;
    }

    // agrupar por categoria
    const groups = new Map();
    for (const ln of lines) {
      if (!groups.has(ln.cat.id)) groups.set(ln.cat.id, { cat: ln.cat, lines: [] });
      groups.get(ln.cat.id).lines.push(ln);
    }
    const ordered = [...groups.values()].sort((a, b) =>
      window.NCMCategories.categoryOrder(a.cat.id) - window.NCMCategories.categoryOrder(b.cat.id)
    );

    let total = 0;
    for (const g of ordered) {
      const title = document.createElement('h3');
      title.className = 'shopping-list__category-title';
      title.innerHTML = `${g.cat.icon} ${escapeHtml(g.cat.name)}`;
      container.appendChild(title);

      for (const ln of g.lines) {
        const lineEl = document.createElement('div');
        lineEl.className = 'shopping-list__line';
        const subTotal = ln.state.toBuy * ln.item.avgUnitValue;
        total += subTotal;
        lineEl.innerHTML = `
          <span class="shopping-list__line-name">
            ${escapeHtml(ln.item.description)}
            <small style="display:block;color:var(--ink-muted);font-size:11px;margin-top:2px">
              ~${fmtBRL(subTotal)}
            </small>
          </span>
          <span class="shopping-list__line-qty">${fmtQty(ln.state.toBuy, ln.item.unit)}</span>
        `;
        container.appendChild(lineEl);
      }
    }

    const totalEl = document.createElement('div');
    totalEl.className = 'shopping-list__total';
    totalEl.innerHTML = `<span>Estimado</span><span>${fmtBRL(total)}</span>`;
    container.appendChild(totalEl);
  }

  function buildShareableText() {
    const lines = [];
    const purchase = state.purchases[state.currentPurchaseIdx];
    lines.push(`🛒 Lista de compras — base: ${purchase.label}`);
    lines.push('');

    const items = [];
    for (const item of state.parsed.items) {
      const st = getItemState(item);
      if (st.toBuy > 0) items.push({ item, st, cat: window.NCMCategories.categorize(item) });
    }

    const groups = new Map();
    for (const ln of items) {
      if (!groups.has(ln.cat.id)) groups.set(ln.cat.id, { cat: ln.cat, lines: [] });
      groups.get(ln.cat.id).lines.push(ln);
    }
    const ordered = [...groups.values()].sort((a, b) =>
      window.NCMCategories.categoryOrder(a.cat.id) - window.NCMCategories.categoryOrder(b.cat.id)
    );

    let total = 0;
    for (const g of ordered) {
      lines.push(`*${g.cat.name}*`);
      for (const ln of g.lines) {
        const sub = ln.st.toBuy * ln.item.avgUnitValue;
        total += sub;
        lines.push(`• ${ln.item.description} — ${fmtQty(ln.st.toBuy, ln.item.unit)}`);
      }
      lines.push('');
    }
    lines.push(`Estimado: ${fmtBRL(total)}`);
    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Filtros
  // -------------------------------------------------------------------------
  function bindFilters() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        state.filter = chip.dataset.filter;
        renderCategories();
      });
    });
    document.getElementById('searchInput').addEventListener('input', e => {
      state.search = e.target.value;
      renderCategories();
    });
  }

  // -------------------------------------------------------------------------
  // Inicialização
  // -------------------------------------------------------------------------
  async function selectPurchase(idx) {
    state.currentPurchaseIdx = idx;
    const p = state.purchases[idx];
    showState('loading');
    try {
      if (!p.parsed) p.parsed = await fetchAndParse(p.filename);
      state.parsed = p.parsed;
      state.listState = loadListState(p.filename);
      // Inicializa estado para itens novos
      for (const item of state.parsed.items) {
        if (!state.listState[item.code]) state.listState[item.code] = defaultItemState(item);
      }
      saveListState(p.filename, state.listState);
      showState('view');
      render();
    } catch (err) {
      console.error(err);
      document.getElementById('errorMessage').textContent = err.message || 'Erro ao processar a nota.';
      showState('error');
    }
  }

  async function init() {
    await ensurePdfJsReady();
    showState('loading');

    let purchases;
    try {
      purchases = await loadManifest();
    } catch (err) {
      console.error(err);
      document.getElementById('errorMessage').textContent =
        'Não encontrei o manifest.json. Veja o README do projeto.';
      showState('error');
      return;
    }

    if (!purchases.length) {
      showState('empty');
      return;
    }

    state.purchases = purchases;
    bindUI();
    bindFilters();
    await selectPurchase(0);
  }

  function bindUI() {
    document.getElementById('btnSelectPurchase').addEventListener('click', () => {
      renderPurchaseList();
      openModal('purchaseModal');
    });

    document.getElementById('btnViewList').addEventListener('click', () => {
      if (document.getElementById('btnViewList').dataset.empty === 'true') {
        showToast('Sua lista está vazia 🌿');
        return;
      }
      renderShoppingList();
      openModal('shoppingListModal');
    });

    // fechar modais
    document.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => {
        const modal = el.closest('.modal');
        if (modal) closeModal(modal.id);
      });
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal:not([hidden])').forEach(m => closeModal(m.id));
      }
    });

    // ações da lista
    document.getElementById('btnCopyList').addEventListener('click', async () => {
      const text = buildShareableText();
      try {
        await navigator.clipboard.writeText(text);
        showToast('Lista copiada ✓');
      } catch {
        showToast('Não consegui copiar :(');
      }
    });

    document.getElementById('btnShareList').addEventListener('click', async () => {
      const text = buildShareableText();
      if (navigator.share) {
        try {
          await navigator.share({ title: 'Lista de compras', text });
        } catch {/* user canceled */}
      } else {
        try {
          await navigator.clipboard.writeText(text);
          showToast('Compartilhamento indisponível — lista copiada ✓');
        } catch {
          showToast('Não consegui compartilhar :(');
        }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
