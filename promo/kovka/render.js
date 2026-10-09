// render the film frame by frame at 1920x1080 and pipe JPEGs into ffmpeg
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
(async () => {
  const [file, out, fps = '30'] = process.argv.slice(2);
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const b = await chromium.launch({ proxy, args: ['--ignore-certificate-errors'] });
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await pg.goto('file://' + file);
  await pg.waitForFunction(() => window.__kovka, null, { timeout: 15000 });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => { window.__kovka.pause(); document.getElementById('bar').style.display = 'none'; });
  const dur = await pg.evaluate(() => window.__kovka.dur);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', fps, '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(dur * +fps);
  for (let i = 0; i < n; i++) {
    await pg.evaluate(s => window.__kovka.seek(s), i / +fps);
    const buf = await pg.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await b.close();
  console.log('frames', n);
})();
