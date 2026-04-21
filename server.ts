import "dotenv/config";
import http from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { parse } from "url";
import { createSocketServer } from "@/lib/socket/server";
import { ensureIndexes } from "@/lib/mongodb/indexes";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function start() {
  await app.prepare();
  await ensureIndexes();

  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "", true);
    void handle(req, res, parsedUrl);
  });

  createSocketServer(server, new SocketIOServer(server, { cors: { origin: true, credentials: true } }));

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}

void start();
