import type { ExtractResult } from "../graph/types";
import type { NoteFile } from "../graph/skeleton";

function key(note: NoteFile): string {
  return `trace:v1:${note.path}:${note.file.size}:${note.file.lastModified}`;
}

export function readCache(note: NoteFile): ExtractResult | null {
  try {
    const raw = localStorage.getItem(key(note));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ExtractResult;
    if (!parsed.summary || !Array.isArray(parsed.concepts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache(note: NoteFile, result: ExtractResult): void {
  try {
    localStorage.setItem(key(note), JSON.stringify(result));
  } catch {
    /* a full cache should not block the demo */
  }
}
