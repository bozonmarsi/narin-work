import sys, json
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()
U = json.load(open('/private/tmp/claude-502/-Users-maga------/1278200c-92a1-49ce-8cde-b521dedb8baf/scratchpad/card_uids.json'))


def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)


CSS = """
.nk-gc-stage{position:relative;aspect-ratio:1/1;border-radius:22px;overflow:hidden;display:grid;place-items:center;perspective:1200px;background:radial-gradient(110% 80% at 85% 0%,#e3edff 0%,rgba(227,237,255,0) 60%),radial-gradient(90% 70% at 0% 100%,#fbe6f4 0%,rgba(251,230,244,0) 62%),#f7f9fc}
.nk-gc-card{width:86%;aspect-ratio:85.6/54;border-radius:4.2%/6.6%;background:#dfe6f2 center/cover no-repeat;box-shadow:0 30px 50px -22px rgba(27,53,102,.55),0 6px 14px rgba(27,53,102,.12);transform:rotate(-4deg);animation:nkGcIn .6s cubic-bezier(.2,.8,.2,1) both}
.nk-gc-card.plast{box-shadow:0 30px 50px -22px rgba(27,53,102,.55),0 2px 0 #dfe6f2,0 4px 0 #cbd5e6,0 6px 14px rgba(27,53,102,.14)}
.nk-gc-card.flip{animation:nkGcFlip .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes nkGcIn{from{opacity:0;transform:translateY(18px) rotate(-8deg) scale(.96)}}
@keyframes nkGcFlip{0%{transform:rotateY(-90deg) rotate(-4deg)}100%{transform:rotateY(0) rotate(-4deg)}}
.nk-gc-badge{position:absolute;left:14px;bottom:14px;display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border-radius:999px;background:rgba(255,255,255,.92);font-size:13px;color:#4a505b;box-shadow:0 4px 14px rgba(20,23,28,.08)}
.nk-gc-badge b{color:var(--ink);font-weight:600}
.nk-gc-k{margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)}
.nk-gc-noms{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.nk-gc-noms button{height:48px;border:1.5px solid var(--line);border-radius:14px;background:#fff;font:600 15px 'Rubik',sans-serif;color:var(--ink);cursor:pointer;transition:background .15s,border-color .15s,color .15s}
.nk-gc-noms button.on{background:var(--blue);border-color:var(--blue);color:#fff}
.nk-gc-types{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.nk-gc-types button{text-align:left;padding:12px 13px;border:1.5px solid var(--line);border-radius:16px;background:#fff;font:inherit;color:var(--ink);cursor:pointer;transition:border-color .15s,background .15s}
.nk-gc-types button b{display:block;font-size:15px;font-weight:600;margin-bottom:3px}
.nk-gc-types button span{display:block;font-size:12.5px;line-height:1.35;color:var(--muted)}
.nk-gc-types button.on{border-color:var(--blue);background:#f2f7ff}
.nk-gc-steps{margin:16px 0 0;padding:0;list-style:none;display:grid;gap:9px;counter-reset:g}
.nk-gc-steps li{display:flex;gap:11px;align-items:flex-start;font-size:14.5px;line-height:1.45;color:#2b2f38;counter-increment:g}
.nk-gc-steps li::before{content:counter(g);flex:none;width:24px;height:24px;border-radius:50%;background:#eef4fc;color:var(--blue);font-size:12.5px;font-weight:700;display:grid;place-items:center;margin-top:1px}
.nk-gc-cats{display:flex;gap:10px;align-items:flex-start;margin:16px 0 0;padding:12px 14px;border-radius:16px;background:#fbf6ee;font-size:13.5px;line-height:1.45;color:#4a505b}
.nk-gc-more{display:inline-flex;align-items:center;gap:6px;margin:14px 0 4px;font-size:14.5px;font-weight:600;color:var(--blue)!important;text-decoration:none}
.nk-gc-more:hover{text-decoration:underline}
@media (max-width:760px){.nk-gc-stage{aspect-ratio:4/3;border-radius:0 0 22px 22px;margin:0 -16px}.nk-gc-noms button{height:44px;font-size:14px}}
@media (prefers-reduced-motion:reduce){.nk-gc-card,.nk-gc-card.flip{animation:none}}
</style>
<script>"""
rep("</style>\n<script>", CSS)

GIFT_JS = """
  // ---------- gift cards: one card per value and type, chosen inside the popup ----------
  var GIFT = {
    500: {e: '%s', p: '%s', img: 'https://static.tildacdn.com/tila6561-3962-4436-a666-363835303132/kocka-500.jpg', scene: 'Černá kočka v lučním kvítí'},
    1000: {e: '%s', p: '%s', img: 'https://static.tildacdn.com/tila6137-6432-4666-b561-336230643435/kocka-1000.jpg', scene: 'Bílá kočka ve fialových květech'},
    1500: {e: '%s', p: '%s', img: 'https://static.tildacdn.com/tila3136-3035-4632-a231-306434646363/kocka-1500.jpg', scene: 'Siamská kočka při západu slunce'},
    2000: {e: '%s', p: '%s', img: 'https://static.tildacdn.com/tila3531-3835-4439-a536-653662333832/kocka-2000.jpg', scene: 'Zrzavé kotě na zahradní cestě'}
  };
  var GIFT_ABOUT = 'https://vezminarin.cz/darkove-karty';
  var GIFT_UID = {};
  Object.keys(GIFT).forEach(function (n) { GIFT_UID[GIFT[n].e] = {n: +n, t: 'e'}; GIFT_UID[GIFT[n].p] = {n: +n, t: 'p'}; });
  function giftName(n, t) { return 'Dárkový poukaz ' + czk(n) + (t === 'e' ? ' elektronický' : ' plastová karta'); }
  function giftData(n, t) { var g = GIFT[n]; return {name: giftName(n, t), basePrice: n, uid: g[t], img: g.img, thumb: g.img, url: location.href}; }
  function renderGift(gc) {
    var d = cardData, g = GIFT[gc.n], e = gc.t === 'e', flip = S.gflip; S.gflip = false;
    var info = [
      '<div class="nk-top"><div class="nk-lbl tomorrow"><i></i>' + (e ? 'Pošleme e-mailem' : 'Předáme v dárkové obálce') + '</div><span></span></div>',
      '<h1>Dárková karta NARIN</h1>',
      '<div class="nk-price"><b>' + czk(d.basePrice) + '</b><span>' + esc(g.scene) + '</span></div>',
      '<div class="nk-gc-k">Hodnota</div><div class="nk-gc-noms">' + Object.keys(GIFT).map(function (n) { return '<button data-gn="' + n + '" class="' + (+n === gc.n ? 'on' : '') + '">' + czk(+n) + '</button>'; }).join('') + '</div>',
      '<div class="nk-gc-k">Typ karty</div><div class="nk-gc-types">'
        + '<button data-gt="e" class="' + (e ? 'on' : '') + '"><b>Elektronická</b><span>E-mailem hned, nebo v den, který vyberete</span></button>'
        + '<button data-gt="p" class="' + (e ? '' : 'on') + '"><b>Plastová</b><span>V dárkové obálce, osobně nebo s kyticí</span></button></div>',
      '<ol class="nk-gc-steps">' + (e
        ? '<li><span>V košíku vyplníte e-mail obdarovaného, věnování a den odeslání.</span></li><li><span>Kartu s obrazem kočky pošleme e-mailem v 9:00, nebo hned po zaplacení.</span></li>'
        : '<li><span>Kartu předáme v dárkové obálce, osobně v Praze nebo s doručením spolu s kyticí.</span></li><li><span>Aktivujeme ji při předání. Obdarovaný naskenuje QR kód na kartě.</span></li>')
        + '<li><span>Celá částka se mu připíše na účet NARIN a čerpá ji postupně na květiny. Platí 12 měsíců.</span></li></ol>',
      '<div class="nk-gc-cats"><span>🐾</span><span>Z každé karty posíláme 50 Kč kočkám v útulcích. Platíme to my, hodnota karty zůstává celá.</span></div>',
      '<a class="nk-gc-more" href="' + GIFT_ABOUT + '" target="_blank" rel="noopener">Proč to děláme a jak karta funguje →</a>'
    ];
    box.innerHTML = '<button class="nk-x" data-close aria-label="Zavřít">✕</button>'
      + '<div class="nk-grid"><div><div class="nk-gc-stage"><div class="nk-gc-card' + (e ? '' : ' plast') + (flip ? ' flip' : '') + '" style="background-image:url(\\'' + esc(img(g.img, 800)) + '\\')" role="img" aria-label="' + esc(g.scene) + '"></div>'
      + '<div class="nk-gc-badge">' + (e ? '✉️ <b>Elektronická</b>' : '💳 <b>Plastová</b>') + '</div></div></div>'
      + '<div class="nk-info">' + info.join('') + '</div></div>'
      + '<div class="nk-buy"><div class="nk-qty"><button data-q="-1" aria-label="Méně">−</button><span>' + S.qty + '</span><button data-q="1" aria-label="Více">+</button></div><button class="nk-cta" data-cart><span>Do košíku</span><span>' + czk(d.basePrice * S.qty) + '</span></button></div>';
    [].forEach.call(box.querySelectorAll('.nk-info>*'), function (el, i) { el.style.setProperty('--i', i); });
  }
""" % (U['500e'], U['500p'], U['1000e'], U['1000p'], U['1500e'], U['1500p'], U['2000e'], U['2000p'])

rep("  function render(fresh) {\n", GIFT_JS + "  function render(fresh) {\n    var gcard = cardData && GIFT_UID[String(cardData.uid)];\n    if (gcard) { renderGift(gcard); if (fresh) box.scrollTop = 0; return; }\n")

rep("    if ((b = e.target.closest('[data-q]'))) {",
    "    if ((b = e.target.closest('[data-gn], [data-gt]'))) {\n"
    "      var gc = GIFT_UID[String(cardData.uid)]; if (!gc) return;\n"
    "      var gn = b.getAttribute('data-gn') ? +b.getAttribute('data-gn') : gc.n, gt = b.getAttribute('data-gt') || gc.t;\n"
    "      if (gn === gc.n && gt === gc.t) return;\n"
    "      S.gflip = gn !== gc.n; cardData = giftData(gn, gt); render(); return;\n"
    "    }\n"
    "    if ((b = e.target.closest('[data-q]'))) {")

# a gift card opened from a recommendation or by uid (not on the page): build its data from the map
rep("  window.narinProduct = {open: function (uid) { var c2 = realCard(uid); open(c2 ? extract(c2) : fromBundle(uid)); }};",
    "  window.narinProduct = {open: function (uid) { var c2 = realCard(uid), gu = GIFT_UID[String(uid)]; open(c2 ? extract(c2) : gu ? giftData(gu.n, gu.t) : fromBundle(uid)); }};")
open(dst, 'w', encoding='utf-8').write(s)
print('ok')
