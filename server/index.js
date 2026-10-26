import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createMarketService } from "./market.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const dev = process.argv.includes("--dev");
const portArg = process.argv.indexOf("--port");
const port = Number(
  process.env.PORT || (portArg >= 0 ? process.argv[portArg + 1] : 5173),
);
const market = createMarketService();
const vite = dev
  ? await (
      await import("vite")
    ).createServer({ root, server: { middlewareMode: true }, appType: "spa" })
  : null;
const json = (res, status, value) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
};
let active = 0;
const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.split("?")[0] === "/api/market") {
      if (req.method !== "POST") return json(res, 405, { error: "Użyj POST." });
      // Browser requests must come from this app, not an unrelated website.
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`
      )
        return json(res, 403, { error: "Niedozwolone źródło żądania." });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return json(res, 415, { error: "Wymagany JSON." });
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (Buffer.byteLength(raw) > 65536)
          return json(res, 413, { error: "Żądanie jest za duże." });
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: "Nieprawidłowy JSON." });
      }
      const { validateRequest } = await import("./market.js");
      try {
        validateRequest(body);
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
      if (active >= 4)
        return json(res, 429, {
          error: "Trwa pobieranie danych. Spróbuj ponownie za chwilę.",
        });
      active++;
      try {
        return json(res, 200, await market.getMarket(body));
      } finally {
        active--;
      }
    }
    if (req.url?.startsWith("/api/"))
      return json(res, 404, { error: "Nieznany endpoint." });
    if (vite) return vite.middlewares(req, res);
    const dist = resolve(root, "dist"),
      url = new URL(req.url, "http://localhost");
    let path = resolve(dist, "." + decodeURIComponent(url.pathname));
    if (!path.startsWith(dist + sep) && path !== dist)
      return json(res, 403, { error: "Niedozwolona ścieżka." });
    try {
      if (!(await stat(path)).isFile()) path = resolve(dist, "index.html");
    } catch {
      if (extname(path))
        return json(res, 404, { error: "Nie znaleziono pliku." });
      path = resolve(dist, "index.html");
    }
    const data = await readFile(path);
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".woff2": "font/woff2",
      ".svg": "image/svg+xml",
    };
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch (e) {
    if (!res.headersSent)
      json(res, 500, {
        error: dev ? e.message : "Nie można obsłużyć żądania.",
      });
    else res.end();
  }
});
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Folio ${dev ? "dev" : "production"} — http://localhost:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await vite?.close();
    server.close(() => process.exit(0));
  });
