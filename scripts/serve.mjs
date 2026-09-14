import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { root } from "./tasks.mjs";
const built = process.argv.includes("--built"),
  port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
};
http
  .createServer(async (req, res) => {
    try {
      let pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (built) {
        if (!pathname.startsWith("/macronic/"))
          throw new Error("Use /macronic/");
        pathname = pathname.slice("/macronic".length);
      } else {
        if (pathname === "/") pathname = "/src/reader/";
        if (pathname.startsWith("/src/reader/shared/"))
          pathname = pathname.replace("/src/reader/shared/", "/src/shared/");
        if (pathname === "/src/reader/reader.json")
          pathname = "/data/reader/reader.json";
      }
      const base = path.join(root, built ? "dist" : "");
      let file = path.resolve(base, "." + pathname);
      if (
        !file.startsWith(base + path.sep) ||
        pathname.split("/").some((x) => x.startsWith("."))
      )
        throw new Error("Not found");
      if ((await stat(file)).isDirectory())
        file = path.join(file, "index.html");
      res.setHeader("Content-Type", types[path.extname(file)] || "text/plain");
      res.setHeader("Cache-Control", "no-store");
      res.end(await readFile(file));
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(
      `http://127.0.0.1:${port}${built ? "/macronic/prototype/" : "/src/reader/"}${built ? "" : " · workshop /src/review/"}`,
    ),
  );
