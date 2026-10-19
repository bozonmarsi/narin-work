(function () {
  'use strict';
  if (window.__npayInit) return;
  window.__npayInit = 1;

  var SB = 'https://wqburlamuipxmenqsjnx.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndxYnVybGFtdWlweG1lbnFzam54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTY2MTIsImV4cCI6MjA4ODgzMjYxMn0.NYnQoorm3z5gkjr954JdYhzDNmYfCjefzK1ddq3cflw';
  var PUB = 'sb_publishable_ORMmBYvVjH6i2GanWa2JyA_mWm3fTCZ';
  var PLACES_KEY = 'AIzaSyDEuFdJdQRQSrxlkZO_hc2hvZAhGACJ3IU';
  var CART_ID = 'rec1915296063', FORM_ID = 'form1915296063';
  var CFG = { wh: { lat: 50.0710426, lng: 14.4883401 }, base: 159, service: 80, free: 14, perKm: 18, maxKm: 40 };
  var SLOTS = ['9-12', '12-15', '15-18', '18-20'];
  var TIMES = []; for (var h = 9; h <= 20; h++) { TIMES.push((h < 10 ? '0' : '') + h + ':00'); if (h < 20) TIMES.push((h < 10 ? '0' : '') + h + ':30'); }
  var DRAFT_KEY = 'npay_draft_v2';
  var WD = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  var MONTH_SHORT = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
  var CAPTIONS = { '9-12': 'dopoledne', '12-15': 'poledne', '15-18': 'odpoledne', '18-20': 'podvečer' };
  var MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
  var DAYS_LONG = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

  /* ---------- helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kc(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0Kč'; }
  function reduceMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  /* money that counts up/down instead of jumping */
  function setMoney(el, val) {
    if (!el) return;
    var to = Math.round(Number(val) || 0), from = el.__v;
    el.__v = to;
    if (from == null || from === to || reduceMotion()) { el.textContent = kc(to); return; }
    var delay = S.tweenDelay || 0;
    cancelAnimationFrame(el.__raf); clearTimeout(el.__to);
    el.__to = setTimeout(function () {
      var t0 = performance.now(), dur = 700;
      el.classList.remove('np-flash'); void el.offsetWidth; el.classList.add('np-flash');
      (function step(now) {
        var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = kc(from + (to - from) * e);
        if (p < 1) el.__raf = requestAnimationFrame(step); else el.textContent = kc(to);
      })(t0);
    }, delay);
  }
  function inView(r) { return r.width > 0 && r.top >= 0 && r.bottom <= (window.innerHeight || 800); }
  function totalTarget() {
    var a = $('#npTotal'), b = $('#npBarTot');
    if (a && inView(a.getBoundingClientRect())) return a;
    if (b && b.getBoundingClientRect().width > 0) return b;
    return a;
  }
  /* small reward: green chip flies from the button to the total, a few sparks, the card bounces */
  function celebrate(from, text) {
    if (reduceMotion() || !from || !ROOT) return;
    var tgt = totalTarget(); if (!tgt || !tgt.getBoundingClientRect) return;
    var tr = tgt.getBoundingClientRect(), x0 = from.left + from.width / 2, y0 = from.top + from.height / 2, x1 = tr.left + tr.width / 2, y1 = tr.top + tr.height / 2;
    var dx = x1 - x0, dy = y1 - y0;
    try {
      var chip = document.createElement('div'); chip.className = 'np-fly'; chip.textContent = text; chip.style.left = x0 + 'px'; chip.style.top = y0 + 'px';
      ROOT.appendChild(chip);
      var an = chip.animate([
        { transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.12)', opacity: 1, offset: .16 },
        { transform: 'translate(calc(-50% + ' + (dx * .45) + 'px), calc(-50% + ' + (dy * .45 - 46) + 'px)) scale(1)', opacity: 1, offset: .55 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.7)', opacity: 0 }
      ], { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)' });
      an.onfinish = function () { if (chip.parentNode) chip.parentNode.removeChild(chip); };
      var cols = ['#02e590', '#ffd56b', '#186ce0', '#02e590', '#ffd56b', '#ff2a20', '#186ce0', '#02e590'];
      for (var i = 0; i < 8; i++) {
        var d = document.createElement('i'); d.className = 'np-spark'; d.style.left = x0 + 'px'; d.style.top = y0 + 'px'; d.style.background = cols[i];
        ROOT.appendChild(d);
        var ang = (Math.PI * 2 * i) / 8 + .3, rad = 26 + (i % 3) * 10;
        (function (dd) {
          var a2 = dd.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(calc(-50% + ' + Math.cos(ang) * rad + 'px), calc(-50% + ' + Math.sin(ang) * rad + 'px)) scale(0)', opacity: 0 }], { duration: 600, easing: 'cubic-bezier(.2,.7,.3,1)' });
          a2.onfinish = function () { if (dd.parentNode) dd.parentNode.removeChild(dd); };
        })(d);
      }
    } catch (e) {}
    var c = $('.np-lcard'); if (c) { c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); }
  }
  function decode(s) { var t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dmy(isoStr) { var p = isoStr.split('-'); return p[2] + '-' + p[1] + '-' + p[0]; }
  function sod(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function addDays(d, n) { var x = sod(d); x.setDate(x.getDate() + n); return x; }
  function parseIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function longDate(isoStr) { var d = parseIso(isoStr); return DAYS_LONG[d.getDay()] + ' ' + d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear(); }
  function debounce(fn, ms) { var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); }; }
  function fire(el, types) { (types || ['input', 'change']).forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); }); }
  function waitFor(test, ms) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function tick() { var v; try { v = test(); } catch (e) { v = null; } if (v) return res(v); if (Date.now() - t0 > ms) return res(null); setTimeout(tick, 120); })();
    });
  }
  function sbGet(path) {
    return fetch(SB + '/rest/v1/' + path, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  }
  function sbRpc(name) {
    return fetch(SB + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, body: '{}' }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  }
  function fn(name, payload) {
    /* tilda-webhook answers CORS preflight only for Content-Type/Authorization (no apikey header), and has verify_jwt off */
    var hd = name === 'tilda-webhook' ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json', apikey: PUB, Authorization: 'Bearer ' + PUB };
    return fetch(SB + '/functions/v1/' + name, { method: 'POST', headers: hd, body: JSON.stringify(payload) }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  /* ---------- auth (same rules as the other site widgets) ---------- */
  function tildaProfile() {
    for (var k in localStorage) {
      if (k.indexOf('tilda_members_profile') === 0 && k.indexOf('_timestamp') === -1) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) {} }
    }
    return null;
  }
  function tokenEmail(t) { try { var p = JSON.parse(atob(String(t).split('.')[0])); return p.email ? String(p.email).trim().toLowerCase() : null; } catch (e) { return null; } }
  function authToken() {
    try {
      var raw = localStorage.getItem('lk_auth_token'); if (!raw) return null;
      var d = JSON.parse(raw); if (!d.token || !d.exp || d.exp < Date.now()) return null;
      var pr = tildaProfile(); var te = pr && (pr.login || pr.email); te = te ? String(te).trim().toLowerCase() : null;
      var ke = tokenEmail(d.token);
      if (te && ke && te !== ke) { localStorage.removeItem('lk_auth_token'); return null; }
      return d.token;
    } catch (e) { return null; }
  }

  /* ---------- state ---------- */
  var S = {
    mode: 'courier', adres: '', city: '', psc: '', floor: '', apt: '', intercom: '', lat: null, lng: null,
    date: null, slot: null, time: null,
    name: '', last: '', phone: '', email: '', isCompany: false, company: '', co: { ico: '', name: '', dic: '', addr: '', vat: false, ok: false, manual: false, loading: false, err: '', id: null, state: '' },
    same: false, rid: null, rname: '', rlast: '', rphone: '', comment: '',
    pcSender: 'name', pcTo: '', pcText: '',
    pay: 'stripe', consent: false,
    promo: { code: '', applied: false, busy: false },
    pts: { balance: null, sel: 100, applied: 0, busy: false },
    dep: { balance: 0, use: true, quote: null, err: '', loading: false },
    gift: null, noNum: false, showCal: false, accOpen: false, submitting: false, token: null, loggedIn: false
  };
  var AV = { weekdays: {}, dates: {}, slots: {}, available: null, special: null, specialDate: null, loaded: false };
  var cal = { y: 0, m: 0 };
  var ROOT;

  function saveDraft() {
    try {
      var d = {}; ['mode', 'adres', 'city', 'psc', 'floor', 'apt', 'intercom', 'lat', 'lng', 'date', 'slot', 'time', 'name', 'last', 'phone', 'email', 'isCompany', 'company', 'co', 'same', 'rname', 'rlast', 'rphone', 'comment', 'pcSender', 'pcTo', 'pcText'].forEach(function (k) { d[k] = S[k]; });
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    } catch (e) {}
  }
  function loadDraft() {
    try { var d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); if (d) Object.keys(d).forEach(function (k) { if (k in S) S[k] = d[k]; }); } catch (e) {}
  }

  /* ---------- cart adapter ---------- */
  function cartRoot() { return document.getElementById(CART_ID); }
  function cartForm() { return document.getElementById(FORM_ID); }
  function tc() { return window.tcart || {}; }
  function products() { return (tc().products || []).filter(function (p) { return p && p.name && p.deleted !== 'yes'; }); }
  function pieces(p) { var por = parseInt(p.portion, 10) || 0, q = Number(p.quantity) || 0; return por > 0 ? q * por : q; }
  function hasPostcard() { return products().some(function (p) { return /pohlednice/i.test(p.name); }); }
  function goodsRaw() { var t = tc(); var s = Number(t.prodamount); if (!isFinite(s) || !s) { s = products().reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0); } return s; }
  function goodsNet() {
    var t = tc(), raw = goodsRaw();
    if (t.promocode && typeof t.promocode === 'object' && t.prodamount_withdiscount != null && isFinite(Number(t.prodamount_withdiscount))) return Number(t.prodamount_withdiscount);
    if (t.prodamount_withdyndiscount != null && isFinite(Number(t.prodamount_withdyndiscount))) return Number(t.prodamount_withdyndiscount);
    return raw;
  }
  function discountSum() { return Math.max(0, Math.round((goodsRaw() - goodsNet()) * 100) / 100); }
  function promoActive() { var p = tc().promocode; return !!(p && typeof p === 'object' && (p.promocode || p.discountsum || p.discountpercent)); }

  /* ---------- delivery price (same numbers as the SQL function expected_delivery_fee) ---------- */
  function toRad(x) { return x * Math.PI / 180; }
  function distKm(a, b, c, d) { var R = 6371, dl = toRad(c - a), dn = toRad(d - b); var x = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dn / 2) * Math.sin(dn / 2); return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); }
  function feeCalc() {
    if (S.mode === 'pickup') return { fee: CFG.service, delivery: 0, service: CFG.service, km: null, extra: 0, need: false, tooFar: false };
    if (S.gift) return { fee: CFG.base + CFG.service, delivery: CFG.base, service: CFG.service, km: null, extra: 0, need: false, tooFar: false };
    if (S.lat != null && S.lng != null) {
      var km = distKm(CFG.wh.lat, CFG.wh.lng, S.lat, S.lng);
      var extra = km > CFG.free ? Math.ceil(km - CFG.free) * CFG.perKm : 0;
      return { fee: CFG.base + extra + CFG.service, delivery: CFG.base + extra, service: CFG.service, km: km, extra: extra, need: false, tooFar: km > CFG.maxKm };
    }
    var psc = String(S.psc || '').replace(/\s+/g, '');
    if (/^1\d{4}$/.test(psc)) return { fee: CFG.base + CFG.service, delivery: CFG.base, service: CFG.service, km: null, extra: 0, need: false, tooFar: false, approx: true };
    return { fee: CFG.base + CFG.service, delivery: CFG.base, service: CFG.service, km: null, extra: 0, need: !!(S.adres || S.psc), tooFar: false, empty: !(S.adres || S.psc) };
  }
  function totals() {
    var f = feeCalc(), g = goodsNet(), raw = goodsRaw();
    var total = Math.max(0, g) + f.fee;
    var dep = 0;
    if (canDeposit() && S.dep.use) dep = depositAmount(total);
    return { raw: raw, goods: g, disc: Math.max(0, raw - g), f: f, total: total, dep: dep, card: total - dep };
  }
  function canDeposit() { return S.loggedIn && S.dep.balance >= 1 && S.pay === 'stripe' && !promoActive() && !(S.pts.applied > 0) && !hasVoucher(); }
  function hasVoucher() { return products().some(function (p) { return /poukaz/i.test(p.name); }); }
  function depositAmount(total) {
    var q = S.dep.quote;
    if (q && q.ok && Math.abs(q.total - total) < 1) return q.deposit;
    return Math.floor(Math.min(S.dep.balance, total));
  }

  /* ---------- availability (closed days / slots / special items) ---------- */
  function normName(s) { return decode(s).replace(/\s+/g, ' ').trim(); }
  function loadAvail() {
    try { applyClosed(JSON.parse(localStorage.getItem('narin_closed_dates_cache_v1') || '[]'), JSON.parse(localStorage.getItem('narin_closed_slots_cache_v1') || '[]')); } catch (e) {}
    return Promise.all([
      sbRpc('get_available_products'), sbRpc('get_special_order_products'),
      sbGet('shop_weekly_closed_days?select=weekday'), sbGet('shop_closed_dates?select=closed_date'),
      sbGet('shop_closed_slots?select=closed_date,slot_label,reason')
    ]).then(function (r) {
      AV.available = {}; (r[0] || []).forEach(function (x) { AV.available[normName(x.product_name)] = 1; });
      AV.special = {}; (r[1] || []).forEach(function (x) { AV.special[normName(x.product_name)] = 1; });
      AV.weekdays = {}; (r[2] || []).forEach(function (x) { AV.weekdays[x.weekday] = 1; });
      try { localStorage.setItem('narin_closed_dates_cache_v1', JSON.stringify(r[3] || [])); localStorage.setItem('narin_closed_slots_cache_v1', JSON.stringify(r[4] || [])); } catch (e) {}
      applyClosed(r[3] || [], r[4] || []);
      AV.loaded = true;
      recomputeSpecial();
    });
  }
  function applyClosed(dates, slots) {
    AV.dates = {}; (dates || []).forEach(function (x) { AV.dates[x.closed_date] = 1; });
    AV.slots = {}; (slots || []).forEach(function (x) { (AV.slots[x.closed_date] = AV.slots[x.closed_date] || {})[x.slot_label] = x.reason || 'Omlouváme se, tento čas je již obsazený.'; });
  }
  function isClosedDay(d) { return !!AV.weekdays[d.getDay()] || !!AV.dates[iso(d)]; }
  function recomputeSpecial() {
    AV.specialDate = null;
    var prods = products();
    if (AV.special && prods.some(function (p) { return AV.special[normName(p.name)]; })) {
      var d = new Date();
      do { d = addDays(d, 1); } while (d.getDay() === 0 || d.getDay() === 6);
      do { d = addDays(d, 1); } while (isClosedDay(d));
      AV.specialDate = d;
    }
    AV.unavailToday = !!(AV.available && prods.some(function (p) { return !AV.available[normName(p.name)]; }));
    renderCalendar(); renderSlots(); renderChips();
  }
  function dateReason(d) {
    var today = sod(new Date());
    if (d < today) return '';
    if (+d === +today) return 'Doručení ještě dnes nestihneme. Nejbližší den je zítra.';
    if (new Date().getHours() >= 20 && +d === +addDays(today, 1)) return 'Objednávky po 20:00 doručujeme nejdříve pozítří.';
    if (d > addDays(today, 120)) return '';
    if (AV.dates[iso(d)]) return 'V tento den máme zavřeno.';
    if (AV.weekdays[d.getDay()]) return 'V tento den nedoručujeme.';
    if (AV.specialDate && d < AV.specialDate) return 'Ve vašem košíku je položka, kterou objednáváme ze zahraničí. Nejbližší doručení je ' + AV.specialDate.getDate() + '. ' + (AV.specialDate.getMonth() + 1) + '.';
    return null; /* available */
  }
  function firstAvailable() { var d = addDays(new Date(), 1); for (var i = 0; i < 120; i++) { if (dateReason(d) === null) return d; d = addDays(d, 1); } return null; }
  function slotReason(slot) { return S.date && AV.slots[S.date] && AV.slots[S.date][slot] || ''; }

  /* ---------- toast ---------- */
  var toastT;
  function toast(msg, warn, ms) {
    var t = $('#npToast'); if (!t) return;
    t.textContent = msg; t.className = 'np-toast on' + (warn ? ' warn' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = 'np-toast'; }, ms || 3600);
  }

  /* ---------- phone ---------- */
  function phoneDigits(v) { return String(v || '').replace(/[^\d+]/g, ''); }
  function phoneShow(raw) {
    var v = String(raw || '').trim();
    if (v.charAt(0) === '+' && !/^\+420/.test(v)) return v.replace(/[^\d+]/g, '').slice(0, 17);
    var d = v.replace(/\D/g, ''); if (/^420/.test(d) && d.length > 9) d = d.slice(3);
    d = d.slice(0, 9);
    return d.replace(/(\d{3})(?=\d)/g, '$1 ');
  }
  function phoneValid(v) { var d = String(v || '').replace(/\D/g, ''); return String(v).charAt(0) === '+' && !/^\+420/.test(v) ? d.length >= 8 : d.replace(/^420(?=\d{9}$)/, '').length === 9; }
  function phoneCart(v) {
    var s = String(v || '').trim();
    if (s.charAt(0) === '+' && !/^\+420/.test(s)) return s;
    var d = s.replace(/\D/g, ''); if (/^420/.test(d) && d.length > 9) d = d.slice(3);
    return '+420 ' + d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6, 9);
  }

  /* ---------- render: skeleton ---------- */
  var ICON_CHECK = '<i class="ti ti-check"></i>';
  function field(k, label, type, opts) {
    opts = opts || {};
    return '<div class="np-f" data-k="' + k + '"><label class="l" for="np_' + k + '">' + label + (opts.req === false ? '' : ' <em>*</em>') + '</label>' +
      '<input class="np-in" id="np_' + k + '" type="' + (type || 'text') + '" autocomplete="' + (opts.ac || 'off') + '"' + (opts.mode ? ' inputmode="' + opts.mode + '"' : '') + (opts.ph ? ' placeholder="' + opts.ph + '"' : '') + '>' +
      '<div class="np-msg"></div></div>';
  }
  function phoneField(k, label) {
    return '<div class="np-f" data-k="' + k + '"><label class="l" for="np_' + k + '">' + label + ' <em>*</em></label>' +
      '<div class="np-phone"><b>+420</b><input class="np-in" id="np_' + k + '" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="777 123 456"></div><div class="np-msg"></div></div>';
  }
  function section(id, n, title, sub, body) {
    return '<section class="np-sec" id="' + id + '"><div class="np-sh"><span class="np-num" data-d="0">' + n + '</span><div><h2>' + title + '</h2><p>' + sub + '</p></div></div><div class="np-bd">' + body + '</div></section>';
  }
  function template() {
    var s1 = '<div id="npLogin"></div>' +
      '<div class="np-row two">' + field('name', 'Jméno', 'text', { ac: 'given-name' }) + field('last', 'Příjmení', 'text', { ac: 'family-name' }) + '</div>' +
      '<div class="np-row two">' + phoneField('phone', 'Telefon') + field('email', 'E-mail', 'email', { ac: 'email', mode: 'email' }) + '</div>' +
      '<label class="np-switch"><input type="checkbox" id="np_isCompany"><span class="tr"></span><span>Nakupuji na firmu</span></label>' +
      '<div id="npCompany" hidden class="np-co"><div id="npCoList"></div>' + field('ico', 'IČO firmy', 'text', { mode: 'numeric', ph: '8 číslic', ac: 'off' }) + '<div id="npCoCard"></div><div id="npCoManual" hidden>' + field('company', 'Název firmy', 'text', { ac: 'organization' }) + '</div><div id="npCoNudge"></div></div>';

    var s2 = '<div class="np-tiles" id="npModes">' +
      '<label class="np-tile" data-m="courier"><input type="radio" name="npmode" value="courier"><span class="ic"><i class="ti ti-truck-delivery"></i></span><span><b>Kurýrem</b><span class="s">Až ke dveřím po Praze a okolí</span></span><span class="pr" id="npModePrC"></span></label>' +
      '<label class="np-tile" data-m="pickup"><input type="radio" name="npmode" value="pickup"><span class="ic"><i class="ti ti-building-store"></i></span><span><b>Osobní odběr</b><span class="s">Vyzvednutí v Praze 10</span></span><span class="pr free">Zdarma</span></label>' +
      '</div>' +
      '<div id="npGiftWrap"></div>' +
      '<div id="npCourier">' +
      '<div class="np-row">' + field('adres', 'Ulice a číslo popisné', 'text', { ac: 'off', ph: 'Začněte psát a vyberte ze seznamu' }) + '</div>' +
      '<div class="np-hint" id="npAdrHint" style="margin:-6px 4px 16px">Podle vybrané adresy spočítáme cenu doručení.</div>' +
      '<div class="np-row two">' + field('city', 'Město', 'text', { ac: 'address-level2' }) + field('psc', 'PSČ', 'text', { ac: 'postal-code', mode: 'numeric' }) + '</div>' +
      '<div class="np-row three">' + field('floor', 'Patro', 'text', { req: false }) + field('apt', 'Číslo bytu', 'text', { req: false }) + field('intercom', 'Kód interkomu', 'text', { req: false }) + '</div>' +
      '</div>' +
      '<div id="npPickup" hidden><div class="np-pick"><span class="ic"><i class="ti ti-map-pin"></i></span><div><b>Na Hroudě 63, 100 00 Praha 10</b><br>Zatím nemáme prodejnu, vyzvednutí probíhá vedle skladu. Podrobné info dostanete e-mailem.</div></div></div>' +
      '<div id="npWhen">' +
      '<div class="np-group" id="g_date"><div class="np-sub"><span id="npDateLbl">Datum doručení</span><small id="npDateErr"></small></div>' +
      '<div class="np-chips" id="npChips"></div>' +
      '<div class="np-cal" id="npCal" hidden><div class="np-cal-h"><button type="button" id="npPrev" aria-label="Předchozí měsíc"><i class="ti ti-chevron-left"></i></button><b id="npMonth"></b><button type="button" id="npNext" aria-label="Další měsíc"><i class="ti ti-chevron-right"></i></button></div><div class="np-cal-g" id="npCalG"></div><div class="np-cal-note">Přeškrtnuté dny nejsou k dispozici. Klepnutím zjistíte proč.</div></div>' +
      '<div class="np-picked" id="npPicked"></div></div>' +
      '<div class="np-group" id="g_time"><div class="np-sub"><span id="npTimeLbl">Doba doručení</span><small id="npTimeErr"></small></div>' +
      '<div class="np-slots" id="npSlots"></div><div class="np-times" id="npTimes" hidden></div></div>' +
      '</div>';

    var s3 = '<div class="np-tiles" id="npWho">' +
      '<button type="button" class="np-tile" data-w="me"><span class="ic"><i class="ti ti-user"></i></span><span><b>Pro mě</b><span class="s">Doručíme na vaše jméno a telefon</span></span></button>' +
      '<button type="button" class="np-tile" data-w="other"><span class="ic"><i class="ti ti-gift"></i></span><span><b>Pro někoho jiného</b><span class="s">Zadáte jméno a telefon příjemce</span></span></button>' +
      '</div>' +
      '<div id="npRChips"></div>' +
      '<div id="npRFields"><div class="np-row two">' + field('rname', 'Jméno příjemce', 'text') + field('rlast', 'Příjmení příjemce', 'text') + '</div>' +
      '<div class="np-row">' + phoneField('rphone', 'Telefon příjemce') + '</div></div>' +
      '<div class="np-row"><div class="np-f"><label class="l" for="np_comment">Komentář k objednávce</label><textarea class="np-in" id="np_comment" rows="3" placeholder="Např. kdy zazvonit nebo kam květiny odložit"></textarea></div></div>' +
      '<div id="npPostcard" hidden></div>' +
      '<div class="np-note" id="npRNote"></div>';

    var s4 = '<div id="npDep"></div><div id="npPromo"></div>' +
      '<div class="np-sub" style="margin-top:6px"><span>Způsob platby</span></div>' +
      '<div class="np-tiles one" id="npPays"></div>' +
      '<div class="np-f" data-k="consent" style="margin-top:26px"><label class="np-check" id="npConsentL"><input type="checkbox" id="np_consent"><span class="bx">' + ICON_CHECK + '</span><span>Přečetl(a) jsem si a souhlasím s <a href="/obchodni-podminky" target="_blank" rel="noopener">podmínkami</a> a <a href="/privacy-policy" target="_blank" rel="noopener">pravidly webových stránek</a> <em style="color:var(--tulip);font-style:normal">*</em></span></label><div class="np-msg" style="margin-left:40px">Pro odeslání objednávky je potřeba souhlas.</div></div>' +
      '<div class="np-hint" style="margin-top:14px">Vaše osobní údaje použijeme k vyřízení objednávky, k podpoře používání těchto stránek a k dalším účelům popsaným v našich zásadách ochrany osobních údajů.</div>';

    return '' +
      '<div class="np-prog" id="npProg"><i></i><i></i><i></i><i></i></div>' +
      '<div class="np-top"><a class="back" href="/" id="npBack"><span class="arr"><i class="ti ti-arrow-left"></i></span><img src="https://narin-work.vercel.app/brand/narin-logo.png" alt="NARIN"></a><span class="np-secure"><i class="ti ti-lock"></i>Zabezpečená platba</span></div>' +
      '<div class="np-hero"><div class="np-eyebrow">Dokončení objednávky</div><h1>Skoro hotovo. <em>Ještě pár detailů.</em></h1><p>Květiny připravíme čerstvé a doručíme v den, který si vyberete.</p></div>' +
      '<div class="np-alert" id="npAlert" hidden></div>' +
      '<div class="np-grid"><div class="np-main">' +
      section('c1', 1, 'Vaše údaje', 'Na tento e-mail pošleme potvrzení', s1) +
      section('c2', 2, 'Doručení', 'Kam a kdy kytice přivezeme', s2) +
      section('c3', 3, 'Příjemce', 'Komu květiny patří', s3) +
      section('c4', 4, 'Platba', 'Vše je připraveno k odeslání', s4) +
      '</div>' +
      '<aside class="np-side"><div class="np-sum" id="npSum"><h2>Vaše objednávka</h2><div class="np-items" id="npItems"></div><div class="np-lines" id="npLines"></div>' +
      '<div class="np-tot"><span>Celkem</span><b id="npTotal">0&nbsp;Kč</b></div><div class="np-split" id="npSplit"></div>' +
      '<button type="button" class="np-cta" id="npCta">Pokračovat k platbě</button>' +
      '<div class="np-trust"><i class="ti ti-shield-check"></i><span>Platbu zpracovává Stripe. Údaje o kartě nikdy nevidíme.</span></div></div></aside>' +
      '</div>' +
      '<div class="np-bar" id="npBar"><div class="t"><small id="npBarLbl">Celkem</small><b id="npBarTot">0&nbsp;Kč</b></div><button type="button" id="npBarBtn">Pokračovat k platbě</button></div>' +
      '<div class="np-toast" id="npToast" role="status" aria-live="polite"></div>' +
      '<div class="np-pop" id="npPop" role="dialog" aria-modal="true"></div>';
  }

  /* ---------- binders for plain fields ---------- */
  var SIMPLE = { name: 'name', last: 'last', email: 'email', company: 'company', adres: 'adres', city: 'city', psc: 'psc', floor: 'floor', apt: 'apt', intercom: 'intercom', rname: 'rname', rlast: 'rlast' };
  function cleanName(v) { return String(v || '').replace(/[0-9!@#$%^&*()_=+\[\]{};:"\\|,.<>\/?]/g, ''); }
  function setErr(k, msg) {
    var w = $('[data-k="' + k + '"]', ROOT); if (!w) return;
    w.classList.toggle('bad', !!msg);
    var m = $('.np-msg', w); if (m && msg) m.textContent = msg;
  }
  function bindFields() {
    Object.keys(SIMPLE).forEach(function (k) {
      var el = $('#np_' + k); if (!el) return;
      el.value = S[k] || '';
      el.addEventListener('input', function () {
        var v = el.value;
        if (k === 'name' || k === 'last' || k === 'rname' || k === 'rlast') { var c = cleanName(v); if (c !== v) { v = c; el.value = c; } }
        S[k] = v; setErr(k, '');
        if (k === 'adres') { S.lat = S.lng = null; S.noNum = false; onAddress(); }
        if (k === 'psc' || k === 'city') { onAddress(); }
        if (S.same && (k === 'name' || k === 'last')) syncSame();
        saveDraft(); refresh();
      });
    });
    ['phone', 'rphone'].forEach(function (k) {
      var el = $('#np_' + k); if (!el) return;
      el.value = S[k] || '';
      el.addEventListener('input', function () { var v = phoneShow(el.value); el.value = v; S[k] = v; setErr(k, ''); if (k === 'phone' && S.same) syncSame(); saveDraft(); });
    });
    $('#np_comment').value = S.comment || '';
    $('#np_comment').addEventListener('input', function (e) { S.comment = e.target.value; saveDraft(); });
    var co = $('#np_isCompany'); co.checked = !!S.isCompany; $('#npCompany').hidden = !S.isCompany;
    co.addEventListener('change', function () { S.isCompany = co.checked; $('#npCompany').hidden = !co.checked; if (!co.checked) { S.company = ''; $('#np_company').value = ''; } else { coAutoPick(); } renderCompany(); saveDraft(); });
    bindCompany();
    var cs = $('#np_consent'); cs.addEventListener('change', function () { S.consent = cs.checked; setErr('consent', ''); $('#npConsentL').classList.remove('bad'); });
  }
  /* ---------- company (ARES) ---------- */
  var ARES = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/';
  var MYCO = null;
  function icoValid(v) {
    if (!/^\d{8}$/.test(v)) return false;
    var w = [8, 7, 6, 5, 4, 3, 2], sum = 0;
    for (var i = 0; i < 7; i++) sum += (+v.charAt(i)) * w[i];
    return ((11 - (sum % 11)) % 10) === +v.charAt(7);
  }
  function coReset(keepIco) { var i = keepIco ? S.co.ico : ''; S.co = { ico: i, name: '', dic: '', addr: '', vat: false, ok: false, manual: false, loading: false, err: '', id: null, state: '' }; S.company = ''; }
  function aresFetch(ico) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    return fetch(ARES + ico, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(to);
      if (r.status === 404 || r.status === 400) return { notFound: true };
      if (!r.ok) throw new Error('ares');
      return r.json();
    });
  }
  function bindCompany() {
    var el = $('#np_ico'); if (!el) return;
    var wrap = $('[data-k="ico"]', ROOT); if (wrap && !$('#npIcoSt')) { var sp = document.createElement('span'); sp.id = 'npIcoSt'; sp.className = 'np-icost'; wrap.appendChild(sp); }
    el.value = S.co.ico || '';
    el.addEventListener('input', function () {
      var v = el.value.replace(/\D/g, '').slice(0, 8); el.value = v;
      if (v === S.co.ico) return;
      coReset(false); S.co.ico = v; setErr('ico', '');
      if (v.length === 8) { if (!icoValid(v)) { S.co.err = 'IČO nevypadá správně, zkontrolujte prosím číslice.'; } else lookupCompany(v); }
      renderCompany(); saveDraft();
    });
    $('#npCompany').addEventListener('click', function (e) {
      var ch = e.target.closest('[data-co]'); if (ch) { var i = ch.getAttribute('data-co'); if (i === 'new') { coReset(false); var inp = $('#np_ico'); if (inp) { inp.value = ''; inp.focus(); } renderCompany(); saveDraft(); } else pickCompany(MYCO[+i]); return; }
      if (e.target.closest('#npCoChange')) { coReset(false); var i2 = $('#np_ico'); if (i2) { i2.value = ''; i2.focus(); } renderCompany(); saveDraft(); return; }
      if (e.target.closest('#npCoManualBtn')) { S.co.manual = true; S.co.err = ''; renderCompany(); var c = $('#np_company'); if (c) c.focus(); }
    });
    var cm = $('#np_company'); if (cm) cm.addEventListener('input', function () { S.co.name = cm.value.trim(); S.co.ok = !!S.co.name; S.company = S.co.name; saveDraft(); });
    renderCompany();
  }
  function lookupCompany(ico) {
    S.co.loading = true; renderCompany();
    aresFetch(ico).then(function (j) {
      if (S.co.ico !== ico) return;
      S.co.loading = false;
      if (j && j.notFound) { S.co.err = 'Firmu s tímto IČO jsme v ARES nenašli. Zkontrolujte prosím číslice.'; renderCompany(); return; }
      if (!j || !j.obchodniJmeno) { S.co.err = 'Firmu s tímto IČO jsme v ARES nenašli.'; renderCompany(); return; }
      var reg = j.seznamRegistraci || {};
      S.co.name = String(j.obchodniJmeno); S.co.addr = String((j.sidlo && j.sidlo.textovaAdresa) || ''); S.co.dic = String(j.dic || '');
      S.co.vat = reg.stavZdrojeDph === 'AKTIVNI'; S.co.ok = true; S.company = S.co.name;
      renderCompany(); saveDraft(); claimCompany();
    }).catch(function () {
      if (S.co.ico !== ico) return;
      S.co.loading = false; S.co.err = 'ARES teď neodpovídá. Název firmy můžete napsat ručně a fakturu vám připravíme podle něj.'; renderCompany();
    });
  }
  function claimCompany() {
    var token = authToken(); if (!token || !S.loggedIn || !S.co.ok || S.co.manual || S.co.id || S.co.claimed === S.co.ico) return;
    var ico = S.co.ico; S.co.claimed = ico;
    fn('company-checkout', { action: 'claim', token: token, ico: ico, full_name: (S.name + ' ' + S.last).trim(), phone: phoneCart(S.phone) }).then(function (r) {
      if (r && r.state && S.co.ico === ico) { S.co.state = r.state; if (r.company_id) S.co.id = r.company_id; renderCompany(); }
    }).catch(function () {});
  }
  function pickCompany(c) {
    if (!c) return;
    S.co = { ico: String(c.ico || ''), name: String(c.name || ''), dic: String(c.dic || ''), addr: String(c.billing_address || ''), vat: !!c.is_vat_payer, ok: true, manual: false, loading: false, err: '', id: c.id, state: 'member' };
    S.company = S.co.name; var inp = $('#np_ico'); if (inp) inp.value = S.co.ico;
    setErr('ico', ''); renderCompany(); saveDraft();
  }
  function coAutoPick() {
    if (S.co.ok || S.co.ico) return;
    if (MYCO && MYCO.length) pickCompany(MYCO[0]);
  }
  function loadMyCompanies() {
    var t = authToken(); if (!t || !S.loggedIn) return;
    fn('company-portal', { action: 'companies', token: t })
      .then(function (r) { MYCO = (r && Array.isArray(r.companies)) ? r.companies : []; if (S.isCompany) { coAutoPick(); } renderCompany(); })
      .catch(function () { MYCO = []; });
  }
  function renderCompany() {
    var box = $('#npCompany'); if (!box) return;
    var co = S.co, list = $('#npCoList'), card = $('#npCoCard'), st = $('#npIcoSt'), man = $('#npCoManual'), nud = $('#npCoNudge');
    /* my companies */
    if (MYCO && MYCO.length) {
      list.innerHTML = '<div class="np-rh" style="margin-top:0">Vaše firmy<small>Vyberte, na koho fakturujeme</small></div><div class="np-cochips">' + MYCO.map(function (c, i) { return '<button type="button" class="np-cochip' + (co.id && co.id === c.id ? ' on' : '') + '" data-co="' + i + '"><i class="ti ti-building"></i><span><b>' + esc(c.name) + '</b><small>IČO ' + esc(c.ico || '') + '</small></span></button>'; }).join('') + '<button type="button" class="np-cochip new" data-co="new"><i class="ti ti-plus"></i><span><b>Jiná firma</b><small>podle IČO</small></span></button></div>';
    } else list.innerHTML = '';
    /* status next to the field */
    st.innerHTML = co.loading ? '<span class="sp2"></span>' : (co.ok && !co.manual ? '<i class="ti ti-circle-check"></i>' : '');
    st.className = 'np-icost' + (co.ok ? ' ok' : '');
    /* card / errors */
    var h = '';
    if (co.ok && !co.manual) {
      h = '<div class="np-cocard"><span class="ic"><i class="ti ti-building-skyscraper"></i></span><div class="tx"><b>' + esc(co.name) + '</b><small>IČO ' + esc(co.ico) + (co.dic ? ' · DIČ ' + esc(co.dic) : '') + (co.vat ? ' · plátce DPH' : '') + '</small><small>' + esc(co.addr) + '</small></div><div class="bd"><span class="vf"><i class="ti ti-shield-check"></i>' + (co.id ? 'Vaše firma' : 'Ověřeno v ARES') + '</span><button type="button" id="npCoChange">Změnit</button></div></div>';
    } else if (co.err) {
      h = '<div class="np-coerr"><i class="ti ti-alert-circle"></i><span>' + esc(co.err) + (/ARES teď/.test(co.err) && !co.manual ? ' <button type="button" id="npCoManualBtn">Napsat ručně</button>' : '') + '</span></div>';
    } else if (!co.ico) {
      h = '<div class="np-hint" style="margin-top:6px">Zadejte IČO a údaje o firmě (název, adresu, DIČ) doplníme z registru ARES.</div>';
    }
    card.innerHTML = h;
    man.hidden = !co.manual; if (co.manual) { var c2 = $('#np_company'); if (c2 && !c2.value && co.name) c2.value = co.name; }
    /* nudge */
    var n = '';
    if (!S.loggedIn) n = '<div class="np-conudge"><i class="ti ti-user-circle"></i><span><a href="/members/login" id="npCoLogin">Přihlaste se</a> a firmu uložíme do vašeho účtu. Příště ji předvyplníme jedním klepnutím.</span></div>';
    else if (co.state === 'created') n = '<div class="np-conudge ok"><i class="ti ti-circle-check"></i><span>Firmu jsme uložili do vašeho účtu. Příště ji najdete mezi svými firmami.</span></div>';
    else if (co.state === 'pending') n = '<div class="np-conudge"><i class="ti ti-clock"></i><span>Tato firma už u nás existuje. Žádost o přístup jsme odeslali ke schválení. Objednávka půjde s fakturačními údaji firmy hned.</span></div>';
    nud.innerHTML = n;
    var lg = $('#npCoLogin'); if (lg) lg.addEventListener('click', function () { try { localStorage.setItem('lkReturnUrl', location.pathname); } catch (e) {} });
  }
  function companyForm() {
    if (!S.isCompany) return { 'company-name': '', 'company-ico': '', 'company-dic': '', 'company-address': '', 'company-vat': '' };
    return { 'company-name': (S.co.name || S.company || '').trim(), 'company-ico': S.co.manual ? '' : S.co.ico, 'company-dic': S.co.dic || '', 'company-address': S.co.addr || '', 'company-vat': S.co.vat ? 'yes' : '' };
  }
  function syncSame() {
    S.rname = S.name; S.rlast = S.last; S.rphone = S.phone;
    $('#np_rname').value = S.rname; $('#np_rlast').value = S.rlast; $('#np_rphone').value = S.rphone;
  }

  /* ---------- sections that re-render ---------- */
  function renderLogin() {
    var el = $('#npLogin'); if (!el) return;
    if (S.loggedIn) {
      var pr = tildaProfile(); var who = pr && (pr.name || pr.login) || S.email;
      el.innerHTML = '<div class="np-note" style="margin:0 0 24px"><i class="ti ti-circle-check" style="color:#00b86f"></i><span>Přihlášeni jako <b>' + esc(who) + '</b>. Údaje jsme předvyplnili.</span></div>';
    } else {
      el.innerHTML = '<div class="np-note" style="margin:0 0 24px"><i class="ti ti-user-circle"></i><span>Nakupovali jste u nás již dříve? <a href="/members/login" id="npLoginBtn">Přihlaste se</a> a předvyplníme údaje. Využijete i body a depozit.</span></div>';
      var b = $('#npLoginBtn'); if (b) b.addEventListener('click', function () { try { localStorage.setItem('lkReturnUrl', location.pathname); } catch (e) {} });
    }
  }
  function renderModes() {
    $$('input[name="npmode"]', ROOT).forEach(function (r) { r.checked = r.value === S.mode; var t = r.closest('.np-tile'); if (t) t.classList.toggle('on', r.checked); });
    $('#npCourier').hidden = S.mode !== 'courier' || !!S.gift;
    $('#npPickup').hidden = S.mode !== 'pickup';
    modePrice();
    $('#npDateLbl').textContent = S.mode === 'pickup' ? 'Datum vyzvednutí' : 'Datum doručení';
    $('#npTimeLbl').textContent = S.mode === 'pickup' ? 'Čas vyzvednutí (9:00 až 20:00)' : 'Doba doručení';
    $('#npSlots').hidden = S.mode === 'pickup';
    $('#npTimes').hidden = S.mode !== 'pickup';
    $('#npWhen').hidden = !!S.gift;
    renderGift(); renderPays();
  }
  function modePrice() {
    var f = feeCalc(), pr = $('#npModePrC'); if (!pr) return;
    pr.textContent = (S.mode === 'courier' && !f.need && !f.empty) ? kc(f.delivery) : 'od ' + kc(CFG.base);
  }
  function renderGift() {
    var w = $('#npGiftWrap'); if (!w) return;
    if (S.mode !== 'courier') { w.innerHTML = ''; return; }
    if (S.gift) {
      w.innerHTML = '<div class="np-gift"><div class="ic"><i class="ti ti-gift"></i></div><div class="tx">Adresu zadá ' + esc(S.gift.name) + '<small>Napíšeme přes ' + esc(CH_LABEL[S.gift.channel]) + ': ' + esc(S.gift.handle) + (S.gift.visible ? '' : ', anonymně') + '</small></div><button type="button" class="go" id="npGiftBtn">Změnit</button><button type="button" class="x" id="npGiftX" aria-label="Zrušit"><i class="ti ti-x"></i></button></div>';
      $('#npGiftX').addEventListener('click', function () { S.gift = null; renderModes(); refresh(); });
    } else {
      w.innerHTML = '<div class="np-gift"><div class="ic"><i class="ti ti-gift"></i></div><div class="tx">Neznáte adresu příjemce?<small>Pošleme mu odkaz, adresu a čas si zadá sám</small></div><button type="button" class="go" id="npGiftBtn">Ať ji zadá sám</button></div>';
    }
    $('#npGiftBtn').addEventListener('click', openGift);
  }
  function renderChips() {
    var el = $('#npChips'); if (!el) return;
    /* 7 consecutive days from tomorrow: closed days stay in the row (struck through), they are not removed */
    var out = [], d = addDays(new Date(), 1);
    for (var i = 0; i < 7; i++) { out.push(d); d = addDays(d, 1); }
    if (S.date) { var sel = parseIso(S.date); if (!out.some(function (x) { return iso(x) === S.date; }) && dateReason(sel) === null) out.unshift(sel); }
    el.innerHTML = out.map(function (x) {
      var k = iso(x), why = dateReason(x), off = why !== null;
      return '<button type="button" class="np-chip' + (S.date === k ? ' on' : '') + (off ? ' off' : '') + '" data-d="' + k + '" data-why="' + esc(why || '') + '"' + (off ? ' aria-disabled="true"' : '') + '><small>' + WD[(x.getDay() + 6) % 7] + '</small><b>' + x.getDate() + '</b><span>' + (off ? 'zavřeno' : MONTH_SHORT[x.getMonth()]) + '</span></button>';
    }).join('') + '<button type="button" class="np-chip more" id="npMore"><i class="ti ti-calendar-event"></i>' + (S.showCal ? 'Skrýt' : 'Jiný den') + '</button>';
  }
  function renderCalendar() {
    var g = $('#npCalG'); if (!g) return;
    var y = cal.y, m = cal.m, first = new Date(y, m, 1), startWd = (first.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
    var html = WD.map(function (w) { return '<div class="w">' + w + '</div>'; }).join('');
    for (var i = 0; i < startWd; i++) html += '<button type="button" class="np-day mute" tabindex="-1" aria-hidden="true"></button>';
    var today = sod(new Date());
    for (var d = 1; d <= days; d++) {
      var dt = new Date(y, m, d), why = dateReason(dt), off = why !== null, k = iso(dt);
      html += '<button type="button" class="np-day' + (off ? ' off' : '') + (+dt === +today ? ' today' : '') + (S.date === k ? ' on' : '') + '" data-d="' + k + '" data-why="' + esc(why || '') + '"' + (off ? ' aria-disabled="true"' : '') + '>' + d + '</button>';
    }
    g.innerHTML = html;
    $('#npMonth').textContent = MONTHS[m] + ' ' + y;
    var now = new Date(); $('#npPrev').disabled = (y === now.getFullYear() && m === now.getMonth());
    $('#npNext').disabled = (y * 12 + m) >= (now.getFullYear() * 12 + now.getMonth() + 4);
    $('#npCal').hidden = !S.showCal;
    var p = $('#npPicked'); p.innerHTML = S.date ? '<i class="ti ti-calendar-check"></i><span>Vybráno: <b>' + esc(longDate(S.date)) + '</b></span>' : '';
  }
  function renderSlots() {
    var sl = $('#npSlots'), tm = $('#npTimes'); if (!sl) return;
    sl.innerHTML = SLOTS.map(function (s) { var why = slotReason(s); return '<button type="button" class="np-slot' + (S.slot === s ? ' on' : '') + (why ? ' off' : '') + '" data-s="' + s + '" data-why="' + esc(why) + '"><b>' + s.replace('-', '–') + '</b><span>' + CAPTIONS[s] + '</span></button>'; }).join('');
    tm.innerHTML = TIMES.map(function (t) { return '<button type="button" class="np-time' + (S.time === t ? ' on' : '') + '" data-t="' + t + '">' + t.replace(/^0/, '') + '</button>'; }).join('');
  }
  function pickDate(k) {
    S.date = k; S.showCal = false;
    if (S.slot && slotReason(S.slot)) S.slot = null;
    $('#npDateErr').textContent = ''; $('#g_date').classList.remove('bad');
    renderCalendar(); renderChips(); renderSlots(); saveDraft(); refresh();
  }
  function bindWhen() {
    $('#npChips').addEventListener('click', function (e) {
      if (e.target.closest('#npMore')) { S.showCal = !S.showCal; renderChips(); renderCalendar(); return; }
      var b = e.target.closest('[data-d]'); if (!b) return;
      if (b.classList.contains('off')) { var w = b.getAttribute('data-why'); if (w) toast(w); return; }
      pickDate(b.getAttribute('data-d'));
    });
    $('#npCalG').addEventListener('click', function (e) {
      var b = e.target.closest('.np-day[data-d]'); if (!b) return;
      if (b.classList.contains('off')) { var w = b.getAttribute('data-why'); if (w) toast(w); return; }
      pickDate(b.getAttribute('data-d'));
    });
    $('#npPrev').addEventListener('click', function () { cal.m--; if (cal.m < 0) { cal.m = 11; cal.y--; } renderCalendar(); });
    $('#npNext').addEventListener('click', function () { cal.m++; if (cal.m > 11) { cal.m = 0; cal.y++; } renderCalendar(); });
    $('#npSlots').addEventListener('click', function (e) {
      var b = e.target.closest('.np-slot'); if (!b) return;
      if (b.classList.contains('off')) { toast(b.getAttribute('data-why') || 'Tento čas je již obsazený.'); return; }
      S.slot = b.getAttribute('data-s'); $('#g_time').classList.remove('bad'); $('#npTimeErr').textContent = ''; renderSlots(); saveDraft();
    });
    $('#npTimes').addEventListener('click', function (e) {
      var b = e.target.closest('.np-time'); if (!b) return;
      S.time = b.getAttribute('data-t'); $('#g_time').classList.remove('bad'); $('#npTimeErr').textContent = ''; renderSlots(); saveDraft();
    });
    $$('input[name="npmode"]', ROOT).forEach(function (r) {
      r.addEventListener('change', function () {
        S.mode = r.value;
        if (S.mode === 'pickup') S.gift = null;
        if (S.mode === 'courier' && S.pay === 'cash') S.pay = 'stripe';
        renderModes(); saveDraft(); refresh(); quoteSoon();
      });
    });
  }
  function bindWho() {
    $('#npWho').addEventListener('click', function (e) { var b = e.target.closest('[data-w]'); if (b) setWho(b.getAttribute('data-w')); });
  }
  function renderWho() {
    $$('#npWho .np-tile', ROOT).forEach(function (b) { b.classList.toggle('on', (b.getAttribute('data-w') === 'me') === !!S.same); });
    $('#npRFields').hidden = !!S.same;
    var rc = $('#npRChips'); if (rc) rc.hidden = !!S.same;
  }
  function setWho(w) {
    var was = S.same; S.same = (w === 'me');
    if (S.same) syncSame();
    else if (was) { S.rid = null; if (RECS) renderRecs(); S.rname = S.rlast = S.rphone = ''; ['rname', 'rlast', 'rphone'].forEach(function (k) { $('#np_' + k).value = ''; }); }
    renderWho(); saveDraft(); refresh();
  }

  /* ---------- address (Google Places) ---------- */
  function onAddress() {
    var h = $('#npAdrHint'); if (!h) return;
    var f = feeCalc();
    if (S.mode !== 'courier') return;
    if (f.tooFar) { h.style.color = 'var(--err)'; h.textContent = 'Na tuto adresu (' + (Math.round(f.km * 10) / 10).toString().replace('.', ',') + ' km) kurýrem bohužel nedoručujeme. Napište nám na support@vezminarin.cz nebo zavolejte na +420 776 421 993.'; }
    else if (f.need) { h.style.color = 'var(--err)'; h.textContent = 'Vyberte prosím adresu ze seznamu, cenu doručení počítáme podle vzdálenosti.'; }
    else if (S.noNum) { h.style.color = 'var(--err)'; h.textContent = 'Chybí číslo popisné. Dopište číslo za ulici a vyberte adresu ze seznamu.'; }
    else if (f.km != null) { h.style.color = 'var(--ok)'; h.textContent = 'Vzdálenost od skladu ' + (Math.round(f.km * 10) / 10).toString().replace('.', ',') + ' km. Cena doručení ' + kc(f.delivery) + (f.extra ? ' (včetně příplatku za vzdálenost)' : '') + '.'; }
    else { h.style.color = ''; h.textContent = 'Podle vybrané adresy spočítáme cenu doručení.'; }
    quoteSoon();
  }
  function initPlaces() {
    if (window.google && google.maps && google.maps.places) return attachPlaces();
    window.__npPlacesReady = attachPlaces;
    if (document.getElementById('npPlacesJs')) return;
    var s = document.createElement('script'); s.id = 'npPlacesJs'; s.async = true; s.defer = true;
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + PLACES_KEY + '&libraries=places&language=cs&region=CZ&callback=__npPlacesReady';
    document.head.appendChild(s);
  }
  function attachPlaces() {
    var input = $('#np_adres'); if (!input || input.__np) return; input.__np = 1;
    var ac = new google.maps.places.Autocomplete(input, { componentRestrictions: { country: 'cz' }, fields: ['address_components', 'geometry'], types: ['address'] });
    ac.addListener('place_changed', function () {
      var p = ac.getPlace(); if (!p || !p.address_components) return;
      var route = '', num = '', city = '', psc = '';
      p.address_components.forEach(function (c) {
        var t = c.types;
        if (t.indexOf('route') > -1) route = c.long_name;
        if (t.indexOf('street_number') > -1) num = c.long_name;
        if (t.indexOf('locality') > -1 || t.indexOf('postal_town') > -1) city = c.long_name;
        if (t.indexOf('sublocality') > -1 && !city) city = c.long_name;
        if (t.indexOf('postal_code') > -1) psc = c.long_name;
      });
      S.adres = (route + ' ' + num).trim(); $('#np_adres').value = S.adres; S.noNum = !num;
      if (city) { S.city = city; $('#np_city').value = city; }
      if (psc) { S.psc = psc; $('#np_psc').value = psc; }
      if (p.geometry && p.geometry.location) { S.lat = p.geometry.location.lat(); S.lng = p.geometry.location.lng(); }
      ['adres', 'city', 'psc'].forEach(function (k) { setErr(k, ''); });
      onAddress(); saveDraft(); refresh();
    });
  }

  /* ---------- recipient ---------- */
  function renderRecipient() {
    renderWho();
    var note = $('#npRNote');
    note.hidden = !S.loggedIn;
    note.innerHTML = '<i class="ti ti-bell-ringing"></i><span>Příjemce i datum si zapamatujeme a příště vám je připomeneme. Upravit je můžete ve svém <a href="/members/occasions" target="_blank" rel="noopener">účtu</a>.</span>';
    updateRAddr();
    var pc = $('#npPostcard');
    if (hasPostcard()) {
      pc.hidden = false;
      if (!pc.__built) {
        pc.__built = 1;
        pc.innerHTML = '<div class="np-pc"><h3><i class="ti ti-mail"></i>Pohlednice: napište své přání</h3>' +
          '<div class="np-seg" id="npPcSeg"><button type="button" data-v="name">Podepsat mým jménem</button><button type="button" data-v="anon">Poslat anonymně</button></div>' +
          '<div class="np-row">' + field('pcTo', 'Pro koho', 'text') + '</div>' +
          '<div class="np-row"><div class="np-f" data-k="pcText"><label class="l" for="np_pcText">Váš text na pohlednici <em>*</em></label><textarea class="np-in" id="np_pcText" rows="4"></textarea><div class="np-msg"></div></div></div></div>';
        $('#npPcSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (!b) return; S.pcSender = b.getAttribute('data-v'); paintSeg(); saveDraft(); });
        $('#np_pcTo').value = S.pcTo; $('#np_pcText').value = S.pcText;
        $('#np_pcTo').addEventListener('input', function (e) { S.pcTo = e.target.value; setErr('pcTo', ''); saveDraft(); });
        $('#np_pcText').addEventListener('input', function (e) { S.pcText = e.target.value; setErr('pcText', ''); saveDraft(); });
      }
      paintSeg();
    } else { pc.hidden = true; }
  }
  function paintSeg() { $$('#npPcSeg button', ROOT).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === S.pcSender); }); }
  var RECS = null, REC_ADDR = null;
  var REL = { mama: 'Máma', partnerka: 'Partnerka', partner: 'Partner', babicka: 'Babička', tata: 'Táta', ucitelka: 'Učitel(ka)', kolegyne: 'Kolega/yně', kamarad: 'Kamarád(ka)' };
  var OCC = {};
  function shortDate(v) { var m = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + '. ' + (+m[2]) + '.' : ''; }
  function plDays(n) { return n === 1 ? 'den' : (n >= 2 && n <= 4 ? 'dny' : 'dní'); }
  function parseAddr(a) {
    var s = String(a || '').trim(); if (!s) return null;
    var parts = s.split(','), street = parts[0].trim(), rest = parts.slice(1).join(',').trim();
    var m = rest.match(/(\d{3})\s?(\d{2})/), psc = m ? m[1] + ' ' + m[2] : '';
    var city = rest.replace(/\d{3}\s?\d{2}/, '').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s+\d.*$/, '').trim();
    return street ? { street: street, city: city, psc: psc } : null;
  }
  function initials(n) { var p = String(n || '').trim().split(/\s+/).filter(Boolean); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function recCard(x, i) {
    var a = parseAddr(x.address), occ = OCC[x.id], rel = REL[x.relation] || '';
    var sub = x.suggested ? (x.delivery_date ? 'Dodáno ' + shortDate(x.delivery_date) : 'Z vašich objednávek') : [rel, a && a.city].filter(Boolean).join(' · ');
    var badge = occ ? '<span class="bd' + (occ.days <= 7 ? ' hot' : '') + '"><i class="ti ti-calendar-heart"></i>' + (occ.days === 0 ? 'Dnes: ' : 'Za ' + occ.days + ' ' + plDays(occ.days) + ': ') + esc(occ.title) + '</span>' : '';
    var lo = x.last_orders && x.last_orders[0], last = lo ? '<span class="lo"><i class="ti ti-history"></i>Minule: ' + esc((lo.products && lo.products[0]) || 'kytice') + ', ' + shortDate(lo.date) + '</span>' : '';
    return '<button type="button" class="np-rc' + (S.rid === x.id ? ' on' : '') + '" data-i="' + i + '" aria-pressed="' + (S.rid === x.id) + '"><span class="av a' + (i % 4) + '">' + esc(initials(x.name)) + '</span><span class="nm">' + esc(x.name) + '</span><span class="sb">' + (sub ? esc(sub) : '&nbsp;') + '</span>' + badge + last + '<span class="ck"><i class="ti ti-check"></i></span></button>';
  }
  function renderRecs() {
    var w = $('#npRChips'); if (!w) return;
    if (!S.loggedIn) {
      w.innerHTML = '<a class="np-rnudge" href="/members/login" id="npRLogin"><span class="ic"><i class="ti ti-heart-handshake"></i></span><span class="tx"><b>Posíláte často? Přihlaste se.</b><small>Příjemce vyberete jedním klepnutím, doplníme jeho adresu a včas vám připomeneme jeho svátek.</small></span><i class="ti ti-chevron-right"></i></a>';
      var lb = $('#npRLogin'); if (lb) lb.addEventListener('click', function () { try { localStorage.setItem('lkReturnUrl', location.pathname); } catch (e) {} });
      return;
    }
    if (RECS === null) { w.innerHTML = '<div class="np-rh">Vaši blízcí</div><div class="np-rcs"><div class="np-rc sk"></div><div class="np-rc sk"></div><div class="np-rc sk"></div></div>'; return; }
    if (!RECS.length) {
      w.innerHTML = '<div class="np-rempty"><span class="ic"><i class="ti ti-address-book"></i></span><span class="tx"><b>Zatím tu nemáte uložené blízké</b><small>Přidejte je ve svém účtu a příště stačí jedno klepnutí. <a href="/members/occasions" target="_blank" rel="noopener">Přidat příjemce</a></small></span></div>';
      return;
    }
    w.innerHTML = '<div class="np-rh">' + (RECS[0] && RECS[0].suggested ? 'Komu jste už posílali' : 'Vaši blízcí') + '<small>Vyberte, komu květiny posíláte</small></div><div class="np-rcs" id="npRC">' + RECS.map(recCard).join('') + '<button type="button" class="np-rc new' + (S.rid === null && !S.same ? '' : '') + '" data-new="1"><span class="av plus"><i class="ti ti-plus"></i></span><span class="nm">Někdo nový</span><span class="sb">Zadáte ručně</span></button></div><div id="npRAddr"></div><div class="np-msg-r" id="npRHint"></div>';
    $('#npRC').addEventListener('click', function (e) {
      var nb = e.target.closest('[data-new]');
      if (nb) { pickRec(null); return; }
      var b = e.target.closest('[data-i]'); if (b) pickRec(RECS[+b.getAttribute('data-i')]);
    });
    updateRAddr();
  }
  function pickRec(x) {
    S.same = false;
    if (!x) {
      S.rid = null; S.rname = S.rlast = S.rphone = '';
      ['rname', 'rlast', 'rphone'].forEach(function (k) { $('#np_' + k).value = ''; });
      renderRecs(); renderWho(); saveDraft(); refresh();
      var f = $('#np_rname'); if (f) { try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); } }
      return;
    }
    var parts = String(x.name || '').trim().split(/\s+/);
    S.rid = x.id; S.rname = parts[0] || ''; S.rlast = parts.slice(1).join(' '); S.rphone = phoneShow(x.phone || '');
    $('#np_rname').value = S.rname; $('#np_rlast').value = S.rlast; $('#np_rphone').value = S.rphone;
    ['rname', 'rlast', 'rphone'].forEach(function (k) { setErr(k, ''); });
    var autoAddr = S.mode === 'courier' && !S.gift && parseAddr(x.address) && (!S.adres || REC_ADDR);
    if (autoAddr) applySavedAddr(x);
    renderRecs(); renderWho(); saveDraft(); refresh();
  }
  function applySavedAddr(x) {
    var a = parseAddr(x.address); if (!a) return;
    S.adres = a.street; S.city = a.city; S.psc = a.psc; S.noNum = !/\d/.test(a.street);
    if (x.address_lat != null && x.address_lng != null) { S.lat = Number(x.address_lat); S.lng = Number(x.address_lng); } else { S.lat = null; S.lng = null; }
    $('#np_adres').value = S.adres; $('#np_city').value = S.city; $('#np_psc').value = S.psc;
    ['adres', 'city', 'psc'].forEach(function (k) { setErr(k, ''); });
    REC_ADDR = x.id; onAddress(); saveDraft(); refresh();
    if (S.lat == null && window.google && google.maps && google.maps.Geocoder) {
      try {
        new google.maps.Geocoder().geocode({ address: [a.street, a.psc, a.city].filter(Boolean).join(', '), componentRestrictions: { country: 'CZ' } }, function (res, st) {
          if (st === 'OK' && res && res[0] && S.adres === a.street) { var l = res[0].geometry.location; S.lat = l.lat(); S.lng = l.lng(); onAddress(); saveDraft(); refresh(); }
        });
      } catch (e) {}
    }
  }
  function updateRAddr() {
    var el = $('#npRAddr'), hint = $('#npRHint'); if (!el) return;
    var x = RECS && S.rid != null ? RECS.filter(function (r) { return r.id === S.rid; })[0] : null;
    if (hint) hint.textContent = x && !x.phone ? 'U tohoto příjemce nemáme telefon, doplňte ho prosím níže. Kurýr se mu před doručením ozve.' : '';
    var a = x && parseAddr(x.address);
    if (!x || !a || S.mode !== 'courier' || S.gift) { el.innerHTML = ''; return; }
    var line = esc(a.street + (a.city ? ', ' + a.city : ''));
    if (REC_ADDR === x.id && S.adres === a.street) el.innerHTML = '<div class="np-raddr ok"><i class="ti ti-map-pin-check"></i><span>Adresu příjemce jsme doplnili do doručení: <b>' + line + '</b>. <a href="#c2" id="npRChg">Změnit</a></span></div>';
    else el.innerHTML = '<div class="np-raddr"><i class="ti ti-map-pin"></i><span>Uložená adresa: <b>' + line + '</b></span><button type="button" id="npRUse">Použít</button></div>';
    var u = $('#npRUse'); if (u) u.addEventListener('click', function () { applySavedAddr(x); updateRAddr(); });
    var c = $('#npRChg'); if (c) c.addEventListener('click', function (e) { e.preventDefault(); var t = $('#np_adres'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { t.focus(); }, 400); } });
  }
  function loadRecipients() {
    renderRecs();
    var t = authToken(); if (!t || !S.loggedIn) return;
    Promise.all([
      fn('personal-dates', { token: t, action: 'listRecipients' }),
      fn('personal-dates', { token: t, action: 'upcoming', days: 60 }).catch(function () { return {}; })
    ]).then(function (rs) {
      var list = (rs[0] && Array.isArray(rs[0].recipients)) ? rs[0].recipients : [];
      var t0 = new Date(); t0 = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate()).getTime();
      ((rs[1] && rs[1].items) || []).forEach(function (it) {
        if (!it.recipient_id) return;
        var m = String(it.occasion_date || '').match(/(\d{4})-(\d{2})-(\d{2})/); if (!m) return;
        var days = Math.round((new Date(+m[1], +m[2] - 1, +m[3]).getTime() - t0) / 864e5);
        if (days < 0 || days > 45) return;
        if (!OCC[it.recipient_id] || days < OCC[it.recipient_id].days) OCC[it.recipient_id] = { days: days, title: String(it.title || it.occasion_key || '').replace(/\s*\(.*\)\s*$/, '') };
      });
      if (list.length) { RECS = list; renderRecs(); return; }
      return fn('personal-dates', { token: t, action: 'suggestedRecipients' }).then(function (r) {
        RECS = ((r && r.suggestions) || []).slice(0, 6).map(function (x, i) { x.id = 's' + i; x.suggested = true; return x; });
        renderRecs();
      });
    }).catch(function () { RECS = []; renderRecs(); });
  }

  /* ---------- gift without address ---------- */
  var CH_LABEL = { phone: 'SMS', whatsapp: 'WhatsApp', telegram: 'Telegram', instagram: 'Instagram' };
  var CH_PH = { phone: '+420 777 123 456', whatsapp: '+420 777 123 456', telegram: '@jmeno nebo telefon', instagram: '@jmeno' };
  var giftCh = 'phone';
  function validHandle(c, v) {
    var d = v.replace(/\D/g, '');
    if (c === 'phone' || c === 'whatsapp') return d.length >= 9 && d.length <= 15 && !/[a-z]/i.test(v);
    if (c === 'telegram') return /^@?[A-Za-z0-9_]{4,32}$/.test(v) || (d.length >= 9 && !/[a-z]/i.test(v));
    return /^@?[A-Za-z0-9._]{2,30}$/.test(v);
  }
  function openGift() {
    var pop = $('#npPop');
    var g = S.gift || { name: S.rname || '', channel: 'phone', handle: '', visible: true }; giftCh = g.channel;
    pop.innerHTML = '<div class="np-box"><button type="button" class="x" id="npGx" aria-label="Zavřít"><i class="ti ti-x"></i></button><div class="gi"><i class="ti ti-gift"></i></div><h3>Dárek bez adresy</h3>' +
      '<p class="lead">Neznáte adresu nebo chcete překvapit? Nevadí. Příjemci napíšeme a on si sám vybere, kam a kdy mu kytici přivezeme.</p>' +
      '<ol><li><b>1</b><span>Objednáte a zaplatíte jako obvykle.</span></li><li><b>2</b><span>Příjemci osobně napíšeme a pošleme odkaz. Žádný robot.</span></li><li><b>3</b><span>Zadá adresu a čas, nejdřív na zítřek. Když to do 48 hodin neudělá nebo dárek odmítne, vrátíme vám peníze.</span></li></ol>' +
      '<div class="np-f"><label class="l" for="ngName">Jméno příjemce</label><input class="np-in" id="ngName" type="text" autocomplete="off" placeholder="např. Jana" value="' + esc(g.name) + '"></div>' +
      '<div class="np-sub" style="margin:18px 0 10px"><span>Kde mu máme napsat?</span></div><div class="np-chs" id="ngCh">' +
      ['phone', 'whatsapp', 'telegram', 'instagram'].map(function (c) { return '<button type="button" data-c="' + c + '"' + (c === giftCh ? ' class="on"' : '') + '>' + (c === 'phone' ? '<i class="ti ti-device-mobile"></i>SMS / telefon' : CH_LABEL[c]) + '</button>'; }).join('') + '</div>' +
      '<input class="np-in" id="ngHandle" type="text" autocomplete="off" placeholder="' + esc(CH_PH[giftCh]) + '" value="' + esc(g.handle) + '">' +
      '<label class="np-check" style="margin-top:20px"><input type="checkbox" id="ngVis"' + (g.visible ? ' checked' : '') + '><span class="bx">' + ICON_CHECK + '</span><span>Příjemce může vědět, že je dárek ode mě<br><small style="color:var(--mut)">Když ne, napíšeme jen „někdo vám posílá květiny“.</small></span></label>' +
      '<p class="np-hint">Kontakt použijeme jen kvůli tomuto doručení a po 30 dnech ho smažeme. <a href="/darek-bez-adresy" target="_blank" rel="noopener" style="color:var(--blue)">Jak to funguje</a></p>' +
      '<div class="np-err-box" id="ngErr"></div>' +
      '<div class="row2"><button type="button" id="ngCancel">Zpět</button><button type="button" class="pri" id="ngOk">Pokračovat</button></div></div>';
    pop.classList.add('on');
    function close() { pop.classList.remove('on'); }
    function err(m) { var e = $('#ngErr'); e.textContent = m || ''; e.classList.toggle('on', !!m); }
    $('#npGx').onclick = close; $('#ngCancel').onclick = close;
    pop.onclick = function (e) { if (e.target === pop) close(); };
    $('#ngCh').onclick = function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return; giftCh = b.getAttribute('data-c');
      $$('#ngCh button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#ngHandle').placeholder = CH_PH[giftCh];
    };
    $('#ngOk').onclick = function () {
      var name = $('#ngName').value.trim(), handle = $('#ngHandle').value.trim();
      if (name.length < 2) return err('Napište prosím jméno příjemce.');
      if (!validHandle(giftCh, handle)) return err(giftCh === 'instagram' || (giftCh === 'telegram' && /[a-z]/i.test(handle)) ? 'Zkontrolujte prosím uživatelské jméno.' : 'Zkontrolujte prosím telefonní číslo (aspoň 9 číslic).');
      var ok = $('#ngOk'); ok.disabled = true; ok.textContent = 'Ověřujeme…';
      fn('gift-link', { action: 'check', contact: handle }).catch(function () { return {}; }).then(function (r) {
        ok.disabled = false; ok.textContent = 'Pokračovat';
        if (r && r.blocked) return err('Tomuto kontaktu bohužel nemůžeme dárek bez adresy poslat. Zadejte prosím adresu sami.');
        var wasSame = S.same;
        S.gift = { name: name.slice(0, 60), channel: giftCh, handle: handle.slice(0, 60), visible: $('#ngVis').checked };
        S.mode = 'courier'; S.same = false;
        if (wasSame || !S.rname) { S.rname = S.gift.name; S.rlast = wasSame ? '' : S.rlast; $('#np_rname').value = S.rname; $('#np_rlast').value = S.rlast; }
        if ((wasSame || !S.rphone) && /^(phone|whatsapp)$/.test(S.gift.channel)) { S.rphone = phoneShow(S.gift.handle); $('#np_rphone').value = S.rphone; }
        else if (wasSame) { S.rphone = ''; $('#np_rphone').value = ''; }
        close(); renderModes(); renderRecipient(); refresh();
      });
    };
  }

  /* ---------- payment section ---------- */
  function renderPays() {
    var el = $('#npPays'); if (!el) return;
    var cashOk = S.mode === 'pickup';
    if (S.pay === 'cash' && !cashOk) S.pay = 'stripe';
    var tt = totals(), useDep = canDeposit() && S.dep.use && tt.dep >= tt.total;
    el.innerHTML =
      '<label class="np-tile row' + (S.pay === 'stripe' ? ' on' : '') + '"><input type="radio" name="nppay" value="stripe"' + (S.pay === 'stripe' ? ' checked' : '') + '><span class="ic"><i class="ti ti-credit-card"></i></span><span class="tx"><b>Kartou online</b><span class="s">Visa, Mastercard, Apple Pay a Google Pay přes Stripe' + (useDep ? ' (nebude potřeba, platíte depozitem)' : '') + '</span></span><span class="rd"></span></label>' +
      '<label class="np-tile row' + (S.pay === 'cash' ? ' on' : '') + (cashOk ? '' : ' dis') + '"><input type="radio" name="nppay" value="cash"' + (S.pay === 'cash' ? ' checked' : '') + (cashOk ? '' : ' disabled') + '><span class="ic"><i class="ti ti-cash"></i></span><span class="tx"><b>Hotově při převzetí</b><span class="s">' + (cashOk ? 'Zaplatíte při vyzvednutí' : 'Jen při osobním odběru') + '</span></span><span class="rd"></span></label>';
    $$('input[name="nppay"]', el).forEach(function (r) { r.addEventListener('change', function () { S.pay = r.value; renderPays(); renderDep(); renderPromo(); refresh(); }); });
  }
  function renderDep() {
    var el = $('#npDep'); if (!el) return;
    if (!S.loggedIn || S.dep.balance < 1) { el.innerHTML = ''; return; }
    var blocked = promoActive() || S.pts.applied > 0 || S.pay !== 'stripe' || hasVoucher();
    var t = totals(), use = S.dep.use && !blocked, err = S.dep.err;
    var h = '<div class="np-wallet' + (use ? '' : ' off') + (err && !blocked ? ' err' : '') + '"><div class="t"><div><div class="lb"><i class="ti ti-wallet"></i>Depozit NARIN</div><div class="bal">' + kc(S.dep.balance) + '</div></div>';
    if (!blocked) h += '<label class="np-switch"><input type="checkbox" id="np_dep"' + (S.dep.use ? ' checked' : '') + '><span class="tr"></span><span>Použít</span></label>';
    h += '</div>';
    if (blocked) h += '<div class="why">' + (S.pay !== 'stripe' ? 'Depozitem lze platit jen online.' : 'Depozit nelze kombinovat se slevou nebo body.') + '</div>';
    else if (err) h += '<div class="why">' + esc(err) + '</div>';
    else if (use) {
      var dep = t.dep, card = Math.max(0, t.total - dep);
      h += '<div class="calc"><div><span>Objednávka</span><b>' + kc(t.total) + '</b></div><div class="g"><span>Z depozitu</span><b>−' + kc(dep) + '</b></div><div class="tot"><span>' + (card > 0 ? 'Zbytek zaplatíte kartou' : 'Kartou nic neplatíte') + '</span><b>' + kc(card) + '</b></div></div>';
    } else h += '<div class="why">Zůstatek zůstane na vašem účtu.</div>';
    el.innerHTML = h + '</div>';
    var cb = $('#np_dep'); if (cb) cb.addEventListener('change', function () { S.dep.use = cb.checked; renderDep(); renderPromo(); renderPays(); refresh(); quoteSoon(); });
  }
  var TIERS = [
    { name: 'Klient', label: 'Sapphire', from: 0, cb: 0.5, color: '#186ce0', img: 'https://static.tildacdn.com/tild6237-3062-4338-b234-373762313165/E3941E6E-7AD6-4B84-B.webp' },
    { name: 'Silver', label: 'Silver', from: 300, cb: 1, color: '#8d97a3', img: 'https://static.tildacdn.com/tild6136-3638-4164-b931-313537363164/21443537-178F-45E1-B.webp' },
    { name: 'Gold', label: 'Gold', from: 600, cb: 1.5, color: '#d4a017', img: 'https://static.tildacdn.com/tild3663-3137-4866-b164-396435303064/95B11AD8-8D5F-4112-B.webp' },
    { name: 'Platinum', label: 'Platinum', from: 900, cb: 2, color: '#8b5fbf', img: 'https://static.tildacdn.com/tild3339-3738-4961-b133-666235386264/E5D597BE-7B84-4E59-A.webp' }
  ];
  function tierIdx(earned) { var i = 0; TIERS.forEach(function (t, k) { if (earned >= t.from) i = k; }); return i; }
  function loyCard(t, badge, label, big) {
    var txt = label ? '<div class="mid"><div class="lb">' + esc(label) + '</div><div class="bl">' + big + '</div></div>' : '';
    return '<div class="np-lcard" style="background-image:url(' + t.img + ')"><span class="sheen"></span>' + (txt ? '<div class="in">' + txt + '</div>' : '') + '</div>';
  }
  function loyBlock(depOn, noRedeem) {
    if (!S.loggedIn) {
      return '<div class="np-loy out">' + loyCard(TIERS[0], '', '', '') +
        '<div class="sd"><div class="hd">Zaregistrujte se a získejte 150 bodů</div><ul><li><i class="ti ti-check"></i>až 2 % z každé objednávky zpět v bodech</li><li><i class="ti ti-check"></i>1 bod = 1 Kč, body nevyprší</li><li><i class="ti ti-check"></i>body uplatníte až na 30 % objednávky</li></ul>' +
        '<div class="ac"><a class="go" href="/members/login" id="npLoyReg">Zaregistrovat se</a><a class="lk" href="/bonussystem" target="_blank" rel="noopener">Jak to funguje</a></div></div></div>';
    }
    var earned = S.pts.earned || 0, ti = tierIdx(earned);
    TIERS.forEach(function (x, k) { if (x.name === S.pts.tierName) ti = k; });
    var tr = TIERS[ti], nx = TIERS[ti + 1];
    var bal = S.pts.balance, tt = totals(), gain = Math.floor(tt.total * tr.cb / 100);
    var num = S.pts.ma ? '●● ●● ●● ' + String(S.pts.ma).slice(-4) : '●● ●● ●● ••••';
    var h = '<div class="np-loy">' + loyCard(tr, '', '', '') + '<div class="sd">';
    h += '<div class="gn"><i class="ti ti-sparkles"></i><span>Z této objednávky získáte <b>+' + gain + ' b.</b> <small>(' + String(tr.cb).replace('.', ',') + ' % zpět)</small></span></div>';
    if (nx) {
      var need = Math.max(0, nx.from - earned), pct = Math.max(4, Math.min(100, Math.round((earned - tr.from) / (nx.from - tr.from) * 100)));
      h += '<div class="pg"><div class="tx">Do úrovně <b>' + nx.label + '</b> chybí ' + need + ' b.</div><div class="bar"><i style="width:' + pct + '%;background:' + nx.color + '"></i></div></div>';
    } else h += '<div class="pg"><div class="tx"><b>Nejvyšší úroveň</b>, máte 2 % zpět.</div></div>';
    var capGoods = Math.floor(goodsNet() * 0.3 / 100) * 100;
    var maxAllowed = Math.min(1000, capGoods, bal == null ? 0 : Math.floor(bal / 100) * 100);
    if (noRedeem) { /* points or code already applied */ }
    else if (bal != null && maxAllowed >= 100) {
      if (S.pts.sel > maxAllowed) S.pts.sel = maxAllowed; if (S.pts.sel < 100) S.pts.sel = 100;
      var one = maxAllowed <= 100;
      h += '<div class="rd"><div class="rl">Uplatnit body <small>máte ' + bal + ' b., 1 b. = 1 Kč</small></div>';
      if (one) h += '<div class="stepper"><span class="lim">Z této objednávky lze uplatnit <b>100 b.</b> (až 30 % zboží)</span><button type="button" class="np-btn2 go" id="npPtsGo"' + (S.pts.busy ? ' disabled' : '') + '>' + (S.pts.busy ? '…' : 'Uplatnit 100 b.') + '</button></div>';
      else h += '<div class="stepper"><button type="button" class="s" id="npPm" aria-label="Méně"' + (S.pts.sel <= 100 ? ' disabled' : '') + '>−</button><span class="v" id="npPv">' + S.pts.sel + ' b.</span><button type="button" class="s" id="npPp" aria-label="Více"' + (S.pts.sel >= maxAllowed ? ' disabled' : '') + '>+</button><button type="button" class="np-btn2 go" id="npPtsGo"' + (S.pts.busy ? ' disabled' : '') + '>' + (S.pts.busy ? '…' : 'Uplatnit') + '</button></div><div class="lim2">Nejvíc ' + maxAllowed + ' b. (až 30 % zboží)</div>';
      h += '<div class="np-err-box" id="npPtsErr"></div>' + (depOn ? '<div class="note">Po uplatnění bodů se depozit nepoužije.</div>' : '') + '</div>';
    } else if (bal != null) {
      h += '<div class="rd"><div class="note">' + (bal < 100 ? 'Body lze uplatnit od 100 b. Každá objednávka vám je přidá.' : 'Body lze uplatnit u zboží od ' + kc(334) + '. Přidejte do košíku další květiny.') + '</div></div>';
    }
    return h + '</div></div>';
  }
  function renderPromo() {
    var el = $('#npPromo'); if (!el) return;
    var depOn = canDeposit() && S.dep.use, applied = promoActive();
    if (applied) S.accOpen = true;
    var h = '';
    if (applied) {
      var pc = tc().promocode || {}, isPts = S.pts.applied > 0 || /^uplatn/i.test(String(pc.promocode || ''));
      h = (S.loggedIn ? loyBlock(false, true) : '') + '<div class="np-done"><span class="ic"><i class="ti ti-' + (isPts ? 'coins' : 'ticket') + '"></i></span><span class="tx"><b>' + (isPts ? 'Body uplatněny' : 'Sleva uplatněna') + '</b><small>' + (isPts ? '' : (pc.promocode ? esc(String(pc.promocode)) + ' · ' : '')) + 'ušetříte ' + kc(discountSum()) + '</small></span><button type="button" id="npPromoX">Odebrat</button></div>';
    } else {
      h += loyBlock(depOn);
      h += '<div class="np-acc' + (S.accOpen ? ' open' : '') + '"><button type="button" id="npAccBtn"><span class="ic"><i class="ti ti-ticket"></i></span><span class="tx">Máte slevový kód?<small>Zadejte kód a uplatníme slevu</small></span><i class="ti ti-chevron-down chev"></i></button><div class="bd">';
      h += '<div class="np-promo-row"><input class="np-in" id="np_promo" type="text" placeholder="Slevový kód" autocomplete="off" value="' + esc(S.promo.code) + '"><button type="button" class="np-btn2" id="npPromoGo"' + (S.promo.busy ? ' disabled' : '') + '>' + (S.promo.busy ? '…' : 'Použít') + '</button></div><div class="np-err-box" id="npPromoErr"></div>';
      if (depOn) h += '<div class="np-hint">Po uplatnění kódu se depozit nepoužije.</div>';
      h += '</div></div>';
    }
    el.innerHTML = h;
    var reg = $('#npLoyReg'); if (reg) reg.addEventListener('click', function () { try { localStorage.setItem('lkReturnUrl', location.pathname); } catch (e) {} });
    var ab = $('#npAccBtn'); if (ab) ab.addEventListener('click', function () { S.accOpen = !S.accOpen; ab.parentNode.classList.toggle('open', S.accOpen); });
    var go = $('#npPromoGo'); if (go) go.addEventListener('click', applyPromo);
    var inp = $('#np_promo'); if (inp) { inp.addEventListener('input', function () { S.promo.code = inp.value; }); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyPromo(); } }); }
    var x = $('#npPromoX'); if (x) x.addEventListener('click', removePromo);
    var pm = $('#npPm'), pp = $('#npPp'), pg = $('#npPtsGo');
    if (pm) pm.addEventListener('click', function () { S.pts.sel = Math.max(100, S.pts.sel - 100); renderPromo(); });
    if (pp) pp.addEventListener('click', function () { var mx = Math.min(1000, Math.floor(goodsNet() * 0.3 / 100) * 100, Math.floor(S.pts.balance / 100) * 100); S.pts.sel = Math.min(mx, S.pts.sel + 100); renderPromo(); });
    if (pg) pg.addEventListener('click', applyPoints);
  }
  function promoErr(m, pts) { var e = $(pts ? '#npPtsErr' : '#npPromoErr'); if (!e) return toast(m, true); e.textContent = m; e.classList.add('on'); }
  function tildaPromo(code) {
    return new Promise(function (res) {
      var root = cartRoot(); if (!root) return res({ ok: false });
      var input = $('.t-inputpromocode', root), btn = $('.t-inputpromocode__btn', root);
      if (!input || !btn) return res({ ok: false });
      var oa = window.alert; window.alert = function () {};
      input.value = code; fire(input, ['input', 'change']); btn.click();
      var n = 0, iv = setInterval(function () {
        n++;
        if (promoActive()) { clearInterval(iv); window.alert = oa; return res({ ok: true }); }
        var txt = ($('.t-inputpromocode__wrapper', root) || { textContent: '' }).textContent.toLowerCase();
        var okTxt = txt.indexOf('aktivov') > -1 || txt.indexOf('активиров') > -1;
        var bad = input.classList.contains('t-input_error') || (function () { var e = $('.t-inputpromocode__error', root); return e && e.offsetParent !== null && e.textContent.length > 2; })();
        if (okTxt) { clearInterval(iv); window.alert = oa; return res({ ok: true }); }
        if (bad || n > 40) { clearInterval(iv); window.alert = oa; res({ ok: false }); }
      }, 100);
    });
  }
  function applyPromo() {
    var code = (S.promo.code || '').trim(); if (!code) return promoErr('Napište prosím slevový kód.');
    var pgo = $('#npPromoGo'), pRect = pgo ? pgo.getBoundingClientRect() : null;
    if (S.promo.busy) return; S.promo.busy = true; renderPromo();
    tildaPromo(code).then(function (r) {
      S.promo.busy = false;
      if (r.ok) { S.dep.use = false; S.tweenDelay = 420; syncCartDelivery(); renderDep(); renderPromo(); renderPays(); refresh(); S.tweenDelay = 0; celebrate(pRect, '−' + kc(discountSum())); toast('Slevový kód byl uplatněn.'); }
      else { renderPromo(); promoErr('Slevový kód nebyl nalezen.'); }
    });
  }
  function applyPoints() {
    var token = authToken(); if (!token) return promoErr('Přihlaste se prosím.', true);
    var goBtn = $('#npPtsGo'), fromRect = goBtn ? goBtn.getBoundingClientRect() : null;
    if (S.pts.busy) return; S.pts.busy = true; renderPromo();
    var cartTotal = Math.round(goodsNet() + feeCalc().fee);
    fn('tilda-webhook', { action: 'get_promo', token: token, amount: S.pts.sel, total_sum: cartTotal, check_only: true }).then(function (r) {
      if (!r || r.status !== 'success') { S.pts.busy = false; renderPromo(); return promoErr((r && r.message) || 'Chyba.', true); }
      return tildaPromo('Uplatněno' + S.pts.sel + 'bodů').then(function (x) {
        S.pts.busy = false;
        if (x.ok) { S.pts.applied = S.pts.sel; S.dep.use = false; if (S.pts.balance != null) S.pts.balance -= S.pts.sel; S.tweenDelay = 420; syncCartDelivery(); renderDep(); renderPromo(); renderPays(); refresh(); S.tweenDelay = 0; celebrate(fromRect, '−' + kc(S.pts.applied)); toast('Body byly uplatněny.'); }
        else { renderPromo(); promoErr('Body se nepodařilo uplatnit, zkuste to prosím znovu.', true); }
      });
    }).catch(function () { S.pts.busy = false; renderPromo(); promoErr('Chyba spojení.', true); });
  }
  function removePromo() {
    try {
      var raw = JSON.parse(localStorage.getItem('tcart') || '{}');
      delete raw.promocode; delete raw.prodamount_withdiscount; delete raw.prodamount_discountsum;
      localStorage.setItem('tcart', JSON.stringify(raw));
    } catch (e) {}
    location.reload();
  }

  /* ---------- deposit quote (server decides) ---------- */
  var quoteSoon = debounce(function () { quoteDeposit(); }, 500);
  function quoteDeposit() {
    var token = authToken(); if (!token || !S.loggedIn || S.dep.balance < 1) return;
    var prods = products().map(function (p) { return { uid: String(p.uid || p.lid || ''), quantity: pieces(p) }; });
    if (!prods.length || prods.some(function (p) { return !p.uid; })) { S.dep.err = 'Tento košík zatím nelze zaplatit depozitem.'; S.dep.quote = null; renderDep(); return; }
    var f = feeCalc();
    if (S.mode === 'courier' && !S.gift && (f.need || f.tooFar)) { S.dep.err = f.tooFar ? 'Na tuto adresu nedoručujeme.' : 'Vyberte adresu ze seznamu, spočítáme cenu.'; S.dep.quote = null; renderDep(); return; }
    S.dep.loading = true;
    fn('checkout-order', { action: 'quote', token: token, use_deposit: true, delivery: S.mode, form: { recipient_lat: S.lat, recipient_lng: S.lng, psc: S.gift ? '11000' : S.psc }, products: prods }).then(function (q) {
      S.dep.loading = false;
      if (q && q.ok) { S.dep.quote = q; S.dep.balance = q.balance; S.dep.err = ''; }
      else { S.dep.quote = null; S.dep.err = quoteErrText(q && q.error); }
      renderDep(); renderPays(); refresh();
    }).catch(function () { S.dep.loading = false; });
  }
  function quoteErrText(code) {
    code = String(code || '');
    if (code.indexOf('product_unavailable') === 0) return 'Tento košík zatím nelze zaplatit depozitem. Zaplaťte prosím kartou.';
    if (code === 'address_not_selected') return 'Vyberte adresu ze seznamu, spočítáme cenu.';
    if (code === 'too_far') return 'Na tuto adresu nedoručujeme.';
    if (code === 'voucher_not_supported') return 'Dárkový poukaz nelze zaplatit depozitem.';
    return 'Depozit se teď nepodařilo načíst. Můžete zaplatit kartou.';
  }

  /* ---------- summary ---------- */
  function renderSummary() {
    var items = $('#npItems'), lines = $('#npLines');
    if (!items) return;
    var ps = products();
    items.innerHTML = ps.map(function (p) {
      var img = p.img ? String(p.img).replace(/"/g, '') : '';
      return '<div class="np-item"><div class="im"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '></div><div class="nm">' + esc(decode(p.name)) + '<small>' + esc(pieces(p)) + ' ks</small></div><div class="pr">' + kc(p.amount) + '</div></div>';
    }).join('');
    var t = totals(), f = t.f, h = '';
    h += '<div><span>Zboží</span><b>' + kc(t.raw) + '</b></div>';
    if (t.disc > 0) h += '<div class="disc' + (t.disc > (S.prevDisc || 0) && !reduceMotion() ? ' new' : '') + '"><span>Sleva</span><b>−' + kc(t.disc) + '</b></div>';
    S.prevDisc = t.disc;
    if (S.mode === 'courier') h += '<div><span>Doručení kurýrem' + (f.extra ? ' (vč. příplatku za vzdálenost)' : '') + '</span><b>' + (f.need || f.empty ? 'od ' + kc(f.delivery) : kc(f.delivery)) + '</b></div>';
    else h += '<div class="free"><span>Osobní odběr</span><b>Zdarma</b></div>';
    h += '<div class="info" id="npSvc"><span>Servisní poplatek<i class="ti ti-info-circle"></i></span><b>' + kc(f.service) + '</b></div>';
    lines.innerHTML = h;
    setMoney($('#npTotal'), t.total);
    var sp = $('#npSplit'), useDep = canDeposit() && S.dep.use && t.dep > 0;
    if (useDep) {
      sp.className = 'np-split on'; sp.innerHTML = '<div class="g"><span>Z depozitu</span><b>−' + kc(t.dep) + '</b></div><div><span>' + (t.card > 0 ? 'Kartou zaplatíte' : 'Kartou nic neplatíte') + '</span><b>' + kc(t.card) + '</b></div>';
    } else sp.className = 'np-split';
    var label = ctaLabel(t), arrow = ' <i class="ti ti-arrow-right"></i>';
    $('#npCta').innerHTML = S.submitting ? '<span class="sp"></span>Zpracováváme…' : label + arrow;
    $('#npBarBtn').innerHTML = S.submitting ? '<span class="sp"></span>' : label.replace(/ · .*$/, '') + arrow;
    $('#npCta').disabled = $('#npBarBtn').disabled = S.submitting;
    setMoney($('#npBarTot'), useDep ? t.card : t.total);
    $('#npBarLbl').textContent = useDep ? (t.card > 0 ? 'Kartou zaplatíte' : 'Z depozitu') : 'Celkem';
    if (useDep && t.card <= 0) setMoney($('#npBarTot'), t.total);
  }
  function ctaLabel(t) {
    if (canDeposit() && S.dep.use && t.dep > 0 && t.card <= 0) return 'Zaplatit z depozitu · ' + kc(t.total);
    if (S.pay === 'cash') return 'Odeslat objednávku';
    return 'Pokračovat k platbě';
  }
  function refresh() { modePrice(); renderSummary(); updateSteps(); }

  /* ---------- validation ---------- */
  function validate() {
    var bad = [], sec = {};
    function need(k, msg, s) { setErr(k, msg); if (msg) { bad.push({ k: k, s: s }); sec[s] = 1; } }
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((S.email || '').trim());
    need('name', S.name.trim() ? '' : 'Vyplňte prosím jméno.', 'c1');
    need('last', S.last.trim() ? '' : 'Vyplňte prosím příjmení.', 'c1');
    need('phone', phoneValid(S.phone) ? '' : 'Zadejte prosím telefon (9 číslic).', 'c1');
    need('email', emailOk ? '' : 'Zadejte prosím platný e-mail.', 'c1');
    if (S.isCompany) need('ico', S.co.ok ? '' : (S.co.manual ? 'Napište prosím název firmy.' : (S.co.err || 'Zadejte prosím IČO firmy (8 číslic).')), 'c1');
    var f = feeCalc();
    if (S.mode === 'courier' && !S.gift) {
      need('adres', S.adres.trim() ? (f.tooFar ? 'Na tuto adresu kurýrem nedoručujeme.' : (f.need ? 'Vyberte prosím adresu ze seznamu.' : (S.noNum ? 'Doplňte prosím číslo popisné: vyberte ze seznamu adresu s číslem.' : ''))) : 'Vyplňte prosím adresu.', 'c2');
      need('city', S.city.trim() ? '' : 'Vyplňte prosím město.', 'c2');
      need('psc', /^\d{3}\s?\d{2}$/.test(S.psc.trim()) ? '' : 'Zadejte prosím PSČ (5 číslic).', 'c2');
    }
    if (!S.gift) {
      var dm = !S.date ? 'Vyberte datum.' : (dateReason(parseIso(S.date)) !== null ? 'Toto datum už není k dispozici.' : '');
      $('#npDateErr').textContent = dm; $('#g_date').classList.toggle('bad', !!dm); if (dm) { bad.push({ k: 'date', s: 'c2', el: '#g_date' }); sec.c2 = 1; }
      var tm = S.mode === 'pickup' ? (S.time ? '' : 'Vyberte čas.') : (S.slot && !slotReason(S.slot) ? '' : 'Vyberte dobu doručení.');
      $('#npTimeErr').textContent = tm; $('#g_time').classList.toggle('bad', !!tm); if (tm) { bad.push({ k: 'time', s: 'c2', el: '#g_time' }); sec.c2 = 1; }
    }
    if (!S.same || S.gift) {
      need('rname', S.rname.trim() ? '' : 'Vyplňte prosím jméno příjemce.', 'c3');
      need('rlast', S.rlast.trim() || S.gift ? '' : 'Vyplňte prosím příjmení příjemce.', 'c3');
      need('rphone', (S.gift && !/^(phone|whatsapp)$/.test(S.gift.channel)) || phoneValid(S.rphone) ? '' : 'Zadejte prosím telefon příjemce.', 'c3');
    }
    if (hasPostcard()) {
      need('pcTo', S.pcTo.trim() ? '' : 'Napište prosím, pro koho pohlednice je.', 'c3');
      need('pcText', S.pcText.trim() ? '' : 'Napište prosím text pohlednice.', 'c3');
    }
    if (!S.consent) { setErr('consent', 'x'); $('#npConsentL').classList.add('bad'); bad.push({ k: 'consent', s: 'c4', el: '#npConsentL' }); sec.c4 = 1; }
    ['c1', 'c2', 'c3', 'c4'].forEach(function (id) { $('#' + id).classList.toggle('err', !!sec[id]); });
    return bad;
  }
  function updateSteps() {
    var ok = {
      c1: S.name.trim() && S.last.trim() && phoneValid(S.phone) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((S.email || '').trim()),
      c2: S.gift ? true : ((S.mode === 'pickup' || (S.adres.trim() && !feeCalc().need && !feeCalc().tooFar && !S.noNum && S.city.trim())) && S.date && (S.mode === 'pickup' ? S.time : S.slot)),
      c3: S.same ? (S.name.trim() && S.last.trim() && phoneValid(S.phone)) : (S.rname.trim() && S.rlast.trim() && phoneValid(S.rphone)),
      c4: S.consent
    };
    var prog = $$('#npProg i', ROOT);
    ['c1', 'c2', 'c3', 'c4'].forEach(function (id, i) {
      var done = !!ok[id], sec = $('#' + id); if (!sec) return;
      sec.classList.toggle('done', done);
      var num = $('.np-num', sec), want = done ? '1' : '0';
      if (num && num.getAttribute('data-d') !== want) { num.setAttribute('data-d', want); num.innerHTML = done ? '<i class="ti ti-check"></i>' : id.charAt(1); }
      if (prog[i]) prog[i].classList.toggle('on', done);
    });
  }

  /* ---------- hand data to the real Tilda cart ---------- */
  function setCart(name, val) {
    var f = cartForm(); if (!f) return;
    var el = f.querySelector('[name="' + name + '"]');
    if (!el) { el = document.createElement('input'); el.type = 'hidden'; el.name = name; f.appendChild(el); }
    el.value = val; if (el.type !== 'hidden') fire(el);
  }
  function setCartClick(name, valueMatch) {
    var f = cartForm(); if (!f) return false;
    var r = $$('input[name="' + name + '"]', f).filter(function (x) { return valueMatch(x.value); })[0];
    if (!r) return false;
    if (!r.checked) { var lab = r.closest('label'); (lab || r).click(); if (!r.checked) r.click(); }
    return true;
  }
  function setCartCheck(name, on) {
    var f = cartForm(); if (!f) return; var el = f.querySelector('input[type="checkbox"][name="' + name + '"]');
    if (el && el.checked !== on) { el.checked = on; fire(el); }
  }
  function syncCartDelivery() {
    var f = cartForm(); if (!f) return;
    var fee = feeCalc();
    $$('input[name="delivery"]', f).forEach(function (r) { if (/kur/i.test(r.value)) r.setAttribute('data-delivery-price', String(fee.fee)); });
    var want = S.mode === 'courier' ? function (v) { return /kur/i.test(v); } : function (v) { return !/kur/i.test(v); };
    setCartClick('delivery', want);
    if (typeof window.tcart__updateDelivery === 'function') { try { window.tcart__updateDelivery(); } catch (e) {} }
  }
  function commitToCart() {
    var f = cartForm(); if (!f) return false;
    var g = S.gift;
    setCart('name', S.name.trim()); setCart('last-name', S.last.trim()); setCart('phone', phoneCart(S.phone)); setCart('email', S.email.trim());
    var cf = companyForm(); Object.keys(cf).forEach(function (k) { setCart(k, cf[k]); });
    var date = S.gift ? iso(addDays(new Date(), 1)) : S.date; setCart('date', dmy(date));
    if (S.mode === 'pickup') { setCart('time', S.time || ''); }
    else {
      var te = cartForm().querySelector('[name="time"]'); if (te && te.value && te.value.indexOf('_') === -1) te.value = '';
      var slot = S.gift ? (SLOTS.filter(function (s) { return !(AV.slots[date] && AV.slots[date][s]); })[0] || SLOTS[0]) : S.slot;
      setCartClick('delivery-time', function (v) { return v === slot; });
    }
    var adres = g ? 'Adresu zadá příjemce' : (S.mode === 'courier' ? S.adres.trim() : ''), city = g ? 'Praha' : (S.mode === 'courier' ? S.city.trim() : ''), psc = g ? '110 00' : (S.mode === 'courier' ? S.psc.trim() : '');
    setCart('adres', adres); setCart('city', city); setCart('psc', psc);
    setCart('floor', S.mode === 'courier' && !g ? S.floor : ''); setCart('apartment-number', S.mode === 'courier' && !g ? S.apt : ''); setCart('intercom', S.mode === 'courier' && !g ? S.intercom : '');
    var rn = S.same ? S.name : S.rname, rl = S.same ? S.last : S.rlast, rp = S.same ? S.phone : S.rphone;
    if (g && !phoneValid(rp)) rp = S.phone;
    setCart('recipients-name', rn.trim()); setCart('recipients-lastname', (rl || '').trim() || '-'); setCart('recipients-phone-number', phoneCart(rp));
    setCartCheck('recipient-customer', !!S.same && !g);
    setCart('comments', S.comment || ''); setCartCheck('personal-data', true);
    setCart('recipient_lat', S.lat != null && !g ? S.lat : ''); setCart('recipient_lng', S.lng != null && !g ? S.lng : '');
    var fee = feeCalc();
    setCart('delivery_km', fee.km != null ? (Math.round(fee.km * 10) / 10).toString() : '');
    setCart('delivery_fee_calc', S.mode === 'courier' ? (fee.tooFar ? 'too_far' : CFG.base + '+' + fee.extra + '+' + CFG.service + '=' + fee.fee) : '');
    ['gift-no-address', 'gift-channel', 'gift-handle', 'gift-recipient-name', 'gift-sender-visible'].forEach(function (n) { var e = f.querySelector('[name="' + n + '"]'); if (e) e.remove(); });
    if (g) { setCart('gift-no-address', 'yes'); setCart('gift-channel', g.channel); setCart('gift-handle', g.handle); setCart('gift-recipient-name', g.name); setCart('gift-sender-visible', g.visible ? 'yes' : 'no'); }
    if (hasPostcard()) {
      setCartClick('senders_name_postcard', function (v) { return S.pcSender === 'anon' ? /anonym/i.test(v) : /jmén|jmen|zákazn/i.test(v); });
      setCart('recipients_name_postcard', S.pcTo.trim()); setCart('postcard_comment', S.pcText.trim());
    }
    syncCartDelivery();
    var want = S.pay === 'cash' ? 'cash' : 'stripe';
    var pr = $('.t-radio_payment[value="' + want + '"]', f) || $('input[name="paymentsystem"][value="' + want + '"]', f);
    if (pr && !pr.checked) { (pr.closest('label') || pr).click(); if (!pr.checked) pr.click(); }
    return true;
  }

  /* ---------- submit ---------- */
  function setBusy(b) { S.submitting = b; renderSummary(); }
  function submit() {
    if (S.submitting) return;
    var bad = validate();
    if (bad.length) {
      var first = bad[0]; var el = first.el ? $(first.el) : $('[data-k="' + first.k + '"]', ROOT);
      (el || $('#' + first.s)).scrollIntoView({ behavior: 'smooth', block: 'center' });
      var inp = el && $('input,textarea', el); if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 400);
      toast('Zkontrolujte prosím zvýrazněná pole.', true);
      return;
    }
    var t = totals();
    var f = feeCalc(); if (S.mode === 'courier' && !S.gift && (f.need || f.tooFar)) { toast(f.tooFar ? 'Na tuto adresu nedoručujeme.' : 'Vyberte prosím adresu ze seznamu.', true); return; }
    saveDraft();
    if (canDeposit() && S.dep.use && t.dep > 0) return submitDeposit(t);
    return submitTilda();
  }
  function tildaErrText() {
    var root = cartRoot(); if (!root) return '';
    var els = $$('.js-errorbox-all, .t-form__errorbox-text', root);
    for (var i = 0; i < els.length; i++) { var t = String(els[i].textContent || '').replace(/\s+/g, ' ').trim(); if (t) return t; }
    return '';
  }
  function clearTildaErr() {
    var root = cartRoot(); if (!root) return;
    $$('.js-errorbox-all', root).forEach(function (e) { e.style.display = 'none'; });
    $$('.t-form__errorbox-text', root).forEach(function (e) { e.textContent = ''; });
  }
  function showAlert(text) {
    var a = $('#npAlert'); if (!a) return;
    var msg = text;
    if (/измени|цена|price/i.test(text)) msg = 'U některé položky v košíku se změnila cena nebo dostupnost. Obnovte prosím stránku a přidejte zboží do košíku znovu.';
    else if (/доставк|delivery/i.test(text)) msg = 'Vyberte prosím způsob doručení a zkuste to znovu.';
    a.innerHTML = '<b>Objednávku se nepodařilo odeslat</b><span>' + esc(msg) + '</span><span class="sm">Pokud problém trvá, napište nám na support@vezminarin.cz nebo zavolejte +420 776 421 993.</span><button type="button" id="npReload">Obnovit stránku</button>';
    a.hidden = false; a.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var b = $('#npReload'); if (b) b.addEventListener('click', function () { location.reload(); });
  }
  function watchTildaResult() {
    var n = 0, iv = setInterval(function () {
      n++;
      var t = tildaErrText();
      if (t) { clearInterval(iv); setBusy(false); showAlert(t); console.warn('tilda cart error:', t); return; }
      if (n > 60) clearInterval(iv);
    }, 250);
  }
  function submitTilda() {
    setBusy(true);
    if (!commitToCart()) { setBusy(false); return toast('Košík se nepodařilo načíst. Obnovte prosím stránku.', true); }
    var btn = $('.t-submit', cartRoot());
    if (!btn) { setBusy(false); return toast('Odeslání se nepodařilo. Obnovte prosím stránku.', true); }
    var al = $('#npAlert'); if (al) al.hidden = true; clearTildaErr();
    setTimeout(function () { btn.click(); watchTildaResult(); }, 200);
    /* Tilda redirects to the payment page; if it stays (captcha, error), let the customer retry */
    setTimeout(function () { if (S.submitting) setBusy(false); }, 12000);
  }
  function submitDeposit(t) {
    var token = authToken(); if (!token) return toast('Přihlaste se prosím znovu.', true);
    setBusy(true);
    var prods = products().map(function (p) { return { uid: String(p.uid || p.lid || ''), quantity: pieces(p) }; });
    var g = S.gift, date = g ? iso(addDays(new Date(), 1)) : S.date;
    var rn = S.same ? S.name : S.rname, rl = S.same ? S.last : S.rlast, rp = S.same ? S.phone : S.rphone;
    if (g && !phoneValid(rp)) rp = S.phone;
    var form = {
      name: S.name.trim(), 'last-name': S.last.trim(), phone: phoneCart(S.phone), email: S.email.trim(), 'company-name': companyForm()['company-name'], 'company-ico': companyForm()['company-ico'], 'company-dic': companyForm()['company-dic'], 'company-address': companyForm()['company-address'], 'company-vat': companyForm()['company-vat'],
      date: dmy(date), comments: S.comment || '', 'personal-data': 'yes',
      'recipients-name': rn.trim(), 'recipients-lastname': (rl || '').trim() || '-', 'recipients-phone-number': phoneCart(rp), 'recipient-customer': S.same && !g ? 'yes' : '',
      adres: g ? 'Adresu zadá příjemce' : (S.mode === 'courier' ? S.adres.trim() : ''), city: g ? 'Praha' : (S.mode === 'courier' ? S.city.trim() : ''), psc: g ? '110 00' : (S.mode === 'courier' ? S.psc.trim() : ''),
      floor: S.mode === 'courier' && !g ? S.floor : '', 'apartment-number': S.mode === 'courier' && !g ? S.apt : '', intercom: S.mode === 'courier' && !g ? S.intercom : '',
      recipient_lat: S.lat != null && !g ? String(S.lat) : '', recipient_lng: S.lng != null && !g ? String(S.lng) : ''
    };
    if (S.mode === 'pickup') form.time = S.time || '';
    else form['delivery-time'] = g ? (SLOTS.filter(function (s) { return !(AV.slots[date] && AV.slots[date][s]); })[0] || SLOTS[0]) : S.slot;
    if (g) { form['gift-no-address'] = 'yes'; form['gift-channel'] = g.channel; form['gift-handle'] = g.handle; form['gift-recipient-name'] = g.name; form['gift-sender-visible'] = g.visible ? 'yes' : 'no'; }
    if (hasPostcard()) { form.senders_name_postcard = S.pcSender === 'anon' ? 'Poslat anonymně' : 'Podepsat mým jménem'; form.recipients_name_postcard = S.pcTo.trim(); form.postcard_comment = S.pcText.trim(); }
    var key = 'np' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    try { var old = sessionStorage.getItem('npay_key'); if (old && /^np[a-z0-9]{16,}/.test(old) && sessionStorage.getItem('npay_key_sig') === JSON.stringify([form.date, prods])) key = old; sessionStorage.setItem('npay_key', key); sessionStorage.setItem('npay_key_sig', JSON.stringify([form.date, prods])); } catch (e) {}
    fn('checkout-order', { action: 'create', token: token, checkout_key: key, use_deposit: true, delivery: S.mode, form: form, products: prods }).then(function (r) {
      if (r && r.ok && r.url) { try { sessionStorage.removeItem('npay_key'); sessionStorage.removeItem(DRAFT_KEY); } catch (e) {} location.href = r.url; return; }
      setBusy(false);
      var code = String(r && r.error || '');
      var msg = code === 'too_far' ? 'Na tuto adresu nedoručujeme.' : code === 'address_not_selected' ? 'Vyberte prosím adresu ze seznamu.' :
        code.indexOf('product_unavailable') === 0 ? 'Některou položku v košíku nelze zaplatit depozitem. Zaplaťte prosím kartou.' :
        code === 'no_deposit' ? 'Na depozitu není dost prostředků.' : code === 'invalid_token' ? 'Přihlášení vypršelo. Přihlaste se prosím znovu.' : 'Objednávku se nepodařilo odeslat. Zkuste to prosím znovu nebo zaplaťte kartou.';
      toast(msg, true, 5200);
    }).catch(function () { setBusy(false); toast('Chyba spojení. Zkuste to prosím znovu.', true); });
  }

  /* ---------- prefill ---------- */
  function prefill() {
    var pr = tildaProfile(), token = authToken();
    S.token = token; S.loggedIn = !!(token && pr);
    if (!pr) return;
    var full = String(pr.name || '').trim().split(/\s+/);
    if (!S.name && full[0]) S.name = cleanName(full[0]);
    if (!S.last && full.slice(1).join(' ')) S.last = cleanName(full.slice(1).join(' '));
    if (!S.email && (pr.login || pr.email)) S.email = pr.login || pr.email;
    if (!S.phone && pr.phone) S.phone = phoneShow(pr.phone);
  }
  function loadPoints() {
    var token = authToken(); if (!token) return;
    fn('member-data', { token: token }).then(function (d) { if (d && !d.error && d.balance != null) { S.pts.balance = Number(d.balance) || 0; S.pts.earned = Number(d.totalEarned) || 0; S.pts.tierName = d.tier || ''; S.pts.ma = d.ma_id || ''; renderPromo(); } }).catch(function () {});
    fn('customer-deposit', { action: 'get', token: token }).then(function (d) { if (d && d.balance != null) { S.dep.balance = Math.max(0, Number(d.balance) || 0); renderDep(); renderPromo(); renderPays(); refresh(); quoteSoon(); } }).catch(function () {});
  }

  /* ---------- delivery-name fix (phones): Tilda leaves tcart.delivery.name empty in full-screen mode ---------- */
  function installDeliveryFix() {
    if (window.__narinDelFix) return;
    function fixNow() { try { var d = tc().delivery; if (d && !d.name) { var r = $('.t706 .t-form .t-radio__wrapper-delivery input:checked'); if (r && r.value) d.name = String(r.value).split('=')[0].trim(); } } catch (e) {} }
    function wrap() {
      if (window.__narinDelFix) return true;
      if (typeof window.tcart__processDelivery !== 'function') return false;
      var orig = window.tcart__processDelivery;
      window.tcart__processDelivery = function (el) { var ok = orig.apply(this, arguments); try { if (ok && el && window.tcart && window.tcart.delivery && !window.tcart.delivery.name) window.tcart.delivery.name = String(el.value || '').split('=')[0].trim(); } catch (e) {} return ok; };
      window.__narinDelFix = 1; fixNow(); return true;
    }
    if (!wrap()) { var n = 0, t = setInterval(function () { if (wrap() || ++n > 200) clearInterval(t); }, 100); }
    document.addEventListener('click', fixNow, true); document.addEventListener('change', function () { setTimeout(fixNow, 0); }, true);
  }

  /* ---------- boot ---------- */
  function revealOnScroll() {
    ROOT.classList.add('js');
    var els = $$('.np-sec, .np-sum', ROOT);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }); }, { threshold: 0.08 });
    els.forEach(function (e, i) { e.style.transitionDelay = Math.min(i, 3) * 60 + 'ms'; io.observe(e); });
    setTimeout(function () { els.forEach(function (e) { e.classList.add('in'); }); }, 2500);
  }
  function showEmpty() {
    ROOT.innerHTML = '<div class="np-empty"><h2>Váš košík je prázdný</h2><p>Vyberte si květiny v našem katalogu a vraťte se k objednávce.</p><a href="/">Do katalogu</a></div>';
  }
  function boot() {
    ROOT = document.getElementById('npay'); if (!ROOT) return;
    try { var m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m); } catch (e) {}
    ROOT.innerHTML = '<div class="np-skel"></div><div class="np-skel"></div>';
    installDeliveryFix();
    waitFor(function () { return cartForm() && window.tcart && typeof window.tcart__updateDelivery === 'function'; }, 20000).then(function (ok) {
      if (!ok) { ROOT.innerHTML = '<div class="np-empty"><h2>Stránku se nepodařilo načíst</h2><p>Obnovte ji prosím, případně nám napište na support@vezminarin.cz.</p></div>'; return; }
      if (!products().length) return showEmpty();
      loadDraft(); prefill();
      var now = new Date(); cal.y = now.getFullYear(); cal.m = now.getMonth();
      ROOT.innerHTML = template();
      bindFields(); bindWhen(); bindWho();
      $('#npCta').addEventListener('click', submit); $('#npBarBtn').addEventListener('click', submit);
      ROOT.addEventListener('click', function (e) { if (e.target.closest('#npSvc')) toast('Servisní poplatek zahrnuje přípravu a zabalení kytice, zpracování objednávky a daně.', false, 6000); });
      if (S.date && dateReason(parseIso(S.date)) !== null && AV.loaded) S.date = null;
      var fa = !S.date && firstAvailable(); if (fa) { S.date = iso(fa); cal.y = fa.getFullYear(); cal.m = fa.getMonth(); }
      else if (S.date) { var sd = parseIso(S.date); cal.y = sd.getFullYear(); cal.m = sd.getMonth(); }
      renderLogin(); renderModes(); renderCalendar(); renderChips(); renderSlots(); renderRecipient(); renderDep(); renderPromo(); renderPays();
      if (S.same) syncSame();
      renderWho(); revealOnScroll();
      refresh(); initPlaces(); onAddress();
      loadAvail().then(function () { var fa2 = S.date && dateReason(parseIso(S.date)) === null ? null : firstAvailable(); if (fa2) { S.date = iso(fa2); cal.y = fa2.getFullYear(); cal.m = fa2.getMonth(); } renderCalendar(); renderChips(); renderSlots(); refresh(); });
      loadRecipients(); loadPoints(); loadMyCompanies(); syncCartDelivery();
      /* keep summary and cart totals in step with Tilda */
      var last = '';
      setInterval(function () { var sig = JSON.stringify([tc().prodamount, tc().prodamount_withdiscount, tc().promocode && tc().promocode.promocode, products().length]); if (sig !== last) { last = sig; renderRecipient(); recomputeSpecial(); renderDep(); renderPromo(); renderPays(); refresh(); quoteSoon(); } }, 800);
      var hb = $('#npBack'); if (hb) hb.addEventListener('click', function (e) { if (history.length > 1 && document.referrer && document.referrer.indexOf(location.host) > -1) { e.preventDefault(); history.back(); } });
      if (window.members && typeof members.hideuserbar === 'function') { try { members.hideuserbar(); } catch (e) {} }
    });
  }
  window.__npay = { S: S, AV: AV, validate: validate, commit: commitToCart, totals: totals, feeCalc: feeCalc, refresh: refresh, renderDep: renderDep, renderPromo: renderPromo, renderPays: renderPays, renderModes: renderModes, loadRecipients: loadRecipients, renderRecs: renderRecs };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
