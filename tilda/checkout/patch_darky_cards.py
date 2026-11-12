import sys
src, dst = sys.argv[1], sys.argv[2]
s = open(src, encoding='utf-8').read()


def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:80])
    s = s.replace(old, new)


rep(".ndp-end { height:48px; }",
    ".ndp-end { height:48px; }\n"
    ".ndp-gwrap { position:relative; border-radius:26px; padding:clamp(22px,3.4vw,40px) clamp(18px,3vw,36px) clamp(14px,2vw,22px); background:radial-gradient(110% 90% at 92% 0%,#e3edff 0%,rgba(227,237,255,0) 58%),radial-gradient(90% 80% at 0% 100%,#fde3f3 0%,rgba(253,227,243,0) 60%),#fbf9fd; overflow:hidden; }\n"
    ".ndp-ghead { display:flex; align-items:flex-end; justify-content:space-between; gap:18px; flex-wrap:wrap; margin-bottom:18px; }\n"
    ".ndp-ghead h2 { font-family:'Gelasio',Georgia,serif; font-size:clamp(32px,4vw,48px); line-height:1.1; font-weight:700; color:var(--pink); }\n"
    ".ndp-ghead p { margin-top:8px; max-width:34em; font-size:16px; line-height:1.5; color:var(--soft); }\n"
    ".ndp-gmore { flex:0 0 auto; display:inline-flex; align-items:center; gap:8px; height:44px; padding:0 18px; border-radius:14px; background:#fff; border:1px solid #e9c6e0; color:var(--ink); font-size:15px; font-weight:500; text-decoration:none; transition:border-color .2s; }\n"
    ".ndp-gmore:hover { border-color:var(--pink); }\n"
    ".ndp-grail { display:flex; gap:clamp(14px,2vw,22px); overflow-x:auto; scroll-snap-type:x proximity; padding:10px 4px 16px; margin:0 -4px; scrollbar-width:none; }\n"
    ".ndp-grail::-webkit-scrollbar { display:none; }\n"
    ".ndp-gc { flex:0 0 clamp(220px,26vw,290px); scroll-snap-align:start; cursor:pointer; -webkit-tap-highlight-color:transparent; }\n"
    ".ndp-gc .ndp-gimg { aspect-ratio:85.6/54; border-radius:4.2%/6.6%; background:#e8edf6 center/cover no-repeat; box-shadow:0 18px 30px -16px rgba(27,53,102,.5),0 4px 10px rgba(27,53,102,.1); transform:rotate(var(--r,-2deg)); transition:transform .35s cubic-bezier(.2,.8,.2,1),box-shadow .35s; }\n"
    ".ndp-gc:nth-child(even) .ndp-gimg { --r:2deg; }\n"
    ".ndp-gc:hover .ndp-gimg { transform:translateY(-6px) rotate(0deg); box-shadow:0 26px 38px -16px rgba(27,53,102,.55),0 6px 14px rgba(27,53,102,.12); }\n"
    ".ndp-gc .ndp-gtx { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-top:14px; padding:0 2px; }\n"
    ".ndp-gc .ndp-gval { font-size:19px; font-weight:600; color:var(--ink); white-space:nowrap; }\n"
    ".ndp-gc .ndp-gscene { font-size:13px; color:var(--soft); text-align:right; }\n"
    ".ndp-gcats { display:flex; gap:10px; align-items:center; margin-top:6px; font-size:14px; line-height:1.45; color:var(--soft); }\n"
    ".ndp-gcats b { color:var(--ink); font-weight:500; }")

rep("      {key: 'sladke', title: 'Sladké',",
    "      {key: 'karty', title: 'Dárkové karty', part: '940179625724', kind: 'cards', lead: 'Když nevíte, co vybrat: ať si vybere sám. Elektronická přijde e-mailem, plastová v dárkové obálce.', more: '/darkove-karty'},\n"
    "      {key: 'sladke', title: 'Sladké',")

rep("  function lineHtml(l, items) {\n",
    "  var SCENES = {500: 'Černá kočka v lučním kvítí', 1000: 'Bílá kočka ve fialových květech', 1500: 'Siamská kočka při západu slunce', 2000: 'Zrzavé kotě na zahradní cestě'};\n"
    "  // Gift cards: one tile per value (the electronic card); the type is chosen in the product popup.\n"
    "  function cardsHtml(l, items) {\n"
    "    var list = items.filter(function (p) { return /elektronick/i.test(p.title); }).sort(function (a, b) { return a.price - b.price; });\n"
    "    if (!list.length) list = items;\n"
    "    return '<section class=\"ndp-line\" id=\"ndp-' + l.key + '\"><div class=\"ndp-gwrap\"><div class=\"ndp-ghead\"><div><h2>' + esc(l.title) + '</h2><p>' + esc(l.lead) + '</p></div>'\n"
    "      + (l.more ? '<a class=\"ndp-gmore\" href=\"' + esc(l.more) + '\">🐾 Proč to děláme</a>' : '') + '</div>'\n"
    "      + '<div class=\"ndp-grail\">' + list.map(function (p) {\n"
    "        var im = firstImage(p), v = Math.round(Number(p.price) || 0);\n"
    "        return '<div class=\"js-product ndp-gc\" data-product-uid=\"' + esc(p.uid) + '\" data-product-img=\"' + esc(im) + '\" data-product-url=\"' + esc(p.url || '') + '\">'\n"
    "          + '<div class=\"js-product-img ndp-gimg\" style=\"background-image:url(' + esc(im) + ')\"></div>'\n"
    "          + '<div class=\"js-product-name ndp-full\">' + esc(p.title) + '</div>'\n"
    "          + '<div class=\"ndp-gtx\"><span class=\"ndp-gval\"><span class=\"js-product-price\">' + czk(p.price) + '</span> Kč</span><span class=\"ndp-gscene\">' + esc(SCENES[v] || '') + '</span></div></div>';\n"
    "      }).join('') + '</div>'\n"
    "      + '<div class=\"ndp-gcats\"><span>🐾</span><span>Z každé karty posíláme <b>50 Kč kočkám v útulcích</b>. Platíme to my.</span></div></div></section>';\n"
    "  }\n"
    "  function lineHtml(l, items) {\n"
    "    if (l.kind === 'cards') return cardsHtml(l, items);\n")
open(dst, 'w', encoding='utf-8').write(s)
print('ok')
