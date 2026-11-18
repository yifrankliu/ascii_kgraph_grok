import { enrich } from "./graph/enrich";
import { layout } from "./graph/layout";
import { fileNodeId, skeletonFromFiles } from "./graph/skeleton";
import type { NoteFile } from "./graph/skeleton";
import type { Graph, GraphNode } from "./graph/types";
import { createRenderer } from "./render/renderer";
import { mountBackground, type BackgroundPreset } from "./ui/background";
import { mountFriends, type FriendView } from "./ui/friends";
import { knowledgeFromGraph, mountGrokbot } from "./ui/grokbot";
import { mountShell } from "./ui/shell";

const OWNER = "frank";
const FOLDER_PRESETS: Record<string, BackgroundPreset> = {
  elena: "koi",
  ravi: "matrix",
  noor: "dark",
};
/** Soft cap on nodes drawn at once; excess branches auto-collapse. */
const MAX_VISIBLE_NODES = 18;

const stageEl = document.querySelector("#stage");
if (!(stageEl instanceof HTMLElement)) throw new Error("Missing #stage");
const stage: HTMLElement = stageEl;
const nameEl = document.querySelector("#graph-name");

let homePreset: BackgroundPreset = "dark";
const background = mountBackground({
  onUserPick(name) {
    homePreset = name;
  },
});
homePreset = background.current();

const shell = mountShell();
let graph: Graph = { nodes: [], edges: [] };
let mine: Graph = { nodes: [], edges: [] };
let live = false;
let viewingOwner = true;
let away = false;
const expanded = new Set<string>();

const friends = mountFriends({
  onView(view) {
    showPerson(view);
  },
  onOpen() {
    grokbot.setOpen(false);
  },
});

const grokbot = mountGrokbot({
  getKnowledge: () => knowledgeFromGraph(viewingOwner ? mine : graph),
  onOpen() {
    friends.setOpen(false);
  },
});

const renderer = createRenderer(stage, {
  onExpand(id) {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return;
    const targetId = node.kind === "folder" ? node.id : (node.parent ?? null);
    if (!targetId) {
      shell.status("Nothing to expand here.");
      return;
    }
    if (expanded.has(targetId)) {
      expanded.delete(targetId);
      renderer.setExpanded(new Set(expanded));
      const label = graph.nodes.find((item) => item.id === targetId)?.label ?? targetId;
      shell.status(`Collapsed ${label}`);
      return;
    }
    expanded.add(targetId);
    const closed = enforceBudget(graph, targetId);
    renderer.setExpanded(new Set(expanded));
    const label = graph.nodes.find((item) => item.id === targetId)?.label ?? targetId;
    const note =
      closed.length > 0
        ? ` · auto-collapsed ${closed
            .slice(0, 2)
            .map((item) => graph.nodes.find((n) => n.id === item)?.label ?? item)
            .join(", ")}${closed.length > 2 ? "…" : ""} (max ${MAX_VISIBLE_NODES} nodes)`
        : "";
    shell.status(`Expanded ${label}${note}`);
  },
  onPreview(id) {
    const node = graph.nodes.find((item) => item.id === id);
    if (!node) return;
    if (node.kind === "file") {
      shell.read(node);
      shell.status(`Reading · ${node.label}`);
      return;
    }
    shell.show(node, graph);
    shell.status(`Preview · ${node.label}`);
  },
});

function countVisible(source: Graph, open: Set<string>): number {
  const byId = new Map(source.nodes.map((node) => [node.id, node]));
  return source.nodes.filter((node) => {
    if (node.id === source.rootId) return true;
    let parent = node.parent;
    if (!parent) return true;
    while (parent) {
      if (!open.has(parent)) return false;
      if (parent === source.rootId) return true;
      parent = byId.get(parent)?.parent;
    }
    return false;
  }).length;
}

function pathIds(source: Graph, focusId?: string | null): Set<string> {
  const keep = new Set<string>();
  if (source.rootId) keep.add(source.rootId);
  let cursor = focusId ?? null;
  const byId = new Map(source.nodes.map((node) => [node.id, node]));
  while (cursor) {
    keep.add(cursor);
    cursor = byId.get(cursor)?.parent ?? null;
  }
  return keep;
}

/** Collapse other open folders until visible count ≤ MAX_VISIBLE_NODES. Returns collapsed ids. */
function enforceBudget(source: Graph, keepFocus?: string | null): string[] {
  const closed: string[] = [];
  const keep = pathIds(source, keepFocus);
  const byId = new Map(source.nodes.map((node) => [node.id, node]));

  const pickVictim = (allowProtected: boolean): string | null => {
    const candidates = [...expanded]
      .filter((id) =>
        allowProtected ? id !== source.rootId && id !== keepFocus : !keep.has(id),
      )
      .map((id) => byId.get(id))
      .filter((node): node is GraphNode => !!node && node.kind === "folder")
      .sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0) || a.label.localeCompare(b.label));
    return candidates[0]?.id ?? null;
  };

  while (countVisible(source, expanded) > MAX_VISIBLE_NODES) {
    const victim = pickVictim(false) ?? pickVictim(true);
    if (!victim) break;
    expanded.delete(victim);
    closed.push(victim);
  }
  return closed;
}

/** Open root and as many shallow folders as fit — never dump the whole tree. */
function seedExpansion(next: Graph): void {
  expanded.clear();
  const rootId = next.rootId ?? next.nodes.find((node) => !node.parent)?.id;
  if (!rootId) return;
  expanded.add(rootId);
  const folders = next.nodes
    .filter((node) => node.kind === "folder" && node.id !== rootId)
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0) || a.label.localeCompare(b.label));
  for (const folder of folders) {
    expanded.add(folder.id);
    if (countVisible(next, expanded) > MAX_VISIBLE_NODES) {
      expanded.delete(folder.id);
      break;
    }
  }
  enforceBudget(next, rootId);
}

function expandAllFolders(next: Graph): void {
  seedExpansion(next);
}

function nameOwner(next: Graph): void {
  next.title = OWNER;
  const root = next.nodes.find((node) => node.id === next.rootId) ?? next.nodes.find((node) => !node.parent);
  if (root) root.label = OWNER;
}

function present(next: Graph): void {
  layout(next);
  graph = next;
  renderer.setGraph(graph);
  renderer.setExpanded(new Set(expanded));
}

function rootLabel(next: Graph): string {
  const root = next.nodes.find((node) => node.id === next.rootId) ?? next.nodes.find((node) => !node.parent);
  return root?.label ?? next.title ?? OWNER;
}

function show(next: Graph, keepPositions = false): void {
  layout(next, keepPositions);
  mine = next;
  viewingOwner = true;
  graph = next;
  renderer.setGraph(graph);
  renderer.setExpanded(new Set(expanded));
  friends.setYours(graph);
  friends.setViewing(OWNER);
  const label = rootLabel(next);
  setName(label);
  const preset = FOLDER_PRESETS[next.title ?? ""];
  if (preset) {
    if (!away) homePreset = background.current();
    away = true;
    background.setPreset(preset, false);
  } else {
    away = false;
    background.setPreset(homePreset, false);
  }
}

function showPerson(view: FriendView): void {
  viewingOwner = view.yours;
  shell.hide();
  const source = view.yours ? mine : view.graph;
  if (view.yours) {
    away = false;
    background.setPreset(homePreset, false);
  } else {
    if (!away) homePreset = background.current();
    away = true;
    if (view.preset) background.setPreset(view.preset, false);
  }
  expandAllFolders(source);
  present(source);
  setName(view.handle);
  const major = view.major ?? view.graph.title ?? view.handle;
  shell.status(
    view.yours
      ? "frank · your graph. Hover a node for expand / preview."
      : `${view.handle} · ${major} · ${view.preset ?? "graph"}`,
  );
  if (!view.nodeId) return;
  const node = source.nodes.find((item) => item.id === view.nodeId);
  if (!node) return;
  reveal(node, source);
  if (node.kind === "file") shell.read(node);
  else shell.show(node, source);
}

async function attachBodies(next: Graph, notes: NoteFile[]): Promise<void> {
  const title = next.title ?? "";
  await Promise.all(
    notes.map(async (note) => {
      if (/\.pdf$/i.test(note.path)) return;
      const node = next.nodes.find((item) => item.id === fileNodeId(note.path, title));
      if (!node) return;
      try {
        node.body = (await note.file.text()).replace(/\r\n/g, "\n").trim();
      } catch {
        node.body = "";
      }
    }),
  );
}

function setName(name: string): void {
  if (nameEl) nameEl.textContent = name;
}

function reveal(node: GraphNode, source: Graph): void {
  let parent = node.kind === "folder" ? node.id : node.parent;
  while (parent) {
    expanded.add(parent);
    if (parent === source.rootId) break;
    parent = source.nodes.find((item) => item.id === parent)?.parent;
  }
  enforceBudget(source, node.kind === "folder" ? node.id : node.parent);
  renderer.setExpanded(new Set(expanded));
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
  void attachBodies(next, notes.kept).then(() => {
    if (graph === next) renderer.setGraph(next);
  });
  expandAllFolders(next);
  show(next);
  shell.hide();
  const cap = notes.skipped > 0 ? ` Skipped ${notes.skipped} files past the 40-file cap.` : "";
  shell.status(
    `${next.title} · ${notes.kept.length} notes · up to ${MAX_VISIBLE_NODES} nodes on screen. Hover a node, then expand / preview.${cap}`,
  );
  void enrich(next, notes.kept, {
    onStatus(message) {
      shell.status(`${message}${cap}`);
    },
    onChange() {
      if (!viewingOwner) {
        friends.setYours(next);
        return;
      }
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
  nameOwner(next);
  expandAllFolders(next);
  show(next);
  if (!live) shell.status("Hover a node for expand / preview. Drag to turn.");
}

void boot();
