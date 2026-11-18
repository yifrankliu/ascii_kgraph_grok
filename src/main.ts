import { enrich } from "./graph/enrich";
import { layout } from "./graph/layout";
import { skeletonFromFiles } from "./graph/skeleton";
import type { Graph } from "./graph/types";
import { createRenderer } from "./render/renderer";
import { mountBackground } from "./ui/background";
import { mountFriends } from "./ui/friends";
import { mountShell } from "./ui/shell";

const stageEl = document.querySelector("#stage");
if (!(stageEl instanceof HTMLElement)) throw new Error("Missing #stage");
const stage: HTMLElement = stageEl;

mountBackground();
const shell = mountShell();
let graph: Graph = { nodes: [], edges: [] };
let live = false;
const expanded = new Set<string>();

const friends = mountFriends({
  onOpenYours(id) {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return;
    let parent = node.kind === "folder" ? node.id : node.parent;
    while (parent) {
      expanded.add(parent);
      if (parent === graph.rootId) break;
      parent = graph.nodes.find((item) => item.id === parent)?.parent;
    }
    renderer.setExpanded(new Set(expanded));
    shell.show(node, graph);
  },
});

const renderer = createRenderer(stage, {
  onExpand(id) {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return;
    // Folders (including root) toggle themselves; files toggle their parent folder.
    const targetId = node.kind === "folder" ? node.id : (node.parent ?? null);
    if (!targetId) {
      shell.status("Nothing to expand here.");
      return;
    }
    if (expanded.has(targetId)) expanded.delete(targetId);
    else expanded.add(targetId);
    renderer.setExpanded(new Set(expanded));
    const open = expanded.has(targetId);
    const label = graph.nodes.find((item) => item.id === targetId)?.label ?? targetId;
    shell.status(open ? `Expanded ${label}` : `Collapsed ${label}`);
  },
  onPreview(id) {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return;
    shell.show(node, graph);
    shell.status(`Preview · ${node.label}`);
  },
});

function expandAllFolders(next: Graph): void {
  expanded.clear();
  for (const node of next.nodes) {
    if (node.kind === "folder") expanded.add(node.id);
  }
}

function show(next: Graph, keepPositions = false): void {
  layout(next, keepPositions);
  graph = next;
  renderer.setGraph(graph);
  renderer.setExpanded(new Set(expanded));
  friends.setYours(graph);
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
  expandAllFolders(next);
  show(next);
  shell.hide();
  const cap = notes.skipped > 0 ? ` Skipped ${notes.skipped} files past the 40-file cap.` : "";
  shell.status(`${next.title} · ${notes.kept.length} notes. Hover for expand / preview.${cap}`);
  void enrich(next, notes.kept, {
    onStatus(message) {
      shell.status(`${message}${cap}`);
    },
    onChange() {
      const linked = next.edges.some((edge) => edge.kind === "relates");
      if (linked) layout(next, true);
      renderer.setGraph(next);
      friends.setYours(next);
    },
  });
});

async function boot(): Promise<void> {
  const response = await fetch("/sample-graph.json");
  if (live) return;
  const next = (await response.json()) as Graph;
  expandAllFolders(next);
  show(next);
  if (!live) shell.status("Hover a node for expand / preview. Drag to turn.");
}

void boot();
