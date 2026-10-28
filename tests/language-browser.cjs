const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs=require('node:fs');
const bank=JSON.parse(fs.readFileSync('public/question-bank.json','utf8'));
const ready=bank.questions.filter(q=>q.status==='validated'&&q.sources.every(s=>s.year==='2027')).length;
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto("http://127.0.0.1:5173/");
  await p.locator('#main').waitFor();
  assert.match(await p.locator('.stats article').first().innerText(), new RegExp('/\\s*'+ready));
  assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('madar-study-v1')).questions.length),0);
  assert.equal(await p.locator("html").getAttribute("lang"), "en");
  await p.screenshot({
    path: "test-results/english-questions.png",
    fullPage: true,
  });
  await p.locator('.topic[data-topic="Fixed Income"]').click();
  await p.locator("[data-action=lesson]").first().click();
  const original = await p.locator(".question-text h2").textContent();
  await p.locator("[data-action=language]").click();
  assert.equal(await p.locator("html").getAttribute("lang"), "ar");
  assert.equal(await p.locator(".question-text h2").textContent(), original);
  await p.reload();
  assert.equal(await p.locator("html").getAttribute("lang"), "ar");
  await p.locator("[data-action=language]").click();
  assert.equal(await p.locator("html").getAttribute("dir"), "ltr");
  await p.setViewportSize({ width: 320, height: 740 });
  await p.locator(".source-figure summary").click();
  assert.ok(
    await p
      .locator(".image-pan")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  );
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.locator("input[value=A]").check();
  await p.locator("[data-action=submit]").click();
  await p.locator(".feedback.success").waitFor();
  await p.reload();
  const state = await p.evaluate(() =>
    JSON.parse(localStorage.getItem("madar-study-v1")),
  );
  assert.equal(state.questions.length, 0); // bundled questions remain outside localStorage quota
  assert.equal(state.attempts.length, 1);
  await p.goto("http://127.0.0.1:5173/#sources");
  const chooser = p.waitForEvent("filechooser");
  await p.locator("[data-action=font]").click();
  await (
    await chooser
  ).setFiles({
    name: "not-a-font.woff2",
    mimeType: "font/woff2",
    buffer: Buffer.from("invalid"),
  });
  await p.getByRole("status").filter({ hasText: "Choose a valid" }).waitFor();
  for (const width of [320, 768, 1024]) {
    await p.setViewportSize({ width, height: 1024 });
    for (const route of [
      "study",
      "tests",
      "sources",
      "saved",
      "progress",
      "session",
      "library",
    ]) {
      await p.goto("http://127.0.0.1:5173/#" + route);
      await p.locator('#main').waitFor();
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width} ${route}`,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real source bank hydrated without quota duplication, English default, Arabic toggle/reload, original text unchanged, zoomable source image, stable attempt after reload, invalid font rejected, 18 route/viewport checks.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
