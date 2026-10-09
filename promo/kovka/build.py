"""Inline assets/ into template.html as data URIs -> kovka.html (single-file presentation)."""
import base64
import pathlib

here = pathlib.Path(__file__).parent
html = (here / "template.html").read_text(encoding="utf-8")
for f in sorted((here / "assets").iterdir()):
    mime = {"webp": "image/webp", "png": "image/png"}[f.suffix[1:]]
    uri = f"data:{mime};base64," + base64.b64encode(f.read_bytes()).decode()
    html = html.replace(f"%%{f.stem}%%", uri)
assert "%%" not in html, "unfilled asset placeholder"
(here / "kovka.html").write_text(html, encoding="utf-8")
print("kovka.html", len(html) // 1024, "KB")
