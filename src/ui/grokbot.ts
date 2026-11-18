import type { Graph } from "../graph/types";

export interface GrokKnowledge {
  title?: string;
  notes: { path: string; label: string; summary?: string; concepts?: string[] }[];
  folders: string[];
}

type Turn = { role: "user" | "assistant"; content: string };

const PROMPTS = [
  "what have i learnt?",
  "summarize my latest notes",
  "give me a refresher on probability",
  "what yale course should i take next?",
];

/** Compact mark for the corner toggle. */
const FACE_TINY = [
  "  .:+#%@@%#+:.  ",
  " :#@@@@@@@@=+#: ",
  ":@@@@@@=.+@@==@:",
  "#@@@@@@@:.#@@@@#",
  "@@@@@@@@@%@@@@@@",
  "#@@@@@@@@@@@@@@#",
  ":@@@@@@@@@@@@@@:",
  " :#@@@@@@@@@@#: ",
  "  .:+#%@@%#+:.  ",
].join("\n");

/** Portrait for the dialogue box. */
const FACE_PORTRAIT = [
  "    .:+*%@@@@%*+:.    ",
  "  .=%@@@@@@@@@@**#=.  ",
  " :#@@@@@@@#+%@@%--%#: ",
  ".%@@@@@@@@-..#@@@-:@%.",
  "*@@@@@@@@@%:..%@@@%@@*",
  "@@@@@@@@@@@%++@@@@@@@@",
  "@@@@@@@@@@@@@@@@@@@@@@",
  "*@@@@@@@@@@@@@@@@@@@@*",
  ".%@@@@@@@@@@@@@@@@@@%.",
  " :#@@@@@@@@@@@@@@@@#: ",
  "  .=%@@@@@@@@@@@@%=.  ",
  "    .:+*%@@@@%*+:.    ",
].join("\n");

export function mountGrokbot(opts: {
  getKnowledge: () => GrokKnowledge;
  onOpen?: () => void;
}): {
  setOpen(open: boolean): void;
  isOpen(): boolean;
} {
  const toggle = required("#grokbot-toggle");
  const panel = required("#grokbot-panel");
  const close = required("#grokbot-close");
  const log = required("#grokbot-log");
  const form = required("#grokbot-form");
  const inputNode = required("#grokbot-input");
  const prompts = required("#grokbot-prompts");
  const resize = required("#grokbot-resize");
  const dialogueNode = panel.querySelector(".dialogue");
  if (!(inputNode instanceof HTMLInputElement)) throw new Error("Missing #grokbot-input");
  if (!(form instanceof HTMLFormElement)) throw new Error("Missing #grokbot-form");
  if (!(dialogueNode instanceof HTMLElement)) throw new Error("Missing .dialogue");
  const input: HTMLInputElement = inputNode;
  const dialogue: HTMLElement = dialogueNode;

  const toggleFace = toggle.querySelector(".grokbot-face");
  if (toggleFace) toggleFace.textContent = FACE_TINY;
  const portrait = panel.querySelector(".dialogue-face");
  if (portrait) portrait.textContent = FACE_PORTRAIT;

  let open = false;
  let busy = false;
  let resizing = false;
  const history: Turn[] = [];
  const minHeight = 192;
  let boxHeight = Math.round(Math.min(window.innerHeight * 0.38, 256));
  applyHeight(boxHeight);

  bindResize(resize);

  prompts.replaceChildren(
    ...PROMPTS.map((text, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dialogue-choice";
      button.textContent = `${index + 1}. ${text}`;
      button.addEventListener("click", () => {
        input.value = text;
        void send(text);
      });
      return button;
    }),
  );

  if (log.childElementCount === 0) {
    log.append(line("ask about your notes, a refresher, or a yale course."));
  }

  toggle.addEventListener("click", () => setOpen(!open));
  close.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    void send(text);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!open || resizing) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (panel.contains(target) || toggle.contains(target)) return;
    setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (!open || event.key !== "Escape") return;
    if (event.target === input && input.value) {
      input.value = "";
      return;
    }
    setOpen(false);
  });

  function setOpen(next: boolean): void {
    const was = open;
    open = next;
    panel.hidden = !next;
    document.body.classList.toggle("grokbot-open", next);
    toggle.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      opts.onOpen?.();
      input.focus();
    } else if (was) {
      toggle.focus();
    }
  }

  async function send(text: string): Promise<void> {
    if (busy) return;
    busy = true;
    input.disabled = true;
    history.push({ role: "user", content: text });
    log.append(line(`› ${text}`, "you"));
    const waiting = line("…", "wait");
    log.append(waiting);
    log.scrollTop = log.scrollHeight;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1),
          knowledge: opts.getKnowledge(),
        }),
      });
      const raw = await response.text();
      let body: { reply?: string; error?: string; citations?: string[] } = {};
      try {
        body = raw ? (JSON.parse(raw) as typeof body) : {};
      } catch {
        waiting.remove();
        const looksLikeHtml = /^\s*</.test(raw) || raw.includes("<!DOCTYPE");
        log.append(
          line(
            looksLikeHtml
              ? "chat api isn’t running here — restart vite (needs vite.config) or use the vercel deploy."
              : response.status === 404
                ? "chat api is missing on this deploy — push /api/chat and redeploy."
                : `bad response (${response.status}).`,
          ),
        );
        return;
      }
      waiting.remove();
      if (!response.ok || !body.reply) {
        const err =
          response.status === 503
            ? "grok is not configured on this deploy."
            : response.status === 404
              ? "chat api is missing on this deploy — push /api/chat and redeploy."
              : body.error ?? `request failed (${response.status}).`;
        log.append(line(err));
      } else {
        history.push({ role: "assistant", content: body.reply });
        log.append(line(body.reply));
        if (body.citations?.length) {
          log.append(line(body.citations.map((url) => `· ${url}`).join("\n"), "sources"));
        }
      }
    } catch {
      waiting.remove();
      log.append(line("could not reach grok — is the api running? use npx vercel dev locally."));
    } finally {
      busy = false;
      input.disabled = false;
      log.scrollTop = log.scrollHeight;
      if (open) input.focus();
    }
  }

  function bindResize(handle: HTMLElement): void {
    let startY = 0;
    let startHeight = 0;

    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      resizing = true;
      startY = event.clientY;
      startHeight = dialogue.getBoundingClientRect().height;
      handle.setPointerCapture(event.pointerId);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    });

    handle.addEventListener("pointermove", (event) => {
      if (!resizing) return;
      // Drag up → taller box (bottom is fixed).
      const next = startHeight + (startY - event.clientY);
      applyHeight(next);
    });

    const endResize = (event: PointerEvent) => {
      if (!resizing) return;
      resizing = false;
      boxHeight = dialogue.getBoundingClientRect().height;
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    handle.addEventListener("pointerup", endResize);
    handle.addEventListener("pointercancel", endResize);
  }

  function applyHeight(px: number): void {
    const maxHeight = Math.min(window.innerHeight * 0.78, 640);
    const clamped = Math.max(minHeight, Math.min(maxHeight, px));
    dialogue.style.setProperty("--dialogue-height", `${Math.round(clamped)}px`);
  }

  return {
    setOpen,
    isOpen: () => open,
  };
}

export function knowledgeFromGraph(graph: Graph): GrokKnowledge {
  return {
    title: graph.title,
    folders: graph.nodes.filter((node) => node.kind === "folder").map((node) => node.label),
    notes: graph.nodes
      .filter((node) => node.kind === "file")
      .map((node) => ({
        path: node.id,
        label: node.label,
        summary: node.summary,
        concepts: node.concepts,
      })),
  };
}

function line(body: string, kind = "bot"): HTMLElement {
  const el = document.createElement("p");
  el.className = `dialogue-line dialogue-line-${kind}`;
  el.textContent = body;
  return el;
}

function required(selector: string): HTMLElement {
  const el = document.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return el;
}
