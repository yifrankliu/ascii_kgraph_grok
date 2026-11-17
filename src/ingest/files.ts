import { isNote, type NoteFile } from "../graph/skeleton";

export interface ChosenNotes {
  kept: NoteFile[];
  skipped: number;
  scanned: number;
}

export async function notesFromList(files: File[]): Promise<ChosenNotes> {
  const notes: NoteFile[] = [];
  for (const file of files) {
    const path = normalize(file.webkitRelativePath || file.name);
    if (isNote(path)) notes.push({ file, path });
  }
  return cap(notes, files.length);
}

export async function notesFromEntries(entries: FileSystemEntry[]): Promise<ChosenNotes> {
  const notes: NoteFile[] = [];
  let scanned = 0;
  for (const entry of entries) {
    scanned += await walk(entry, "", notes);
  }
  return cap(notes, scanned);
}

/** Call this during the drop/change event, before any await. */
export function captureDrop(data: DataTransfer): {
  entries: FileSystemEntry[];
  files: File[];
} {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  return { entries, files: [...data.files] };
}

function normalize(path: string): string {
  return path.replace(/\\/g, "/");
}

function cap(notes: NoteFile[], scanned: number): ChosenNotes {
  notes.sort((a, b) => a.path.localeCompare(b.path));
  return {
    kept: notes.slice(0, 40),
    skipped: Math.max(0, notes.length - 40),
    scanned,
  };
}

async function walk(entry: FileSystemEntry, prefix: string, out: NoteFile[]): Promise<number> {
  if (entry.name.startsWith(".")) return 0;
  const path = normalize(prefix ? `${prefix}/${entry.name}` : entry.name);
  if (entry.isFile) {
    const file = await fileOf(entry as FileSystemFileEntry);
    if (isNote(path)) out.push({ file, path });
    return 1;
  }
  if (!entry.isDirectory) return 0;
  let scanned = 0;
  for (const child of await readDir(entry as FileSystemDirectoryEntry)) {
    scanned += await walk(child, path, out);
  }
  return scanned;
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDir(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = entry.createReader();
    const all: FileSystemEntry[] = [];
    const batch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) resolve(all);
        else {
          all.push(...entries);
          batch();
        }
      }, reject);
    };
    batch();
  });
}
