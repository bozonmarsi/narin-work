import sys
import numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
im.thumbnail((900, 900), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
mn, mx = a.min(2), a.max(2)
lum = a.mean(2)
neutral = (mn > 195) & ((mx - mn) < 9)
fg = ~neutral
for _ in range(int(sys.argv[3]) if len(sys.argv)>3 else 4):
    f2 = fg.copy(); f2[1:] |= fg[:-1]; f2[:-1] |= fg[1:]; f2[:, 1:] |= fg[:, :-1]; f2[:, :-1] |= fg[:, 1:]; fg = f2
open_ = neutral & ~fg
full = neutral
neutral = open_
reg = np.zeros_like(neutral)
reg[0, :] = neutral[0, :]; reg[-1, :] = neutral[-1, :]
reg[:, 0] = neutral[:, 0]; reg[:, -1] = neutral[:, -1]
while True:
    g = reg.copy()
    g[1:] |= reg[:-1]; g[:-1] |= reg[1:]; g[:, 1:] |= reg[:, :-1]; g[:, :-1] |= reg[:, 1:]
    g &= neutral
    if (g == reg).all(): break
    reg = g
for _ in range(5):
    g = reg.copy(); g[1:] |= reg[:-1]; g[:-1] |= reg[1:]; g[:, 1:] |= reg[:, :-1]; g[:, :-1] |= reg[:, 1:]
    reg = g & full
alpha = np.where(reg, np.clip((252 - lum) / 252 * 1.6, 0, 1), 1.0)
# soften 1px fringe: foreground pixels touching bg that are very light
edge = np.zeros_like(reg)
edge[1:] |= reg[:-1]; edge[:-1] |= reg[1:]; edge[:, 1:] |= reg[:, :-1]; edge[:, :-1] |= reg[:, 1:]
edge &= ~reg
alpha = np.where(edge, np.minimum(alpha, np.clip((255 - lum) / 40, 0.35, 1)), alpha)
rgb = np.where(reg[..., None], 0, a)
out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
o = Image.fromarray(out, 'RGBA')
o = o.crop(o.getbbox())
o.save(dst, 'WEBP', quality=86, method=6)
print(dst, o.size)
