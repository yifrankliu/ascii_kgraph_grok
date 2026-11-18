import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

/** Serve Vercel-style `api/*.ts` handlers during `vite` / `vite preview`. */
function vercelApiDev(): Plugin {
  return {
    name: "vercel-api-dev",
    configureServer(server) {
      mountApi(server);
    },
    configurePreviewServer(server) {
      mountApi(server);
    },
  };
}

function mountApi(server: ViteDevServer | { middlewares: ViteDevServer["middlewares"]; ssrLoadModule: ViteDevServer["ssrLoadModule"] }): void {
  server.middlewares.use(async (req, res, next) => {
    try {
      const path = req.url?.split("?")[0] ?? "";
      if (!path.startsWith("/api/")) {
        next();
        return;
      }

      const name = path.slice("/api/".length).replace(/\/$/, "");
      if (!name || name.includes("..") || name.includes("/")) {
        next();
        return;
      }

      const method = (req.method ?? "GET").toUpperCase();
      const mod = await server.ssrLoadModule(`/api/${name}.ts`);
      const handler = mod[method] ?? mod.default;
      if (typeof handler !== "function") {
        json(res, 404, { error: `No ${method} handler for /api/${name}` });
        return;
      }

      const request = await toRequest(req, path);
      const response = (await handler(request)) as Response;
      await writeResponse(res, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "API handler failed.";
      json(res, 500, { error: message.slice(0, 240) });
    }
  });
}

async function toRequest(req: IncomingMessage, path: string): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${path}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(url, { method: req.method, headers });
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const body = Buffer.concat(chunks);
  return new Request(url, {
    method: req.method,
    headers,
    body,
    // Node's fetch requires duplex when a body is present.
    duplex: "half",
  } as RequestInit);
}

async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["XAI_API_KEY", "XAI_MODEL"]) {
    if (env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [vercelApiDev()],
  };
});
