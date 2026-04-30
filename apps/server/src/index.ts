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

    socket.join(roomCode);
    // Notify the room that a new peer has joined, passing their socket ID
    socket.to(roomCode).emit("peer-joined", { roomCode, peerName, socketId: socket.id });
    // Tell the joiner they are connected to the room
    socket.emit("ready", { roomCode, peerName });
  });

  socket.on("signal", ({ roomCode, target, payload }: { roomCode: string; target?: string; payload: unknown }) => {
    if (target) {
      io.to(target).emit("signal", { payload, sender: socket.id });
    } else {
      socket.to(roomCode).emit("signal", { payload, sender: socket.id });
    }
  });

  socket.on("relay-data", ({ roomCode, target, data }: { roomCode: string; target?: string; data: Buffer }) => {
    if (target) {
      io.to(target).emit("relay-data", { data, sender: socket.id });
    } else {
      socket.to(roomCode).emit("relay-data", { data, sender: socket.id });
    }
  });

  socket.on("relay-control", ({ roomCode, target, message }: { roomCode: string; target?: string; message: any }) => {
    if (target) {
      io.to(target).emit("relay-control", { message, sender: socket.id });
    } else {
      socket.to(roomCode).emit("relay-control", { message, sender: socket.id });
    }
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
