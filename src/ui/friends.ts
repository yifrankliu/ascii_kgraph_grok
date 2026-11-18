import type { Graph, GraphNode } from "../graph/types";

interface FriendRecord {
  handle: string;
  graph: Graph;
}

interface RelateLine {
  label: string;
  note?: string;
  nodeId: string;
}

interface Comment {
  id: string;
  kind: "graph" | "folder" | "file";
  label: string;
  meta: string;
  copy?: string;
  concepts: string[];
  relates: RelateLine[];
  yours: boolean;
  nodeId?: string;
  children: Comment[];
}

interface Person {
  handle: string;
  graph: Graph;
  yours: boolean;
}

interface ConceptHit {
  key: string;
  label: string;
  handles: string[];
}

export function mountFriends(opts?: { onOpenYours?: (id: string) => void }): {
  setYours(graph: Graph): void;
} {
  const toggle = required("#friends-toggle");
  const panel = required("#friends-panel");
  const countEl = required("#friends-count");
  const indexEl = required("#friends-index");
  const threadsEl = required("#friends-threads");
  const findNode = required("#friends-find");
  if (!(findNode instanceof HTMLInputElement)) throw new Error("Missing #friends-find");
  const findEl: HTMLInputElement = findNode;
  const close = required("#friends-close");

  let yours: Graph = { nodes: [], edges: [] };
  let friends: FriendRecord[] = [];
  let open = false;
  let loaded = false;
  let failed = false;
  const collapsed = new Set<string>();
  const seen = new Set<string>();

  toggle.addEventListener("click", () => setOpen(!open));
  close.addEventListener("click", () => setOpen(false));
  findEl.addEventListener("input", () => {
    if (open) paint();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!open) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (panel.contains(target) || toggle.contains(target)) return;
    setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (!open || event.key !== "Escape") return;
    if (event.target === findEl && findEl.value) {
      findEl.value = "";
      paint();
      return;
    }
    setOpen(false);
  });

  void load();

  return {
    setYours(graph) {
      yours = graph;
      if (open) paint();
    },
  };

  function setOpen(next: boolean): void {
    const was = open;
    open = next;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      paint();
      findEl.focus();
    } else if (was) {
      toggle.focus();
    }
  }

  async function load(): Promise<void> {
    try {
      const response = await fetch("/friends.json");
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { friends?: unknown };
      const list = Array.isArray(data.friends) ? data.friends : [];
      friends = list.filter(isFriend);
    } catch {
      failed = true;
    }
    loaded = true;
    if (open) paint();
  }

  function paint(): void {
    const scroll = panel.scrollTop;
    const query = norm(findEl.value);
    const people = roster();
    const index = conceptIndex(people);
    const trees = people.map((person) => buildPerson(person, index));
    for (const tree of trees) remember(tree, collapsed, seen);

    const notes = people.reduce(
      (sum, person) => sum + person.graph.nodes.filter((node) => node.kind === "file").length,
      0,
    );
    const tally = `${people.length} graph${people.length === 1 ? "" : "s"} · ${notes} notes · ${index.length} shared`;
    if (!loaded) countEl.textContent = "Loading friends…";
    else if (failed) countEl.textContent = `${tally} · friends list unavailable`;
    else countEl.textContent = tally;

    indexEl.replaceChildren(indexView(index, query));
    const visible = trees
      .map((tree) => (query ? prune(tree, query) : tree))
      .filter((tree): tree is Comment => tree !== null);

    const threadItems = visible.map((tree) => commentView(tree, Boolean(query)));
    if (!loaded) threadsEl.replaceChildren(post("Loading friends…"));
    else if (threadItems.length === 0) {
      threadsEl.replaceChildren(post(query ? "Nothing in the index matches." : "No graphs yet."));
    } else threadsEl.replaceChildren(threadSection("threads", threadItems));
    panel.scrollTop = scroll;
  }

  function roster(): Person[] {
    const people: Person[] = [];
    if (yours.nodes.length > 0) people.push({ handle: "you", graph: yours, yours: true });
    for (const friend of friends) people.push({ handle: friend.handle, graph: friend.graph, yours: false });
    return people;
  }

  function applyQuery(value: string): void {
    findEl.value = value;
    paint();
    findEl.focus();
  }

  function toggleCollapsed(id: string): void {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    paint();
  }

  function indexView(index: ConceptHit[], query: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const shown = index
      .filter((hit) => !query || hit.key.includes(query) || hit.handles.some((handle) => handle.includes(query)))
      .slice(0, 8);
    if (shown.length === 0) return fragment;
    const items = shown.map((hit) => {
      const names = [...hit.handles].sort(byHandle);
      const reply = document.createElement("div");
      reply.className = "reply";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reply-title";
      button.textContent = `${hit.label} · ${names.join(" ")}`;
      button.setAttribute("aria-pressed", query === hit.key ? "true" : "false");
      button.addEventListener("click", () => applyQuery(query === hit.key ? "" : hit.label));
      reply.append(button);
      return reply;
    });
    fragment.append(threadSection("index", items));
    return fragment;
  }

  function commentView(comment: Comment, forceOpen: boolean): HTMLElement {
    const reply = document.createElement("div");
    reply.className = "reply";
    const openKids = comment.children.length > 0 && (forceOpen || !collapsed.has(comment.id));
    reply.append(headFor(comment, openKids, forceOpen));
    reply.append(replyNote(comment.meta));
    if (comment.copy) reply.append(replyNote(comment.copy));

    const nested: HTMLElement[] = [];
    const showBody = comment.children.length === 0 || openKids;
    if (showBody) {
      const query = norm(findEl.value);
      for (const concept of comment.concepts) nested.push(conceptReply(concept, query));
      for (const relate of comment.relates) nested.push(relateReply(comment, relate));
      if (openKids) {
        for (const child of comment.children) nested.push(commentView(child, forceOpen));
      }
      if (comment.kind === "graph" && comment.yours && comment.nodeId && opts?.onOpenYours) {
        nested.push(openReply(comment.nodeId));
      }
    }
    if (nested.length > 0) reply.append(replyList(nested));
    return reply;
  }

  function headFor(comment: Comment, openKids: boolean, forceOpen: boolean): HTMLElement {
    const mark =
      comment.children.length === 0 ? (comment.kind === "folder" ? "[#]" : "(o)") : openKids ? "[-]" : "[+]";
    const text = `${mark} ${comment.label}`;
    if (comment.children.length > 0 && !forceOpen) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reply-title";
      button.textContent = text;
      button.setAttribute("aria-expanded", openKids ? "true" : "false");
      button.setAttribute("aria-label", `${openKids ? "Collapse" : "Expand"} ${comment.label}`);
      button.addEventListener("click", () => toggleCollapsed(comment.id));
      return button;
    }
    if (comment.kind === "file" && comment.yours && comment.nodeId && opts?.onOpenYours) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reply-title";
      button.textContent = text;
      const nodeId = comment.nodeId;
      button.addEventListener("click", () => opts.onOpenYours?.(nodeId));
      return button;
    }
    const label = document.createElement("p");
    label.className = "reply-label";
    label.textContent = text;
    return label;
  }

  function conceptReply(concept: string, query: string): HTMLElement {
    const reply = document.createElement("div");
    reply.className = "reply";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reply-title";
    button.textContent = concept;
    button.setAttribute("aria-pressed", query !== "" && norm(concept) === query ? "true" : "false");
    button.addEventListener("click", () => applyQuery(query === norm(concept) ? "" : concept));
    reply.append(button);
    return reply;
  }

  function relateReply(comment: Comment, relate: RelateLine): HTMLElement {
    const reply = document.createElement("div");
    reply.className = "reply";
    if (comment.yours && opts?.onOpenYours) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reply-title";
      button.textContent = `relates ${relate.label}`;
      button.addEventListener("click", () => opts.onOpenYours?.(relate.nodeId));
      reply.append(button);
    } else {
      const label = document.createElement("p");
      label.className = "reply-label";
      label.textContent = `relates ${relate.label}`;
      reply.append(label);
    }
    if (relate.note) reply.append(replyNote(relate.note));
    return reply;
  }

  function openReply(nodeId: string): HTMLElement {
    const reply = document.createElement("div");
    reply.className = "reply";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reply-title";
    button.textContent = "open";
    button.addEventListener("click", () => opts?.onOpenYours?.(nodeId));
    reply.append(button);
    return reply;
  }
}

function buildPerson(person: Person, index: ConceptHit[]): Comment {
  const rootId = person.graph.rootId ?? person.graph.nodes.find((node) => !node.parent)?.id;
  const files = person.graph.nodes.filter((node) => node.kind === "file").length;
  const title = person.graph.title ?? person.handle;
  const children = rootId ? childNodes(person.graph, rootId).map((node) => buildNode(person, node)) : [];
  return {
    id: person.handle,
    kind: "graph",
    label: person.handle,
    meta: `${title} · ${files} note${files === 1 ? "" : "s"}`,
    copy: shareCopy(person, index),
    concepts: [],
    relates: [],
    yours: person.yours,
    nodeId: rootId,
    children,
  };
}

function buildNode(person: Person, node: GraphNode): Comment {
  if (node.kind === "folder") {
    const files = countFiles(person.graph, node.id);
    return {
      id: `${person.handle}:${node.id}`,
      kind: "folder",
      label: node.label,
      meta: `folder · ${files}`,
      concepts: [],
      relates: [],
      yours: person.yours,
      nodeId: node.id,
      children: childNodes(person.graph, node.id).map((child) => buildNode(person, child)),
    };
  }
  const status =
    node.status === "pending" ? "file · reading" : node.status === "failed" ? "file · unread" : "file";
  return {
    id: `${person.handle}:${node.id}`,
    kind: "file",
    label: node.label,
    meta: status,
    copy: node.summary,
    concepts: node.concepts ?? [],
    relates: person.graph.edges
      .filter((edge) => edge.kind === "relates" && edge.source === node.id)
      .map((edge) => {
        const other = person.graph.nodes.find((item) => item.id === edge.target);
        return { label: other?.label ?? edge.target, note: edge.note, nodeId: edge.target };
      }),
    yours: person.yours,
    nodeId: node.id,
    children: [],
  };
}

function childNodes(graph: Graph, parentId: string): GraphNode[] {
  return graph.nodes
    .filter((node) => node.parent === parentId)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
}

function countFiles(graph: Graph, folderId: string): number {
  let count = 0;
  const pending = [folderId];
  const seenIds = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (!id) break;
    for (const node of graph.nodes) {
      if (node.parent !== id || seenIds.has(node.id)) continue;
      seenIds.add(node.id);
      if (node.kind === "file") count += 1;
      else pending.push(node.id);
    }
  }
  return count;
}

function conceptIndex(people: Person[]): ConceptHit[] {
  const map = new Map<string, ConceptHit>();
  for (const person of people) {
    const seenHere = new Set<string>();
    for (const node of person.graph.nodes) {
      for (const concept of node.concepts ?? []) {
        const key = norm(concept);
        if (!key || seenHere.has(key)) continue;
        seenHere.add(key);
        const hit = map.get(key) ?? { key, label: concept.trim(), handles: [] };
        hit.handles.push(person.handle);
        map.set(key, hit);
      }
    }
  }
  return [...map.values()]
    .filter((hit) => hit.handles.length > 1)
    .sort((a, b) => b.handles.length - a.handles.length || a.label.localeCompare(b.label));
}

function shareCopy(person: Person, index: ConceptHit[]): string | undefined {
  const mine = new Set<string>();
  for (const node of person.graph.nodes) {
    for (const concept of node.concepts ?? []) {
      const key = norm(concept);
      if (key) mine.add(key);
    }
  }
  const shared = index.filter((hit) => mine.has(hit.key)).slice(0, 3);
  if (shared.length === 0) return undefined;
  return `shares ${shared.map((hit) => hit.label).join(", ")}`;
}

function remember(comment: Comment, collapsed: Set<string>, seen: Set<string>): void {
  if (comment.kind === "folder" && !seen.has(comment.id)) collapsed.add(comment.id);
  seen.add(comment.id);
  for (const child of comment.children) remember(child, collapsed, seen);
}

function prune(comment: Comment, query: string): Comment | null {
  const children = comment.children
    .map((child) => prune(child, query))
    .filter((child): child is Comment => child !== null);
  if (children.length > 0 || hits(comment, query)) return { ...comment, children };
  return null;
}

function hits(comment: Comment, query: string): boolean {
  if (comment.label.toLowerCase().includes(query)) return true;
  if (comment.meta.toLowerCase().includes(query)) return true;
  if (comment.copy?.toLowerCase().includes(query)) return true;
  if (comment.concepts.some((concept) => concept.toLowerCase().includes(query))) return true;
  return comment.relates.some(
    (relate) => relate.label.toLowerCase().includes(query) || (relate.note?.toLowerCase().includes(query) ?? false),
  );
}

function byHandle(a: string, b: string): number {
  if (a === "you") return -1;
  if (b === "you") return 1;
  return a.localeCompare(b);
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isFriend(value: unknown): value is FriendRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as FriendRecord;
  return typeof record.handle === "string" && Boolean(record.graph) && Array.isArray(record.graph.nodes);
}

function threadSection(tag: string, items: HTMLElement[]): HTMLElement {
  const section = document.createElement("section");
  section.className = "thread";
  const label = document.createElement("p");
  label.className = "tag";
  label.textContent = tag;
  section.append(label, replyList(items));
  return section;
}

function post(text: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "post";
  const body = document.createElement("p");
  body.className = "body";
  body.textContent = text;
  section.append(body);
  return section;
}

function replyList(items: HTMLElement[]): HTMLElement {
  const list = document.createElement("div");
  list.className = "replies";
  for (const item of items) list.append(item);
  return list;
}

function replyNote(text: string): HTMLElement {
  const note = document.createElement("p");
  note.className = "reply-note";
  note.textContent = text;
  return note;
}

function required(selector: string): HTMLElement {
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return element;
}
