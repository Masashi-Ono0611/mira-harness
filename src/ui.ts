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

/**
 * Run an async task while showing an elapsed-time spinner on stderr. @mira can
 * take 5–60s, so show progress. Falls back to a plain run when `quiet` or when
 * stderr isn't a TTY (piped / CI output stays clean).
 */
export async function withProgress<T>(
  label: string,
  fn: () => Promise<T>,
  quiet = false,
): Promise<T> {
  if (quiet || !process.stderr.isTTY) return fn();
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const start = Date.now();
  let i = 0;
  const timer = setInterval(() => {
    const s = ((Date.now() - start) / 1000).toFixed(0);
    process.stderr.write(`\r${pc.cyan(frames[i++ % frames.length])} ${label} ${pc.dim(`${s}s`)}  `);
  }, 100);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
    process.stderr.write("\r\x1b[K"); // clear the spinner line
  }
}
