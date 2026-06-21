const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const VOICE_RANGE = 50;
const players = {};

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

io.on("connection", (socket) => {
  console.log("Nouveau joueur connecté : " + socket.id);

  socket.on("join", ({ playerId, playerName }) => {
    players[socket.id] = { playerId, playerName, x: 0, y: 0, z: 0 };
    console.log(playerName + " a rejoint la voix");
    socket.broadcast.emit("player-joined", { socketId: socket.id, playerName });
    const existing = Object.entries(players)
      .filter(([id]) => id !== socket.id)
      .map(([id, p]) => ({ socketId: id, playerName: p.playerName }));
    socket.emit("existing-players", existing);
  });

  socket.on("update-position", ({ x, y, z }) => {
    if (players[socket.id]) {
      players[socket.id].x = x;
      players[socket.id].y = y;
      players[socket.id].z = z;
      const nearby = [];
      for (const [id, p] of Object.entries(players)) {
        if (id === socket.id) continue;
        const dx = x - p.x, dy = y - p.y, dz = z - p.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist <= VOICE_RANGE) {
          const volume = Math.round((1 - dist / VOICE_RANGE) * 100) / 100;
          nearby.push({ socketId: id, distance: Math.floor(dist), volume });
        }
      }
      socket.emit("nearby-players", nearby);
    }
  });

  socket.on("webrtc-offer", ({ targetSocketId, offer }) => {
    io.to(targetSocketId).emit("webrtc-offer", { fromSocketId: socket.id, fromName: players[socket.id]?.playerName, offer });
  });

  socket.on("webrtc-answer", ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit("webrtc-answer", { fromSocketId: socket.id, answer });
  });

  socket.on("ice-candidate", ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit("ice-candidate", { fromSocketId: socket.id, candidate });
  });

  socket.on("toggle-mute", (muted) => {
    socket.broadcast.emit("player-muted", { socketId: socket.id, muted });
  });

  socket.on("disconnect", () => {
    const p = players[socket.id];
    if (p) {
      console.log(p.playerName + " a quitté");
      socket.broadcast.emit("player-left", { socketId: socket.id });
      delete players[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("MotrolifeVoice serveur démarré sur port " + PORT);
});
