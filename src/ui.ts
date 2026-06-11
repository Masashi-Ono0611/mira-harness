/**
 * Tiny terminal UX helpers — color (picocolors, honors NO_COLOR / non-TTY) and an
 * elapsed-time spinner. All decoration goes to stderr so stdout stays clean for
 * machine-readable output (JSON / Markdown).
 */
import pc from "picocolors";

export const c = pc;

/** Write a line to stderr (status/decoration; never pollutes stdout). */
export function note(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

/** Center a short glyph string within `width` columns (used for the mascot mouth). */
function center(s: string, width: number): string {
  const pad = Math.max(0, width - s.length);
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + s + " ".repeat(pad - left);
}

export type Mood = "neutral" | "happy" | "sleepy" | "sad";

/**
 * A friendly @mira mascot whose face reflects a mood. Pure ASCII so it aligns in
 * any terminal/locale. Eyes are 5 cols wide; the mouth is centered to match the
 * `.-------.` box. Used by the banner (neutral) and command epilogues (e.g. doctor).
 */
export function mascot(mood: Mood = "neutral"): string[] {
  const faces: Record<Mood, { top: string; eyes: string; mouth: string }> = {
    neutral: { top: "*  .  *", eyes: "o   o", mouth: "~" },
    happy: { top: "*  .  *", eyes: "^   ^", mouth: "\\_/" },
    sleepy: { top: "z  .  z", eyes: "-   -", mouth: "~" },
    sad: { top: "       ", eyes: "x   x", mouth: "_" },
  };
  const f = faces[mood];
  return [`     ${f.top}`, "    .-------.", `    | ${f.eyes} |`, `    | ${center(f.mouth, 5)} |`, "    '-------'"];
}

/** "MIRA" wordmark (figlet "Standard"). Backslashes are escaped (\\). */
const WORDMARK = [
  " __  __ ___ ____      _",
  "|  \\/  |_ _|  _ \\    / \\",
  "| |\\/| || || |_) |  / _ \\",
  "| |  | || ||  _ <  / ___ \\",
  "|_|  |_|___|_| \\_\\/_/   \\_\\",
];

/** Rotating one-liners surfaced under the banner — discoverability for hidden flags. */
const TIPS = [
  'echo "STON_USDT_10" | mira-harness send   — pipe a probe from stdin',
  "mira-harness loop --list   — preview the probes without sending anything",
  "touch STOP_MIRA   — instant kill switch; blocks every send until removed",
  "mira-harness loop --catalog ./my.json   — run your own probe catalog",
  "mira-harness report --out report.md   — distill the run log into Markdown",
  "mira-harness stats   — latency records + an ASCII sparkline of your runs",
  "mira-harness watch   — live-tail @mira while you poke it by hand",
  "MIRA_NO_BANNER=1 hides this banner · --quiet hides all decoration",
];

/**
 * Print the mira mascot + wordmark, Claude-Code-style. Decoration only, so it
 * follows the same rules as the spinner: goes to stderr, only on an interactive
 * TTY (skipped when piped / CI so stdout stays machine-clean), and suppressed by
 * `quiet` or `MIRA_NO_BANNER=1`. Color via picocolors (auto-honors NO_COLOR).
 */
export function banner(version: string, opts: { quiet?: boolean } = {}): void {
  if (opts.quiet || process.env.MIRA_NO_BANNER || !process.stderr.isTTY) return;
  const tip = TIPS[new Date().getDate() % TIPS.length]; // rotates daily
  const lines = [
    ...mascot("neutral").map((l) => c.magenta(l)),
    ...WORDMARK.map((l) => c.cyan(l)),
    c.dim(`mira-harness v${version} · drive @mira from your terminal`),
    c.dim(`tip: ${tip}`),
  ];
  process.stderr.write(`\n${lines.map((l) => `  ${l}`).join("\n")}\n\n`);
}

/** Playful verbs cycled while we wait — @mira can take a while, so keep it lively. */
const VERBS = [
  "Summoning",
  "Consulting the chain",
  "Poking the bot",
  "Nudging the oracle",
  "Pondering",
  "Channeling TON",
  "Crunching tokens",
  "Waiting on a reply",
];
/** After a while @mira is clearly chewing on something big — reassure, don't nag. */
const VERBS_SLOW = ["Still pondering", "Deep in thought", "Brewing a big one", "Hang tight", "Almost there"];
const SLOW_AFTER_MS = 30_000;
const VERB_EVERY_MS = 3_500;

/**
 * Run an async task while showing an elapsed-time spinner on stderr. @mira can
 * take 5–60s, so show progress — with a playful verb that rotates every few
 * seconds (and escalates to a "still going" set past 30s). The original label is
 * kept as dim context. Falls back to a plain run when `quiet` or when stderr
 * isn't a TTY (piped / CI output stays clean).
 */
export async function withProgress<T>(label: string, fn: () => Promise<T>, quiet = false): Promise<T> {
  if (quiet || !process.stderr.isTTY) return fn();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const start = Date.now();
  let i = 0;
  const timer = setInterval(() => {
    const elapsed = Date.now() - start;
    const pool = elapsed >= SLOW_AFTER_MS ? VERBS_SLOW : VERBS;
    const verb = pool[Math.floor(elapsed / VERB_EVERY_MS) % pool.length];
    const s = (elapsed / 1000).toFixed(0);
    process.stderr.write(`\r${pc.cyan(frames[i++ % frames.length])} ${verb} ${pc.dim(`· ${label} · ${s}s`)}  `);
  }, 100);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
    process.stderr.write("\r\x1b[K"); // clear the spinner line
  }
}

/** Strip control chars (incl. BEL / ESC / newline) so they can't break or inject
 *  into an OSC escape sequence that embeds user-controlled text (probe id/category). */
function oscSafe(s: string): string {
  return s.replace(/[\x00-\x1f\x7f]/g, " ").trim();
}

/**
 * Fire a terminal "attention" notification on completion (OSC 9 — iTerm2 / WezTerm
 * / kitty show a desktop toast; the trailing BEL bounces the dock / flashes the tab
 * elsewhere). stderr + TTY only, suppressed by `quiet` or `MIRA_NO_NOTIFY=1`.
 */
export function notify(message: string, opts: { quiet?: boolean } = {}): void {
  if (opts.quiet || process.env.MIRA_NO_NOTIFY || !process.stderr.isTTY) return;
  process.stderr.write(`\x1b]9;${oscSafe(message)}\x07`);
}

/**
 * Set the terminal tab / window title (OSC 0) so progress is visible while the run
 * is in the background. TTY only; suppressed by `MIRA_NO_TITLE=1`. Pair with
 * `clearTitle()` in a finally block. OSC sequences print no visible characters, so
 * this never disturbs the spinner or stdout.
 */
export function setTitle(title: string): void {
  if (process.env.MIRA_NO_TITLE || !process.stderr.isTTY) return;
  process.stderr.write(`\x1b]0;${oscSafe(title)}\x07`);
}

/** Reset the terminal title set by `setTitle()`. Safe to call unconditionally. */
export function clearTitle(): void {
  if (!process.stderr.isTTY) return;
  process.stderr.write("\x1b]0;\x07");
}
