import type { Graph, GraphNode } from "../graph/types";
import type { ChosenNotes } from "../ingest/files";
import { captureDrop } from "../ingest/files";

export function mountShell(): {
  status: (message: string) => void;
  show: (node: GraphNode, graph: Graph) => void;
  hide: () => void;
  bindFiles: (handler: (notes: ChosenNotes) => void) => void;
} {
  const statusEl = required("#status");
  const panel = required("#panel");
  const picker = required("#picker") as HTMLInputElement;
  const reroot = required("#reroot");
  let handler: ((notes: ChosenNotes) => void) | null = null;

  reroot.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    const files = picker.files ? [...picker.files] : [];
    picker.value = "";
    if (handler) void deliverFiles(files);
  });

  window.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    document.body.classList.add("dragging");
  });
  window.addEventListener("dragleave", (event) => {
    if (event.target === document.body) document.body.classList.remove("dragging");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    document.body.classList.remove("dragging");
    if (!event.dataTransfer || !handler) return;
    void deliverDrop(captureDrop(event.dataTransfer));
  });
  required("#close").addEventListener("click", () => {
    panel.hidden = true;
  });

  return {
    status(message) {
      statusEl.textContent = message;
    },
    show(node, graph) {
      openNode(node, graph);
    },
    hide() {
      panel.hidden = true;
    },
    bindFiles(next) {
      handler = next;
    },
  };

  function openNode(node: GraphNode, graph: Graph) {
    panel.hidden = false;
    panel.replaceChildren(
      panelView(node, graph, (id) => {
        const next = graph.nodes.find((item) => item.id === id);
        if (next) openNode(next, graph);
      }),
    );
  }

  async function deliverFiles(files: File[]) {
    statusEl.textContent = "Reading folder…";
    try {
      const { notesFromList } = await import("../ingest/files");
      handler?.(await notesFromList(files));
    } catch {
      statusEl.textContent = "Could not read that folder.";
    }
  }

  async function deliverDrop(captured: { entries: FileSystemEntry[]; files: File[] }) {
    statusEl.textContent = "Reading folder…";
    try {
      const { notesFromEntries, notesFromList } = await import("../ingest/files");
      const notes =
        captured.entries.length > 0
          ? await notesFromEntries(captured.entries)
          : await notesFromList(captured.files);
      handler?.(notes);
    } catch {
      statusEl.textContent = "Could not read that folder.";
    }
  }
}

function panelView(node: GraphNode, graph: Graph, onOpen: (id: string) => void): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(plate(node, graph));
  fragment.append(post(node.kind === "folder" ? "index" : "summary", copyFor(node, graph)));

  if (node.kind === "folder") {
    const kids = containsReplies(node.id, graph, onOpen);
    if (kids.length) fragment.append(thread("contains", kids));
  }
  if (node.concepts?.length) {
    fragment.append(thread("concepts", node.concepts.map((concept) => textReply(concept))));
  }

  const related = graph.edges.filter(
    (edge) => edge.kind === "relates" && (edge.source === node.id || edge.target === node.id),
  );
  if (related.length) {
    fragment.append(
      thread(
        "connected",
        related.map((edge) => {
          const otherId = edge.source === node.id ? edge.target : edge.source;
          const other = graph.nodes.find((item) => item.id === otherId);
          const head = other
            ? nodeButton(other, onOpen)
            : textLabel(otherId);
          return replyBlock(head, edge.note);
        }),
      ),
    );
  }
  return fragment;
}

function plate(node: GraphNode, graph: Graph): HTMLElement {
  const row = document.createElement("div");
  row.className = "plate";
  const main = document.createElement("div");
  main.className = "plate-main";
  main.append(line(kindLine(node, graph)), heading(node.label));
  if (node.id !== node.label) main.append(pathLine(node.id));
  row.append(main, required("#close"));
  return row;
}

function containsReplies(parentId: string, graph: Graph, onOpen: (id: string) => void): HTMLElement[] {
  return graph.nodes
    .filter((item) => item.parent === parentId)
    .map((item) => {
      const nested = containsReplies(item.id, graph, onOpen);
      return replyBlock(nodeButton(item, onOpen), item.summary, nested.length ? replies(nested) : undefined);
    });
}

function thread(tag: string, items: HTMLElement[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "thread";
  section.append(tagLine(tag), replies(items));
  return section;
}

function post(tag: string, text: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "post";
  const body = document.createElement("p");
  body.className = "body";
  body.textContent = text;
  section.append(tagLine(tag), body);
  return section;
}

function replies(items: HTMLElement[]): HTMLElement {
  const list = document.createElement("div");
  list.className = "replies";
  for (const item of items) list.append(item);
  return list;
}

function replyBlock(head: HTMLElement, note?: string, nested?: HTMLElement): HTMLElement {
  const reply = document.createElement("div");
  reply.className = "reply";
  reply.append(head);
  if (note) {
    const body = document.createElement("p");
    body.className = "reply-note";
    body.textContent = note;
    reply.append(body);
  }
  if (nested) reply.append(nested);
  return reply;
}

function nodeButton(node: GraphNode, onOpen: (id: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "reply-title";
  button.textContent = `${node.kind === "folder" ? "[#]" : "(o)"} ${node.label}`;
  button.addEventListener("click", () => onOpen(node.id));
  return button;
}

function textReply(text: string): HTMLElement {
  return replyBlock(textLabel(text));
}

function textLabel(text: string): HTMLElement {
  const label = document.createElement("p");
  label.className = "reply-label";
  label.textContent = text;
  return label;
}

function kindLine(node: GraphNode, graph: Graph): string {
  if (node.kind === "folder") return node.id === graph.rootId ? "root" : "folder";
  if (node.status) return `file · ${node.status}`;
  return "file";
}

function pathLine(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "path";
  el.textContent = text;
  return el;
}

function tagLine(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "tag";
  el.textContent = text;
  return el;
}

function copyFor(node: GraphNode, graph: Graph): string {
  if (node.summary) return node.summary;
  if (node.kind === "folder") {
    const kids = graph.nodes.filter((item) => item.parent === node.id);
    const folders = kids.filter((item) => item.kind === "folder").length;
    const files = kids.filter((item) => item.kind === "file").length;
    if (node.id === graph.rootId) {
      return `Root of this knowledge graph · ${folders} subfolder${folders === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"} here.`;
    }
    return `Folder · ${folders} subfolder${folders === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"}. Click the node again to expand or collapse files.`;
  }
  if (node.status === "pending") return "Grok is still reading this file.";
  if (node.status === "failed") return "Grok could not read this file. The node stays in the folder graph.";
  return "No summary yet.";
}

function heading(text: string): HTMLElement {
  const el = document.createElement("h2");
  el.textContent = text;
  return el;
}

function line(text: string): HTMLElement {
  const el = document.createElement("p");
  el.className = "kind";
  el.textContent = text;
  return el;
}

function required(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return element;
}
