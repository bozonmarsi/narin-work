import numpy as np
from PIL import Image
from rembg import remove, new_session
im = Image.open('../images/2.webp').convert('RGB'); im.thumbnail((1000, 1000), Image.LANCZOS)
a = np.asarray(im).astype(np.float32)
rb = np.asarray(remove(im, session=new_session('isnet-general-use'), alpha_matting=True, alpha_matting_foreground_threshold=245, alpha_matting_background_threshold=12, alpha_matting_erode_size=6))[..., 3].astype(np.float32) / 255
mn, mx = a.min(2), a.max(2)
neutral = (mn > 195) & ((mx - mn) < 9)
reg = np.zeros_like(neutral)
reg[0], reg[-1], reg[:, 0], reg[:, -1] = neutral[0], neutral[-1], neutral[:, 0], neutral[:, -1]
while True:
    g = reg.copy(); g[1:] |= reg[:-1]; g[:-1] |= reg[1:]; g[:, 1:] |= reg[:, :-1]; g[:, :-1] |= reg[:, 1:]; g &= neutral
    if (g == reg).all(): break
    reg = g
fg = ~reg
# shrink classic mask by 1px to avoid white fringe, only trust it where saturated (blue sprigs etc)
e = fg.copy(); e[1:] &= fg[:-1]; e[:-1] &= fg[1:]; e[:, 1:] &= fg[:, :-1]; e[:, :-1] &= fg[:, 1:]
sat = (mx - mn) > 25
alpha = np.maximum(rb, (e & sat).astype(np.float32))
o = Image.fromarray(np.dstack([a, alpha * 255]).astype(np.uint8), 'RGBA')
o = o.crop(o.getbbox()); o.save('cut2/k2.webp', 'WEBP', quality=88, method=6); print(o.size)
