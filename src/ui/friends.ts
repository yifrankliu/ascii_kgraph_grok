import type { BackgroundPreset } from "./background";
import type { Graph, GraphNode } from "../graph/types";

const OWNER = "frank";

interface FriendRecord {
  handle: string;
  email: string;
  major: string;
  preset: BackgroundPreset;
  graph: Graph;
}

interface RelateLine {
  label: string;
  note?: string;
  nodeId: string;
}

interface Comment {
  id: string;
  handle: string;
  kind: "graph" | "folder" | "file";
  label: string;
  meta: string;
  copy?: string;
  concepts: string[];
  relates: RelateLine[];
  yours: boolean;
  nodeId?: string;
  major?: string;
  preset?: BackgroundPreset;
  children: Comment[];
}

interface Person {
  handle: string;
  email?: string;
  graph: Graph;
  yours: boolean;
  major?: string;
  preset?: BackgroundPreset;
}

export interface FriendView {
  handle: string;
  yours: boolean;
  graph: Graph;
  preset?: BackgroundPreset;
  major?: string;
  nodeId?: string;
}

interface ConceptHit {
  key: string;
  label: string;
  handles: string[];
}

export function mountFriends(opts?: {
  onView?: (view: FriendView) => void;
  onOpen?: () => void;
}): {
  setYours(graph: Graph): void;
  setViewing(handle: string): void;
  setOpen(open: boolean): void;
  isOpen(): boolean;
} {
  const toggle = required("#friends-toggle");
  const panel = required("#friends-panel");
  const countEl = required("#friends-count");
  const indexEl = required("#friends-index");
  const threadsEl = required("#friends-threads");
  const findNode = required("#friends-find");
  if (!(findNode instanceof HTMLInputElement)) throw new Error("Missing #friends-find");
  const findEl: HTMLInputElement = findNode;
  const addNode = required("#friends-add");
  if (!(addNode instanceof HTMLInputElement)) throw new Error("Missing #friends-add");
  const addEl: HTMLInputElement = addNode;
  const suggestEl = required("#friends-suggest");
  const close = required("#friends-close");

  let yours: Graph = { nodes: [], edges: [] };
  let directory: FriendRecord[] = [];
  let friends: FriendRecord[] = [];
  let open = false;
  let loaded = false;
  let failed = false;
  let viewing = OWNER;
  const collapsed = new Set<string>();
  const seen = new Set<string>();

  toggle.addEventListener("click", () => setOpen(!open));
  close.addEventListener("click", () => setOpen(false));
  findEl.addEventListener("input", () => {
    if (open) paint();
  });
  addEl.addEventListener("input", () => {
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
    if (event.target === addEl && addEl.value) {
      addEl.value = "";
      paint();
      return;
    }
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
    setViewing(handle) {
      viewing = handle;
      if (open) paint();
    },
    setOpen,
    isOpen: () => open,
  };

  function setOpen(next: boolean): void {
    const was = open;
    open = next;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      opts?.onOpen?.();
      paint();
      addEl.focus();
    } else if (was) {
      toggle.focus();
    }
  }

  async function load(): Promise<void> {
    try {
      const response = await fetch("/friends.json");
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as { friends?: unknown; added?: unknown };
      const list = Array.isArray(data.friends) ? data.friends.filter(isFriend) : [];
      directory = list;
      const added = new Set(
        Array.isArray(data.added) ? data.added.filter((item): item is string => typeof item === "string") : list.map((item) => item.handle),
      );
      friends = list.filter((item) => added.has(item.handle));
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
    suggestEl.replaceChildren(suggestView(norm(addEl.value)));
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
    if (yours.nodes.length > 0) {
      people.push({ handle: OWNER, graph: yours, yours: true, major: "your graph" });
    }
    for (const friend of friends) {
      people.push({
        handle: friend.handle,
        graph: friend.graph,
        yours: false,
        major: friend.major,
        preset: friend.preset,
        email: friend.email,
      });
    }
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

  function viewFrom(comment: Comment, nodeId?: string): void {
    const graph = graphOf(comment.handle);
    if (!graph) return;
    if (collapsed.has(comment.handle)) collapsed.delete(comment.handle);
    viewing = comment.handle;
    paint();
    const record = friends.find((friend) => friend.handle === comment.handle);
    opts?.onView?.({
      handle: comment.handle,
      yours: comment.yours,
      graph,
      preset: record?.preset,
      major: record?.major ?? comment.major,
      nodeId,
    });
  }

  function graphOf(handle: string): Graph | null {
    if (handle === OWNER) return yours.nodes.length > 0 ? yours : null;
    return friends.find((friend) => friend.handle === handle)?.graph ?? null;
  }

  function addFriend(handle: string): void {
    if (friends.some((friend) => friend.handle === handle)) return;
    const person = directory.find((friend) => friend.handle === handle);
    if (!person) return;
    friends = [...friends, person];
    addEl.value = "";
    paint();
  }

  function removeFriend(handle: string): void {
    const wasViewing = viewing === handle;
    friends = friends.filter((friend) => friend.handle !== handle);
    if (wasViewing) {
      viewing = OWNER;
      const graph = graphOf(OWNER);
      if (graph) {
        opts?.onView?.({ handle: OWNER, yours: true, graph, major: "your graph" });
      }
    }
    paint();
  }

  function suggestView(query: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    if (!query) return fragment;
    const matches = directory.filter((person) => {
      const hay = `${person.email} ${person.handle} ${person.major}`.toLowerCase();
      return hay.includes(query);
    });
    const section = document.createElement("section");
    section.className = "thread";
    const label = document.createElement("p");
    label.className = "tag";
    label.textContent = "add";
    section.append(label);
    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.className = "reply-note";
      empty.textContent = "No Yale email matches.";
      section.append(empty);
      fragment.append(section);
      return fragment;
    }
    const list = document.createElement("div");
    list.className = "replies";
    for (const person of matches) {
      const added = friends.some((friend) => friend.handle === person.handle);
      const reply = document.createElement("div");
      reply.className = "reply";
      const row = document.createElement("div");
      row.className = "reply-line";
      const who = document.createElement("p");
      who.className = "reply-label";
      who.textContent = person.email;
      row.append(who);
      const action = document.createElement("button");
      action.type = "button";
      action.className = "reply-title f-remove";
      action.textContent = added ? "remove" : "add";
      action.addEventListener("click", () => (added ? removeFriend(person.handle) : addFriend(person.handle)));
      row.append(action);
      const note = document.createElement("p");
      note.className = "reply-note";
      note.textContent = `${person.handle} · ${person.major}`;
      reply.append(row, note);
      list.append(reply);
    }
    section.append(list);
    fragment.append(section);
    return fragment;
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
    }
    if (nested.length > 0) reply.append(replyList(nested));
    return reply;
  }

  function headFor(comment: Comment, openKids: boolean, forceOpen: boolean): HTMLElement {
    if (comment.kind === "graph") return graphHead(comment, openKids, forceOpen);
    const mark = comment.children.length === 0 ? (comment.kind === "folder" ? "[#]" : "(o)") : openKids ? "[-]" : "[+]";
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
    if (comment.kind === "file" && comment.nodeId && opts?.onView) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reply-title";
      button.textContent = text;
      button.addEventListener("click", () => viewFrom(comment, comment.nodeId));
      return button;
    }
    const label = document.createElement("p");
    label.className = "reply-label";
    label.textContent = text;
    return label;
  }

  function graphHead(comment: Comment, openKids: boolean, forceOpen: boolean): HTMLElement {
    const row = document.createElement("div");
    row.className = "reply-line";
    if (comment.children.length > 0 && !forceOpen) {
      const fold = document.createElement("button");
      fold.type = "button";
      fold.className = "reply-title";
      fold.textContent = openKids ? "[-]" : "[+]";
      fold.setAttribute("aria-expanded", openKids ? "true" : "false");
      fold.setAttribute("aria-label", `${openKids ? "Collapse" : "Expand"} ${comment.label}`);
      fold.addEventListener("click", () => toggleCollapsed(comment.id));
      row.append(fold);
    } else if (comment.children.length > 0) {
      const mark = document.createElement("span");
      mark.className = "reply-label";
      mark.textContent = "[-]";
      row.append(mark);
    }
    const name = document.createElement("button");
    name.type = "button";
    name.className = "reply-title";
    name.textContent = comment.label;
    name.setAttribute("aria-pressed", viewing === comment.handle ? "true" : "false");
    name.addEventListener("click", () => viewFrom(comment));
    row.append(name);
    if (!comment.yours) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "reply-title f-remove";
      remove.textContent = "remove";
      remove.addEventListener("click", () => removeFriend(comment.handle));
      row.append(remove);
    }
    return row;
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
    if (opts?.onView) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "reply-title";
      button.textContent = `relates ${relate.label}`;
      button.addEventListener("click", () => viewFrom(comment, relate.nodeId));
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
}

function buildPerson(person: Person, index: ConceptHit[]): Comment {
  const rootId = person.graph.rootId ?? person.graph.nodes.find((node) => !node.parent)?.id;
  const files = person.graph.nodes.filter((node) => node.kind === "file").length;
  const major = person.major ?? person.graph.title ?? person.handle;
  const children = rootId ? childNodes(person.graph, rootId).map((node) => buildNode(person, node)) : [];
  const notes = `${files} note${files === 1 ? "" : "s"}`;
  return {
    id: person.handle,
    handle: person.handle,
    kind: "graph",
    label: person.handle,
    meta: person.yours ? `your graph · ${notes}` : `${person.email ?? person.handle} · ${major} · ${person.preset} · ${notes}`,
    copy: shareCopy(person, index),
    concepts: [],
    relates: [],
    yours: person.yours,
    nodeId: rootId,
    major,
    preset: person.preset,
    children,
  };
}

function buildNode(person: Person, node: GraphNode): Comment {
  if (node.kind === "folder") {
    const files = countFiles(person.graph, node.id);
    return {
      id: `${person.handle}:${node.id}`,
      handle: person.handle,
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
    handle: person.handle,
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
  if (a === OWNER) return -1;
  if (b === OWNER) return 1;
  return a.localeCompare(b);
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isFriend(value: unknown): value is FriendRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as FriendRecord;
  return (
    typeof record.handle === "string" &&
    typeof record.email === "string" &&
    record.email.endsWith("@yale.edu") &&
    typeof record.major === "string" &&
    (record.preset === "dark" || record.preset === "koi" || record.preset === "matrix") &&
    Boolean(record.graph) &&
    Array.isArray(record.graph.nodes)
  );
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
