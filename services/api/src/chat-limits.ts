import { config } from "./config.js";
import { AppError } from "./errors.js";

/**
 * What keeps POST /chat from being farmed for OpenAI credit (Feature 24 AC 1).
 *
 * Until this feature the hosted service simply did not serve this route
 * (`ENABLE_CHAT_ROUTES=false`), which is a complete defence and a useless product. Turning
 * it on for the private preview replaces "nobody can call it" with two bounds:
 *
 *   1. **Per-IP rate limiting**, applied by @fastify/rate-limit from `chatRateLimit` below.
 *      It stops one client from looping the endpoint, and it is the only limit a real person
 *      might ever meet, so it is sized for the heaviest legitimate use rather than the
 *      average — see the note on the numbers.
 *   2. **A daily spend ceiling for the whole instance**, enforced here. Per-IP limiting says
 *      nothing at all about a hundred IPs, and "the URL is unadvertised" is not a cost
 *      control. This is the bound that makes the worst case a number rather than a hope.
 *
 * The second one is the reason this module exists rather than a line of route config. It is
 * deliberately crude: estimated dollars, counted in memory, reset at UTC midnight and by any
 * restart. Each of those is a real limitation, and each is the right trade at one free
 * instance serving one reviewer — an exact ceiling would mean a counter in Postgres written
 * on the hot path of every turn, to bound a bill that is already bounded well enough.
 */

/** UTC date, as `YYYY-MM-DD`. The day the running total belongs to. */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

let day = utcDay();
let spentUsd = 0;

/** Start the count over when the UTC date has rolled past the one we were counting. */
function rollover(): void {
  const now = utcDay();
  if (now !== day) {
    day = now;
    spentUsd = 0;
  }
}

/**
 * Add what a turn cost to the running total.
 *
 * Called with the ledger's estimate — the same figure the log line and the inspector quote,
 * so the ceiling is denominated in the units this codebase already reasons about. Called on
 * failed turns too: a turn that spent three cheap calls and then lost the reply call still
 * spent them, and an attacker who can make the expensive half fail must not get the cheap
 * half for free.
 */
export function recordChatSpend(usd: number): void {
  rollover();
  spentUsd += usd;
}

/** The running total, for the boot log and the 503's own log line. */
export function chatBudgetSnapshot(): { day: string; spentUsd: number; budgetUsd: number; remainingUsd: number } {
  rollover();
  const budgetUsd = config.chatLimits.dailyBudgetUsd;
  return {
    day,
    spentUsd: Number(spentUsd.toFixed(6)),
    budgetUsd,
    remainingUsd: Number(Math.max(0, budgetUsd - spentUsd).toFixed(6)),
  };
}

/**
 * Refuse the turn if today's ceiling is already reached.
 *
 * Checked before the turn runs rather than after, and against the total as it stands, which
 * means the ceiling can be crossed by at most one turn's worth — a few cents. Making it exact
 * would mean reserving an estimate up front and reconciling it afterwards, which is a great
 * deal of machinery to avoid overshooting a five-dollar limit by four cents.
 *
 * 503 rather than 429: 429 says "you personally are asking too often", and the honest thing
 * to tell a student who has sent one message is that the service is temporarily unable to
 * answer. The client maps both onto the same "busy right now" wording.
 */
export function assertChatBudget(): void {
  rollover();
  if (spentUsd < config.chatLimits.dailyBudgetUsd) return;
  throw new AppError(
    503,
    "chat_budget_exhausted",
    "InnerSun has reached its usage limit for today. Please try again tomorrow.",
  );
}

/**
 * Per-IP limiting for POST /chat, as @fastify/rate-limit route config.
 *
 * `max` is deliberately generous. The limit that matters for cost is the daily ceiling
 * above; this one exists to stop a single looping client, and it is the only one a real
 * person could run into — so it is sized for the worst legitimate case, which is a live
 * demo with the inspector's comparison switch on. Forty requests in ten minutes is a message
 * every fifteen seconds sustained, which no one types and no counseling conversation needs.
 *
 * Keyed on the client IP, which is only correct because `trustProxy` is on when hosted.
 * Without it every visitor behind the platform's load balancer would share one budget.
 */
export const chatRateLimit = {
  max: config.chatLimits.maxPerWindow,
  timeWindow: config.chatLimits.windowMs,
} as const;

/**
 * State the limits once, at startup, next to the other readiness reports.
 *
 * Same reasoning as Feature 8's cost controls and Feature 11's funnel: a limit that is set
 * wrong does not break anything visibly. Too high and the protection is theatre; too low and
 * the reviewer's demo dies mid-conversation with a 429 nobody connects to a config value.
 */
export function logChatLimits(log: { info: (obj: object, msg: string) => void }): void {
  log.info(
    {
      maxPerWindow: config.chatLimits.maxPerWindow,
      windowMs: config.chatLimits.windowMs,
      dailyBudgetUsd: config.chatLimits.dailyBudgetUsd,
    },
    "chat limits ready",
  );
}
