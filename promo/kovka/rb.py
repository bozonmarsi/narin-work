import sys
from rembg import remove, new_session
from PIL import Image
s = new_session(sys.argv[1])
for src in sys.argv[3:]:
    im = Image.open(src).convert('RGB')
    im.thumbnail((1000, 1000), Image.LANCZOS)
    o = remove(im, session=s, alpha_matting=True, alpha_matting_foreground_threshold=245, alpha_matting_background_threshold=12, alpha_matting_erode_size=6)
    o = o.crop(o.getbbox())
    name = src.rsplit('/', 1)[1].split('.')[0]
    o.save(f'{sys.argv[2]}/k{name}.webp', 'WEBP', quality=88, method=6)
    print(name, o.size)
