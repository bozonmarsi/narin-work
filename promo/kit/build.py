"""Inline assets into template.html -> kit.html (FC Sajfer intro: colour crest, kit maker mark, NARIN A)."""
import base64
import pathlib

here = pathlib.Path(__file__).parent
html = (here / "template.html").read_text(encoding="utf-8")
html = html.replace("%%MARK%%", (here / "mark_path.txt").read_text().strip())
for name in ("crest_color", "A_color"):
    f = next((p for p in (here / "assets").glob(name + ".*") if p.suffix in (".png", ".webp", ".jpg")), None)
    uri = ""
    if f:
        mime = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg"}[f.suffix]
        uri = f"data:{mime};base64," + base64.b64encode(f.read_bytes()).decode()
    html = html.replace(f"%%{name}%%", uri)
assert "%%" not in html, "unfilled placeholder"
(here / "kit.html").write_text(html, encoding="utf-8")
print("kit.html", len(html) // 1024, "KB")
