# AGENTS.md — project context

Read this whole file before writing code. It is the source of truth for what
we are building, what is out of scope, and how the pieces fit together.

**If the repo has no `package.json` yet, do the setup runbook in section 13
first, then stop and report before building features.**

## 1. What this is

**Working title: Trace** (TODO: rename if we pick something better)

A website where a student drops in a folder of their notes and gets back a
rotating, interactive **ASCII-art knowledge graph** of what they have learned:
folders and files become nodes, and Grok reads the files to add summaries and
cross-links between related notes. The result is a personal "trace" of their
knowledge that they can explore and show to others.

One-line pitch: *your notes folder, as a living ASCII knowledge graph.*

## 2. Constraints (hackathon)

- Built at Grokathon Yale 2026: **4 hours of build time**, solo or small team.
- **Must use Grok models** (xAI API) to be prize-eligible. Grok is a core part
  of the product, not decoration: it turns raw notes into the graph's content.
- Brief: a new tool for the Yale community. Audience is students.
- Everything is judged from a live demo. A working, good-looking demo beats
  feature count. When in doubt, cut scope and protect the demo.

## 3. The demo we must be able to give

1. Open the site: a sample graph is already slowly rotating in ASCII.
2. Drag a notes folder onto the page (PDFs exported from GoodNotes, plus any
   `.md` / `.txt`).
3. Within a second the folder structure appears as a graph (no AI yet).
4. Over the next seconds, nodes "fill in" as Grok returns summaries, and
   cross-link edges appear between related notes in different folders.
5. Hover a node to highlight it and its edges; click to open a side panel
   with the file's summary and key concepts.

If Grok is slow or fails, steps 1–3 and 5 must still work.

## 4. Scope

**In scope**
- Folder drop / folder picker, client-side file reading
- Skeleton graph from folder paths
- Grok extraction: per-file summary + concepts, then cross-links
- ASCII renderer: 3D rotating graph, labels, depth, hover, click
- Side panel for the selected node
- Bundled sample graph for offline demo

**Out of scope — do not build**
- Accounts, login, databases, server-side storage of notes
- Direct GoodNotes / Notion / Google Drive integration (no usable API for
  GoodNotes; users export to a folder instead)
- Editing the graph by hand, multi-user features, mobile layout
- Any UI framework (React, Vue, Svelte) or CSS framework

**Stretch, only if everything above is done**
- Share link (graph JSON compressed into the URL hash)
- Concept nodes as a third node kind
- Search box that flies the camera to a node

## 5. Stack

- **Vite + TypeScript**, strict mode, no UI framework. Plain DOM.
- **Two serverless functions** under `api/` (Vercel) that proxy to the xAI
  API. Run locally with `vercel dev`.
- Dependencies allowed: `d3-force-3d` (layout), `pdfjs-dist` (PDF reading),
  `openai` (client pointed at xAI). Ask before adding anything else.

- **Hosting: Vercel (Hobby plan), confirmed.** The GitHub repo is already
  imported as a Vercel project; every push to `main` redeploys. There is no
  database and no other service. See section 14 for what runs where.

## 6. Architecture

```
folder drop ──> ingest ──> skeleton graph ──> layout ──> ASCII renderer
                  │                              ▲
                  └──> /api/extract (Grok) ──> /api/link (Grok) ──┘
                         per file                all files
```

Suggested layout:

```
src/
  main.ts            wiring only
  ingest/            folder reading, PDF → text or page images
  graph/             types, skeleton builder, merge of Grok results, layout
  render/            ASCII renderer (see section 8) — zero dependencies
  ui/                side panel, drop zone, status line
api/
  extract.ts         one file in → summary + concepts out
  link.ts            all file concepts in → cross-link edges out
public/
  sample-graph.json  fixture used on load and as the demo fallback
```

Hard boundaries:
- `render/` knows nothing about files, Grok, or the network. It takes a
  positioned graph and a mount element. It must stay reusable in another site.
- The xAI API key lives only in `api/` via `process.env.XAI_API_KEY`. It must
  never appear in client code or in the repo.

## 7. Data contract

```ts
type NodeKind = 'folder' | 'file'

interface GraphNode {
  id: string            // stable; use the relative path
  label: string         // display name, max 18 chars, truncated with '…'
  kind: NodeKind
  parent?: string       // id of containing folder
  summary?: string      // from Grok, 1–2 sentences
  concepts?: string[]   // from Grok, 3–6 short noun phrases
  status?: 'pending' | 'ready' | 'failed'   // Grok extraction state
  x?: number; y?: number; z?: number         // set by layout, unit sphere
}

interface GraphEdge {
  source: string
  target: string
  kind: 'contains' | 'relates'   // folder tree vs Grok cross-link
  note?: string                  // why they relate, shown in the panel
}

interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }
```

## 8. ASCII renderer spec

The renderer draws into a character grid. It does **not** convert a rendered
image to text; it places characters directly, which keeps thin lines crisp
and labels readable.

- **Grid:** a `<pre>` in a monospace font. Measure one character to get the
  cell size, derive columns × rows from the container, cap at about 140 × 60.
  Cells are roughly twice as tall as wide; correct for this when projecting.
- **Frame loop:** `requestAnimationFrame`, target 30 fps. Each frame:
  1. Rotate node positions about the Y axis (slow auto-rotate; drag to
     rotate manually; pause auto-rotate while a node is hovered).
  2. Perspective-project to (col, row, depth).
  3. Clear a character buffer, a colour buffer and a depth buffer.
  4. Rasterise edges, then nodes, then labels, each as batches of
     `{col, row, depth, char, color}`; nearest depth wins per cell.
  5. Write the buffers to the `<pre>`, one text run per colour change.
- **Edges:** sample along the projected segment at most one cell apart.
  Choose the glyph from the screen-space slope: `-` when mostly horizontal,
  `|` when mostly vertical, otherwise `/` or `\` (rows grow downward).
  `contains` edges are dim; `relates` edges use `·` or `:` and a second colour.
- **Depth:** 3–4 brightness levels; far things dimmer.
- **Nodes:** `[#]` for folders, `(o)` for files, `(.)` while `pending`.
  Label drawn to the right of the node. Labels of near nodes win over far.
- **Interaction:** hover picks the nearest projected node within 2 cells.
  Hovered node and its edges go full brightness; everything else dims.
  Click emits a `select(nodeId)` callback.
- **Look:** dark background, off-white text, one cool accent colour, soft
  glow via CSS `text-shadow`. Restrained and academic, not playful or neon.
- **Layout:** run `d3-force-3d` for ~300 ticks once when the graph changes,
  then freeze and normalise into a unit sphere. Never run it per frame.
  `contains` links are short and strong; `relates` links long and weak.
  When Grok adds edges, re-run layout starting from current positions so the
  graph settles instead of jumping.

API shape:

```ts
createRenderer(mount: HTMLElement, opts?: { onSelect?: (id: string) => void })
  => { setGraph(g: Graph): void; destroy(): void }
```

## 9. Ingest

- Accept a dropped folder (`DataTransferItem.webkitGetAsEntry`) and a picker
  fallback (`<input type="file" webkitdirectory>`).
- Keep `.pdf`, `.md`, `.txt`. Ignore hidden files and everything else.
- Build the skeleton graph from relative paths immediately and render it.
- Per file, prepare a payload for `/api/extract`:
  - `.md` / `.txt`: text, truncated to ~8,000 characters.
  - `.pdf`: try the text layer with pdf.js. If it yields under ~200
    characters (handwritten notes usually do), render the **first 3 pages**
    to JPEG, ~1024 px wide, and send those as images instead.
- Run extraction with a concurrency of 4. Update each node as it returns.
- Cache results in `localStorage` keyed by path + size + lastModified so a
  second drop of the same folder is instant.
- Cap at 40 files for the demo; show a status line if more were skipped.

## 10. Grok usage

- xAI API is OpenAI-compatible. Base URL: `https://api.x.ai/v1`.
  Key: `XAI_API_KEY`. Model id: `XAI_MODEL` env var.
  (TODO: set `XAI_MODEL` to a current vision-capable Grok model. Check
  https://docs.x.ai for the exact id and for whether to use the Responses
  API or chat completions. Do not guess model names or parameters.)
- Use structured / JSON-schema output for both calls and validate the
  result before using it. On invalid JSON, retry once, then mark `failed`.

`POST /api/extract`
- in: `{ name: string, text?: string, images?: string[] }` (data URLs)
- out: `{ summary: string, concepts: string[] }`
- prompt intent: "These are a student's notes. Give a 1–2 sentence summary
  of what the notes cover and 3–6 key concepts as short noun phrases."

`POST /api/link`
- in: `{ files: { id: string, label: string, concepts: string[] }[] }`
- out: `{ edges: { source: string, target: string, note: string }[] }`
- prompt intent: "Find pairs of notes that are meaningfully related,
  preferring pairs in different folders. At most 2 links per note. `note`
  says in under 12 words why they connect." Only ids from the input are
  valid; drop any edge that references an unknown id.

Notes are sent to xAI for processing and are not stored by us. Say so in
one line near the drop zone.

Vercel limits that constrain these endpoints:
- A request body to a function is capped at 4.5 MB. Keep to 3 pages per PDF
  at ~1024 px wide JPEG (quality ~0.7), and check the payload size client-side
  before sending. Do not raise page count or resolution without asking.
- Set `maxDuration` explicitly to 60 seconds on both functions. Vision calls
  can be slow and the default timeout may be much shorter.

## 11. Build order (4 hours)

| Time      | Goal                                                          |
|-----------|---------------------------------------------------------------|
| 0:00–0:30 | Scaffold, types, `sample-graph.json`, empty grid on screen    |
| 0:30–1:45 | Renderer: project, rasterise edges, nodes, labels, rotate, hover, click |
| 1:45–2:15 | Folder drop → skeleton graph → layout → render                |
| 2:15–3:15 | `/api/extract`, `/api/link`, merge results, side panel        |
| 3:15–3:40 | Polish: glow, colours, pending state, status line             |
| 3:40–4:00 | Deploy, rehearse the demo twice, stop changing code           |

Always keep `main` in a demoable state. Finish each stage against the
sample graph before wiring the next one.

## 12. Rules for the coding agent

- Follow the scope in section 4. If a request seems to need something out of
  scope, say so instead of building it.
- Do not add dependencies, frameworks, or build steps beyond section 5
  without asking.
- Keep modules small (roughly under 200 lines) and keep `render/` free of
  imports from the rest of the app.
- Prefer the simplest thing that works for the demo. No abstractions for
  hypothetical future features, no test suite; the sample graph is the test.
- Never hardcode or log the API key. Never commit `.env`.
- When unsure about the xAI API or pdf.js, read the docs or the installed
  package source. Do not invent function names or parameters.
- After each change, say in one or two lines what changed and what to check
  in the browser.

## 13. Setup runbook

Run from the repo root (the folder that contains this file). The repo is
already cloned and connected to GitHub and to a Vercel project. Run the
steps in order, do not skip the checks, and report the result of each check.

### 13.1 Steps the agent runs

Do not use `npm create vite`: it asks interactive questions. Create the
project by hand instead.

1. Initialise and install:
   ```
   npm init -y
   npm install -D vite typescript
   npm install d3-force-3d pdfjs-dist openai
   ```
2. In `package.json`, set `"type": "module"`, `"private": true`, and scripts:
   ```
   "dev": "vite",
   "build": "tsc --noEmit && vite build",
   "preview": "vite preview"
   ```
3. Create these files:
   - `tsconfig.json`: strict mode, `target` ES2022, `module` ESNext,
     `moduleResolution` bundler, `lib` ES2022 + DOM, `include` `src` and `api`.
   - `index.html`: a dark page with `<pre id="stage"></pre>` and
     `<script type="module" src="/src/main.ts"></script>`.
   - `src/main.ts`: write one line of text into `#stage` for now.
   - `api/hello.ts`: a health check.
     ```ts
     export function GET() {
       return Response.json({ ok: true })
     }
     ```
   - `public/sample-graph.json`: about 12 nodes and 15 edges matching the
     types in section 7 (3 folders, 9 files, a few `relates` edges).
   - `.env.example` containing `XAI_API_KEY=` and `XAI_MODEL=`.
   - Empty folders from section 6: `src/ingest`, `src/graph`, `src/render`,
     `src/ui` (add a `.gitkeep` in each).
   - If `d3-force-3d` has no type declarations, add `src/types/d3-force-3d.d.ts`
     with `declare module 'd3-force-3d'`.
4. Create or extend `.gitignore` with:
   ```
   node_modules
   dist
   .env
   .env.local
   .vercel
   sample-notes/
   ```
5. Check the build: `npm run build` must finish with no errors.
6. Check locally: `npx vercel dev` (only works after step 13.2.1 below; if the
   project is not linked yet, use `npm run dev` and skip the API check).
   - `http://localhost:3000` shows the page.
   - `http://localhost:3000/api/hello` returns `{"ok":true}`.
7. Commit and push:
   ```
   git add -A
   git commit -m "Scaffold project"
   git push origin main
   ```
   Before committing, confirm `git status` lists no `.env` file and nothing
   from `sample-notes/`.

### 13.2 Steps the human does (the agent cannot)

1. In a terminal: `npx vercel login`, then `npx vercel link` and pick the
   existing Vercel project. Both open a browser or ask questions.
2. In the Vercel dashboard, project Settings → Environment Variables: add
   `XAI_API_KEY` and `XAI_MODEL` for Production, Preview and Development.
   Redeploy after adding them.
3. Pull them for local use: `npx vercel env pull .env.local`.
4. Vercel project settings should read: Framework Preset **Vite**, Root
   Directory `./`, Build Command `npm run build`, Output Directory `dist`.
5. After the first push, open the deployed URL and `/api/hello` on it. If
   `/api/hello` returns 404, tell the agent; it should fix the function
   format against the current Vercel docs, not guess.

### 13.3 Everyday commands

| Purpose                         | Command                          |
|---------------------------------|----------------------------------|
| Run site + functions locally    | `npx vercel dev`                 |
| Run frontend only               | `npm run dev`                    |
| Type-check and build            | `npm run build`                  |
| Deploy                          | `git push origin main`           |
| Refresh local env vars          | `npx vercel env pull .env.local` |

The agent may run the first three freely. Ask before pushing to `main` once
the demo is working, since every push changes the live site.

## 14. Hosting and data flow

| Piece                         | Runs on                    | Role                                   |
|-------------------------------|----------------------------|----------------------------------------|
| Frontend (page, renderer)     | Visitor's browser, served by Vercel | Reads the dropped folder, draws the graph |
| `api/extract`, `api/link`     | Vercel functions           | Hold the xAI key, forward to Grok      |
| Grok                          | xAI                        | Summaries, concepts, cross-links       |
| Database                      | None                       | Not part of this design                |

- Note files never leave the user's machine as files. Extracted text or page
  images pass through a function to xAI and are not stored anywhere.
- The graph lives in browser memory; Grok results are cached in
  `localStorage`. Nothing persists across devices.
- Do not add storage, uploads, or a database. Sharing, if built, encodes the
  graph into the URL (stretch goal in section 4).
