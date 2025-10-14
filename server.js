const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = {};
let roundActive = false;
let roundPhase = null;

io.on("connection", (socket) => {
  console.log("접속:", socket.id);

  // 플레이어 참가
  socket.on("joinGame", ({ name, nation }) => {
    players[socket.id] = { name, nation, PA: 0 };
    console.log(`${name} (${nation}) 참가`);
    socket.emit("joined", players[socket.id]);
  });

  // 생산 (production 라운드일 때만 증가)
  socket.on("produce", () => {
    if (roundActive && roundPhase === "production") {
      players[socket.id].PA += 1;
      socket.emit("updateState", players[socket.id]);
    }
  });

  // 가위바위보
  socket.on("playRPS", ({ card }) => {
    if (!roundActive || roundPhase !== "production") return;
    const p = players[socket.id];
    if (!p) return;

    const choices = ["rock", "paper", "scissors"];
    const gmCard = choices[Math.floor(Math.random() * 3)];
    let result = "draw", bonus = 0;

    if ((card === "rock" && gmCard === "scissors") ||
        (card === "paper" && gmCard === "rock") ||
        (card === "scissors" && gmCard === "paper")) {
      result = "win"; bonus = 50;
    } else if ((gmCard === "rock" && card === "scissors") ||
               (gmCard === "paper" && card === "rock") ||
               (gmCard === "scissors" && card === "paper")) {
      result = "lose"; bonus = -50;
    }

    p.PA += bonus;
    socket.emit("rpsResult", { result, bonus, gmCard });
    socket.emit("updateState", p);
  });

  // --- ✅ 사회자 이벤트 ---
  socket.on("startRound", ({ phase }) => {
    roundActive = true;
    roundPhase = phase;
    console.log(`라운드 시작: ${phase}`);
    io.emit("roundStart", { phase });   // 👈 socket.emit이 아닌 io.emit
  });

  socket.on("endRound", () => {
    roundActive = false;
    roundPhase = null;
    console.log("라운드 종료");
    io.emit("roundEnd", { players });   // 👈 모든 플레이어에게 전달
  });

  // 연결 해제 시 플레이어 삭제
  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

server.listen(3000, () => {
  console.log("서버 실행: http://localhost:3000");
});
