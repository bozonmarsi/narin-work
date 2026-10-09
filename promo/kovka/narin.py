"""Split the NARIN logo (white background) into transparent glyph PNGs that share one coordinate frame."""
import sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
alpha = np.clip((255 - a).max(2) / 110, 0, 1)
rgb = np.clip(np.where(alpha[..., None] > 0.01, (a - (1 - alpha[..., None]) * 255) / np.maximum(alpha[..., None], 0.01), 255), 0, 255)
rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
parts = {  # name: (x0, x1, y0, y1) in source px
    'nN1': (226, 454, 330, 640), 'nA': (465, 725, 330, 640), 'nR': (731, 953, 330, 640),
    'nI': (965, 1050, 330, 640), 'nN2': (1071, 1299, 330, 640),
    'nSub1': (226, 762, 640, 745), 'nSub2': (938, 1307, 640, 745),
}
for k, (x0, x1, y0, y1) in parts.items():
    Image.fromarray(rgba[y0:y1, x0:x1], 'RGBA').save(f'{out}/{k}.png', optimize=True)
    print(k, x0, y0, x1 - x0, y1 - y0)
