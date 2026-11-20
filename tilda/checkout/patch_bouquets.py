"""Bouquet rules for the /payment checkout (2026-11-20).

* Only bouquets in the cart -> courier delivery 0 Kc (until 2026-12-07 incl.).
* Only bouquets of size M in the cart -> today can be chosen until 16:00,
  slots/pickup times that start at least 2 h (pickup 1 h) from now.
"""
import sys

src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding="utf-8").read()


def rep(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f"expected {count}x, found {n}: {old[:80]!r}"
    s = s.replace(old, new)


# 1) config + helpers right after CFG
rep(
    "CFG = { wh: { lat: 50.1036125, lng: 14.4321458 }, base: 159, service: 0, free: 14, perKm: 18, maxKm: 40 };",
    """CFG = { wh: { lat: 50.1036125, lng: 14.4321458 }, base: 159, service: 0, free: 14, perKm: 18, maxKm: 40 };
  /* Bouquets (Tilda part Kytice): uids of every size + names as a fallback.
     freeUntil: courier delivery free when the cart holds ONLY bouquets.
     todayUntil: hour until which a cart of ONLY size-M bouquets can be delivered today. */
  var BQ = {
    m: { '252683133924': 1, '654998674304': 1, '427190086874': 1, '666190431624': 1 },
    all: { '878665563584': 1, '252683133924': 1, '274589258944': 1, '368461273424': 1, '654998674304': 1, '773943522984': 1,
      '270125333084': 1, '427190086874': 1, '721320228364': 1, '541289761604': 1, '666190431624': 1, '284146105434': 1,
      '338915278194': 1, '820957205954': 1, '854913749674': 1, '337106830694': 1, '370679130724': 1, '852946763324': 1, '470555828164': 1 },
    names: /^(clara stahlbaum|margarita|anne shirley|matilda wormwood|daisy buchanan|holly golightly|lucy pevensie)\\b/i,
    freeUntil: '2026-12-07', todayUntil: 16
  };
  function bqUid(p) { return String(p && (p.uid || p.lid) || ''); }
  function bqIs(p) { return !!BQ.all[bqUid(p)] || BQ.names.test(decode(String(p && p.name || '')).trim()); }
  function bqSize(p) {
    if (BQ.m[bqUid(p)]) return 'M';
    var o = p && p.options; if (!Array.isArray(o)) return '';
    for (var i = 0; i < o.length; i++) { if (o[i] && /velikost/i.test(String(o[i].option || ''))) return String(o[i].variant || '').trim().toUpperCase(); }
    return '';
  }
  function bqOnly() { var ps = products(); return ps.length > 0 && ps.every(bqIs); }
  function bqFree() { return bqOnly() && iso(sod(new Date())) <= BQ.freeUntil; }
  function bqToday() { var ps = products(); return ps.length > 0 && new Date().getHours() < BQ.todayUntil && ps.every(function (p) { return bqIs(p) && bqSize(p) === 'M'; }); }
  function hoursLeft(startHour) { var n = new Date(); return startHour - (n.getHours() + n.getMinutes() / 60); }""",
)

# 2) fee: free courier for bouquet-only carts (too-far stays as is)
rep("function feeCalc() {\n    if (VO)", "function feeCalcBase() {\n    if (VO)")
rep(
    "function totals() {",
    """function feeCalc() {
    var f = feeCalcBase();
    if (S.mode !== 'pickup' && !VO && bqFree()) { f = Object.assign({}, f, { fee: f.service, delivery: 0, extra: 0, bqFree: true }); }
    return f;
  }
  function totals() {""",
)

# 3) today for size-M-only carts
rep(
    "if (+d === +today) return 'Doručení ještě dnes nestihneme. Nejbližší den je zítra.';",
    "if (+d === +today && !bqToday()) return 'Doručení ještě dnes nestihneme. Nejbližší den je zítra.';",
)
rep(
    "function firstAvailable() { var d = addDays(new Date(), 1);",
    "function firstAvailable() { var d = addDays(new Date(), bqToday() ? 0 : 1);",
)
rep(
    "function slotReason(slot) { return S.date && AV.slots[S.date] && AV.slots[S.date][slot] || ''; }",
    """function slotReason(slot) {
    var r = S.date && AV.slots[S.date] && AV.slots[S.date][slot] || '';
    if (!r && S.date && S.date === iso(sod(new Date())) && hoursLeft(parseInt(slot, 10)) < 2) r = 'Tento čas už dnes nestihneme.';
    return r;
  }""",
)
rep(
    "function pickupWhy(dateIso, t) {\n    var p = AV.pickup;\n    if (p.off) return p.off;",
    "function pickupWhy(dateIso, t) {\n    var p = AV.pickup;\n    if (p.off) return p.off;\n    if (dateIso && t && dateIso === iso(sod(new Date())) && hoursLeft(parseInt(t, 10) + (/:30$/.test(t) ? 0.5 : 0)) < 1) return 'Tento čas už dnes nestihneme.';",
)

# 4) labels: summary row + courier tile price + hint
rep(
    "else if (S.mode === 'courier') h += '<div><span>Doručení kurýrem' + (f.extra ? ' (vč. příplatku za vzdálenost)' : '') + '</span><b>' + (f.need || f.empty ? 'od ' + kc(f.delivery) : kc(f.delivery)) + '</b></div>';",
    "else if (S.mode === 'courier' && f.bqFree) h += '<div class=\"free\"><span>Doručení kurýrem · kytice</span><b>Zdarma</b></div>';\n    else if (S.mode === 'courier') h += '<div><span>Doručení kurýrem' + (f.extra ? ' (vč. příplatku za vzdálenost)' : '') + '</span><b>' + (f.need || f.empty ? 'od ' + kc(f.delivery) : kc(f.delivery)) + '</b></div>';",
)
rep(
    "pr.textContent = (S.mode === 'courier' && !f.need && !f.empty) ? kc(f.delivery) : 'od ' + kc(CFG.base);",
    "pr.textContent = bqFree() ? 'Zdarma' : (S.mode === 'courier' && !f.need && !f.empty) ? kc(f.delivery) : 'od ' + kc(CFG.base);",
)
rep(
    "else if (f.km != null) { h.style.color = 'var(--ok)'; h.textContent = 'Vzdálenost od skladu ' + (Math.round(f.km * 10) / 10).toString().replace('.', ',') + ' km. Cena doručení ' + kc(f.delivery) + (f.extra ? ' (včetně příplatku za vzdálenost)' : '') + '.'; }",
    "else if (f.km != null && f.bqFree) { h.style.color = 'var(--ok)'; h.textContent = 'Doručení kytic máme do 7. 12. zdarma.'; }\n    else if (f.km != null) { h.style.color = 'var(--ok)'; h.textContent = 'Vzdálenost od skladu ' + (Math.round(f.km * 10) / 10).toString().replace('.', ',') + ' km. Cena doručení ' + kc(f.delivery) + (f.extra ? ' (včetně příplatku za vzdálenost)' : '') + '.'; }",
)

# 5) what the order records about the fee
rep(
    "setCart('delivery_fee_calc', S.mode === 'courier' ? (fee.tooFar ? 'too_far' : CFG.base + '+' + fee.extra + '+' + CFG.service + '=' + fee.fee) : '');",
    "setCart('delivery_fee_calc', S.mode === 'courier' ? (fee.tooFar ? 'too_far' : fee.bqFree ? 'bouquet_free=0' : CFG.base + '+' + fee.extra + '+' + CFG.service + '=' + fee.fee) : '');",
)

open(dst, "w", encoding="utf-8").write(s)
print("patched OK", len(s))
