import { enrich } from "./graph/enrich";
import { layout } from "./graph/layout";
import { skeletonFromFiles } from "./graph/skeleton";
import type { Graph } from "./graph/types";
import { createRenderer } from "./render/renderer";
import { mountShell } from "./ui/shell";

const stageEl = document.querySelector("#stage");
if (!(stageEl instanceof HTMLElement)) throw new Error("Missing #stage");
const stage: HTMLElement = stageEl;

const shell = mountShell();
let graph: Graph = { nodes: [], edges: [] };
let live = false;

const renderer = createRenderer(stage, {
  onSelect(id) {
    const node = graph.nodes.find((item) => item.id === id);
    if (node) shell.show(node, graph);
  },
});

function show(next: Graph, keepPositions = false): void {
  layout(next, keepPositions);
  graph = next;
  renderer.setGraph(graph);
}

shell.bindFiles((notes) => {
  if (notes.kept.length === 0) {
    shell.status(
      notes.scanned === 0
        ? "Nothing readable in that drop. Use a folder of .pdf, .md, or .txt notes."
        : `Found ${notes.scanned} files, but none were .pdf, .md, or .txt. Demo graph kept.`,
    );
    return;
  }
  live = true;
  const next = skeletonFromFiles(notes.kept);
  show(next);
  shell.hide();
  const cap = notes.skipped > 0 ? ` Skipped ${notes.skipped} files past the 40-file cap.` : "";
  shell.status(`${next.title} · ${notes.kept.length} notes.${cap}`);
  void enrich(next, notes.kept, {
    onStatus(message) {
      shell.status(`${message}${cap}`);
    },
    onChange() {
      const linked = next.edges.some((edge) => edge.kind === "relates");
      if (linked) layout(next, true);
      renderer.setGraph(next);
    },
  });
});

async function boot(): Promise<void> {
  const response = await fetch("/sample-graph.json");
  if (live) return;
  show((await response.json()) as Graph);
  if (!live) shell.status("");
}

void boot();
