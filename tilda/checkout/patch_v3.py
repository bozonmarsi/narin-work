"""checkout v3: step 2 = who (me / gift, gift without address inline), step 3 = delivery adapts,
colour zones per step, finished steps collapse, no iOS zoom on inputs.
Input: checkout_new.html (live + recipient picker patch). Output: checkout_v3.html"""
import sys
src = open('checkout_new.html').read()


def rep(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, (n, old[:120])
    src = src.replace(old, new)


# ------------------------------------------------------------------ template
rep("""  function section(id, n, title, sub, body) {
    return '<section class="np-sec" id="' + id + '"><div class="np-sh"><span class="np-num" data-d="0">' + n + '</span><div><h2>' + title + '</h2><p>' + sub + '</p></div></div><div class="np-bd">' + body + '</div></section>';
  }""",
"""  function section(id, n, title, sub, body) {
    return '<section class="np-sec" id="' + id + '"><div class="np-sh"><span class="np-num" data-d="0">' + n + '</span><div class="hx"><h2 id="h_' + id + '">' + title + '</h2><p class="ps" id="p_' + id + '">' + sub + '</p><p class="pv" id="v_' + id + '"></p></div>' + (id === 'c4' ? '' : '<button type="button" class="np-edit" data-open="' + id + '">Změnit</button>') + '</div><div class="np-bd">' + body + '</div></section>';
  }
  function nextBtn(id, label) { return '<button type="button" class="np-next" data-next="' + id + '">' + label + '<i class="ti ti-arrow-down"></i></button>'; }""")

# step 1: continue button
rep("""'<div id="npCompany" hidden class="np-co"><div id="npCoList"></div>' + field('ico', 'IČO firmy', 'text', { mode: 'numeric', ph: '8 číslic', ac: 'off' }) + '<div id="npCoCard"></div><div id="npCoManual" hidden>' + field('company', 'Název firmy', 'text', { ac: 'organization' }) + '</div><div id="npCoNudge"></div></div>';""",
"""'<div id="npCompany" hidden class="np-co"><div id="npCoList"></div>' + field('ico', 'IČO firmy', 'text', { mode: 'numeric', ph: '8 číslic', ac: 'off' }) + '<div id="npCoCard"></div><div id="npCoManual" hidden>' + field('company', 'Název firmy', 'text', { ac: 'organization' }) + '</div><div id="npCoNudge"></div></div>' +
      nextBtn('c1', 'Pokračovat');""")

# step 3 (delivery, id c2 in the old layout): gift note instead of the gift button, comment moves here
rep("""      '<div id="npGiftWrap"></div>' +
      '<div id="npCourier">' +""", """      '<div id="npGiftWrap"></div>' +
      '<div id="npCourier">' +""")
rep("""      '<div class="np-slots" id="npSlots"></div><div class="np-times" id="npTimes" hidden></div></div>' +
      '</div>';""",
"""      '<div class="np-slots" id="npSlots"></div><div class="np-times" id="npTimes" hidden></div></div>' +
      '</div>' +
      '<div class="np-row" style="margin-top:16px"><div class="np-f"><label class="l" for="np_comment" id="npComL">Komentář pro kurýra</label><textarea class="np-in" id="np_comment" rows="3" placeholder="Např. kdy zazvonit nebo kam květiny odložit"></textarea></div></div>' +
      nextBtn('c3', 'Pokračovat k platbě');""")
# the delivery modes get an id-able wrapper already (#npModes)

# step 2 (who)
rep("""    var s3 = '<div class="np-tiles" id="npWho">' +
      '<button type="button" class="np-tile" data-w="me"><span class="ic"><i class="ti ti-user"></i></span><span><b>Pro mě</b><span class="s">Doručíme na vaše jméno a telefon</span></span></button>' +
      '<button type="button" class="np-tile" data-w="other"><span class="ic"><i class="ti ti-gift"></i></span><span><b>Pro někoho jiného</b><span class="s">Zadáte jméno a telefon příjemce</span></span></button>' +
      '</div>' +
      '<div id="npRChips"></div>' +
      '<div id="npRFields"><div class="np-row two">' + field('rname', 'Jméno příjemce', 'text') + field('rlast', 'Příjmení příjemce', 'text') + '</div>' +
      '<div class="np-row">' + phoneField('rphone', 'Telefon příjemce') + '</div></div>' +
      '<div class="np-row"><div class="np-f"><label class="l" for="np_comment">Komentář k objednávce</label><textarea class="np-in" id="np_comment" rows="3" placeholder="Např. kdy zazvonit nebo kam květiny odložit"></textarea></div></div>' +
      '<div id="npPostcard" hidden></div>' +
      '<div class="np-note" id="npRNote"></div>';""",
"""    var s3 = '<div class="np-tiles" id="npWho">' +
      '<button type="button" class="np-tile me" data-w="me"><span class="ic"><i class="ti ti-user"></i></span><span><b>Pro mě</b><span class="s">Doručíme na vaše jméno a telefon</span></span></button>' +
      '<button type="button" class="np-tile gift" data-w="other"><span class="ic"><i class="ti ti-gift"></i></span><span><b>Dárek pro někoho</b><span class="s">Doručíme komukoli, i když neznáte adresu</span></span></button>' +
      '</div><div class="np-msg-w" id="npWhoErr"></div>' +
      '<div id="npMe" hidden></div>' +
      '<div id="npOther" hidden>' +
      '<div id="npRChips"></div>' +
      '<div id="npRFields"><div class="np-row two">' + field('rname', 'Jméno příjemce', 'text') + field('rlast', 'Příjmení příjemce', 'text') + '</div></div>' +
      '<div class="np-sub"><span>Znáte adresu příjemce?</span></div>' +
      '<div class="np-tiles np-gm" id="npGm">' +
      '<button type="button" class="np-tile" data-gm="addr"><span class="ic"><i class="ti ti-map-pin"></i></span><span><b>Ano, zadám ji</b><span class="s">Adresu a čas vyberete v dalším kroku</span></span></button>' +
      '<button type="button" class="np-tile" data-gm="link"><span class="ic"><i class="ti ti-send"></i></span><span><b>Ne, ať si ji zadá sám</b><span class="s">Napíšeme mu, adresu i čas si vybere</span></span></button>' +
      '</div><div class="np-msg-w" id="npGmErr"></div>' +
      '<div id="npGmAddr" hidden><div class="np-row">' + phoneField('rphone', 'Telefon příjemce') + '</div></div>' +
      '<div id="npGmLink" hidden></div>' +
      '<div id="npPerks"></div>' +
      '</div>' +
      '<div id="npPostcard" hidden></div>' +
      '<div class="np-note" id="npRNote" hidden></div>' +
      nextBtn('c2', 'Pokračovat k doručení');""")

# new order: who is step 2, delivery is step 3 (ids follow the meaning: c2 = who, c3 = delivery)
rep("""      section('c2', 2, 'Doručení', 'Kam a kdy kytice přivezeme', s2) +
      section('c3', 3, 'Příjemce', 'Komu květiny patří', s3) +""",
"""      section('c2', 2, 'Pro koho jsou květiny?', 'Pro vás, nebo jako dárek', s3) +
      section('c3', 3, 'Doručení', 'Kam a kdy kytice přivezeme', s2) +""")

# ------------------------------------------------------------------ state + draft
rep("""    gift: null, noNum: false, showCal: false, accOpen: false, submitting: false, token: null, loggedIn: false
  };""",
"""    gift: null, noNum: false, showCal: false, accOpen: false, submitting: false, token: null, loggedIn: false,
    who: null, gm: null, gl: { channel: 'phone', handle: '', visible: true }, glBlocked: false, act: 'c1', col: {}
  };""")
rep("""'comment', 'pcSender', 'pcTo', 'pcText'].forEach(function (k) { d[k] = S[k]; });""",
    """'comment', 'pcSender', 'pcTo', 'pcText', 'who', 'gm', 'gl'].forEach(function (k) { d[k] = S[k]; });""")
rep("""    try { var d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); if (d) Object.keys(d).forEach(function (k) { if (k in S) S[k] = d[k]; }); } catch (e) {}""",
    """    try { var d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); if (d) Object.keys(d).forEach(function (k) { if (k in S) S[k] = d[k]; }); } catch (e) {}
    if (!S.who && S.same) S.who = 'me';
    if (!S.gl || typeof S.gl !== 'object') S.gl = { channel: 'phone', handle: '', visible: true };
    S.same = S.who === 'me';""")

# ------------------------------------------------------------------ delivery section adapts
rep("""    $('#npCourier').hidden = S.mode !== 'courier' || !!S.gift;
    $('#npPickup').hidden = S.mode !== 'pickup';""",
"""    $('#npCourier').hidden = S.mode !== 'courier' || !!S.gift;
    $('#npPickup').hidden = S.mode !== 'pickup' || !!S.gift;
    $('#npModes').hidden = !!S.gift;""")
rep("""  function renderGift() {
    var w = $('#npGiftWrap'); if (!w) return;
    if (S.mode !== 'courier') { w.innerHTML = ''; return; }
    if (S.gift) {
      w.innerHTML = '<div class="np-gift"><div class="ic"><i class="ti ti-gift"></i></div><div class="tx">Adresu zadá ' + esc(S.gift.name) + '<small>Napíšeme přes ' + esc(CH_LABEL[S.gift.channel]) + ': ' + esc(S.gift.handle) + (S.gift.visible ? '' : ', anonymně') + '</small></div><button type="button" class="go" id="npGiftBtn">Změnit</button><button type="button" class="x" id="npGiftX" aria-label="Zrušit"><i class="ti ti-x"></i></button></div>';
      $('#npGiftX').addEventListener('click', function () { S.gift = null; renderModes(); refresh(); });
    } else {
      w.innerHTML = '<div class="np-gift"><div class="ic"><i class="ti ti-gift"></i></div><div class="tx">Neznáte adresu příjemce?<small>Pošleme mu odkaz, adresu a čas si zadá sám</small></div><button type="button" class="go" id="npGiftBtn">Ať ji zadá sám</button></div>';
    }
    $('#npGiftBtn').addEventListener('click', openGift);
  }""",
"""  function firstName() { return String(S.rname || '').trim().split(/\\s+/)[0] || ''; }
  function renderGift() {
    var w = $('#npGiftWrap'); if (!w) return;
    if (!S.gift) { w.innerHTML = ''; return; }
    var nm = firstName() || 'příjemce', ch = CH_LABEL[S.gift.channel] || 'SMS', h = String(S.gift.handle || '').trim();
    w.innerHTML = '<div class="np-gnote"><span class="ic"><i class="ti ti-send"></i></span><span class="tx"><b>Adresu a čas si vybere ' + esc(nm) + '</b>' +
      '<small>Hned po zaplacení osobně napíšeme přes ' + esc(ch) + (h ? ' (' + esc(h) + ')' : '') + '. Kytici přivezeme kurýrem po Praze a okolí, nejdřív zítra. Cenu doručení počítáme jako obvykle, od ' + kc(CFG.base + CFG.service) + '.</small></span></div>' +
      '<button type="button" class="np-link" id="npGiftChg"><i class="ti ti-pencil"></i>Změnit kontakt</button>';
    $('#npGiftChg').addEventListener('click', function () { openSec('c2', '#npGmLink'); });
  }
  function paintDelivery() {
    var h = $('#p_c3'), nm = firstName(), other = S.who === 'other';
    if (h) h.textContent = S.gift ? 'Kurýrem po Praze a okolí' : (S.mode === 'pickup' ? 'Kdy si kytici vyzvednete' : (other && nm ? 'Kam a kdy kytici přivezeme. Příjemce: ' + nm : 'Kam a kdy kytice přivezeme'));
    var al = $('label[for="np_adres"]'); if (al) al.innerHTML = (other ? 'Adresa příjemce' : 'Ulice a číslo popisné') + ' <em>*</em>';
    var cl = $('#npComL'), ct = $('#np_comment');
    if (cl) cl.textContent = S.mode === 'courier' && !S.gift ? 'Komentář pro kurýra' : 'Komentář k objednávce';
    if (ct) ct.placeholder = S.mode === 'courier' && !S.gift ? (other ? 'Např. zazvonit u sousedů, nebo že jde o překvapení' : 'Např. kdy zazvonit nebo kam květiny odložit') : 'Cokoli, co bychom měli vědět';
  }""")

# pickup no longer drops a gift (the gift is chosen in step 2)
rep("""        if (S.mode === 'pickup') S.gift = null;
""", "")

# ------------------------------------------------------------------ who
rep("""  function renderWho() {
    $$('#npWho .np-tile', ROOT).forEach(function (b) { b.classList.toggle('on', (b.getAttribute('data-w') === 'me') === !!S.same); });
    $('#npRFields').hidden = !!S.same;
    var rc = $('#npRChips'); if (rc) rc.hidden = !!S.same;
  }
  function setWho(w) {
    var was = S.same; S.same = (w === 'me');
    if (S.same) syncSame();
    else if (was) { S.rid = null; if (RECS) renderRecs(); S.rname = S.rlast = S.rphone = ''; ['rname', 'rlast', 'rphone'].forEach(function (k) { $('#np_' + k).value = ''; }); }
    renderWho(); saveDraft(); refresh();
  }""",
"""  function renderWho() {
    $$('#npWho .np-tile', ROOT).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-w') === S.who); });
    $$('#npGm .np-tile', ROOT).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-gm') === S.gm); });
    var sec = $('#c2'); if (sec) { sec.classList.toggle('z-gift', S.who === 'other'); sec.classList.toggle('z-me', S.who === 'me'); }
    $('#npMe').hidden = S.who !== 'me';
    $('#npOther').hidden = S.who !== 'other';
    $('#npGmAddr').hidden = S.gm !== 'addr';
    $('#npGmLink').hidden = S.gm !== 'link';
    if (S.who) { var e1 = $('#npWhoErr'); if (e1) e1.textContent = ''; $('#npWho').classList.remove('bad'); }
    if (S.gm) { var e2 = $('#npGmErr'); if (e2) e2.textContent = ''; $('#npGm').classList.remove('bad'); }
    renderMe(); renderLink(); renderPerks();
  }
  function renderMe() {
    var el = $('#npMe'); if (!el || S.who !== 'me') return;
    var nm = (S.name + ' ' + S.last).trim();
    el.innerHTML = '<div class="np-mecard"><span class="ic"><i class="ti ti-user-check"></i></span><span class="tx">' +
      (nm ? '<b>' + esc(nm) + (S.phone ? ', ' + esc(S.phone) : '') + '</b><small>Kytici předáme přímo vám. Kurýr vám před doručením zavolá.</small>' : '<b>Doručíme na vaše jméno a telefon</b><small>Vyplňte je prosím v kroku 1.</small>') +
      '</span></div>';
  }
  var REC_STASH = null;
  function setWho(w) {
    var was = S.who; S.who = w; S.same = (w === 'me');
    ['rname', 'rlast', 'rphone', 'ghandle'].forEach(function (k) { setErr(k, ''); }); $('#c2').classList.remove('err');
    /* a mis-tap on Pro me must not lose what was typed for the recipient */
    if (S.same) { if (was === 'other') REC_STASH = { rid: S.rid, rname: S.rname, rlast: S.rlast, rphone: S.rphone }; syncSame(); }
    else if (was === 'me') {
      var r0 = REC_STASH || { rid: null, rname: '', rlast: '', rphone: '' };
      S.rid = r0.rid; S.rname = r0.rname; S.rlast = r0.rlast; S.rphone = r0.rphone;
      ['rname', 'rlast', 'rphone'].forEach(function (k) { $('#np_' + k).value = S[k] || ''; }); if (RECS) renderRecs();
    }
    syncGift(); renderWho(); renderModes(); saveDraft(); refresh();
    if (w === 'other' && !S.rname && !(RECS && RECS.length)) { var f = $('#np_rname'); if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 60); }
  }
  function setGm(m) {
    S.gm = m; ['rphone', 'ghandle'].forEach(function (k) { setErr(k, ''); });
    if (m === 'link' && !S.gl.handle && phoneValid(S.rphone)) { S.gl.channel = 'phone'; S.gl.handle = S.rphone; }
    syncGift(); renderWho(); renderModes(); saveDraft(); refresh();
    var f = $(m === 'link' ? '#np_ghandle' : '#np_rphone'); if (f && !f.value) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 60);
  }
  function syncGift() {
    var on = S.who === 'other' && S.gm === 'link';
    S.gift = on ? { name: ((S.rname || '') + ' ' + (S.rlast || '')).trim().slice(0, 60), channel: S.gl.channel, handle: String(S.gl.handle || '').trim().slice(0, 60), visible: S.gl.visible !== false } : null;
    if (on) S.mode = 'courier';
  }""")
rep("""  function bindWho() {
    $('#npWho').addEventListener('click', function (e) { var b = e.target.closest('[data-w]'); if (b) setWho(b.getAttribute('data-w')); });
  }""",
"""  function bindWho() {
    $('#npWho').addEventListener('click', function (e) { var b = e.target.closest('[data-w]'); if (b) setWho(b.getAttribute('data-w')); });
    $('#npGm').addEventListener('click', function (e) { var b = e.target.closest('[data-gm]'); if (b) setGm(b.getAttribute('data-gm')); });
  }""")

# picking a saved person: always the gift branch; a saved address means we know where to go
rep("""  function pickRec(x) {
    S.same = false;""", """  function pickRec(x) {
    S.same = false; S.who = 'other';""")
rep("""    var autoAddr = S.mode === 'courier' && !S.gift && parseAddr(x.address) && (!S.adres || REC_ADDR);""",
    """    if (!S.gm && parseAddr(x.address)) S.gm = 'addr';
    if (S.gm === 'link' && x.phone && (!S.gl.handle || /^(phone|whatsapp)$/.test(S.gl.channel))) { S.gl.handle = phoneShow(x.phone); }
    syncGift();
    var autoAddr = S.mode === 'courier' && !S.gift && parseAddr(x.address) && (!S.adres || REC_ADDR);""")
rep("""    renderRecs(); renderWho(); syncRNote(); saveDraft(); refresh();
  }
  function applySavedAddr(x) {""", """    renderRecs(); renderWho(); renderModes(); syncRNote(); saveDraft(); refresh();
  }
  function applySavedAddr(x) {""")
rep("""<a href="#c2" id="npRChg">Změnit</a>""", """<a href="#c3" id="npRChg">Změnit</a>""")
rep("""    var c = $('#npRChg'); if (c) c.addEventListener('click', function (e) { e.preventDefault(); var t = $('#np_adres'); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { t.focus(); }, 400); } });""",
    """    var c = $('#npRChg'); if (c) c.addEventListener('click', function (e) { e.preventDefault(); openSec('c3', '#np_adres'); });""")

# the old reminder note becomes the perks block
rep("""    var note = $('#npRNote');
    syncRNote();
    note.innerHTML = '<i class="ti ti-bell-ringing"></i><span>Příjemce i datum si zapamatujeme a příště vám je připomeneme. Upravit je můžete ve svém <a href="/members/occasions" target="_blank" rel="noopener">účtu</a>.</span>';
    updateRAddr();""", """    syncRNote();
    updateRAddr();""")
rep("""  function syncRNote() { var n = $('#npRNote'); if (n) n.hidden = !S.loggedIn || (S.rid != null && !/^s\\d+$/.test(String(S.rid)));""",
    """  function syncRNote() { renderPerks();""")

# ------------------------------------------------------------------ gift without address, inline (replaces the popup)
a = src.index('  function openGift() {')
b = src.index('  /* ---------- payment section ---------- */')
src = src[:a] + """  function renderLink() {
    var el = $('#npGmLink'); if (!el) return;
    if (!el.__built) {
      el.__built = 1;
      el.innerHTML = '<div class="np-glink"><div class="np-sub" style="margin-top:4px"><span>Kde mu máme napsat?</span></div><div class="np-chs" id="npGlCh">' +
        ['phone', 'whatsapp', 'telegram', 'instagram'].map(function (c) { return '<button type="button" data-c="' + c + '">' + (c === 'phone' ? '<i class="ti ti-device-mobile"></i>SMS' : CH_LABEL[c]) + '</button>'; }).join('') + '</div>' +
        '<div class="np-f" data-k="ghandle"><input class="np-in" id="np_ghandle" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"><div class="np-msg"></div></div>' +
        '<label class="np-check" style="margin-top:12px"><input type="checkbox" id="np_gvis"><span class="bx">' + ICON_CHECK + '</span><span>Může vědět, že je dárek ode mě<br><small style="color:var(--mut)">Když ne, napíšeme jen, že mu někdo posílá květiny.</small></span></label>' +
        '<ol class="np-steps"><li><b>1</b><span>Zaplatíte jako obvykle.</span></li><li><b>2</b><span>Příjemci osobně napíšeme a pošleme odkaz.</span></li><li><b>3</b><span>Vybere adresu a čas. Když to do 48 hodin neudělá nebo dárek odmítne, vrátíme vám peníze.</span></li></ol>' +
        '<p class="np-hint">Kontakt použijeme jen kvůli tomuto doručení a po 30 dnech ho smažeme. <a href="/darek-bez-adresy" target="_blank" rel="noopener" style="color:var(--blue)">Jak to funguje</a></p></div>';
      $('#npGlCh').addEventListener('click', function (e) {
        var b = e.target.closest('[data-c]'); if (!b) return;
        S.gl.channel = b.getAttribute('data-c'); S.glBlocked = false; setErr('ghandle', '');
        if (/^(phone|whatsapp)$/.test(S.gl.channel) && !S.gl.handle && phoneValid(S.rphone)) S.gl.handle = S.rphone;
        $('#np_ghandle').value = S.gl.handle || '';
        renderLink(); syncGift(); saveDraft(); refresh();
        try { $('#np_ghandle').focus({ preventScroll: true }); } catch (x) {}
      });
      var hi = $('#np_ghandle');
      hi.value = S.gl.handle || '';
      hi.addEventListener('input', function () { S.gl.handle = hi.value; S.glBlocked = false; setErr('ghandle', ''); syncGift(); saveDraft(); refresh(); checkHandle(); });
      var vi = $('#np_gvis'); vi.checked = S.gl.visible !== false;
      vi.addEventListener('change', function () { S.gl.visible = vi.checked; syncGift(); saveDraft(); });
    }
    $$('#npGlCh button', el).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-c') === S.gl.channel); });
    var hi2 = $('#np_ghandle'); hi2.placeholder = CH_PH[S.gl.channel] || '';
    hi2.setAttribute('inputmode', /^(phone|whatsapp)$/.test(S.gl.channel) ? 'tel' : 'text');
  }
  var checkHandle = debounce(function () {
    var c = S.gl.channel, h = String(S.gl.handle || '').trim(); if (!validHandle(c, h)) return;
    fn('gift-link', { action: 'check', contact: h }).then(function (r) {
      if (String(S.gl.handle || '').trim() !== h) return;
      S.glBlocked = !!(r && r.blocked);
      setErr('ghandle', S.glBlocked ? 'Tomuto kontaktu bohužel nemůžeme dárek bez adresy poslat. Zvolte prosím, že adresu znáte.' : '');
      refresh();
    }).catch(function () {});
  }, 700);
  function perk(ic, b, s) { return '<div class="np-perk"><span class="ic"><i class="ti ti-' + ic + '"></i></span><span><b>' + b + '</b>' + s + '</span></div>'; }
  function renderPerks() {
    var el = $('#npPerks'); if (!el) return;
    if (S.who !== 'other') { el.innerHTML = ''; return; }
    var nm = esc(firstName()) || 'ho', saved = S.loggedIn && S.rid != null && !/^s\\d+$/.test(String(S.rid));
    var h = '';
    if (S.loggedIn) {
      h += saved ? perk('address-book', 'Je ve vašem adresáři', 'Údaje jsme doplnili za vás. Případné změny si uložíme.') : perk('address-book', 'Příjemce si zapamatujeme', 'Příště ho vyberete jedním klepnutím, i s adresou.');
      h += perk('bell-ringing', 'Připomeneme vám tento den', 'Datum doručení si uložíme a za rok vám včas napíšeme, ať na nic nezapomenete.');
    }
    h += S.gm === 'link' ? perk('message-heart', 'Napíšeme osobně, žádný robot', 'Když příjemce adresu do 48 hodin nezadá, vrátíme vám peníze.')
      : perk('phone-call', 'Kurýr příjemci zavolá', 'Před doručením se ozve, ať je doma. Vás o předání informujeme.');
    if (S.loggedIn) h += '<div class="ft">Své blízké a důležitá data spravujete ve svém <a href="/members/occasions" target="_blank" rel="noopener">účtu</a>.</div>';
    el.innerHTML = '<div class="np-perks">' + h + '</div>';
    var lb = $('#npPerkLogin'); if (lb) lb.addEventListener('click', function () { try { localStorage.setItem('lkReturnUrl', location.pathname); } catch (e) {} });
  }

  /* ---------- steps: finished ones fold into one line ---------- */
  var ORDER = ['c1', 'c2', 'c3', 'c4'];
  var SLOT_TXT = { '9-12': '9 až 12 h', '12-15': '12 až 15 h', '15-18': '15 až 18 h', '18-20': '18 až 20 h' };
  function stepSummary(id) {
    if (id === 'c1') return [(S.name + ' ' + S.last).trim(), S.phone, S.email].filter(Boolean).join(' · ');
    if (id === 'c2') {
      if (S.who === 'me') return 'Pro mě';
      var nm = (S.rname + ' ' + S.rlast).trim();
      if (S.gift) return 'Dárek · ' + nm + ' · adresu doplní přes ' + (CH_LABEL[S.gift.channel] || 'SMS');
      return 'Dárek · ' + nm + (S.rphone ? ' · ' + S.rphone : '');
    }
    if (id === 'c3') {
      if (S.gift) return 'Kurýrem · adresu a čas vybere příjemce';
      var d = S.date ? WD[(parseIso(S.date).getDay() + 6) % 7] + ' ' + shortDate(S.date) : '';
      if (S.mode === 'pickup') return 'Osobní odběr · ' + [d, S.time].filter(Boolean).join(' ');
      return [S.adres + (S.city ? ', ' + S.city : ''), d, SLOT_TXT[S.slot] || S.slot].filter(Boolean).join(' · ');
    }
    return '';
  }
  function paintCol() {
    var ok = stepOk();
    ORDER.forEach(function (id) {
      var sec = $('#' + id); if (!sec) return;
      var col = id !== 'c4' && id !== S.act && !!S.col[id] && !!ok[id];
      sec.classList.toggle('col', col);
      var v = $('#v_' + id); if (v) v.textContent = col ? stepSummary(id) : '';
    });
  }
  function keepPlace(el, fn2) {
    var t0 = el ? el.getBoundingClientRect().top : 0; fn2();
    if (el) { var t1 = el.getBoundingClientRect().top; if (Math.abs(t1 - t0) > 1) window.scrollBy(0, t1 - t0); }
  }
  function openSec(id, focusSel) {
    S.col[id] = false; S.act = id; paintCol();
    var sec = $('#' + id), t = focusSel && $(focusSel);
    (t || sec).scrollIntoView({ behavior: 'smooth', block: t ? 'center' : 'start' });
    if (t && t.focus) setTimeout(function () { try { t.focus({ preventScroll: true }); } catch (e) {} }, 380);
  }
  function goNext(id) {
    var bad = validate(id);
    if (bad.length) { showBad(bad); return; }
    S.col[id] = true;
    var nx = ORDER[ORDER.indexOf(id) + 1]; S.act = nx; S.col[nx] = false;
    paintCol();
    var sec = $('#' + nx); if (sec) setTimeout(function () { sec.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
  }
  function bindSteps() {
    /* working in a later step folds the finished steps above it, without moving what the finger is on */
    function foldAbove(t) {
      var sec = t.closest && t.closest('.np-sec'); if (!sec || sec.id === S.act || sec.classList.contains('col')) return;
      var i = ORDER.indexOf(sec.id), ok = stepOk(), ch = false;
      ORDER.slice(0, i).forEach(function (id) { if (ok[id] && !S.col[id]) { S.col[id] = true; ch = true; } });
      S.act = sec.id;
      if (ch) keepPlace(t, paintCol); else paintCol();
    }
    ROOT.addEventListener('click', function (e) {
      var nb = e.target.closest('[data-next]'); if (nb) { goNext(nb.getAttribute('data-next')); return; }
      var sec = e.target.closest('.np-sec.col'); if (sec) { e.preventDefault(); openSec(sec.id); return; }
      foldAbove(e.target);
    });
    ROOT.addEventListener('focusin', function (e) { foldAbove(e.target); });
  }

""" + src[b:]

# ------------------------------------------------------------------ validation + steps
rep("""  function validate() {
    var bad = [], sec = {};
    function need(k, msg, s) { setErr(k, msg); if (msg) { bad.push({ k: k, s: s }); sec[s] = 1; } }""",
"""  function validate(only) {
    var bad = [], sec = {};
    function need(k, msg, s) { if (only && s !== only) return; setErr(k, msg); if (msg) { bad.push({ k: k, s: s }); sec[s] = 1; } }""")
rep("""    if (S.mode === 'courier' && !S.gift) {
      need('adres', S.adres.trim() ? (f.tooFar ? 'Na tuto adresu kurýrem nedoručujeme.' : (f.need ? 'Vyberte prosím adresu ze seznamu.' : (S.noNum ? 'Doplňte prosím číslo popisné: vyberte ze seznamu adresu s číslem.' : ''))) : 'Vyplňte prosím adresu.', 'c2');
      need('city', S.city.trim() ? '' : 'Vyplňte prosím město.', 'c2');
      need('psc', /^\\d{3}\\s?\\d{2}$/.test(S.psc.trim()) ? '' : 'Zadejte prosím PSČ (5 číslic).', 'c2');
    }
    if (!S.gift) {""",
"""    if (S.mode === 'courier' && !S.gift) {
      need('adres', S.adres.trim() ? (f.tooFar ? 'Na tuto adresu kurýrem nedoručujeme.' : (f.need ? 'Vyberte prosím adresu ze seznamu.' : (S.noNum ? 'Doplňte prosím číslo popisné: vyberte ze seznamu adresu s číslem.' : ''))) : 'Vyplňte prosím adresu.', 'c3');
      need('city', S.city.trim() ? '' : 'Vyplňte prosím město.', 'c3');
      need('psc', /^\\d{3}\\s?\\d{2}$/.test(S.psc.trim()) ? '' : 'Zadejte prosím PSČ (5 číslic).', 'c3');
    }
    if (!S.gift && (!only || only === 'c3')) {""")
rep("""      $('#npDateErr').textContent = dm; $('#g_date').classList.toggle('bad', !!dm); if (dm) { bad.push({ k: 'date', s: 'c2', el: '#g_date' }); sec.c2 = 1; }""",
    """      $('#npDateErr').textContent = dm; $('#g_date').classList.toggle('bad', !!dm); if (dm) { bad.push({ k: 'date', s: 'c3', el: '#g_date' }); sec.c3 = 1; }""")
rep("""      $('#npTimeErr').textContent = tm; $('#g_time').classList.toggle('bad', !!tm); if (tm) { bad.push({ k: 'time', s: 'c2', el: '#g_time' }); sec.c2 = 1; }""",
    """      $('#npTimeErr').textContent = tm; $('#g_time').classList.toggle('bad', !!tm); if (tm) { bad.push({ k: 'time', s: 'c3', el: '#g_time' }); sec.c3 = 1; }""")
rep("""    if (!S.same || S.gift) {
      need('rname', S.rname.trim() ? '' : 'Vyplňte prosím jméno příjemce.', 'c3');
      need('rlast', S.rlast.trim() || S.gift || recSingle() ? '' : 'Vyplňte prosím příjmení příjemce.', 'c3');
      need('rphone', (S.gift && !/^(phone|whatsapp)$/.test(S.gift.channel)) || phoneValid(S.rphone) ? '' : 'Zadejte prosím telefon příjemce.', 'c3');
    }
    if (hasPostcard()) {
      need('pcTo', S.pcTo.trim() ? '' : 'Napište prosím, pro koho pohlednice je.', 'c3');
      need('pcText', S.pcText.trim() ? '' : 'Napište prosím text pohlednice.', 'c3');
    }
    if (!S.consent) {""",
"""    if (!only || only === 'c2') {
      var we = $('#npWhoErr'), ge = $('#npGmErr');
      if (!S.who) { we.textContent = 'Vyberte prosím, pro koho květiny jsou.'; $('#npWho').classList.add('bad'); bad.push({ k: 'who', s: 'c2', el: '#npWho' }); sec.c2 = 1; }
      if (S.who === 'other' && !S.gm) { ge.textContent = 'Vyberte prosím jednu z možností.'; $('#npGm').classList.add('bad'); bad.push({ k: 'gm', s: 'c2', el: '#npGm' }); sec.c2 = 1; }
    }
    if (S.who === 'other') {
      need('rname', S.rname.trim() ? '' : 'Vyplňte prosím jméno příjemce.', 'c2');
      need('rlast', S.rlast.trim() || S.gift || recSingle() ? '' : 'Vyplňte prosím příjmení příjemce.', 'c2');
      if (S.gm === 'addr') need('rphone', phoneValid(S.rphone) ? '' : 'Zadejte prosím telefon příjemce. Kurýr se mu ozve.', 'c2');
      if (S.gm === 'link') {
        var gh = String(S.gl.handle || '').trim(), gc = S.gl.channel;
        need('ghandle', !gh ? 'Napište prosím kontakt, kam mu napíšeme.' : (!validHandle(gc, gh) ? (gc === 'instagram' || (gc === 'telegram' && /[a-z]/i.test(gh)) ? 'Zkontrolujte prosím uživatelské jméno.' : 'Zkontrolujte prosím telefonní číslo (aspoň 9 číslic).') : (S.glBlocked ? 'Tomuto kontaktu bohužel nemůžeme dárek bez adresy poslat. Zvolte prosím, že adresu znáte.' : '')), 'c2');
      }
    }
    if (hasPostcard()) {
      need('pcTo', S.pcTo.trim() ? '' : 'Napište prosím, pro koho pohlednice je.', 'c2');
      need('pcText', S.pcText.trim() ? '' : 'Napište prosím text pohlednice.', 'c2');
    }
    if (!S.consent && !only) {""")
rep("""    ['c1', 'c2', 'c3', 'c4'].forEach(function (id) { $('#' + id).classList.toggle('err', !!sec[id]); });
    return bad;
  }""",
"""    ['c1', 'c2', 'c3', 'c4'].forEach(function (id) { if (!only || id === only) $('#' + id).classList.toggle('err', !!sec[id]); });
    bad.sort(function (x, y) { return ORDER.indexOf(x.s) - ORDER.indexOf(y.s); });
    return bad;
  }
  function showBad(bad) {
    bad.forEach(function (b) { S.col[b.s] = false; });
    S.act = bad[0].s; paintCol();
    var first = bad[0]; var el = first.el ? $(first.el) : $('[data-k="' + first.k + '"]', ROOT);
    (el || $('#' + first.s)).scrollIntoView({ behavior: 'smooth', block: 'center' });
    var inp = el && $('input,textarea', el); if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 400);
    toast('Zkontrolujte prosím zvýrazněná pole.', true);
  }""")
rep("""    var bad = validate();
    if (bad.length) {
      var first = bad[0]; var el = first.el ? $(first.el) : $('[data-k="' + first.k + '"]', ROOT);
      (el || $('#' + first.s)).scrollIntoView({ behavior: 'smooth', block: 'center' });
      var inp = el && $('input,textarea', el); if (inp) setTimeout(function () { try { inp.focus({ preventScroll: true }); } catch (e) {} }, 400);
      toast('Zkontrolujte prosím zvýrazněná pole.', true);
      return;
    }""", """    var bad = validate();
    if (bad.length) { showBad(bad); return; }""")
rep("""  function updateSteps() {
    var ok = {
      c1: S.name.trim() && S.last.trim() && phoneValid(S.phone) && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test((S.email || '').trim()),
      c2: S.gift ? true : ((S.mode === 'pickup' || (S.adres.trim() && !feeCalc().need && !feeCalc().tooFar && !S.noNum && S.city.trim())) && S.date && (S.mode === 'pickup' ? S.time : S.slot)),
      c3: S.same ? (S.name.trim() && S.last.trim() && phoneValid(S.phone)) : (S.rname.trim() && (S.rlast.trim() || recSingle()) && phoneValid(S.rphone)),
      c4: S.consent
    };""",
"""  function stepOk() {
    var c1 = S.name.trim() && S.last.trim() && phoneValid(S.phone) && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test((S.email || '').trim());
    var pc = !hasPostcard() || (S.pcTo.trim() && S.pcText.trim());
    var c2 = S.who === 'me' ? true : (S.who === 'other' && S.rname.trim() && (S.gm === 'link' ? validHandle(S.gl.channel, String(S.gl.handle || '').trim()) && !S.glBlocked : (S.gm === 'addr' && (S.rlast.trim() || recSingle()) && phoneValid(S.rphone))));
    return {
      c1: !!c1,
      c2: !!(c2 && pc),
      c3: !!(S.gift ? true : ((S.mode === 'pickup' || (S.adres.trim() && !feeCalc().need && !feeCalc().tooFar && !S.noNum && S.city.trim())) && S.date && (S.mode === 'pickup' ? S.time : S.slot))),
      c4: !!S.consent
    };
  }
  function updateSteps() {
    var ok = stepOk();""")
rep("""      if (num && num.getAttribute('data-d') !== want) { num.setAttribute('data-d', want); num.innerHTML = done ? '<i class="ti ti-check"></i>' : id.charAt(1); }
      if (prog[i]) prog[i].classList.toggle('on', done);
    });""", """      if (num && num.getAttribute('data-d') !== want) { num.setAttribute('data-d', want); num.innerHTML = done ? '<i class="ti ti-check"></i>' : id.charAt(1); }
      if (prog[i]) prog[i].classList.toggle('on', done);
    });
    paintCol();""")

# refresh keeps the dependent texts in step
rep("""  function refresh() { modePrice(); renderSummary(); updateSteps(); paintPhones(); }""",
"""  var lastGift = null;
  function refresh() {
    syncGift();
    var g = !!S.gift; if (g !== lastGift) { lastGift = g; renderModes(); }
    else if (S.gift) renderGift();
    modePrice(); renderSummary(); updateSteps(); paintPhones(); paintDelivery();
    if (S.who === 'me') renderMe();
  }""")
# phone typing should update the steps too
rep("""      el.addEventListener('input', function () { var v = phoneShow(el.value); el.value = v; S[k] = v; setErr(k, ''); if (k === 'phone' && S.same) syncSame(); saveDraft(); paintPhones(); });""",
    """      el.addEventListener('input', function () { var v = phoneShow(el.value); el.value = v; S[k] = v; setErr(k, ''); if (k === 'phone' && S.same) syncSame(); saveDraft(); refresh(); });""")
# names typed in step 2 refresh the perks wording
rep("""        if (S.same && (k === 'name' || k === 'last')) syncSame();
        saveDraft(); refresh();""", """        if (S.same && (k === 'name' || k === 'last')) syncSame();
        if (k === 'rname') renderPerks();
        saveDraft(); refresh();""")

# ------------------------------------------------------------------ boot
rep("""      bindFields(); bindWhen(); bindWho();""", """      bindFields(); bindWhen(); bindWho(); bindSteps();""")
rep("""      renderWho(); revealOnScroll();
      refresh(); initPlaces(); onAddress();""",
"""      syncGift(); renderWho(); renderModes(); revealOnScroll();
      refresh(); initPlaces(); onAddress();
      /* a returning customer is prefilled: step 1 starts folded */
      if (stepOk().c1) { S.col.c1 = true; S.act = 'c2'; paintCol(); }""")
rep("""    try { var m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m); } catch (e) {}""",
"""    try { var m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m); } catch (e) {}
    /* iPhone zooms into a focused field and stays zoomed: inputs are 16px, and on iOS the page keeps scale 1 (pinch zoom still works there) */
    try {
      if (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
        var vp = document.querySelector('meta[name=viewport]');
        if (!vp) { vp = document.createElement('meta'); vp.name = 'viewport'; vp.content = 'width=device-width, initial-scale=1'; document.head.appendChild(vp); }
        if (!/maximum-scale/.test(vp.content)) vp.content = vp.content + ', maximum-scale=1';
      }
    } catch (e) {}""")

# ------------------------------------------------------------------ css
css = """
/* ===== v3: every step is its own zone, the colour says what it is about ===== */
.np-sec { --z: #186ce0; --zd: #1257b8; --zs: #f6f9fe; --zl: #dce8fa; --zt: #e8f0fc; --zi: #0f3f86;
  background: var(--zs); border: 1px solid var(--zl); border-radius: 16px; padding: 16px 14px 18px; margin: 0 0 12px; transition: background .3s, border-color .3s, padding .25s; }
.np-sec:first-child { border-top: 1px solid var(--zl); }
.np-sec::before { display: none !important; }
@media (min-width: 980px) { .np-sec { padding: 20px 24px 22px; } .np-sh { margin-left: 0; } }
#c2.z-gift { --z: #e0457b; --zd: #c23365; --zs: #fff6f9; --zl: #f8d3e0; --zt: #fde6ee; --zi: #8a1f48; }
#c4 { --zs: #fbfbfc; --zl: #e8eaed; }
.np-sec .np-num { background: #fff; color: var(--z); box-shadow: inset 0 0 0 1.5px var(--zl); }
.np-sec.done .np-num { background: var(--z); color: #fff; box-shadow: none; }
.np-sec.err .np-num { background: var(--tulip); color: #fff; box-shadow: none; }
.np-sec .np-in, .np-sec .np-phone { background: #fff; border-color: var(--zl); }
.np-sec .np-in:focus, .np-sec .np-phone:focus-within { border-color: var(--z); box-shadow: 0 0 0 3px var(--zt); }
.np-sec .np-tile { border-color: var(--zl); }
.np-sec .np-tile .ic { background: var(--zt); color: var(--z); }
.np-sec .np-tile.on { border-color: var(--z); background: #fff; box-shadow: 0 0 0 3px var(--zt); }
.np-sec .np-tile.on .ic { background: var(--z); color: #fff; }
#npWho .np-tile.gift .ic { background: #fde6ee; color: #e0457b; }
#npWho .np-tile.gift.on { border-color: #e0457b; box-shadow: 0 0 0 3px #fde6ee; }
#npWho .np-tile.gift.on .ic { background: #e0457b; color: #fff; }
#npWho .np-tile.me .ic { background: #e8f0fc; color: #186ce0; }
#npWho .np-tile.me.on { border-color: #186ce0; box-shadow: 0 0 0 3px #e8f0fc; }
#npWho .np-tile.me.on .ic { background: #186ce0; color: #fff; }
#npWho.bad .np-tile, #npGm.bad .np-tile { border-color: var(--tulip); }
.np-msg-w { color: var(--err-ink); font-size: 13px; font-weight: 500; margin: -4px 2px 8px; }
.np-msg-w:empty { display: none; }
.np-sec .np-chs button.on, .np-sec .np-seg button.on { background: var(--z); border-color: var(--z); color: #fff; }
.np-sec .np-check input:checked + .bx { background: var(--z); border-color: var(--z); }
.np-sec .np-sub { color: var(--zi); }

/* folded step */
.np-sh .hx { flex: 1; min-width: 0; }
.np-sh .pv { display: none; margin: 2px 0 0; font-size: 13.5px; color: var(--ink2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.np-edit { display: none; flex: 0 0 auto; margin-left: 8px; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--zl); background: #fff; color: var(--zi); font: 500 13px 'Rubik', sans-serif; cursor: pointer; align-items: center; }
.np-sec.col { padding-top: 11px; padding-bottom: 11px; cursor: pointer; background: #fff; }
.np-sec.col:hover { border-color: var(--z); }
.np-sec.col .np-bd, .np-sec.col .ps { display: none; }
.np-sec.col .pv { display: block; }
.np-sec.col .np-edit { display: inline-flex; }
.np-sec.col .np-sh { margin: 0; }
.np-sec.col .np-sh h2 { font-size: 15.5px; }
.np-sec:not(.col) .np-bd { animation: npopen .35s cubic-bezier(.16, 1, .3, 1); }
@keyframes npopen { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
.np-next { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 48px; margin: 16px 0 0; border: 0; border-radius: 12px; background: var(--z); color: #fff; font: 600 15px 'Rubik', sans-serif; cursor: pointer; transition: background .2s, transform .1s; }
.np-next:hover { background: var(--zd); }
.np-next:active { transform: scale(.99); }
.np-next i { font-size: 18px; }
.np-sec.done .np-next { background: var(--zd); }

/* step 2 */
.np-mecard, .np-gnote { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: #fff; border: 1px solid var(--zl); }
.np-mecard .ic, .np-gnote .ic { flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px; background: var(--zt); color: var(--z); display: grid; place-items: center; font-size: 18px; }
.np-mecard .tx, .np-gnote .tx { flex: 1; min-width: 0; font-size: 14.5px; line-height: 1.35; }
.np-mecard b, .np-gnote b { display: block; font-weight: 600; }
.np-mecard small, .np-gnote small { display: block; margin-top: 3px; font-size: 13px; color: var(--ink2); line-height: 1.45; }
.np-gnote { margin-bottom: 8px; }
#npGiftChg { margin: 0 0 4px 2px; font-size: 13.5px; }
.np-gm { margin-bottom: 8px; }
.np-glink { padding: 12px 14px 4px; border-radius: 12px; background: #fff; border: 1px solid var(--zl); margin-bottom: 4px; }
.np-glink .np-chs { margin-bottom: 10px; }
.np-glink .np-chs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.np-glink .np-chs button { height: 38px; padding: 0 4px; font-size: 13px; border-radius: 999px; justify-content: center; gap: 4px; }
.np-steps { list-style: none; margin: 12px 0 8px; padding: 10px 12px; background: var(--zs); border-radius: 10px; }
.np-steps li { display: flex; gap: 10px; font-size: 13px; color: var(--ink2); line-height: 1.4; padding: 3px 0; }
.np-steps b { flex: 0 0 20px; height: 20px; border-radius: 50%; background: var(--z); color: #fff; font-size: 11.5px; display: grid; place-items: center; }
.np-perks { display: grid; gap: 10px; margin: 14px 0 0; padding: 12px 14px; border-radius: 12px; background: #fff; border: 1px dashed var(--zl); }
.np-perk { display: flex; gap: 11px; align-items: flex-start; font-size: 13px; line-height: 1.4; color: var(--ink2); text-decoration: none; }
.np-perk .ic { flex: 0 0 30px; height: 30px; border-radius: 9px; background: var(--zt); color: var(--z); display: grid; place-items: center; font-size: 16px; }
.np-perk b { display: block; color: var(--ink); font-weight: 600; font-size: 14px; margin-bottom: 1px; }
.np-perk.lg { align-items: center; }
.np-perk.lg > span:nth-child(2) { flex: 1; }
.np-perk.lg > i { color: var(--z); }
.np-perks .ft { font-size: 12.5px; color: var(--mut); border-top: 1px solid var(--zl); padding-top: 8px; }
.np-perks .ft a { color: var(--zi); font-weight: 500; }
#npOther .np-rh { margin-top: 4px; }

/* no zoom on iPhone: fields at least 16px, nothing wider than the screen */
@media (max-width: 979px) {
  .np input, .np textarea, .np select { font-size: 16px !important; }
  .np-phone b { font-size: 16px; }
  html, body { overflow-x: hidden; }
}
.np { touch-action: manipulation; }
"""
rep("""
.np-phone.intl > b { display: none; }
.np-phone.intl .np-in { padding-left: 14px !important; }
</style>""", """
.np-phone.intl > b { display: none; }
.np-phone.intl .np-in { padding-left: 14px !important; }
""" + css + """</style>""")

open('checkout_v3.html', 'w').write(src)
print('ok', len(src))
