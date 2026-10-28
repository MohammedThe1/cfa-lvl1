const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const { fixture } = await import("./fixtures.js");
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (require("node:fs").existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined),
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  await context.route("**/question-bank.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: 1, questions: [] }),
    }),
  );
  const page = await context.newPage();
  const navigate=async(url)=>{await page.goto(url);await page.locator('#main').waitFor();};
  const reload=async()=>{await page.reload();await page.locator('#main').waitFor();};
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await navigate("http://127.0.0.1:5173");
  await page.screenshot({
    path: "test-results/phone-empty.png",
    fullPage: true,
  });
  assert.equal(await page.locator(".topic").count(), 10);
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.locator('nav a[href="#sources"]').click();
  const q = fixture();
  q.materials = [
    {
      id: "tbl",
      type: "table",
      headers: ["__COL_1__", "__COL_2__"],
      rows: [["__CELL_1__", "__CELL_2__"]],
    },
    { id: "f", type: "formula", text: "__FORMULA_SOURCE_TOKEN__" },
    { id: "p", type: "passage", text: "__PASSAGE_SOURCE_TOKEN__" },
  ];
  q.requiredMaterialIds = ["tbl", "f", "p"];
  const bank = JSON.stringify({
    version: 1,
    questions: [q, fixture("record-2", true)],
  });
  await page.locator("#bank-file").setInputFiles({
    name: "structural-fixtures.json",
    mimeType: "application/json",
    buffer: Buffer.from(bank),
  });
  await page.getByRole("status").waitFor();
  await page.locator('nav a[href="#study"]').click();
  await page.locator(".topic").first().click();
  await page.getByRole("button", { name: "Start lesson", exact: true }).click();
  await page.locator('input[value="option-x"]').check();
  const order = await page
    .locator("input[name=answer]")
    .evaluateAll((es) => es.map((e) => e.value));
  await reload();
  assert.deepEqual(
    await page
      .locator("input[name=answer]")
      .evaluateAll((es) => es.map((e) => e.value)),
    order,
  );
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 1024 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.locator('[data-action="submit"]').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('[data-action="submit"]').isVisible());
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-action="submit"]').click();
  assert.equal(await page.locator(".feedback.error").count(), 1);
  await page.locator('[data-action="bookmark"]').click();
  await reload();
  assert.equal(await page.locator(".feedback.error").count(), 1);
  await page.locator('[data-action="next"]').click();
  assert.deepEqual(
    await page
      .locator("input[name=answer]")
      .evaluateAll((es) => es.map((e) => e.value)),
    ["option-x", "option-y", "option-z"],
  );
  await page.locator('input[value="option-y"]').check();
  await page.locator('[data-action="submit"]').click();
  await page.locator('[data-action="next"]').click();
  assert.equal(
    await page
      .locator(".eyebrow")
      .filter({ hasText: "Reviewing a previous mistake" })
      .count(),
    1,
  );
  await page.locator('input[value="option-y"]').check();
  await page.locator('[data-action="submit"]').click();
  await page.locator('[data-action="next"]').click();
  await page.locator(".result-card").waitFor();
  let data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("madar-study-v1")),
  );
  assert.equal(data.attempts.length, 3);
  assert.equal(data.bookmarks.length, 1);
  await page.locator('nav a[href="#sources"]').click();
  await page.locator("#bank-file").setInputFiles({
    name: "repeat.json",
    mimeType: "application/json",
    buffer: Buffer.from(bank),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "already present" })
    .waitFor();
  data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("madar-study-v1")),
  );
  assert.equal(data.questions.length, 2);
  assert.equal(data.attempts.length, 3);
  const bad = fixture("bad");
  bad.correctOptionId = "missing";
  await page.locator("#bank-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, questions: [bad] })),
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Correct answer" })
    .waitFor();
  await page.locator('nav a[href="#tests"]').click();
  await page.selectOption("select[name=mode]", "timed");
  await page.fill("input[name=minutes]", "1");
  await page.locator("#practice-form button").click();
  await page.locator('input[value="option-y"]').check();
  assert.equal(await page.locator(".feedback").count(), 0);
  await reload();
  assert.equal(await page.locator(".feedback").count(), 0);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("madar-study-v1"));
    s.sessions.find((x) => x.id === s.active).deadline = Date.now() - 1;
    localStorage.setItem("madar-study-v1", JSON.stringify(s));
  });
  await reload();
  await page.locator(".result-card").waitFor();
  data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("madar-study-v1")),
  );
  assert.equal(data.attempts.length, 4);
  await reload();
  assert.equal(
    (
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("madar-study-v1")),
      )
    ).attempts.length,
    4,
  );
  for (const size of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 1366 },
  ]) {
    await page.setViewportSize(size);
    for (const route of [
      "study",
      "sources",
      "tests",
      "progress",
      "saved",
      "weak",
      "session",
    ]) {
      await navigate("http://127.0.0.1:5173/#" + route);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${size.width} ${route}: overflow`,
      );
    }
  }
  await page.setViewportSize({ width: 1024, height: 1366 });
  await page.evaluate(() => localStorage.clear());
  await navigate("http://127.0.0.1:5173/#study");
  await reload();
  await page.screenshot({
    path: "test-results/tablet-empty.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: phone workflow, selection reload, wrong retry, fixed order, bookmark, idempotent/invalid import, timed conceal/expiry, 28 viewport/route checks, no page errors.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
