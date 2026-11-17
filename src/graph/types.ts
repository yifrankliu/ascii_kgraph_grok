export type NodeKind = "folder" | "file";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
  parent?: string;
  summary?: string;
  concepts?: string[];
  status?: "pending" | "ready" | "failed";
  x?: number;
  y?: number;
  z?: number;
  depth?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "contains" | "relates";
  note?: string;
}

export interface Graph {
  title?: string;
  rootId?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ExtractResult {
  summary: string;
  concepts: string[];
}

export interface LinkEdge {
  source: string;
  target: string;
  note: string;
}
