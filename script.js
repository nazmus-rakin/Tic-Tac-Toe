"use strict";

/* =====================================================
   Neon Tic-Tac-Toe – game logic
   ===================================================== */

// All 8 winning lines (indices of the 3x3 board)
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

// ---------- State ----------
const state = {
  board: Array(9).fill(null),
  current: "X",
  active: false,          // is a round in progress?
  mode: "pvp",            // "pvp" | "cpu"
  difficulty: "medium",   // "easy" | "medium" | "hard"
  scores: { X: 0, O: 0, D: 0 },
  starter: "X",           // alternates each round
  muted: false,
  thinking: false,        // true while the computer is "thinking"
};

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const boardEl = $("board");
const statusEl = $("status");

// ---------- Sound (Web Audio, no files needed) ----------
let audioCtx = null;
function beep(freq, dur = 0.12, type = "sine", vol = 0.08, delay = 0) {
  if (state.muted) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch (e) { /* audio not available – ignore */ }
}
const sounds = {
  X: () => beep(520, 0.12, "triangle"),
  O: () => beep(390, 0.12, "triangle"),
  win: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.25, "sine", 0.09, i * 0.12)),
  draw: () => { beep(300, 0.2, "sawtooth", 0.05); beep(240, 0.3, "sawtooth", 0.05, 0.18); },
  click: () => beep(660, 0.05, "square", 0.04),
};

// ---------- Board rendering ----------
function buildBoard() {
  boardEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.dataset.index = i;
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Cell ${i + 1}, empty`);
    cell.addEventListener("click", () => onCellClick(i));
    boardEl.appendChild(cell);
  }
}

// Animated SVG symbols (strokes are "drawn" via CSS)
function markSVG(player) {
  return player === "X"
    ? `<svg viewBox="0 0 100 100"><path class="mark x" d="M20 20 L80 80"/><path class="mark x" d="M80 20 L20 80"/></svg>`
    : `<svg viewBox="0 0 100 100"><circle class="mark o" cx="50" cy="50" r="31"/></svg>`;
}

function renderCell(i) {
  const cell = boardEl.children[i];
  const v = state.board[i];
  cell.innerHTML = v ? markSVG(v) : "";
  cell.disabled = !!v || !state.active;
  cell.setAttribute("aria-label", `Cell ${i + 1}, ${v || "empty"}`);
}

function updateStatus() {
  if (!state.active) return;
  const cpuTurn = state.mode === "cpu" && state.current === "O";
  statusEl.textContent = cpuTurn ? "Computer is thinking…" : `${playerName(state.current)}'s turn`;
  statusEl.style.color = state.current === "X" ? "var(--x)" : "var(--o)";
  $("scoreXBox").classList.toggle("turn", state.current === "X");
  $("scoreOBox").classList.toggle("turn", state.current === "O");
}

function playerName(p) {
  if (state.mode === "cpu") return p === "X" ? "You" : "Computer";
  return `Player ${p}`;
}

function updateScores(bump) {
  $("scoreX").textContent = state.scores.X;
  $("scoreO").textContent = state.scores.O;
  $("scoreD").textContent = state.scores.D;
  $("nameX").textContent = state.mode === "cpu" ? "You (X)" : "Player X";
  $("nameO").textContent = state.mode === "cpu" ? "Computer (O)" : "Player O";
  if (bump) {
    const el = $(bump === "D" ? "scoreD" : "score" + bump).parentElement;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }
}

// ---------- Core game flow ----------
function startRound() {
  state.board = Array(9).fill(null);
  state.current = state.starter;
  state.active = true;
  state.thinking = false;
  buildBoard();
  updateStatus();
  closeModal("resultModal");
  // If the computer starts this round, let it move
  if (state.mode === "cpu" && state.current === "O") computerTurn();
}

function onCellClick(i) {
  if (!state.active || state.board[i] || state.thinking) return;
  if (state.mode === "cpu" && state.current === "O") return; // not the human's turn
  place(i);
}

function place(i) {
  state.board[i] = state.current;
  sounds[state.current]();
  renderCell(i);

  const line = findWin(state.board);
  if (line) return endRound(state.current, line);
  if (state.board.every(Boolean)) return endRound(null, null);

  state.current = state.current === "X" ? "O" : "X";
  updateStatus();
  if (state.mode === "cpu" && state.current === "O") computerTurn();
}

function findWin(b) {
  return WIN_LINES.find(([a, c, d]) => b[a] && b[a] === b[c] && b[a] === b[d]) || null;
}

function endRound(winner, line) {
  state.active = false;
  state.thinking = false;
  [...boardEl.children].forEach((c) => (c.disabled = true));
  $("scoreXBox").classList.remove("turn");
  $("scoreOBox").classList.remove("turn");
  state.starter = state.starter === "X" ? "O" : "X"; // alternate who starts

  if (winner) {
    line.forEach((i) => boardEl.children[i].classList.add("win"));
    state.scores[winner]++;
    updateScores(winner);
    statusEl.textContent = `${playerName(winner)} wins!`;
    sounds.win();
    setTimeout(() => { confetti(); showResult(winner); }, 900);
  } else {
    state.scores.D++;
    updateScores("D");
    statusEl.textContent = "It's a draw";
    sounds.draw();
    setTimeout(() => showResult(null), 700);
  }
}

// ---------- Result popup ----------
function showResult(winner) {
  const icon = $("resultIcon");
  if (winner) {
    icon.textContent = winner;
    icon.style.color = winner === "X" ? "var(--x)" : "var(--o)";
    icon.style.textShadow = `0 0 30px ${winner === "X" ? "var(--x)" : "var(--o)"}`;
    $("resultTitle").textContent = `${playerName(winner)} ${playerName(winner) === "You" ? "win" : "wins"}!`;
    $("resultText").textContent = "Three in a row. Nicely played.";
  } else {
    icon.textContent = "=";
    icon.style.color = "var(--muted)";
    icon.style.textShadow = "none";
    $("resultTitle").textContent = "It's a draw";
    $("resultText").textContent = "The board is full and nobody got three in a row.";
  }
  openModal("resultModal");
}

function openModal(id) { const m = $(id); m.classList.add("open"); m.setAttribute("aria-hidden", "false"); }
function closeModal(id) { const m = $(id); m.classList.remove("open"); m.setAttribute("aria-hidden", "true"); }

// ---------- Celebration ----------
function confetti() {
  const box = $("confetti");
  const colors = ["#a855f7", "#38bdf8", "#fbbf24", "#6366f1", "#f472b6"];
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 2 + Math.random() * 2 + "s";
    p.style.animationDelay = Math.random() * 0.6 + "s";
    box.appendChild(p);
  }
  setTimeout(() => (box.innerHTML = ""), 5000);
}

/* =====================================================
   Computer AI
   ===================================================== */
function computerTurn() {
  state.thinking = true;
  updateStatus();
  setTimeout(() => {
    if (!state.active) return;
    state.thinking = false;
    place(pickMove());
  }, 550);
}

function emptyCells(b) { return b.map((v, i) => (v ? null : i)).filter((v) => v !== null); }

function pickMove() {
  const b = state.board;
  const empties = emptyCells(b);
  const random = () => empties[Math.floor(Math.random() * empties.length)];

  if (state.difficulty === "easy") return random();                      // pure random
  if (state.difficulty === "medium") {
    // Medium: win if possible, block if needed, otherwise 50% random / 50% smart
    return findFinisher(b, "O") ?? findFinisher(b, "X") ?? (Math.random() < 0.5 ? random() : bestMove(b));
  }
  return bestMove(b);                                                    // hard: perfect play
}

// Find a cell that completes three in a row for `player`
function findFinisher(b, player) {
  for (const i of emptyCells(b)) {
    b[i] = player;
    const wins = !!findWin(b);
    b[i] = null;
    if (wins) return i;
  }
  return null;
}

// Minimax with alpha-beta pruning. Computer = "O" (maximizer), human = "X".
function minimax(b, isMax, depth, alpha, beta) {
  const line = findWin(b);
  if (line) return b[line[0]] === "O" ? 10 - depth : depth - 10; // prefer faster wins / slower losses
  if (b.every(Boolean)) return 0;

  let best = isMax ? -Infinity : Infinity;
  for (const i of emptyCells(b)) {
    b[i] = isMax ? "O" : "X";
    const score = minimax(b, !isMax, depth + 1, alpha, beta);
    b[i] = null;
    if (isMax) { best = Math.max(best, score); alpha = Math.max(alpha, score); }
    else { best = Math.min(best, score); beta = Math.min(beta, score); }
    if (beta <= alpha) break; // prune
  }
  return best;
}

function bestMove(b) {
  let bestScore = -Infinity, move = null;
  for (const i of emptyCells(b)) {
    b[i] = "O";
    const score = minimax(b, false, 1, -Infinity, Infinity);
    b[i] = null;
    if (score > bestScore) { bestScore = score; move = i; }
  }
  return move;
}

/* =====================================================
   UI wiring (menu, controls, modals)
   ===================================================== */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id));
}

// Segmented selectors on the welcome screen
function wireSegment(containerId, attr, key, onChange) {
  $(containerId).addEventListener("click", (e) => {
    const btn = e.target.closest(".seg-btn");
    if (!btn) return;
    $(containerId).querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    state[key] = btn.dataset[attr];
    sounds.click();
    if (onChange) onChange();
  });
}
wireSegment("modeSeg", "mode", "mode", () => $("diffWrap").classList.toggle("hidden", state.mode !== "cpu"));
wireSegment("diffSeg", "diff", "difficulty");

$("startBtn").addEventListener("click", () => {
  state.scores = { X: 0, O: 0, D: 0 };
  state.starter = "X";
  $("modeLabel").textContent = state.mode === "cpu"
    ? `Vs Computer · ${state.difficulty[0].toUpperCase() + state.difficulty.slice(1)}`
    : "Two Players";
  updateScores();
  showScreen("game");
  startRound();
  sounds.click();
});

$("menuBtn").addEventListener("click", () => {
  state.active = false;
  closeModal("resultModal");
  showScreen("welcome");
});

// New Round: keep scores, clear the board
$("newRoundBtn").addEventListener("click", () => { sounds.click(); startRound(); });

// Restart Game: clear board and start over with X (scores are kept)
$("restartBtn").addEventListener("click", () => { sounds.click(); state.starter = "X"; startRound(); });

// Reset Score: confirm first
$("resetBtn").addEventListener("click", () => openModal("confirmModal"));
$("confirmNo").addEventListener("click", () => closeModal("confirmModal"));
$("confirmYes").addEventListener("click", () => {
  state.scores = { X: 0, O: 0, D: 0 };
  updateScores();
  closeModal("confirmModal");
  sounds.click();
});

$("nextBtn").addEventListener("click", startRound);

// Mute toggle
$("muteBtn").addEventListener("click", (e) => {
  state.muted = !state.muted;
  e.currentTarget.textContent = state.muted ? "Sound off" : "Sound on";
  e.currentTarget.setAttribute("aria-pressed", String(state.muted));
  sounds.click();
});

// Close modals with Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeModal("confirmModal"); closeModal("resultModal"); }
});

buildBoard();
