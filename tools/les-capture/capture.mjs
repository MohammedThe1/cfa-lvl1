import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import path from "node:path";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const args = process.argv.slice(2),
  option = (key, fallback) => {
    const i = args.indexOf(key);
    return i >= 0 ? args[i + 1] : fallback;
  };
const startURL = option(
  "--url",
  "https://learn.cfainstitute.org/courses/2127/external_tools/261",
);
const output = path.resolve(option("--output", "les-output")),
  fixture = args.includes("--fixture"),
  parsed = new URL(startURL);
if (
  !fixture &&
  (parsed.protocol !== "https:" || parsed.hostname !== "learn.cfainstitute.org")
)
  throw Error("Use an HTTPS Practice URL on learn.cfainstitute.org.");
const maxPages = Number(option("--max-pages", "200"));
if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 500)
  throw Error("max-pages must be 1–500.");
await mkdir(output, { recursive: true });
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const context = await chromium.launchPersistentContext(
  path.resolve(".les-profile"),
  {
    headless: fixture,
    channel: process.env.LES_CHROMIUM_PATH ? undefined : "chrome",
    executablePath: process.env.LES_CHROMIUM_PATH || undefined,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: false,
  },
);
const page = context.pages()[0] || (await context.newPage());
let index = {
  version: 1,
  mode: "existing-review-only",
  captures: [],
  limitations: [
    "Rendered review evidence, not a validated question bank.",
    "Pack/source membership and answer completeness must be checked from visible labels.",
  ],
};
try {
  index = JSON.parse(
    await readFile(path.join(output, "manifest.json"), "utf8"),
  );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const safeURL = (url) => {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return "(unknown)";
  }
};
async function saveIndex() {
  await writeFile(
    path.join(output, "manifest.json"),
    JSON.stringify(index, null, 2),
  );
}
async function snapshot(target, group, number) {
  const frames = [],
    failures = [];
  for (const frame of target.frames()) {
    try {
      const text = await frame.locator("body").innerText({ timeout: 10000 });
      if (text.trim()) frames.push({ location: safeURL(frame.url()), text });
    } catch {
      failures.push(safeURL(frame.url()));
    }
  }
  if (!frames.length)
    throw Error("No readable review content. Capture stopped.");
  const text = frames
      .map((f) => `[FRAME ${f.location}]\n${f.text}`)
      .join("\n\n"),
    digest = hash(text),
    name = `review-${group}-${number}-${digest.slice(0, 10)}`;
  if (index.captures.some((c) => c.digest === digest))
    return { digest, repeated: true };
  await writeFile(path.join(output, name + ".txt"), text);
  await writeFile(
    path.join(output, name + ".json"),
    JSON.stringify(
      {
        version: 1,
        status: "review",
        frames,
        unreadableFrames: failures,
        validation: "not validated",
        correctAnswer: "not inferred",
        packMembership: "not inferred",
      },
      null,
      2,
    ),
  );
  await target.screenshot({
    path: path.join(output, name + ".png"),
    fullPage: true,
  });
  index.captures.push({
    digest,
    textFile: name + ".txt",
    evidenceFile: name + ".json",
    screenshot: name + ".png",
    capturedAt: new Date().toISOString(),
    review: group,
    page: number,
  });
  await saveIndex();
  return { digest, repeated: false };
}
async function controls(target, name) {
  const found = [];
  for (const frame of target.frames())
    for (const role of ["link", "button"]) {
      const loc = frame.getByRole(role, { name, exact: true });
      for (let i = 0; i < (await loc.count()); i++)
        if (await loc.nth(i).isVisible()) found.push(loc.nth(i));
    }
  return found;
}
try {
  await page.goto(startURL, { waitUntil: "domcontentloaded" });
  if (!fixture) {
    console.log(
      "سجّل الدخول بنفسك في Chrome وافتح قائمة Practice التي تعرض Review Previous Attempt. لا تختَر Retake أو Restart.",
    );
    await terminal.question("عندما تظهر القائمة اضغط Enter هنا: ");
  }
  const practiceURL = page.url();
  let blocked = 0;
  // Authentication occurs before the guard; capture rejects non-read HTTP methods.
  await context.route("**/*", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      blocked++;
      await route.abort("blockedbyclient");
    } else await route.continue();
  });
  const initial = await controls(page, "Review Previous Attempt");
  if (!initial.length)
    throw Error(
      "No visible Review Previous Attempt controls. Open a completed-review list and run again. No Take/Retake/Restart actions were performed.",
    );
  console.log(`Found ${initial.length} existing-review controls.`);
  for (let i = 0; i < initial.length; i++) {
    if (i > 0) await page.goto(practiceURL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(fixture ? 100 : 1500);
    const reviews = await controls(page, "Review Previous Attempt");
    if (reviews.length !== initial.length)
      throw Error(
        "Review list changed; stopping to avoid selecting the wrong control.",
      );
    const beforeBlocked = blocked,
      oldPages = new Set(context.pages());
    await reviews[i].click({ noWaitAfter: true });
    await page.waitForTimeout(fixture ? 100 : 1800);
    const target = context.pages().find((p) => !oldPages.has(p)) || page;
    const seen = new Set();
    for (let n = 1; n <= maxPages; n++) {
      if (blocked > beforeBlocked)
        throw Error(
          "A non-read network request was blocked. This review needs site-specific inspection; automation stopped without allowing it.",
        );
      const snap = await snapshot(target, i + 1, n);
      if (seen.has(snap.digest)) break;
      seen.add(snap.digest);
      const next = await controls(target, "Next Question");
      if (!next.length || (await next[0].isDisabled())) break;
      if (next.length !== 1)
        throw Error(
          "Ambiguous Next Question controls. Manual inspection required.",
        );
      if (n === maxPages) {
        index.limitations.push(
          `Review ${i + 1} reached max-pages; completeness unverified.`,
        );
        break;
      }
      await next[0].click({ noWaitAfter: true });
      await target.waitForTimeout(fixture ? 100 : 1000);
    }
    if (target !== page) await target.close();
  }
  console.log(
    `Saved ${index.captures.length} distinct review snapshots in ${output}. They require source review. No answers submitted.`,
  );
} catch (error) {
  index.limitations.push(error.message);
  await saveIndex();
  console.error(error.message);
  process.exitCode = 1;
} finally {
  terminal.close();
  await context.close();
}
