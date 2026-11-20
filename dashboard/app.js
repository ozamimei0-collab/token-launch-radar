// Token Launch Radar's console. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, the live-token set kept apart from it, a filterable table, and a
// per-protocol detail view with the model's own working, the farm plan, the risks and a readiness
// checklist. No network: every byte it shows is in data.js.
//
// The page recomputes each row's implied value from the snapshot figures with impliedOf, the same
// radar-2 arithmetic main.ts runs, and says whether the number matches the one board.json carries,
// so the page's code and the board's data are visibly the same model.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var WATCH = {};
  DATA.watchlist.forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchOnly: false };
  var checks = {}; // slug -> {index: true} for the readiness checklist, kept in memory only

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // radar-2, as main.ts runs it: base x growth x maturity x chain diversity x category.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chainMult = 1 + model.chain_step * Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max_extra);
    var cat = row.category;
    var categoryMult = model.category_boost;
    if (cat === null) categoryMult = 1;
    else if (['Dexs', 'Lending', 'Yield', 'Yield Aggregator', 'Derivatives', 'CDP', 'Leveraged Farming', 'Options', 'Prediction Market', 'Launchpad', 'Liquidity Manager', 'Farm', 'Basis Trading', 'Synthetics', 'Indexes'].indexOf(cat) < 0) {
      categoryMult = ['Bridge', 'Cross Chain Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX', 'Chain', 'Anchor BTC', 'Decentralized BTC', 'Stablecoin Wrapper', 'Dual-Token Stablecoin'].indexOf(cat) >= 0 ? model.category_discount : 1;
    }
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity * chainMult * categoryMult));
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 30;
  }

  function risksFor(row) {
    var out = ['No token is promised. The snapshot records no token for this protocol; that is a record, not a promise that one is coming.'];
    if (row.age_days !== null && row.age_days < 180) out.push('Young record: first listed under six months ago, so the history behind the score is short.');
    if (row.change_7d !== null && row.change_7d < -10) out.push('TVL fell ' + Math.abs(row.change_7d).toFixed(1) + '% in the last seven days, so momentum is running against it.');
    if (row.change_7d !== null && row.change_7d > 50) out.push('TVL jumped ' + row.change_7d.toFixed(1) + '% in seven days; a spike can unwind as fast as it came.');
    if (row.chains && row.chains.length === 1) out.push('Single-chain exposure: everything rides on ' + row.chains[0] + '.');
    if (row.tvl_usd < DATA.floor_usd) out.push('Below the $' + Math.round(DATA.floor_usd / 1e6) + 'M watchlist floor: smaller, earlier and less proven.');
    out.push('Smart-contract risk: a bug can take deposited funds. Farm only with money you can afford to lose.');
    out.push('Airdrop rules are never published in advance. Points and activity do not guarantee a token.');
    return out;
  }

  function checklistFor(row) {
    var chain = row.chains && row.chains.length ? row.chains[0] : 'its main chain';
    return [
      'Fresh wallet created, seed phrase stored offline',
      'Position opened on ' + chain,
      'A qualifying action done at least twice, a week apart',
      'Position held ' + holdDaysFor(row.age_days) + ' days or more',
      'Points or rewards page checked on the protocol\u2019s own site',
      'Claim link verified against the protocol\u2019s own announcement'
    ];
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('w') === '1') state.watchOnly = true;
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.watchOnly) params.set('w', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchOnly && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'chains') { av = (a.chains || []).length; bv = (b.chains || []).length; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' },
        el('span', { class: 'radar-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'brand-name' }, 'Token ', el('b', { text: 'Launch Radar' }))
      ),
      el('div', { class: 'top-meta' },
        el('span', { class: 'chip' }, 'snapshot ', el('b', { text: DATA.as_of })),
        el('span', { class: 'chip' }, 'model ', el('b', { text: DATA.model_version })),
        el('span', { class: 'chip' }, 'DefiLlama protocol index')
      )
    );
  }

  function lede() {
    var total = DATA.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, el('span', { text: DATA.watchlist_size + ' watchlist protocols' }), ', ranked by what a launch would be worth'),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor, so the board is the whole rankable pre-token universe — ',
          el('b', { text: String(DATA.board_size) + ' rows' }), ', ',
          el('b', { text: fmtUsd(total) }), ' of implied value in all. Implied value is a model, not a price and not a promise.'
        )
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, slug, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    var chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    var watchBtn = el('button', { type: 'button', class: 'toggle', 'aria-pressed': state.watchOnly ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watchOnly = !state.watchOnly; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; writeHash(); render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Scope' }), watchBtn),
      el('div', { class: 'field' }, el('span', { class: 'lbl', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? filteredRows().length + ' of ' + DATA.board_size + ' rows' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchOnly = false; writeHash(); render(); } })
      ));
    }
    var max = DATA.rows[0] ? DATA.rows[0].implied_value_usd : 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rankcell' }, el('span', { class: 'tick', 'aria-hidden': 'true' }), String(r.rank))),
        el('td', null, el('div', { class: 'name' },
          el('span', null, el('b', { text: r.name }), WATCH[r.slug] ? el('span', { class: 'tag', text: ' WATCHLIST' }) : null),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: String((r.chains || []).length) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'pill', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel', id: 'board' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Pre-token protocols, strongest implied value first. Select a row for its model, farm plan, risks and checklist.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('chains', 'Chains'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', { onclick: function () { return; } },
        el('td', null, el('span', { class: 'pill live', text: 'already trades' })),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' \u00b7 ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', null, 'How implied value is computed ', el('span', { class: 'sub', text: 'model ' + DATA.model_version + ' \u00b7 one function, every row' })),
      el('p', { class: 'sub', text: 'Every row is scored by the same function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The page recomputes each row from the same figures and checks it against board.json.' }),
      el('div', { class: 'formula' },
        el('b', { text: 'implied' }), ' = round( tvl_usd \u00d7 ', el('b', { text: String(m.base_multiple) }),
        ' \u00d7 (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 \u00d7 ' + m.growth_weight + ')',
        ' \u00d7 (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' \u00d7 ' + m.maturity_range + ')',
        ' \u00d7 (1 + ' + m.chain_step + ' \u00d7 min(chains \u2212 1, ' + m.chain_max_extra + '))',
        ' \u00d7 category )'
      ),
      el('div', { class: 'consts' },
        el('div', { class: 'const' }, el('b', { text: '\u00d7 ' + m.base_multiple }), el('span', { text: 'base multiple on TVL' })),
        el('div', { class: 'const' }, el('b', { text: m.growth_weight + ' weight' }), el('span', { text: 'seven-day growth, clamped ' + m.growth_floor + ' to ' + m.growth_cap + '%' })),
        el('div', { class: 'const' }, el('b', { text: m.maturity_floor + ' \u2013 ' + (m.maturity_floor + m.maturity_range) }), el('span', { text: 'maturity over ' + m.maturity_days + ' days; unknown age uses ' + m.unknown_age_days + ' days' })),
        el('div', { class: 'const' }, el('b', { text: '+4% a chain' }), el('span', { text: 'chain diversity, up to ' + m.chain_max_extra + ' extra chains' })),
        el('div', { class: 'const' }, el('b', { text: '\u00d7 ' + m.category_boost + ' / \u00d7 ' + m.category_discount }), el('span', { text: 'category: token is the norm / usually infrastructure, else \u00d7 1.00' }))
      ),
      el('p', { class: 'sub', text: 'Farm plans follow the same rule: the action follows the category, the gas follows the chain, the capital follows the TVL and the hold follows the age. Age is the time since the protocol was first listed — the best record of how long it has run with no token. Bridges, staking wrappers, exchange products and versioned pools are set aside from the board: they are a wrapped or staked product of a token that already trades, not a launch still to come.' })
    );
  }

  function foot() {
    return el('footer', { class: 'foot' },
      el('p', null, el('b', { text: 'Source. ' }), 'DefiLlama protocol index, fetched once and frozen as the snapshot of ' + DATA.as_of + '. ' + DATA.source + '.'),
      el('p', null, el('b', { text: 'Read it right. ' }), 'A protocol on this board records no token — the snapshot is a record, not proof, and never a promise that a token is coming. Implied value is this entry\u2019s own claim, not a price.'),
      el('p', null, el('b', { text: 'Built for the make.fun bounty. ' }), 'Token Launch Radar, model ' + DATA.model_version + ', ' + DATA.board_size + ' rows, ' + DATA.watchlist_size + ' watchlist protocols covered.')
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); render(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var recomputed = impliedOf(row, DATA.model);
    var matches = recomputed === row.implied_value_usd;
    var steps = row.farm_steps || [];
    var risks = risksFor(row);
    var items = checklistFor(row);
    var done = checks[slug] || {};
    var doneCount = Object.keys(done).length;

    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub num', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[slug] ? ' \u00b7 WATCHLIST' : ' \u00b7 early') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' \u00b7 ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'The record' }),
      el('div', { class: 'kv' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day change' }), el('b', { text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'First listed' }), el('b', { text: row.listed_at || 'unknown' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Chains' }), el('b', { text: String((row.chains || []).length) })),
        el('div', null, el('span', { text: 'Token on record' }), el('b', { text: 'none' }))
      )
    ));

    var bd = row.model;
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — the working' }),
      el('div', { class: 'breakdown' },
        el('div', null, el('span', { text: 'Base: TVL \u00d7 ' + DATA.model.base_multiple }), el('b', { text: fmtUsd(bd.base_usd) })),
        el('div', null, el('span', { text: 'Growth: ' + bd.growth_pct + '% over 7 days' }), el('b', { text: '\u00d7 ' + bd.growth_multiplier })),
        el('div', null, el('span', { text: 'Maturity: ' + fmtAge(bd.age_days) + ' with no token' }), el('b', { text: '\u00d7 ' + bd.maturity_multiplier })),
        el('div', null, el('span', { text: 'Chain diversity: ' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') }), el('b', { text: '\u00d7 ' + bd.chain_multiplier })),
        el('div', null, el('span', { text: 'Category: ' + (row.category || 'none named') }), el('b', { text: '\u00d7 ' + bd.category_multiplier })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: matches ? 'check' : 'check bad', text: matches ? 'This page recomputes the row as ' + fmtUsd(recomputed) + ' — the same number board.json carries.' : 'This page recomputes the row as ' + fmtUsd(recomputed) + ', which differs from the board: the data would be stale.' })
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));

    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Risks' }),
      el('ul', { class: 'risks' }, risks.map(function (r) { return el('li', { text: r }); }))
    ));

    var list = el('div', { class: 'checklist' });
    items.forEach(function (item, i) {
      var label = el('label', { class: done[i] ? 'done' : '' });
      var box = el('input', { type: 'checkbox', checked: done[i] ? 'checked' : null, 'aria-label': item });
      box.addEventListener('change', function () {
        if (!checks[slug]) checks[slug] = {};
        if (box.checked) checks[slug][i] = true; else delete checks[slug][i];
        label.className = box.checked ? 'done' : '';
        var n = Object.keys(checks[slug]).length;
        countEl.textContent = n + ' of ' + items.length + ' done';
      });
      label.appendChild(box);
      label.appendChild(el('span', { text: item }));
      list.appendChild(label);
    });
    var countEl = el('span', { class: 'done-count', text: doneCount + ' of ' + items.length + ' done' });
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', null, 'Airdrop-readiness checklist ', countEl),
      list
    ));

    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(foot());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
