import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "peerdash-signal" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  socket.on("create-room", ({ roomCode }: { roomCode: string }) => {
    socket.join(roomCode);
    socket.emit("room-created", { roomCode });
  });

  socket.on("join-room", ({ roomCode, peerName }: { roomCode: string; peerName: string }) => {
    const sockets = io.sockets.adapter.rooms.get(roomCode);
    if (!sockets || sockets.size === 0) {
      socket.emit("error", { message: "Room not found. Check the code or create a fresh room." });
      return;
    }

    if (sockets.size >= 2) {
      socket.emit("error", { message: "This room already has two devices connected." });
      return;
    }

    socket.join(roomCode);
    io.to(roomCode).emit("ready", { roomCode, peerName });
  });

  socket.on("signal", ({ roomCode, payload }: { roomCode: string; payload: unknown }) => {
    socket.to(roomCode).emit("signal", { payload });
  });

  socket.on("disconnecting", () => {
    for (const roomCode of socket.rooms) {
      if (roomCode !== socket.id) {
        socket.to(roomCode).emit("peer-left");
      }
    }
  });
});

const port = Number(process.env.PORT ?? 3001);
httpServer.listen(port, () => {
  console.log(`PeerDash signaling server on http://localhost:${port}`);
});
