// Рендер build/*.html -> out/*.pdf (векторный текст и QR) и preview/*.png.
// Нужен playwright-core и Chromium:  NODE_PATH=<node_modules> node print/gift-cards/render.cjs
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const ROOT = __dirname;
const PAGE = { width: "89.6mm", height: "58mm" };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ deviceScaleFactor: 1058 / 339 });
  fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "preview"), { recursive: true });

  for (const name of ["fronts", "backs", "back-templates", "duplex"]) {
    await page.goto("file://" + path.join(ROOT, "build", name + ".html"));
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({ path: path.join(ROOT, "out", `narin-gift-card-${name}.pdf`), ...PAGE, printBackground: true, preferCSSPageSize: true });
    console.log("pdf", name);
  }

  // PNG-превью: каждая страница preview.html отдельно, 300 dpi (89.6 мм = 1058 px)
  await page.setViewportSize({ width: 339, height: 220 });
  await page.goto("file://" + path.join(ROOT, "build", "preview.html"));
  await page.evaluate(() => document.fonts.ready);
  const pages = await page.$$(".page");
  const nominals = [500, 1000, 1500, 2000];
  for (let i = 0; i < pages.length; i++) {
    const side = i % 2 === 0 ? "front" : "back";
    const file = path.join(ROOT, "preview", `${nominals[i >> 1]}-${side}.png`);
    await pages[i].screenshot({ path: file, scale: "device" });
  }
  await browser.close();
})();
