const http = require("node:http"),
  { spawn } = require("node:child_process"),
  fs = require("node:fs/promises"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  os = require("node:os");
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "les-capture-"));
  let writes = 0;
  const server = http.createServer((req, res) => {
    if (req.method === "POST") writes++;
    res.setHeader("Content-Type", "text/html");
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/list")
      res.end(
        '<a href="/review?a=1">Review Previous Attempt</a><a href="/review?a=2">Review Previous Attempt</a><form action="/mutate" method="post"><button>Retake</button></form>',
      );
    else if (u.pathname === "/review") {
      const a = u.searchParams.get("a"),
        n = u.searchParams.get("n") || "1";
      res.end(
        `<p>__REVIEW_${a}_${n}__</p>${a === "1" && n === "1" ? '<a href="/review?a=1&n=2">Next Question</a>' : ""}<button onclick="fetch('/mutate',{method:'POST'})">Submit</button>`,
      );
    } else if (u.pathname === "/blocked")
      res.end('<a href="/post-review">Review Previous Attempt</a>');
    else if (u.pathname === "/post-review")
      res.end(
        '<p>__REVIEW__</p><script>fetch("/mutate",{method:"POST"})</script>',
      );
    else res.end("__NO_ACTION__");
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const port = server.address().port;
  const script = path.resolve("tools/les-capture/capture.mjs");
  const run = (route, out) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          script,
          "--fixture",
          "--url",
          `http://127.0.0.1:${port}/${route}`,
          "--output",
          out,
        ],
        {
          cwd: dir,
          env: { ...process.env, LES_CHROMIUM_PATH: "/usr/bin/chromium" },
        },
      );
      let output = "";
      child.stdout.on("data", (s) => (output += s));
      child.stderr.on("data", (s) => (output += s));
      child.on("error", reject);
      child.on("exit", (code) => resolve({ code, output }));
    });
  try {
    for (let i = 0; i < 2; i++) {
      const r = await run("list", path.join(dir, "capture"));
      assert.equal(r.code, 0, r.output);
      const manifest = JSON.parse(
        await fs.readFile(path.join(dir, "capture/manifest.json")),
      );
      assert.equal(manifest.captures.length, 3);
      assert.ok(manifest.captures.every((c) => c.textFile && c.screenshot));
    }
    const denied = await run("blocked", path.join(dir, "denied"));
    assert.equal(denied.code, 1);
    assert.match(denied.output, /non-read/);
    assert.equal(writes, 0);
    console.log(
      "PASS: existing-review discovery, next-question navigation, 3 distinct snapshots, repeat run without duplicates, POST blocked, zero submissions to server. Local fixture only; no LES account access.",
    );
  } finally {
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
