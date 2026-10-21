// =====================================================================
// GD&T Pass or Fail
// Two levels (beginner/advanced), a timer with a speed bonus, a
// difficulty ramp, a best score per level, and a review of every miss.
// =====================================================================

const QUESTIONS_PER_ROUND = 10;
const SPEED_BONUS_MAX = 50;      // points for an instant correct answer
const STREAK_BONUS = 10;         // extra points per question in a streak

let mode = null;        // "beginner" or "advanced"
let question = null;    // the current question
let qIndex = 0;         // 0-based question number in this round
let score = 0;
let streak = 0;
let correct = 0;
let answered = false;
let timer = null;       // setInterval handle
let startedAt = 0;      // when the current question appeared (ms)
let history = [];       // every question this round, for the review

const $ = (id) => document.getElementById(id);

// =====================================================================
// Drawing (SVG)
// =====================================================================
const INK = "#1b2533";
const NOTE = "#6b7d92";
const HALO = `stroke="#fbfaf3" stroke-width="5" stroke-linejoin="round" paint-order="stroke"`;

// GD&T symbols, drawn centered on (cx, cy)
function symbol(name, cx, cy) {
  const s = `stroke="${INK}" stroke-width="1.6" fill="none"`;
  switch (name) {
    case "position":          // circle with a crosshair
      return `<circle cx="${cx}" cy="${cy}" r="7" ${s}/>
              <line x1="${cx - 11}" y1="${cy}" x2="${cx + 11}" y2="${cy}" ${s}/>
              <line x1="${cx}" y1="${cy - 11}" x2="${cx}" y2="${cy + 11}" ${s}/>`;
    case "flatness":          // parallelogram
      return `<polygon points="${cx - 10},${cy + 5} ${cx + 4},${cy + 5} ${cx + 10},${cy - 5} ${cx - 4},${cy - 5}" ${s}/>`;
    case "perpendicularity":  // upside-down T
      return `<line x1="${cx}" y1="${cy - 9}" x2="${cx}" y2="${cy + 7}" ${s}/>
              <line x1="${cx - 9}" y1="${cy + 7}" x2="${cx + 9}" y2="${cy + 7}" ${s}/>`;
    case "profile":           // closed half circle
      return `<path d="M${cx - 10},${cy + 6} A10,10 0 0 1 ${cx + 10},${cy + 6} Z" ${s}/>`;
    case "runout":            // single diagonal arrow
      return `<line x1="${cx - 7}" y1="${cy + 8}" x2="${cx + 4}" y2="${cy - 4}" ${s}/>
              ${arrow(cx + 8, cy - 8, 0.7, -0.7)}`;
    default:
      return "";
  }
}

// A circled modifier letter: Ⓜ (MMC) or Ⓛ (LMC)
function modifier(letter, cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${INK}" stroke-width="1.4"/>
          <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="${INK}">${letter}</text>`;
}

// The feature control frame: a row of boxes, starting at (x, y)
function frameSvg(cells, x, y) {
  const h = 30;
  let out = "";
  let cx = x;
  for (const cell of cells) {
    const textW = cell.text ? cell.text.length * 9 + 16 : 0;
    const w = cell.sym ? 34 : textW + (cell.mod ? 22 : 0);
    out += `<rect x="${cx}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`;
    if (cell.sym) out += symbol(cell.sym, cx + w / 2, y + h / 2);
    if (cell.text) out += `<text x="${cx + 8}" y="${y + 20}" font-size="15" fill="${INK}">${cell.text}</text>`;
    if (cell.mod) out += modifier(cell.mod, cx + textW + 8, y + h / 2);
    cx += w;
  }
  return { svg: out, width: cx - x };
}

// A dimension value. label is a string, a limit dimension {upper, lower},
// or a unilateral tolerance {main, plus, minus}. y is the main baseline.
function dimText(x, y, label, anchor = "start") {
  const t = (tx, ty, size, txt, a = "start") =>
    `<text x="${tx}" y="${ty}" text-anchor="${a}" font-size="${size}" font-weight="600" fill="${INK}" ${HALO}>${txt}</text>`;
  if (typeof label === "string") return t(x, y, 16, label, anchor);
  if (label.upper) return t(x, y - 10, 15, label.upper, anchor) + t(x, y + 8, 15, label.lower, anchor);
  // Unilateral: main number, then the two tolerances stacked
  const mainW = label.main.length * 9.6, gap = 5;
  const tolW = Math.max(label.plus.length, label.minus.length) * 7.2;
  const x0 = anchor === "middle" ? x - (mainW + gap + tolW) / 2 : x;
  return t(x0, y, 16, label.main) + t(x0 + mainW + gap, y - 7, 12, label.plus) + t(x0 + mainW + gap, y + 6, 12, label.minus);
}

// Small filled arrowhead pointing in direction (dx, dy) with its tip at (x, y)
function arrow(x, y, dx, dy) {
  const px = -dy, py = dx;
  return `<polygon points="${x},${y} ${x - dx * 9 + px * 3.5},${y - dy * 9 + py * 3.5} ${x - dx * 9 - px * 3.5},${y - dy * 9 - py * 3.5}" fill="${INK}"/>`;
}

// A leader line from (x1, y1) to an arrowhead at (x2, y2)
function leader(x1, y1, x2, y2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="1.2"/>
          ${arrow(x2, y2, (x2 - x1) / len, (y2 - y1) / len)}`;
}

// Datum feature symbol: a boxed letter attached to an edge with a filled triangle
function datum(letter, x, y, side) {
  if (side === "down") {
    return `<polygon points="${x - 7},${y} ${x + 7},${y} ${x},${y + 10}" fill="${INK}"/>
            <line x1="${x}" y1="${y + 10}" x2="${x}" y2="${y + 18}" stroke="${INK}" stroke-width="1.4"/>
            <rect x="${x - 11}" y="${y + 18}" width="22" height="22" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
            <text x="${x}" y="${y + 34}" text-anchor="middle" font-size="14" fill="${INK}">${letter}</text>`;
  }
  return `<polygon points="${x},${y - 7} ${x},${y + 7} ${x - 10},${y}" fill="${INK}"/>
          <line x1="${x - 10}" y1="${y}" x2="${x - 18}" y2="${y}" stroke="${INK}" stroke-width="1.4"/>
          <rect x="${x - 40}" y="${y - 11}" width="22" height="22" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
          <text x="${x - 29}" y="${y + 5}" text-anchor="middle" font-size="14" fill="${INK}">${letter}</text>`;
}

// Horizontal basic dimension from x1 to x2 at height y, with extension lines
function basicDimH(x1, x2, y, extFrom, label) {
  return `<line x1="${x2}" y1="${extFrom}" x2="${x2}" y2="${y + 6}" stroke="${INK}" stroke-width="0.8"/>
          <line x1="${x1}" y1="235" x2="${x1}" y2="${y + 6}" stroke="${INK}" stroke-width="0.8"/>
          <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${INK}" stroke-width="0.9"/>
          ${arrow(x1, y, -1, 0)}${arrow(x2, y, 1, 0)}
          <rect x="${(x1 + x2) / 2 - 24}" y="${y - 9}" width="48" height="18" fill="#fff" stroke="${INK}"/>
          <text x="${(x1 + x2) / 2}" y="${y + 4}" text-anchor="middle" font-size="12" fill="${INK}">${label}</text>`;
}

// Vertical basic dimension from y1 to y2 at x, with extension lines
function basicDimV(y1, y2, x, extFrom, label) {
  return `<line x1="${extFrom}" y1="${y1}" x2="${x - 6}" y2="${y1}" stroke="${INK}" stroke-width="0.8"/>
          <line x1="90" y1="${y2}" x2="${x - 6}" y2="${y2}" stroke="${INK}" stroke-width="0.8"/>
          <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${INK}" stroke-width="0.9"/>
          ${arrow(x, y1, 0, -1)}${arrow(x, y2, 0, 1)}
          <rect x="${x - 22}" y="${(y1 + y2) / 2 - 9}" width="44" height="18" fill="#fff" stroke="${INK}"/>
          <text x="${x}" y="${(y1 + y2) / 2 + 4}" text-anchor="middle" font-size="12" fill="${INK}">${label}</text>`;
}

// The title block on beginner drawings
function titleBlock() {
  const line = (y, txt, bold) => `<text x="380" y="${y}" font-size="10" ${bold ? 'font-weight="700"' : ""} fill="${INK}">${txt}</text>`;
  return `<rect x="370" y="186" width="182" height="96" fill="#fff" stroke="${INK}" stroke-width="1.4"/>
          ${line(201, "UNLESS OTHERWISE SPECIFIED", true)}
          <line x1="370" y1="207" x2="552" y2="207" stroke="${INK}" stroke-width="0.8"/>
          ${line(222, "DIMENSIONS IN INCHES")}
          ${line(237, "TOLERANCES:")}
          ${line(251, "  .XX  ±.01")}
          ${line(264, "  .XXX ±.005")}
          ${line(277, "  ANGLES ±1°")}`;
}

const footNote = (txt, y = 282) =>
  `<text x="552" y="${y}" text-anchor="end" font-size="10" fill="${NOTE}">${txt}</text>`;

// The whole drawing
function drawingSvg(d, beginner) {
  let body = "";
  const centerline = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="10 3 2 3"/>`;

  switch (d.feature) {
    case "surface": {   // side view of a block, frame on the top surface
      body += `<rect x="90" y="120" width="300" height="90" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>
               <line x1="330" y1="70" x2="330" y2="120" stroke="${INK}" stroke-width="1.2"/>
               ${arrow(330, 120, 0, 1)}
               ${frameSvg(d.frame, 260, 40).svg}
               <text x="90" y="235" font-size="12" fill="${NOTE}">SIDE VIEW</text>`;
      break;
    }

    case "block": {     // side view of a block with an overall length dimension
      body += `<rect x="60" y="90" width="260" height="80" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>
               <line x1="60" y1="174" x2="60" y2="252" stroke="${INK}" stroke-width="0.8"/>
               <line x1="320" y1="174" x2="320" y2="252" stroke="${INK}" stroke-width="0.8"/>
               <line x1="60" y1="246" x2="320" y2="246" stroke="${INK}" stroke-width="0.9"/>
               ${arrow(60, 246, -1, 0)}${arrow(320, 246, 1, 0)}
               ${dimText(190, typeof d.dim === "string" ? 236 : d.dim.upper ? 228 : 234, d.dim, "middle")}`;
      break;
    }

    case "wedge": {     // a wedge with its angle dimensioned at the left corner
      const th = d.angle * Math.PI / 180, vx = 60, vy = 220, r = 52;
      const L = Math.min(260, 150 / Math.tan(th));
      const ex = vx + r * Math.cos(th), ey = vy - r * Math.sin(th);
      body += `<polygon points="${vx},${vy} ${vx + L},${vy} ${vx + L},${vy - L * Math.tan(th)}" fill="#eef1f5" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
               <path d="M${vx + r},${vy} A${r},${r} 0 0 0 ${ex},${ey}" fill="none" stroke="${INK}" stroke-width="0.9"/>
               ${arrow(vx + r, vy, 0, 1)}${arrow(ex, ey, -Math.sin(th), -Math.cos(th))}
               ${dimText(vx + 70 * Math.cos(th / 2), vy - 70 * Math.sin(th / 2) + 6, d.dim)}`;
      break;
    }

    case "radius": {    // a block with a rounded corner
      body += `<path d="M60,200 L320,200 L320,150 A50,50 0 0 0 270,100 L60,100 Z" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>
               <line x1="264" y1="150" x2="276" y2="150" stroke="${INK}" stroke-width="0.8"/>
               <line x1="270" y1="144" x2="270" y2="156" stroke="${INK}" stroke-width="0.8"/>
               ${leader(345, 79, 306, 115)}
               ${dimText(340, 72, d.dim)}`;
      break;
    }

    case "profile": {   // side view with a curved top surface
      body += `<path d="M90,220 L90,150 Q250,70 410,150 L410,220 Z" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>
               <line x1="330" y1="70" x2="330" y2="111" stroke="${INK}" stroke-width="1.2"/>
               ${arrow(330, 120, 0, 1)}
               ${frameSvg(d.frame, 260, 40).svg}
               ${datum("A", 250, 220, "down")}${datum("B", 90, 190, "left")}`;
      break;
    }

    case "shaft": {     // a stepped shaft; datum A is the large diameter
      body += `<rect x="90" y="110" width="160" height="110" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>
               <rect x="250" y="135" width="170" height="60" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>
               ${centerline(70, 165, 440, 165)}
               ${datum("A", 170, 220, "down")}
               <line x1="345" y1="80" x2="345" y2="126" stroke="${INK}" stroke-width="1.2"/>
               ${arrow(345, 135, 0, 1)}
               ${frameSvg(d.frame, 300, 50).svg}`;
      break;
    }

    case "pin-side": {  // side view of a plate with a pin standing up
      body += `<rect x="90" y="175" width="320" height="60" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>
               <rect x="230" y="85" width="40" height="90" fill="#b7c3d1" stroke="${INK}" stroke-width="2"/>
               ${centerline(250, 70, 250, 190)}
               ${datum("A", 340, 235, "down")}
               ${leader(300, 77, 272, 105)}
               ${dimText(300, 54, d.size + " PIN")}
               ${frameSvg(d.frame, 300, 62).svg}`;
      break;
    }

    default: {          // "hole" or "pin": top view of a plate
      const isPin = d.feature === "pin";
      const gdt = !!d.frame;
      const cx = gdt ? 230 : 190, cy = 165;
      const px = gdt ? 90 : 60, pw = gdt ? 290 : 260;
      const tx = cx + 70;                         // where the callout text starts
      body += `<rect x="${px}" y="95" width="${pw}" height="140" fill="#eef1f5" stroke="${INK}" stroke-width="2"/>`;
      body += isPin
        ? `<circle cx="${cx}" cy="${cy}" r="22" fill="#b7c3d1" stroke="${INK}" stroke-width="2"/>
           <circle cx="${cx}" cy="${cy}" r="14" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 3"/>`
        : `<circle cx="${cx}" cy="${cy}" r="22" fill="#fff" stroke="${INK}" stroke-width="2"/>`;
      body += centerline(cx - 32, cy, cx + 32, cy) + centerline(cx, cy - 32, cx, cy + 32);

      if (gdt) {
        body += datum("B", 330, 235, "down") + datum("C", 90, 120, "left");
        body += basicDimH(90, cx, 262, cy + 32, "1.500") + basicDimV(cy, 235, 52, cx - 32, ".750");
        body += footNote("DATUM A = FACE OF PLATE", 268);
      }
      body += leader(tx, 64, cx + 16, cy - 16);
      body += dimText(tx, 54, typeof d.size === "string" && isPin ? d.size + " PIN" : d.size);
      if (gdt) body += frameSvg(d.frame, tx, 62).svg;
    }
  }

  body += beginner ? titleBlock() : footNote("DIMS IN INCHES");
  return `<svg viewBox="0 0 560 290" xmlns="http://www.w3.org/2000/svg" font-family="IBM Plex Mono, Consolas, monospace">${body}</svg>`;
}

// =====================================================================
// Saved best scores (per mode)
// =====================================================================
function getBest(m) {
  try { return Number(localStorage.getItem("gdt-best-" + m)) || 0; } catch { return 0; }
}
function setBest(m, v) {
  try { localStorage.setItem("gdt-best-" + m, String(v)); } catch { /* storage blocked: fine */ }
}

// =====================================================================
// Timer
// =====================================================================
function secondsLeft() {
  const limit = MODES[mode].seconds;
  return Math.max(0, limit - (performance.now() - startedAt) / 1000);
}

function startTimer() {
  stopTimer();
  startedAt = performance.now();
  $("timeFill").classList.remove("low");
  timer = setInterval(tick, 100);
  tick();
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

function tick() {
  const left = secondsLeft();
  const frac = left / MODES[mode].seconds;
  $("time").textContent = Math.ceil(left);
  $("timeFill").style.width = (frac * 100) + "%";
  $("timeFill").classList.toggle("low", frac < 0.25);
  if (left <= 0) answer(null);          // time's up
}

// =====================================================================
// Game flow
// =====================================================================
function newQuestion() {
  // Pick from this question's tier, avoiding the same type twice in a row
  const tier = MODES[mode].tiers[tierFor(qIndex)];
  const lastType = question ? question.type : null;
  for (let tries = 0; tries < 8; tries++) {
    question = pick(tier)();
    if (question.type !== lastType) break;
  }
  answered = false;

  $("qNum").textContent = qIndex + 1;
  $("qType").textContent = question.type;
  $("drawing").innerHTML = drawingSvg(question.drawing, mode === "beginner");
  $("reportTable").innerHTML = question.report
    .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join("");

  for (const b of [$("passBtn"), $("failBtn")]) { b.disabled = false; b.classList.remove("chosen"); }
  $("verdict").classList.add("hidden");
  startTimer();
}

// saysPass: true, false, or null if the time ran out
function answer(saysPass) {
  if (answered) return;
  answered = true;
  stopTimer();

  const timedOut = saysPass === null;
  const right = !timedOut && saysPass === question.pass;
  let pointsLine = "";
  if (right) {
    streak++;
    correct++;
    const speed = Math.round(SPEED_BONUS_MAX * secondsLeft() / MODES[mode].seconds);
    const streakPts = STREAK_BONUS * (streak - 1);
    score += 100 + speed + streakPts;
    pointsLine = `+100 correct · +${speed} speed${streakPts ? ` · +${streakPts} streak` : ""}`;
  } else {
    streak = 0;
    pointsLine = timedOut ? "Out of time: no points, streak reset" : "No points, streak reset";
  }

  $("passBtn").disabled = true;
  $("failBtn").disabled = true;
  if (!timedOut) (saysPass ? $("passBtn") : $("failBtn")).classList.add("chosen");

  const verdictWord = question.pass ? "PASS" : "FAIL";
  $("score").textContent = score;
  $("streak").textContent = streak;
  $("verdict").className = "verdict " + (right ? "right" : "wrong");
  $("verdictTitle").textContent = timedOut ? `⏱ Time's up. It's a ${verdictWord}.`
    : right ? `✔ Correct, it's a ${verdictWord}.` : `✘ Not quite, it's a ${verdictWord}.`;
  $("points").textContent = pointsLine;
  $("verdictBody").innerHTML = question.explain;
  history.push({ q: question, right, timedOut });
  $("nextLabel").textContent = qIndex + 1 < QUESTIONS_PER_ROUND ? "Next question →" : "See results →";
  $("nextBtn").focus({ preventScroll: true });
}

function next() {
  if (!answered || qIndex >= QUESTIONS_PER_ROUND) return;
  qIndex++;
  if (qIndex >= QUESTIONS_PER_ROUND) return showSummary();
  newQuestion();
}

function showSummary() {
  $("verdict").classList.add("hidden");
  document.querySelector(".question").classList.add("hidden");
  $("summary").classList.remove("hidden");
  $("game").classList.add("done");

  const best = getBest(mode);
  const newBest = score > best;
  if (newBest) setBest(mode, score);

  const g = grade(correct);
  $("grade").textContent = g.letter;
  $("grade").className = "grade " + g.cls;
  $("gradeNote").textContent = g.note;
  $("summaryText").innerHTML = `${MODES[mode].name}: <b>${correct} / ${QUESTIONS_PER_ROUND}</b> correct,
    <b>${score}</b> points. ${newBest ? "🏆 New best score!" : `Best: ${best}`}`;

  // One row per question; the misses open up to show the worked answer again
  $("review").innerHTML = history.map((h, i) => {
    const mark = h.right ? "✔" : h.timedOut ? "⏱" : "✘";
    const head = `<span class="mark ${h.right ? "ok" : "bad"}">${mark}</span>
      <span class="rq">Q${i + 1}</span> ${h.q.type}
      <span class="ans">${h.q.pass ? "PASS" : "FAIL"}</span>`;
    return h.right
      ? `<div class="review-row">${head}</div>`
      : `<details class="review-row"><summary>${head}</summary><p>${h.q.explain}</p></details>`;
  }).join("");
  $("reviewTitle").textContent = correct === QUESTIONS_PER_ROUND
    ? "Perfect round. Nothing to review." : "Your round (click a miss to see the answer)";
}

// Letter grade from the number correct out of 10
function grade(n) {
  if (n === 10) return { letter: "A+", cls: "a", note: "Ready to sign off the first article." };
  if (n === 9) return { letter: "A", cls: "a", note: "Sharp eyes. The inspection lab wants you." };
  if (n === 8) return { letter: "B", cls: "b", note: "Solid. Review the misses below." };
  if (n === 7) return { letter: "C", cls: "c", note: "Getting there. Check the traps you fell for." };
  if (n >= 5) return { letter: "D", cls: "d", note: "A coin flip gets 5. Read the explanations below." };
  return { letter: "F", cls: "f", note: "Rough round. Every miss below shows the math." };
}

function startRound(m) {
  mode = m || mode;
  qIndex = 0; score = 0; streak = 0; correct = 0; question = null; history = [];
  $("menu").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("modeName").textContent = MODES[mode].name;
  $("score").textContent = 0;
  $("streak").textContent = 0;
  $("qTotal").textContent = QUESTIONS_PER_ROUND;
  $("summary").classList.add("hidden");
  document.querySelector(".question").classList.remove("hidden");
  $("game").classList.remove("done");
  newQuestion();
}

function showMenu() {
  stopTimer();
  answered = true;                 // ignore P/F keys on the menu
  $("game").classList.add("hidden");
  $("menu").classList.remove("hidden");
  for (const m of Object.keys(MODES)) {
    const b = getBest(m);
    $("best-" + m).textContent = b ? b : "–";
  }
}

// =====================================================================
// Buttons and keys
// =====================================================================
document.querySelectorAll(".mode-card").forEach((b) =>
  b.addEventListener("click", () => startRound(b.dataset.mode)));
$("passBtn").addEventListener("click", () => answer(true));
$("failBtn").addEventListener("click", () => answer(false));
$("nextBtn").addEventListener("click", next);
$("againBtn").addEventListener("click", () => startRound());
$("menuBtn").addEventListener("click", showMenu);
$("quitBtn").addEventListener("click", showMenu);
document.addEventListener("keydown", (e) => {
  if ($("game").classList.contains("hidden")) return;
  const k = e.key.toLowerCase();
  if (k === "p") answer(true);
  if (k === "f") answer(false);
  if (k === "enter") { e.preventDefault(); next(); }
});

showMenu();
