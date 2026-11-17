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
      panel.hidden = false;
      panel.replaceChildren(panelView(node, graph));
    },
    hide() {
      panel.hidden = true;
    },
    bindFiles(next) {
      handler = next;
    },
  };

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

function panelView(node: GraphNode, graph: Graph): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(required("#close"));
  fragment.append(
    heading(node.label),
    line(node.kind === "folder" ? (node.id === graph.rootId ? "Root folder" : "Folder") : node.status ?? "file"),
  );
  fragment.append(paragraph(copyFor(node, graph)));
  if (node.kind === "folder") {
    const kids = graph.nodes.filter((item) => item.parent === node.id);
    if (kids.length) {
      fragment.append(heading("Contains"));
      const list = document.createElement("ul");
      for (const kid of kids) {
        const item = document.createElement("li");
        item.textContent = `${kid.kind === "folder" ? "[#]" : "(o)"} ${kid.label}`;
        list.append(item);
      }
      fragment.append(list);
    }
  }
  if (node.concepts?.length) {
    const list = document.createElement("ul");
    for (const concept of node.concepts) {
      const item = document.createElement("li");
      item.textContent = concept;
      list.append(item);
    }
    fragment.append(list);
  }
  const related = graph.edges.filter(
    (edge) => edge.kind === "relates" && (edge.source === node.id || edge.target === node.id),
  );
  if (related.length) {
    fragment.append(heading("Connected"));
    for (const edge of related) {
      const otherId = edge.source === node.id ? edge.target : edge.source;
      const other = graph.nodes.find((item) => item.id === otherId);
      fragment.append(paragraph(`${other?.label ?? otherId}${edge.note ? ` — ${edge.note}` : ""}`));
    }
  }
  return fragment;
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
    return `Folder · ${folders} subfolder${folders === 1 ? "" : "s"}, ${files} file${files === 1 ? "" : "s"}.`;
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

function paragraph(text: string): HTMLElement {
  const el = document.createElement("p");
  el.textContent = text;
  return el;
}

function required(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return element;
}
