import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()

def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

# ---- CSS ----
rep(".np [hidden] { display: none !important; }",
    ".np [hidden] { display: none !important; }\n"
    ".np.vo #npWho, .np.vo #npWhoErr, .np.vo #npOther, .np.vo #npMe, .np.vo #npRNote, .np.vo #npPostcard { display: none !important; }\n"
    ".np-vch .np-tile .s { font-size: 13px; }\n"
    ".np-vch input[type=date].np-in { line-height: 56px; }\n"
    ".np-vhint { font-size: 13px; color: var(--mut); line-height: 1.45; margin: -4px 4px 14px; }\n"
    ".np-cats { display: flex; gap: 10px; align-items: flex-start; margin-top: 14px; padding: 12px 14px; border-radius: 16px; background: #fbf6ee; font-size: 13.5px; line-height: 1.45; color: #4a505b; }\n"
    ".np-cats a { color: var(--blue); font-weight: 600; text-decoration: none; white-space: nowrap; }")

# ---- helpers ----
rep("  function hasVoucher() { return products().some(function (p) { return /poukaz/i.test(p.name); }); }",
    "  function hasVoucher() { return products().some(function (p) { return /poukaz/i.test(p.name); }); }\n"
    "  /* electronic gift card = name has poukaz but not plastov (same rule as the DB trigger voucher_split) */\n"
    "  function isEV(p) { return /poukaz/i.test(decode(p.name)) && !/plastov|card-/i.test(decode(p.name)); }\n"
    "  function hasEV() { return products().some(isEV); }\n"
    "  function vOnly() { var ps = products(); return ps.length > 0 && ps.every(isEV); }\n"
    "  var VO = false;\n"
    "  function isEmail(v) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v || '').trim()); }\n"
    "  function vcDateOk() { var d = S.vc.date; if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(d || '')) return false; var x = parseIso(d), t = sod(new Date()); return x > t && x <= addDays(t, 60); }\n"
    "  function vcOk() { if (!hasEV() || S.vc.to !== 'other') return true; return isEmail(S.vc.email) && (S.vc.when !== 'date' || vcDateOk()); }")

# ---- state + draft ----
rep("    who: null, gm: null, gl: { channel: 'phone', handle: '', visible: true }, glBlocked: false, act: 'c1', col: {}\n  };",
    "    who: null, gm: null, gl: { channel: 'phone', handle: '', visible: true }, glBlocked: false, act: 'c1', col: {},\n"
    "    vc: { to: 'me', email: '', name: '', msg: '', when: 'now', date: '' }\n  };")
rep("'pcSender', 'pcTo', 'pcText', 'who', 'gm', 'gl'].forEach(function (k) { d[k] = S[k]; });",
    "'pcSender', 'pcTo', 'pcText', 'who', 'gm', 'gl', 'vc'].forEach(function (k) { d[k] = S[k]; });")
rep("    if (!S.gl || typeof S.gl !== 'object') S.gl = { channel: 'phone', handle: '', visible: true };",
    "    if (!S.gl || typeof S.gl !== 'object') S.gl = { channel: 'phone', handle: '', visible: true };\n"
    "    if (!S.vc || typeof S.vc !== 'object') S.vc = { to: 'me', email: '', name: '', msg: '', when: 'now', date: '' };")

# ---- fees: e-cards only = no delivery, no service fee ----
rep("  function feeCalc() {\n",
    "  function feeCalc() {\n"
    "    if (VO) return { fee: 0, delivery: 0, service: 0, km: null, extra: 0, need: false, tooFar: false };\n")

# ---- template ----
rep("      '<div class=\"np-note\" id=\"npRNote\" hidden></div>' +\n      nextBtn('c2', 'Pokračovat k doručení');",
    "      '<div class=\"np-note\" id=\"npRNote\" hidden></div>' +\n      '<div id=\"npVch\" class=\"np-vch\"></div>' +\n"
    "      nextBtn('c2', VO ? 'Pokračovat k platbě' : 'Pokračovat k doručení');")
rep("'<div class=\"np-prog\" id=\"npProg\"><i></i><i></i><i></i><i></i></div>'",
    "'<div class=\"np-prog\" id=\"npProg\"><i></i><i></i><i></i>' + (VO ? '' : '<i></i>') + '</div>'")
rep("<p>Květiny připravíme čerstvé a doručíme v den, který si vyberete.</p>",
    "<p>' + (VO ? 'Dárkovou kartu pošleme e-mailem hned po zaplacení, vám nebo rovnou obdarovanému.' : 'Květiny připravíme čerstvé a doručíme v den, který si vyberete.') + '</p>")
rep("      section('c2', 2, 'Pro koho jsou květiny?', 'Pro vás, nebo jako dárek', s3) +",
    "      section('c2', 2, VO ? 'Komu kartu pošleme?' : 'Pro koho jsou květiny?', VO ? 'E-mailem hned po zaplacení' : 'Pro vás, nebo jako dárek', s3) +")
rep("      section('c4', 4, 'Platba',", "      section('c4', VO ? 3 : 4, 'Platba',")
rep("'<div class=\"np-trust\"><i class=\"ti ti-shield-check\"></i><span>Platbu zpracovává Stripe. Údaje o kartě nikdy nevidíme.</span></div></div></aside>'",
    "'<div class=\"np-trust\"><i class=\"ti ti-shield-check\"></i><span>Platbu zpracovává Stripe. Údaje o kartě nikdy nevidíme.</span></div>' +\n"
    "      '<div class=\"np-cats\" id=\"npCats\" hidden><span>🐾</span><span>Z každé dárkové karty posíláme 50 Kč kočkám v útulcích. Platíme to my, cena se nemění. <a href=\"/darkove-karty#kocky\" target=\"_blank\" rel=\"noopener\">Více</a></span></div></div></aside>'")

# ---- voucher block (render + bind), placed before renderWho ----
rep("  function renderWho() {",
    "  function renderVch() {\n"
    "    var el = $('#npVch'); if (!el) return;\n"
    "    if (!hasEV()) { el.innerHTML = ''; return; }\n"
    "    S.vc.when = 'now'; /* e-cards always go out right after payment */\n"
    "    var v = S.vc, other = v.to === 'other', t = sod(new Date());\n"
    "    var h = (VO ? '' : '<div class=\"np-sub\"><span>Elektronická dárková karta</span></div>') +\n"
    "      '<div class=\"np-tiles\" id=\"npVTo\">' +\n"
    "      '<button type=\"button\" class=\"np-tile' + (other ? '' : ' on') + '\" data-vt=\"me\"><span class=\"ic\"><i class=\"ti ti-mail\"></i></span><span><b>Na můj e-mail</b><span class=\"s\">Kód pošleme vám, předáte ho sami</span></span></button>' +\n"
    "      '<button type=\"button\" class=\"np-tile' + (other ? ' on' : '') + '\" data-vt=\"other\"><span class=\"ic\"><i class=\"ti ti-gift\"></i></span><span><b>Obdarovanému</b><span class=\"s\">Pošleme mu ji e-mailem i s věnováním</span></span></button>' +\n"
    "      '</div>';\n"
    "    if (other) {\n"
    "      h += '<div class=\"np-row\">' + field('vemail', 'E-mail obdarovaného', 'email', { mode: 'email', ac: 'off' }) + '</div><div class=\"np-row\">' + field('vname', 'Jméno obdarovaného', 'text', { req: false }) + '</div>' +\n"
    "        '<div class=\"np-row\"><div class=\"np-f\" data-k=\"vmsg\"><label class=\"l\" for=\"np_vmsg\">Věnování</label><textarea class=\"np-in\" id=\"np_vmsg\" rows=\"3\" maxlength=\"500\" placeholder=\"Např. Všechno nejlepší k narozeninám!\"></textarea><div class=\"np-msg\"></div></div></div>' +\n"
    "        '<div class=\"np-vhint\">Kartu pošleme na tento e-mail hned po zaplacení. Vám přijde potvrzení.</div>';\n"
    "    } else {\n"
    "      h += '<div class=\"np-vhint\">Kartu s kódem pošleme na váš e-mail hned po zaplacení. Přepošlete ji, vytiskněte nebo pošlete přes WhatsApp.</div>';\n"
    "    }\n"
    "    el.innerHTML = h;\n"
    "    var e1 = $('#np_vemail'); if (e1) e1.value = v.email || '';\n"
    "    var e2 = $('#np_vname'); if (e2) e2.value = v.name || '';\n"
    "    var e3 = $('#np_vmsg'); if (e3) e3.value = v.msg || '';\n"
    "    var e4 = $('#np_vdate'); if (e4) { e4.min = iso(addDays(t, 1)); e4.max = iso(addDays(t, 60)); e4.value = v.date || ''; }\n"
    "  }\n"
    "  function bindVch() {\n"
    "    var el = $('#npVch'); if (!el) return;\n"
    "    el.addEventListener('click', function (e) {\n"
    "      var a = e.target.closest('[data-vt]'), b = e.target.closest('[data-vw]');\n"
    "      if (a) { S.vc.to = a.getAttribute('data-vt'); renderVch(); saveDraft(); refresh(); if (S.vc.to === 'other' && !S.vc.email) { var f = $('#np_vemail'); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (x) {} }, 60); } }\n"
    "      if (b) { S.vc.when = b.getAttribute('data-vw'); if (S.vc.when === 'date' && !S.vc.date) S.vc.date = iso(addDays(new Date(), 1)); renderVch(); saveDraft(); refresh(); }\n"
    "    });\n"
    "    var map = { np_vemail: 'email', np_vname: 'name', np_vmsg: 'msg', np_vdate: 'date' };\n"
    "    function on(e) { var k = map[e.target && e.target.id]; if (!k) return; S.vc[k] = String(e.target.value || '').slice(0, k === 'msg' ? 500 : 120); setErr(e.target.id.slice(3), ''); saveDraft(); refresh(); }\n"
    "    el.addEventListener('input', on); el.addEventListener('change', on);\n"
    "  }\n"
    "  function renderWho() {")

# ---- validation ----
rep("    if (S.mode === 'courier' && !S.gift) {\n      need('adres',",
    "    if (S.mode === 'courier' && !S.gift && !VO) {\n      need('adres',")
rep("    if (!S.gift && (!only || only === 'c3')) {", "    if (!S.gift && !VO && (!only || only === 'c3')) {")
rep("      if (!S.who) { we.textContent", "      if (!S.who && !VO) { we.textContent")
rep("    if (hasPostcard()) {\n      need('pcTo',",
    "    if (hasEV() && S.vc.to === 'other') {\n"
    "      need('vemail', isEmail(S.vc.email) ? '' : 'Zadejte prosím e-mail obdarovaného.', 'c2');\n"
    "      if (S.vc.when === 'date') need('vdate', vcDateOk() ? '' : 'Vyberte prosím den: nejdřív zítra, nejpozději za 60 dní.', 'c2');\n"
    "    }\n"
    "    if (hasPostcard()) {\n      need('pcTo',")
rep("    ['c1', 'c2', 'c3', 'c4'].forEach(function (id) { if (!only || id === only) $('#' + id).classList.toggle('err', !!sec[id]); });",
    "    ORDER.forEach(function (id) { if (!only || id === only) $('#' + id).classList.toggle('err', !!sec[id]); });")

# ---- step state ----
rep("      c2: !!(c2 && pc),\n      c3: !!(S.gift ? true :",
    "      c2: !!((VO || (c2 && pc)) && vcOk()),\n      c3: !!(VO || S.gift ? true :")
rep("    ['c1', 'c2', 'c3', 'c4'].forEach(function (id, i) {\n      var done = !!ok[id], sec = $('#' + id); if (!sec) return;",
    "    ORDER.forEach(function (id, i) {\n      var done = !!ok[id], sec = $('#' + id); if (!sec) return;")
rep("num.innerHTML = done ? '<i class=\"ti ti-check\"></i>' : id.charAt(1); }",
    "num.innerHTML = done ? '<i class=\"ti ti-check\"></i>' : String(i + 1); }")
rep("    if (id === 'c2') {\n      if (S.who === 'me') return 'Pro mě';",
    "    if (id === 'c2') {\n"
    "      if (VO) return S.vc.to === 'other' ? 'Pro ' + String(S.vc.email || '').trim() + ' · ' + 'hned po zaplacení' : 'Kód pošleme na váš e-mail';\n"
    "      if (S.who === 'me') return 'Pro mě';")

# ---- cart hand-over ----
rep("  function syncCartDelivery() {\n    var f = cartForm(); if (!f) return;\n    var fee = feeCalc();\n",
    "  function syncCartDelivery() {\n    var f = cartForm(); if (!f) return;\n    var fee = feeCalc();\n"
    "    /* e-cards only: pickup option without the service fee (nothing to prepare or deliver) */\n"
    "    $$('input[name=\"delivery\"]', f).forEach(function (r) { if (/kur/i.test(r.value)) return; if (r.__npP === undefined) r.__npP = r.getAttribute('data-delivery-price'); if (VO) r.setAttribute('data-delivery-price', '0'); else if (r.__npP != null) r.setAttribute('data-delivery-price', r.__npP); });\n")
rep("    var f = cartForm(); if (!f) return false;\n    var g = S.gift;\n",
    "    var f = cartForm(); if (!f) return false;\n"
    "    if (VO) { S.mode = 'pickup'; S.gift = null; if (!S.date) S.date = iso(addDays(new Date(), 1)); if (!S.time) S.time = '12:00'; }\n"
    "    var g = S.gift;\n")
rep("    var rn = S.same ? S.name : S.rname, rl = S.same ? S.last : S.rlast, rp = S.same ? S.phone : S.rphone;\n    if (g && !phoneValid(rp)) rp = S.phone;\n    setCart('recipients-name'",
    "    var me = S.same || VO, rn = me ? S.name : S.rname, rl = me ? S.last : S.rlast, rp = me ? S.phone : S.rphone;\n    if (g && !phoneValid(rp)) rp = S.phone;\n    setCart('recipients-name'")
rep("    if (g) { setCart('gift-no-address', 'yes'); setCart('gift-channel', g.channel);",
    "    ['voucher-recipient-email', 'voucher-recipient-name', 'voucher-send-on', 'voucher-message'].forEach(function (n) { var e = f.querySelector('[name=\"' + n + '\"]'); if (e) e.remove(); });\n"
    "    if (hasEV() && S.vc.to === 'other') {\n"
    "      setCart('voucher-recipient-email', String(S.vc.email || '').trim().toLowerCase()); setCart('voucher-recipient-name', String(S.vc.name || '').trim());\n"
    "      setCart('voucher-message', String(S.vc.msg || '').trim()); setCart('voucher-send-on', S.vc.when === 'date' && vcDateOk() ? S.vc.date : '');\n"
    "    }\n"
    "    if (g) { setCart('gift-no-address', 'yes'); setCart('gift-channel', g.channel);")

# ---- payment: no cash for e-cards only ----
rep("    var cashOk = S.mode === 'pickup';\n", "    var cashOk = S.mode === 'pickup' && !VO;\n")
rep("      '<label class=\"np-tile row' + (S.pay === 'cash' ? ' on' : '') + (cashOk ? '' : ' dis') + '\">",
    "      (VO ? '' : '<label class=\"np-tile row' + (S.pay === 'cash' ? ' on' : '') + (cashOk ? '' : ' dis') + '\">")
rep("'Jen při osobním odběru') + '</span></span><span class=\"rd\"></span></label>';",
    "'Jen při osobním odběru') + '</span></span><span class=\"rd\"></span></label>');")

# ---- summary ----
rep("    if (S.mode === 'courier') h += '<div><span>Doručení kurýrem'",
    "    if (VO) h += '<div class=\"free\"><span>Doručení e-mailem</span><b>Zdarma</b></div>';\n"
    "    else if (S.mode === 'courier') h += '<div><span>Doručení kurýrem'")
rep("    h += '<div class=\"info\" id=\"npSvc\"><span>Servisní poplatek<i class=\"ti ti-info-circle\"></i></span><b>' + kc(f.service) + '</b></div>';\n    lines.innerHTML = h;",
    "    if (!VO) h += '<div class=\"info\" id=\"npSvc\"><span>Servisní poplatek<i class=\"ti ti-info-circle\"></i></span><b>' + kc(f.service) + '</b></div>';\n    lines.innerHTML = h;\n"
    "    var cats = $('#npCats'); if (cats) cats.hidden = !hasVoucher();")

# ---- boot ----
rep("      loadDraft(); prefill();\n",
    "      loadDraft(); prefill();\n"
    "      VO = vOnly(); ORDER = VO ? ['c1', 'c2', 'c4'] : ['c1', 'c2', 'c3', 'c4'];\n"
    "      if (VO) { S.mode = 'pickup'; S.who = null; S.gm = null; S.same = false; S.gift = null; if (S.pay === 'cash') S.pay = 'stripe'; }\n")
rep("      bindFields(); bindWhen(); bindWho(); bindSteps();\n",
    "      bindFields(); bindWhen(); bindWho(); bindSteps(); bindVch();\n"
    "      ROOT.classList.toggle('vo', VO); if (VO) $('#c3').hidden = true;\n"
    "      renderVch();\n")
rep("if (sig !== last) { last = sig; renderRecipient();",
    "if (sig !== last) { if (last && vOnly() !== VO) { saveDraft(); location.reload(); return; } var hadEV = !!$('#npVch .np-tiles'); last = sig; if (hadEV !== hasEV()) renderVch(); renderRecipient();")

open(dst, 'w', encoding='utf-8').write(s)
print('ok', len(s))
