import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ExtractPayload {
  name: string;
  text?: string;
  images?: string[];
}

const PAGE_CAP = 3;
const TEXT_CAP = 8000;
const BODY_CAP = 3_800_000;

export async function payloadFor(path: string, file: File): Promise<ExtractPayload | null> {
  if (/\.pdf$/i.test(path)) return pdfPayload(path, file);
  const text = (await file.text()).slice(0, TEXT_CAP);
  return text.trim() ? { name: path, text } : null;
}

async function pdfPayload(path: string, file: File): Promise<ExtractPayload | null> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await getDocument({ data }).promise;
  let text = "";
  for (let pageNo = 1; pageNo <= doc.numPages && text.length < TEXT_CAP; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) text += `${item.str} `;
    }
  }
  if (text.trim().length >= 200) return { name: path, text: text.trim().slice(0, TEXT_CAP) };

  const images: string[] = [];
  const pages = Math.min(PAGE_CAP, doc.numPages);
  for (let pageNo = 1; pageNo <= pages; pageNo++) {
    images.push(await renderPage(doc, pageNo, 0.7));
    if (!fits({ name: path, images })) images[images.length - 1] = await renderPage(doc, pageNo, 0.5);
    while (images.length > 1 && !fits({ name: path, images })) images.pop();
    if (!fits({ name: path, images })) return null;
  }
  return images.length ? { name: path, images } : null;
}

async function renderPage(doc: PDFDoc, pageNo: number, quality: number): Promise<string> {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 1024 / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL("image/jpeg", quality);
}

type PDFDoc = Awaited<ReturnType<typeof getDocument>["promise"]>;

function fits(body: ExtractPayload): boolean {
  return new Blob([JSON.stringify(body)]).size < BODY_CAP;
}
