import sys
import numpy as np
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
d = (255 - a).max(2)
alpha = np.clip(d / 110, 0, 1)
rgb = np.where(alpha[..., None] > 0.01, (a - (1 - alpha[..., None]) * 255) / np.maximum(alpha[..., None], 0.01), 255)
rgb = np.clip(rgb, 0, 255)
ink = (alpha > 0.05).astype(np.uint8) * 255
lab = Image.fromarray(ink, 'L')
# boxes per glyph (x ranges in source px), seeds pick the component(s)
glyphs = {
  'K1': ((262, 655), [(300, 1000)]),
  'O':  ((630, 1062), [(700, 1000)]),
  'V':  ((1040, 1495), [(1150, 850)]),
  'K2': ((1523, 1912), [(1560, 1000)]),
  'A':  ((1912, 2340), None),
  'Q':  ((2450, 2880), None),
}
H0, H1 = 600, 1340
meta = {}
for name, ((x0, x1), seeds) in glyphs.items():
    m = np.zeros(ink.shape, bool)
    if seeds:
        for sx, sy in seeds:
            tmp = lab.copy()
            ImageDraw.floodfill(tmp, (sx, sy), 128, thresh=0)
            m |= np.asarray(tmp) == 128
        # include antialias fringe: dilate 2px
        for _ in range(3):
            g = m.copy(); g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]; m = g
    else:
        m[:, x0:x1] = True
    al = np.where(m, alpha, 0)
    al[:, :x0] = 0; al[:, x1:] = 0
    rgba = np.dstack([rgb, al * 255]).astype(np.uint8)
    g = Image.fromarray(rgba, 'RGBA').crop((x0, H0, x1, H1))
    s = 0.6
    g = g.resize((round(g.width * s), round(g.height * s)), Image.LANCZOS)
    g.save(f'{out}/{name}.png', optimize=True)
    meta[name] = (x0, x1)
print(meta)
