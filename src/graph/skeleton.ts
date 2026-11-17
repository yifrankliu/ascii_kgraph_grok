import type { Graph, GraphNode } from "./types";

export interface NoteFile {
  file: File;
  path: string;
}

const NOTE = /\.(pdf|md|txt)$/i;

export function isNote(path: string): boolean {
  return NOTE.test(path) && !path.split("/").some((part) => part.startsWith("."));
}

export function labelOf(name: string): string {
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
}

/** Shared top folder when every path sits under one directory name. */
export function folderTitle(files: NoteFile[]): string {
  const tops = files.map((file) => file.path.replace(/\\/g, "/").split("/").filter(Boolean)[0] ?? "");
  if (tops.length && tops.every((top) => top && top === tops[0])) return tops[0];
  return "notes";
}

export function skeletonFromFiles(files: NoteFile[]): Graph {
  const title = folderTitle(files);
  const nodes = new Map<string, GraphNode>();
  const edges: Graph["edges"] = [];

  nodes.set(title, {
    id: title,
    label: labelOf(title),
    kind: "folder",
  });

  for (const note of files) {
    const raw = note.path.replace(/\\/g, "/").split("/").filter(Boolean);
    const parts = raw[0] === title ? raw : [title, ...raw];
    let parent: string | undefined;
    for (let i = 0; i < parts.length; i++) {
      const id = parts.slice(0, i + 1).join("/");
      const file = i === parts.length - 1;
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: labelOf(parts[i]),
          kind: file ? "file" : "folder",
          parent,
          status: file ? "pending" : undefined,
        });
        if (parent) edges.push({ source: parent, target: id, kind: "contains" });
      } else if (parent && !edges.some((edge) => edge.source === parent && edge.target === id)) {
        edges.push({ source: parent, target: id, kind: "contains" });
      }
      parent = id;
    }
  }

  return { title, rootId: title, nodes: [...nodes.values()], edges };
}
