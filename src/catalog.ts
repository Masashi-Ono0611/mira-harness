/**
 * Experiment catalog — the hypotheses the loop runner probes @mira with.
 *
 * Each probe is ONE send. The interesting answers often live in buttons/links/
 * media (captured by capture.ts), not just text. `slow: true` widens the wait
 * windows for generation / deep-research, which Mira takes longer to produce.
 *
 * Safety: probes only SEND text and CAPTURE the reply. We never click buttons or
 * follow OAuth/Launch links (wallet/integration probes observe the link surface
 * only — no irreversible actions, no permission grants).
 */
export type ProbeCategory = "core" | "skills" | "generation" | "wallet";

export interface Probe {
  id: string;
  category: ProbeCategory;
  hypothesis: string;
  send: string;
  /** Generation / deep research is slow — widen collector windows. */
  slow?: boolean;
  /**
   * Safe to press a "✅ Confirm" callback button to complete this probe (e.g. to
   * actually run a credit-gated generation). ONLY set on generation probes — never
   * on wallet/OAuth. Still requires the runner's `--confirm` CLI opt-in to fire.
   */
  confirm?: boolean;
  note?: string;
}

export const CATEGORIES: ProbeCategory[] = ["core", "skills", "generation", "wallet"];

export const CATALOG: Probe[] = [
  // --- core spec ---------------------------------------------------------------
  {
    id: "core-model",
    category: "core",
    hypothesis: "Which underlying model is Mira on? (docs say MiniMax M2.5)",
    send: "What AI model are you running on right now? Answer with just the model name.",
  },
  {
    id: "core-mem-set",
    category: "core",
    hypothesis: "Mira has server-side memory — seed a fact to recall in core-mem-get.",
    send: "Please remember this for later: my favorite TON token is TRIBEMIND.",
  },
  {
    id: "core-mem-get",
    category: "core",
    hypothesis: "Does the fact from core-mem-set persist across separate sends?",
    send: "What did I tell you my favorite TON token is? Answer with one word.",
  },
  {
    id: "core-json",
    category: "core",
    hypothesis: "Will Mira return STRICT JSON only (usable for structured workflows)?",
    send: 'Reply with ONLY this JSON and nothing else: {"ok":true,"n":42}',
  },
  {
    id: "core-reason",
    category: "core",
    hypothesis: "Multi-step arithmetic reasoning accuracy.",
    send: "Split 100 USDT 60/40 across two pools. Pool A: 0.9 STON per USDT. Pool B: 0.8 STON per USDT. How many STON total? End with just the number.",
  },
  {
    id: "core-commands",
    category: "core",
    hypothesis: "What commands does Mira expose? (/help surface, buttons)",
    send: "/help",
  },
  {
    id: "core-ja",
    category: "core",
    hypothesis: "Non-English handling — does Mira answer in Japanese?",
    send: "あなたが得意なことを3つ、日本語で箇条書きにして教えてください。",
  },

  // --- skills & deep-link ------------------------------------------------------
  {
    id: "skill-fire",
    category: "skills",
    hypothesis: "FROM_TO_AMOUNT fires the swap skill -> Launch card (startapp) + research.",
    send: "STON_USDT_10",
    slow: true,
    note: "expect buttons[].webAppUrl (startapp deep link) + research links",
  },
  {
    id: "skill-lower",
    category: "skills",
    hypothesis: "Is skill activation case-sensitive? (lowercase pattern)",
    send: "ston_usdt_10",
  },
  {
    id: "skill-spaces",
    category: "skills",
    hypothesis: "Does the skill fire on space-separated form instead of underscores?",
    send: "STON USDT 10",
  },
  {
    id: "skill-noamount",
    category: "skills",
    hypothesis: "Does FROM_TO without an amount fire the skill?",
    send: "STON_USDT",
  },
  {
    id: "skill-start",
    category: "skills",
    hypothesis: "Re-confirm: /start <payload> is ignored (fixed welcome).",
    send: "/start tribemind_test_payload",
  },
  {
    id: "skill-list",
    category: "skills",
    hypothesis: "Can Mira enumerate the custom skills configured on this account?",
    send: "List the custom skills I currently have set up.",
  },

  // --- generation (consumes Pro credits) --------------------------------------
  {
    id: "gen-image",
    category: "generation",
    hypothesis: "Image generation — media kind, caption, watermark (view in Telegram), Pro diff.",
    send: "Generate an image: a friendly teal robot mascot holding a glowing TON diamond, flat vector style.",
    slow: true,
    confirm: true,
    note: "expect a Confirm card; with --confirm the runner presses ✅ Confirm -> media.kind=photo",
  },
  {
    id: "gen-music",
    category: "generation",
    hypothesis: "Music generation — does Mira return an audio document?",
    send: "Create a short upbeat 15-second jingle for a TON DeFi app called TribeMind.",
    slow: true,
    note: "expect media.kind=audio (document) if supported",
  },

  // --- wallet & integrations (observe surface only — do NOT follow links) ------
  {
    id: "wallet-cmd",
    category: "wallet",
    hypothesis: "Is there a /wallet command and what does it surface?",
    send: "/wallet",
  },
  {
    id: "wallet-balance",
    category: "wallet",
    hypothesis: "TON wallet balance response (testnet per deck).",
    send: "What is my TON wallet balance?",
  },
  {
    id: "integ-list",
    category: "wallet",
    hypothesis: "Which Composio integrations can Mira connect (GitHub/Gmail/Notion)?",
    send: "What integrations can you connect to? List what's available.",
  },
  {
    id: "integ-github",
    category: "wallet",
    hypothesis: "GitHub connect — capture the OAuth link surface ONLY (we never follow it).",
    send: "Connect my GitHub account.",
    note: "expect an OAuth url in buttons[]/links[]; harness does NOT open it",
  },
];

export function probesFor(category?: string): Probe[] {
  if (!category) return CATALOG;
  return CATALOG.filter((p) => p.category === category);
}
