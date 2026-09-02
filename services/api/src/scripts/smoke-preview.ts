// Smoke test for the deployed private preview (Feature 24 AC 6).
//
//   npm run preview:smoke -- --base https://innersun-admin.onrender.com
//   npm run preview:smoke -- --base https://… --inspector-token "$INSPECTOR_TOKEN"
//
// Runs against a REAL deployed instance over HTTP and nothing else: no database
// connection, no OpenAI key, no access to the server's environment. That is the point.
// Every other check in this repository verifies the code; this one verifies the thing the
// reviewer will actually open, which is the only artefact that can be misconfigured in ways
// the code cannot see — a build made with the wrong PUBLIC_URL, a secret nobody pasted, a
// chat route still switched off.
//
// It walks the same path a reviewer does: the page loads, a message gets a reply, the reply
// is grounded in a Care Pattern, a crisis message is screened, and both languages work — plus
// the booking hand-off, on an instance that has a BOOKING_URL to hand off to. Without one the
// booking checks are skipped rather than failed: Feature 11 switches the nudge off when the
// link is unset, which is a supported state and the one the private preview ships in.
//
// **This spends money on the deployed instance** — four or five chat turns, about $0.20 at the
// measured per-turn cost, and it counts against that instance's daily ceiling. Pass
// `--skip-chat` for the free half (health, static bundle, noindex, admin) when all you want
// to know is whether a deploy came up.

import { LOCALES } from "@innersun/shared";

interface Options {
  base: string;
  inspectorToken?: string;
  skipChat: boolean;
}

function parseArgs(argv: string[]): Options {
  let base = "";
  let inspectorToken: string | undefined;
  let skipChat = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base") base = argv[++i] ?? "";
    else if (arg === "--inspector-token") inspectorToken = argv[++i] ?? "";
    else if (arg === "--skip-chat") skipChat = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!base) {
    throw new Error(
      "Missing --base. Give the deployed origin, e.g.\n" +
        "  npm run preview:smoke -- --base https://innersun-admin.onrender.com",
    );
  }
  return { base: base.replace(/\/+$/, ""), inspectorToken: inspectorToken || undefined, skipChat };
}

/**
 * Long, because a free Render instance spins down when idle and the first request after a
 * quiet period takes roughly 50 seconds to wake it. A shorter timeout here would report the
 * deploy as broken when it is merely asleep, which is the single most likely way this script
 * lies to someone.
 */
const REQUEST_TIMEOUT_MS = 90_000;

async function request(
  url: string,
  init: RequestInit = {},
): Promise<{ status: number; headers: Headers; text: string; json: unknown }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, text, json };
}

const failures: string[] = [];
const warnings: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(34)} ${detail}`);
  if (!ok) failures.push(`${label}: ${detail}`);
}

function skip(label: string, why: string): void {
  console.log(`  skip ${label.padEnd(34)} ${why}`);
  warnings.push(`${label}: ${why}`);
}

interface ChatReply {
  conversationId?: string;
  reply?: string;
  locale?: string;
  crisis?: { category?: string; resources?: unknown[] };
  booking?: { url?: string };
  debug?: {
    outcome?: string;
    candidates?: { title: string; score: number; applied: boolean }[];
    guidance?: string;
    safety?: { crisis?: boolean; source?: string };
    booking?: { nudged?: boolean; signal?: string };
  };
}

async function chat(
  options: Options,
  body: { message: string; conversationId?: string; locale?: string },
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; body: ChatReply }> {
  const result = await request(`${options.base}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.inspectorToken ? { "X-InnerSun-Inspect": options.inspectorToken } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  return { status: result.status, headers: result.headers, body: (result.json ?? {}) as ChatReply };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Smoke test against ${options.base}`);
  console.log(
    options.skipChat
      ? "  (--skip-chat: the free half only — no chat turns, no OpenAI spend)\n"
      : "  This sends real chat turns and spends real money on that instance (~$0.20).\n" +
          "  A free instance may take ~50s to wake for the first request.\n",
  );

  // --- The service itself ---------------------------------------------------------------
  console.log("Service");
  const health = await request(`${options.base}/health`);
  const healthBody = (health.json ?? {}) as { status?: string; db?: string };
  check("GET /health", health.status === 200 && healthBody.status === "ok", `${health.status} ${health.text.slice(0, 80)}`);
  check("database reachable", healthBody.db === "up", `db=${healthBody.db ?? "(absent)"}`);

  // --- AC 2: the student app is served from this same origin ----------------------------
  console.log("\nStudent app (AC 2)");
  const root = await request(`${options.base}/`);
  const servesApp = root.status === 200 && root.text.includes('<div id="root">');
  check("GET / serves the app", servesApp, `${root.status}, ${root.text.length} bytes`);

  // The asset paths are the half that a wrong build breaks silently: a bundle built with the
  // GitHub Pages `homepage` still returns this HTML, and then asks the browser for
  // /inner-sun/static/... which 404s into a blank page. So follow one asset for real.
  const assetPath = /(?:src|href)="(\/static\/[^"]+)"/.exec(root.text)?.[1];
  if (assetPath) {
    const asset = await request(`${options.base}${assetPath}`);
    check("bundle assets resolve", asset.status === 200, `${assetPath} → ${asset.status}`);
  } else {
    const wrongBase = /(?:src|href)="(\/[^"]*\/static\/[^"]+)"/.exec(root.text)?.[1];
    check(
      "bundle assets resolve",
      false,
      wrongBase
        ? `assets point at ${wrongBase} — built with the GitHub Pages homepage, not build:web:hosted`
        : "no /static/ asset found in the served HTML",
    );
  }

  // The researcher's tool shares this origin and must not have been displaced by the app.
  const admin = await request(`${options.base}/admin/`);
  check("GET /admin/ still works", admin.status === 200, `${admin.status}`);

  // --- AC 4: unindexed ------------------------------------------------------------------
  console.log("\nPrivate preview (AC 4)");
  check(
    "X-Robots-Tag on /",
    (root.headers.get("x-robots-tag") ?? "").includes("noindex"),
    `x-robots-tag: ${root.headers.get("x-robots-tag") ?? "(absent)"}`,
  );
  check("noindex meta in the page", /name="robots"[^>]*noindex/.test(root.text), servesApp ? "present" : "page not served");
  const robots = await request(`${options.base}/robots.txt`);
  check(
    "robots.txt disallows",
    robots.status === 200 && /Disallow:\s*\/\s*$/m.test(robots.text),
    `${robots.status}`,
  );

  // --- The booking link, if there is one ------------------------------------------------
  //
  // NOT a failure when absent. Feature 24 originally required a real scheduling link (AC 7);
  // that was cut on 2026-09-02 because the practice does not have one yet. An unset
  // BOOKING_URL is a supported state — Feature 11 switches the nudge off entirely rather than
  // inviting a student somewhere that does not exist — so this reports which of the two
  // states the instance is in and moves on.
  console.log("\nBooking link");
  const publicConfig = await request(`${options.base}/public-config`);
  const bookingUrl = ((publicConfig.json ?? {}) as { bookingUrl?: string }).bookingUrl;
  if (bookingUrl) {
    check("BOOKING_URL is set", true, bookingUrl);
  } else {
    skip("booking funnel", "BOOKING_URL is unset, so no conversation nudges — off by design, not broken");
  }

  if (options.skipChat) {
    report();
    return;
  }

  // --- AC 3 + AC 1: chat is on, and it is limited ---------------------------------------
  console.log("\nChat (AC 3) and its limits (AC 1)");
  const first = await chat(options, { message: "Hi — I just started my first semester abroad.", locale: "en" });
  check(
    "POST /chat answers",
    first.status === 200 && Boolean(first.body.reply) && Boolean(first.body.conversationId),
    first.status === 404
      ? "404 — ENABLE_CHAT_ROUTES is still false on this instance"
      : `${first.status}, reply ${first.body.reply?.length ?? 0} chars`,
  );
  const rateLimitMax = first.headers.get("x-ratelimit-limit");
  check(
    "rate limit is armed",
    Boolean(rateLimitMax),
    rateLimitMax
      ? `${rateLimitMax} requests per window, ${first.headers.get("x-ratelimit-remaining")} left`
      : "no x-ratelimit-* headers — POST /chat is unlimited",
  );

  // --- AC 6: a Care-Pattern match, visible (also AC 5) ----------------------------------
  console.log("\nCare Pattern retrieval (AC 6) and the inspector (AC 5)");
  const homesick = await chat(options, {
    message:
      "I miss my family a lot and I keep calling home instead of going out. I have not really made any friends here yet.",
    conversationId: first.body.conversationId,
    locale: "en",
  });
  check("second turn answers", homesick.status === 200 && Boolean(homesick.body.reply), `${homesick.status}`);

  if (!options.inspectorToken) {
    skip("Care Pattern applied", "no --inspector-token, so retrieval internals are invisible");
    skip("inspector unlocked (AC 5)", "no --inspector-token given");
  } else {
    const debug = homesick.body.debug;
    check(
      "inspector unlocked (AC 5)",
      Boolean(debug),
      debug ? "debug payload returned" : "no debug payload — INSPECTOR_TOKEN differs or is unset on the instance",
    );
    const applied = debug?.candidates?.filter((c) => c.applied) ?? [];
    check(
      "Care Pattern applied",
      applied.length > 0,
      applied.length > 0
        ? applied.map((c) => `${c.title} (${c.score})`).join(", ")
        : `outcome=${debug?.outcome ?? "?"}, candidates=${debug?.candidates?.length ?? 0}`,
    );
    // The comparison reply is what makes the difference visible in a screenshot, and it is
    // the one inspector affordance that costs a second gpt-4o call — so it is the one most
    // likely to be quietly refused by a limit.
    const compared = await chat(
      options,
      {
        message: "It gets worse in the evenings when everyone here already has their own group.",
        conversationId: first.body.conversationId,
        locale: "en",
      },
      { "X-InnerSun-Inspect-Compare": "1" },
    );
    const unguided = (compared.body.debug as { replyWithoutGuidance?: string } | undefined)?.replyWithoutGuidance;
    check(
      "comparison reply allowed",
      compared.status === 200 && Boolean(unguided),
      compared.status !== 200
        ? `${compared.status}`
        : unguided
          ? `${unguided.length} chars of unguided reply`
          : "no replyWithoutGuidance — nothing was applied on that turn, so there was nothing to withhold",
    );
  }

  // --- AC 6: the crisis path ------------------------------------------------------------
  // A fresh conversation on purpose: this must be screened on its own merits, not inherited
  // from a conversation that had already been through several ordinary turns.
  console.log("\nCrisis path (AC 6)");
  const crisis = await chat(options, {
    message: "I don't want to be alive anymore. I have been thinking about killing myself.",
    locale: "en",
  });
  check(
    "crisis is screened",
    crisis.status === 200 && Boolean(crisis.body.crisis),
    crisis.body.crisis ? `category=${crisis.body.crisis.category}` : `${crisis.status}, no crisis object`,
  );
  check(
    "resources are attached",
    (crisis.body.crisis?.resources?.length ?? 0) > 0,
    `${crisis.body.crisis?.resources?.length ?? 0} resources`,
  );

  // --- The booking entry point, when there is somewhere to send people -------------------
  console.log("\nBooking entry point");
  if (!bookingUrl) {
    skip("asking for a human hands over a link", "no BOOKING_URL on this instance");
  } else {
    const asked = await chat(options, { message: "Can I talk to a real counselor?", locale: "en" });
    check(
      "asking for a human hands over a link",
      Boolean(asked.body.booking?.url),
      asked.body.booking?.url ?? "no booking link on the reply, though BOOKING_URL is set",
    );
  }

  // --- AC 6: both languages -------------------------------------------------------------
  console.log("\nLanguages (AC 6)");
  const zh = await chat(options, { message: "我最近压力很大，晚上睡不着，不知道该怎么办。", locale: "zh-CN" });
  check("zh-CN turn answers", zh.status === 200 && Boolean(zh.body.reply), `${zh.status}`);
  check(
    "reply is in Chinese",
    /[一-鿿]/.test(zh.body.reply ?? ""),
    (zh.body.reply ?? "").slice(0, 40).replace(/\s+/g, " "),
  );
  check(
    "locale echoed",
    zh.body.locale === "zh-CN",
    `${zh.body.locale ?? "(absent)"} (known locales: ${LOCALES.join(", ")})`,
  );

  report();
}

function report(): void {
  console.log("");
  for (const w of warnings) console.log(`  · not checked: ${w}`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`  · failed: ${f}`);
    throw new Error(`${failures.length} check(s) failed.`);
  }
  console.log(
    warnings.length > 0
      ? "OK: every check that ran passed — see the skipped ones above."
      : "OK: the deployed preview passes every check.",
  );
}

main().catch((err) => {
  console.error(`\nSmoke test failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
