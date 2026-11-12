# Trace the logo daisy mask into one smooth SVG path in a 100x100 box centred on 0,0
import sys, cv2, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGBA'))[..., 3]
a = cv2.resize(a, None, fx=5, fy=5, interpolation=cv2.INTER_CUBIC)
a = cv2.GaussianBlur(a, (0, 0), 3)
_, m = cv2.threshold(a, 127, 255, cv2.THRESH_BINARY)
cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
x0, y0, w, h = cv2.boundingRect(c.astype(np.int32))
cx, cy, s = x0 + w / 2, y0 + h / 2, 100 / max(w, h)
p = cv2.approxPolyDP(c.astype(np.float32).reshape(-1, 1, 2), 2.0, True)[:, 0, :]
p = (p - [cx, cy]) * s
n = len(p)
d = f'M{p[0][0]:.2f} {p[0][1]:.2f}'
for i in range(n):  # Catmull-Rom -> cubic Bezier
    p0, p1, p2, p3 = p[i - 1], p[i], p[(i + 1) % n], p[(i + 2) % n]
    c1, c2 = p1 + (p2 - p0) / 6, p2 - (p3 - p1) / 6
    d += f'C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} {p2[0]:.2f} {p2[1]:.2f}'
print(d + 'Z')
print(n, file=sys.stderr)
