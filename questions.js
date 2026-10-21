// =====================================================================
// GD&T Pass or Fail -- question generators
//
// Each generator makes a random question and returns:
//   type:     short name of the question type
//   drawing:  what to draw (feature, dimension or callout, frame)
//   report:   rows of the inspection report: [label, value]
//   pass:     the correct answer (true = PASS)
//   explain:  the worked answer, as HTML
//
// Units are inches. All math is done in ten-thousandths of an inch
// (whole numbers), so rounding can never flip an answer.
// .5050" is stored as 5050. Angles are done in whole arc-minutes.
//
// A dimension label on the drawing is either a plain string
// ("2.500 ±.010"), a limit dimension {upper, lower}, or a unilateral
// tolerance {main, plus, minus}.
// =====================================================================

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));   // inclusive
const coin = (p = 0.5) => Math.random() < p;

// Format inches the way prints do: no leading zero.
// 5050 -> ".5050" (4 places, for measurements) or ".505" (3 places, for the drawing)
// 12500 -> "1.2500",  -21 -> "-.0021"
function inch(tenths, places = 4) {
  const sign = tenths < 0 ? "-" : "";
  let s = (Math.abs(tenths) / 10000).toFixed(places);
  if (s.startsWith("0.")) s = s.slice(1);
  return sign + s;
}
// Signed deviation for the report: 21 -> "+.0021"
function dev(tenths) {
  return (tenths >= 0 ? "+" : "") + inch(tenths);
}

// Angles. 2730 minutes -> "45.50°" (measured), 30 -> "0°30'" (tolerance)
const degDecimal = (min) => (min / 60).toFixed(2) + "°";
function degMin(min) {
  const d = Math.floor(min / 60), m = min % 60;
  return m ? `${d}°${String(m).padStart(2, "0")}'` : `${d}°`;
}

// Diameter of the position zone a hole center actually uses:
// 2 x the distance from true position, rounded to the nearest .0001.
// A value squared, for the worked math: -3 -> "(-.0003)²"
const sq = (t) => (t < 0 ? `(${inch(t)})` : inch(t)) + "²";

function positionalDia(dx, dy) {
  return Math.round(2 * Math.sqrt(dx * dx + dy * dy));
}

// A measured value for a size between lo and hi: half the time inside
// (often close to a limit, so you have to actually compare), half the
// time just outside, by .0005" to .0030".
function nearLimits(lo, hi) {
  const band = Math.max(10, Math.round((hi - lo) * 0.3));
  if (coin()) {
    if (coin()) return randInt(lo + 5, hi - 5);
    return coin() ? randInt(hi - band, hi - 5) : randInt(lo + 5, lo + band);
  }
  return coin() ? hi + randInt(5, 30) : lo - randInt(5, 30);
}

// The standard "compare to the limits" answer
function limitsExplain(how, lo, hi, actual, prefix = "") {
  const pass = actual >= lo && actual <= hi;
  const by = actual > hi ? actual - hi : lo - actual;
  return `${how}<br>
    Limits: <b>${prefix}${inch(lo)}</b> to <b>${prefix}${inch(hi)}</b>.
    Measured ${prefix}${inch(actual)} is ${pass ? "inside" : `<b>outside</b> by ${inch(by)}`},
    so it ${pass ? "passes" : "fails"}.`;
}

// The title block printed on every beginner drawing
const TITLE_BLOCK = { twoPlace: 100, threePlace: 50, angleMin: 60 };   // ±.01, ±.005, ±1°

// =====================================================================
// BEGINNER: reading dimensions and tolerances
// =====================================================================

// Linear dimension, plus or minus
function bLinear() {
  const nominal = pick([10000, 12500, 15000, 20000, 25000, 30000]);   // 1.000" to 3.000"
  const tol = pick([50, 100, 150]);                                    // ±.005 to ±.015
  const lo = nominal - tol, hi = nominal + tol;
  const actual = nearLimits(lo, hi);
  return {
    type: "Linear dimension",
    drawing: { feature: "block", dim: `${inch(nominal, 3)} ±${inch(tol, 3)}` },
    report: [["Feature", "Overall length"], ["Measured length", inch(actual)]],
    pass: actual >= lo && actual <= hi,
    explain: limitsExplain(`${inch(nominal, 3)} ±${inch(tol, 3)} means ${inch(nominal, 3)} − ${inch(tol, 3)}
      up to ${inch(nominal, 3)} + ${inch(tol, 3)}.`, lo, hi, actual),
  };
}

// Diameter of a hole or pin, plus or minus
function bDiameter() {
  const nominal = pick([2500, 3750, 5000, 6250, 7500, 10000]);   // .250" to 1.000"
  const tol = pick([30, 50, 100]);                                // ±.003 to ±.010
  const lo = nominal - tol, hi = nominal + tol;
  const isHole = coin();
  const actual = nearLimits(lo, hi);
  return {
    type: "Diameter",
    drawing: { feature: isHole ? "hole" : "pin", size: `Ø${inch(nominal, 3)} ±${inch(tol, 3)}` },
    report: [["Feature", isHole ? "Hole" : "Pin"], ["Measured diameter", `Ø${inch(actual)}`]],
    pass: actual >= lo && actual <= hi,
    explain: limitsExplain(`<b>Ø</b> means diameter. Ø${inch(nominal, 3)} ±${inch(tol, 3)} allows
      ${inch(tol, 3)} either way.`, lo, hi, actual, "Ø"),
  };
}

// Limit dimension: the two limits written directly, larger on top
function bLimit() {
  const isHole = coin(0.4);
  const nominal = isHole ? pick([2500, 3750, 5000]) : pick([10000, 15000, 20000, 25000]);
  const span = pick([50, 100]);
  const lo = nominal, hi = nominal + span;
  const actual = nearLimits(lo, hi);
  const p = isHole ? "Ø" : "";
  return {
    type: "Limit dimension",
    drawing: isHole
      ? { feature: "hole", size: { upper: `Ø${inch(hi, 3)}`, lower: `Ø${inch(lo, 3)}` } }
      : { feature: "block", dim: { upper: inch(hi, 3), lower: inch(lo, 3) } },
    report: [["Feature", isHole ? "Hole" : "Overall length"], [isHole ? "Measured diameter" : "Measured length", p + inch(actual)]],
    pass: actual >= lo && actual <= hi,
    explain: limitsExplain(`A <b>limit dimension</b> gives the two limits directly: the larger
      one on top, the smaller one underneath. No math needed.`, lo, hi, actual, p),
  };
}

// Unilateral tolerance: all the tolerance on one side (+.002/−.000)
function bUnilateral() {
  const isHole = coin();
  const nominal = isHole ? pick([2500, 3750, 5000, 6250]) : pick([10000, 15000, 20000]);
  const tol = isHole ? pick([10, 20, 30]) : pick([50, 100]);
  const plusSide = isHole ? coin(0.8) : coin();     // reamed holes are usually +/−.000
  const lo = plusSide ? nominal : nominal - tol;
  const hi = plusSide ? nominal + tol : nominal;
  // Often the trap: just past the ".000" side
  const r = Math.random();
  let actual;
  if (r < 0.3) actual = plusSide ? nominal - randInt(5, 15) : nominal + randInt(5, 15);
  else if (r < 0.6) actual = nearLimits(lo, hi);
  else actual = randInt(lo + 3, hi - 3);
  const p = isHole ? "Ø" : "";
  const label = {
    main: p + inch(nominal, 3),
    plus: plusSide ? `+${inch(tol, 3)}` : "+.000",
    minus: plusSide ? "−.000" : `−${inch(tol, 3)}`,
  };
  return {
    type: "Unilateral tolerance",
    drawing: isHole ? { feature: "hole", size: label } : { feature: "block", dim: label },
    report: [["Feature", isHole ? "Hole" : "Overall length"], [isHole ? "Measured diameter" : "Measured length", p + inch(actual)]],
    pass: actual >= lo && actual <= hi,
    explain: limitsExplain(`A <b>unilateral</b> tolerance only goes one way. ${label.plus} / ${label.minus}
      means the size can ${plusSide ? "grow" : "shrink"} by ${inch(tol, 3)}, but can't go
      ${plusSide ? "under" : "over"} ${p}${inch(nominal, 3)} at all.`, lo, hi, actual, p),
  };
}

// Radius, plus or minus
function bRadius() {
  const nominal = pick([1250, 2500, 3750, 5000]);   // R.125 to R.500
  const tol = pick([50, 100]);
  const lo = nominal - tol, hi = nominal + tol;
  const actual = nearLimits(lo, hi);
  return {
    type: "Radius",
    drawing: { feature: "radius", dim: `R${inch(nominal, 3)} ±${inch(tol, 3)}` },
    report: [["Feature", "Corner radius"], ["Measured radius", `R${inch(actual)}`]],
    pass: actual >= lo && actual <= hi,
    explain: limitsExplain(`<b>R</b> means radius: half a diameter, measured from the center of the arc
      to its edge. Don't double it; compare the radius to the radius.`, lo, hi, actual, "R"),
  };
}

// No tolerance on the dimension: it comes from the title block,
// and the number of decimal places decides which line applies.
function bTitleBlock() {
  const nominal = pick([10000, 12500, 15000, 17500, 20000, 25000]);
  const places = coin() ? 2 : 3;
  const tol = places === 2 ? TITLE_BLOCK.twoPlace : TITLE_BLOCK.threePlace;
  const lo = nominal - tol, hi = nominal + tol;
  // Often the trap: off by .0055 to .0095, which passes ±.01 but fails ±.005
  const actual = coin(0.55)
    ? nominal + (coin() ? 1 : -1) * randInt(55, 95)
    : nearLimits(lo, hi);
  const shown = inch(nominal, places);
  return {
    type: "Title block tolerance",
    drawing: { feature: "block", dim: shown },
    report: [["Feature", "Overall length"], ["Measured length", inch(actual)]],
    pass: actual >= lo && actual <= hi,
    explain: limitsExplain(`There's no tolerance on the dimension, so it comes from the
      <b>title block</b>. ${shown} has <b>${places} decimal places</b>, so the
      <b>${places === 2 ? ".XX ±.01" : ".XXX ±.005"}</b> line applies.
      ${places === 2 ? "(If it were written 2.500, it would only get ±.005.)" : "(Written with two places, it would get ±.01. The extra zero matters.)"}`,
      lo, hi, actual),
  };
}

// Angle, with the tolerance in degrees, in minutes, or from the title block
function bAngle() {
  const nominal = pick([30, 45, 60]) * 60;            // in minutes
  const style = pick(["deg", "min", "min", "title"]);
  const tolMin = style === "min" ? 30 : 60;
  // Offsets are multiples of 3 minutes so the decimal display is exact
  const out = coin();
  const off = out
    ? 3 * randInt(Math.ceil((tolMin + 6) / 3), Math.floor((tolMin + 42) / 3))
    : 3 * randInt(0, Math.floor((tolMin - 6) / 3));
  const actual = nominal + (coin() ? off : -off);
  const pass = Math.abs(actual - nominal) <= tolMin;
  const lo = nominal - tolMin, hi = nominal + tolMin;

  let how;
  if (style === "title") how = `No tolerance on the angle, so the title block's <b>ANGLES ±1°</b> applies.`;
  else if (style === "min") how = `The ' symbol means <b>minutes</b>, and there are 60 minutes in a degree.
      So ±0°30' is ±<b>0.50°</b>, not ±0.30°.`;
  else how = `${degMin(nominal)} ±1° allows one degree either way.`;

  return {
    type: "Angle",
    drawing: { feature: "wedge", angle: nominal / 60, dim: style === "title" ? `${degMin(nominal)}` : `${degMin(nominal)} ±${degMin(tolMin)}` },
    report: [["Feature", "Angled face"], ["Measured angle", degDecimal(actual)]],
    pass,
    explain: `${how}<br>Limits: <b>${degDecimal(lo)}</b> to <b>${degDecimal(hi)}</b>.
      Measured ${degDecimal(actual)} is ${pass ? "inside" : "<b>outside</b>"}, so it ${pass ? "passes" : "fails"}.`,
  };
}

// =====================================================================
// ADVANCED: geometric tolerances
// =====================================================================

// Flatness
function qFlatness() {
  const tol = pick([10, 20, 30, 50]);                // .001" to .005"
  // Usually close to the limit, so the player has to actually compare
  const measured = coin() ? randInt(Math.round(tol * 0.5), tol - 3) : randInt(tol + 3, Math.round(tol * 1.5));
  const pass = measured <= tol;
  return {
    type: "Flatness",
    drawing: { feature: "surface", frame: [{ sym: "flatness" }, { text: inch(tol, 3) }] },
    report: [["Feature", "Top surface"], ["Flatness (highest − lowest point)", inch(measured)]],
    pass,
    explain: `Flatness ${inch(tol)} means every point on the surface must lie between two parallel
      planes ${inch(tol)} apart. The surface measured ${inch(measured)}: ${pass ? "within" : "<b>more than</b>"}
      the ${inch(tol)} zone, so it ${pass ? "passes" : "fails"}. Flatness has no datum: it only
      compares the surface to itself.`,
  };
}

// Position, regardless of feature size (no modifier)
function qPositionRFS() {
  const nominal = pick([2500, 3750, 5000]);
  const lo = nominal, hi = nominal + 50;              // e.g. Ø.250–.255
  const T = pick([50, 100, 140, 200]);                // Ø.005 to Ø.020
  const actual = randInt(lo + 5, hi - 5);

  // Three flavors: clearly in, clearly out, or the classic trap where
  // X and Y each look fine (under half the zone) but the diameter fails.
  let dx, dy, d;
  const flavor = pick(["in", "in", "out", "trap"]);
  do {
    let r;
    let angle;
    if (flavor === "in") { r = T / 2 * (0.4 + Math.random() * 0.5); angle = Math.random() * 2 * Math.PI; }
    else if (flavor === "out") { r = T / 2 * (1.15 + Math.random() * 0.4); angle = Math.random() * 2 * Math.PI; }
    else { r = T / 2 * (1.08 + Math.random() * 0.28); angle = Math.PI / 4 + (Math.random() - 0.5) * 0.4 + Math.PI / 2 * randInt(0, 3); }
    dx = Math.round(r * Math.cos(angle));
    dy = Math.round(r * Math.sin(angle));
    d = positionalDia(dx, dy);
  } while (Math.abs(d - T) < 4);              // never too close to call

  const pass = d <= T;
  const trapNote = (!pass && Math.abs(dx) <= T / 2 && Math.abs(dy) <= T / 2)
    ? `<br><br>⚠️ <b>The trap:</b> X and Y are each under ${inch(T / 2)}, so it looks fine if you
       think of a ±${inch(T / 2)} square. But a <b>Ø</b> position zone is a <b>circle</b>, and the
       corners of the square are outside it.` : "";
  return {
    type: "Position (RFS)",
    drawing: { feature: "hole", size: `Ø${inch(lo, 3)}–${inch(hi, 3)}`, frame: [{ sym: "position" }, { text: `Ø${inch(T, 3)}` }, { text: "A" }, { text: "B" }, { text: "C" }] },
    report: [["Measured size", `Ø${inch(actual)}`], ["X deviation from true position", dev(dx)], ["Y deviation from true position", dev(dy)]],
    pass,
    explain: `Size Ø${inch(actual)} is within Ø${inch(lo)}–${inch(hi)} ✔.<br>
      Positional error = 2 × √(X² + Y²) = 2 × √(${sq(dx)} + ${sq(dy)}) = <b>Ø${inch(d)}</b>.<br>
      No modifier means no bonus tolerance, so the zone is Ø${inch(T)}.
      Ø${inch(d)} ${pass ? "≤" : "<b>&gt;</b>"} Ø${inch(T)}, so it ${pass ? "passes" : "fails"}.${trapNote}`,
  };
}

// The bonus math shared by position at MMC/LMC and perpendicularity at MMC.
//   isHole: hole or pin.   mod: "M" (MMC) or "L" (LMC)
// Returns the size limits, the measured size, the bonus, and a short
// explanation of where the bonus came from.
function bonusSetup(isHole, mod, T) {
  const nominal = pick([2500, 3750, 5000, 6250]);
  const span = pick([50, 100, 150]);                 // .005" to .015" of size tolerance
  const lo = nominal, hi = nominal + span;

  // MMC = the most material (smallest hole, largest pin). LMC = the least.
  const cond = mod === "M" ? (isHole ? lo : hi) : (isHole ? hi : lo);
  const condName = mod === "M" ? "MMC" : "LMC";

  // Usually in size; sometimes out of size (the size trap).
  // With a zero tolerance, stay well away from MMC so there's bonus to work with.
  const sizeTrap = T > 0 && coin(0.18);
  let actual;
  if (sizeTrap) actual = coin() ? hi + randInt(5, 25) : lo - randInt(5, 25);
  else if (T === 0) actual = isHole ? randInt(lo + 30, hi - 5) : randInt(lo + 5, hi - 30);
  else actual = randInt(lo + 5, hi - 5);
  const inSize = actual >= lo && actual <= hi;
  const bonus = inSize ? Math.abs(actual - cond) : 0;

  const feat = isHole ? "hole" : "pin";
  const bigger = actual >= cond ? `${inch(actual)} − ${inch(cond)}` : `${inch(cond)} − ${inch(actual)}`;
  const condWhy = `For a <b>${feat}</b>, ${condName} is the <b>${(mod === "M") === isHole ? "smallest" : "largest"}</b>
    size: Ø${inch(cond)}.<br>Bonus = how far the size has moved from ${condName} = ${bigger} = <b>${inch(bonus)}</b>.<br>`;
  const sizeFail = `<b>Check size first.</b> Size limits are Ø${inch(lo)}–${inch(hi)}, and the ${feat}
    measured Ø${inch(actual)}: <b>out of size</b>. It fails no matter what the
    geometric tolerance measured. Bonus tolerance only exists for a feature that's within its size limits.`;
  return { lo, hi, actual, inSize, bonus, cond, condName, feat, condWhy, sizeFail, sizeTrap };
}

// Pick a measured geometric error d that makes an interesting question:
// clearly in, in only thanks to the bonus, or out.
function pickError(T, bonus, allowed, forceIn) {
  let flavor = forceIn ? "in" : pick(["bonus", "bonus", "out", "in"]);
  if (flavor === "bonus" && bonus < 20) flavor = pick(["in", "out"]);   // not enough bonus to matter
  if (flavor === "in" && allowed < 12) flavor = "out";
  if (T === 0 && flavor === "in") flavor = "bonus";
  return flavor;
}

// Position at MMC or LMC, for a hole or a pin
function qPositionMod(isHole, mod) {
  const T = pick([50, 100, 140]);                    // Ø.005 to Ø.014
  const s = bonusSetup(isHole, mod, T);
  const allowed = T + s.bonus;

  let dx, dy, d;
  const flavor = pickError(T, s.bonus, allowed, s.sizeTrap);
  do {
    let target;
    if (flavor === "in") target = T * (0.4 + Math.random() * 0.5);
    else if (flavor === "bonus") target = T + s.bonus * (0.2 + Math.random() * 0.7);
    else target = allowed * (1.08 + Math.random() * 0.3);
    const angle = Math.random() * 2 * Math.PI;
    dx = Math.round(target / 2 * Math.cos(angle));
    dy = Math.round(target / 2 * Math.sin(angle));
    d = positionalDia(dx, dy);
  } while (Math.abs(d - allowed) < 4);

  const pass = s.inSize && d <= allowed;
  let explain;
  if (!s.inSize) explain = s.sizeFail;
  else {
    explain = `Size Ø${inch(s.actual)} is within Ø${inch(s.lo)}–${inch(s.hi)} ✔.<br>${s.condWhy}
      Allowed position = ${inch(T)} + ${inch(s.bonus)} = <b>Ø${inch(allowed)}</b>.<br>
      Positional error = 2 × √(${sq(dx)} + ${sq(dy)}) = <b>Ø${inch(d)}</b>.
      Ø${inch(d)} ${pass ? "≤" : "<b>&gt;</b>"} Ø${inch(allowed)}, so it ${pass ? "passes" : "fails"}.`;
    if (pass && d > T) {
      explain += `<br><br>💡 <b>Bonus saved it.</b> Without the bonus, Ø${inch(d)} would fail Ø${inch(T)}.`;
    }
    if (mod === "L") {
      explain += `<br><br>📐 <b>Why LMC?</b> ${isHole ? "A hole near an edge" : "A pin"} at LMC has the
        least material, so LMC protects minimum wall thickness rather than assembly fit.`;
    }
  }

  return {
    type: `Position at ${s.condName} (${s.feat})`,
    drawing: { feature: s.feat, size: `Ø${inch(s.lo, 3)}–${inch(s.hi, 3)}`, frame: [{ sym: "position" }, { text: `Ø${inch(T, 3)}`, mod }, { text: "A" }, { text: "B" }, { text: "C" }] },
    report: [["Measured size", `Ø${inch(s.actual)}`], ["X deviation from true position", dev(dx)], ["Y deviation from true position", dev(dy)]],
    pass,
    explain,
  };
}

// Perpendicularity of a pin to datum A, at MMC. Sometimes Ø.000 at MMC.
function qPerpMMC() {
  const T = pick([0, 0, 20, 50]);                    // Ø.000, Ø.002, Ø.005
  const s = bonusSetup(false, "M", T);
  const allowed = T + s.bonus;

  let flavor = pickError(T, s.bonus, allowed, s.sizeTrap);
  if (!s.sizeTrap && coin(0.2)) flavor = "out";
  let d;
  do {
    if (flavor === "in") d = Math.round(T * (0.3 + Math.random() * 0.6));
    else if (flavor === "bonus") d = Math.round(T + s.bonus * (0.2 + Math.random() * 0.65));
    else d = allowed + randInt(4, Math.max(8, Math.round(allowed * 0.4)));
  } while (Math.abs(d - allowed) < 4 || d < 0);

  const pass = s.inSize && d <= allowed;
  let explain;
  if (!s.inSize) explain = s.sizeFail;
  else {
    explain = `Size Ø${inch(s.actual)} is within Ø${inch(s.lo)}–${inch(s.hi)} ✔.<br>${s.condWhy}
      Allowed perpendicularity = ${inch(T)} + ${inch(s.bonus)} = <b>Ø${inch(allowed)}</b>.<br>
      Measured Ø${inch(d)} ${pass ? "≤" : "<b>&gt;</b>"} Ø${inch(allowed)}, so it ${pass ? "passes" : "fails"}.`;
    if (T === 0) {
      explain += `<br><br>🎯 <b>Zero at MMC</b> means the pin must be perfectly perpendicular when
        it's at its largest size. All the tolerance comes from the bonus: the smaller the pin,
        the more it can lean.`;
    }
  }

  return {
    type: "Perpendicularity at MMC",
    drawing: { feature: "pin-side", size: `Ø${inch(s.lo, 3)}–${inch(s.hi, 3)}`, frame: [{ sym: "perpendicularity" }, { text: `Ø${inch(T, 3)}`, mod: "M" }, { text: "A" }] },
    report: [["Measured size", `Ø${inch(s.actual)}`], ["Axis perpendicularity to A", `Ø${inch(d)}`]],
    pass,
    explain,
  };
}

// Profile of a surface: the zone is the TOTAL width, split equally
// on both sides of the true profile unless the drawing says otherwise.
function qProfile() {
  const T = pick([50, 100, 200]);                    // .005", .010", .020"
  const half = T / 2;
  const flavor = pick(["in", "in", "in", "out", "trap", "trap"]);
  let a, b;                                          // a = the bigger side, b = the other side
  if (flavor === "in") { a = randInt(Math.round(half * 0.4), half - 4); b = randInt(2, a); }
  else if (flavor === "out") { a = half + randInt(Math.max(4, Math.round(half * 0.3)), half); b = randInt(2, half - 4); }
  else { a = half + randInt(4, Math.round(half * 0.6)); b = randInt(2, T - a - 3); }   // spread under T, one side over
  const plusBig = coin();
  const high = plusBig ? a : b, low = plusBig ? -b : -a;
  const pass = high <= half && -low <= half;
  const spread = high - low;

  let explain = `Profile ${inch(T, 3)} with no other note is <b>equal bilateral</b>: the zone is
    ${inch(T)} wide in total, so <b>±${inch(half)}</b> around the true profile.<br>
    Highest point ${dev(high)} ${high <= half ? "✔" : "✘"}, lowest point ${dev(low)} ${-low <= half ? "✔" : "✘"}.
    ${pass ? "Both are inside ±" + inch(half) + ", so it passes." : "<b>Outside</b> ±" + inch(half) + ", so it fails."}`;
  if (!pass && spread <= T) {
    explain += `<br><br>⚠️ <b>The trap:</b> the total spread is only ${inch(spread)}, under ${inch(T)}.
      But the zone doesn't float: it's fixed to the true profile (located from datums A and B),
      so each side only gets ${inch(half)}.`;
  }
  return {
    type: "Profile of a surface",
    drawing: { feature: "profile", frame: [{ sym: "profile" }, { text: inch(T, 3) }, { text: "A" }, { text: "B" }] },
    report: [["Feature", "Curved top surface"], ["Highest point vs true profile", dev(high)], ["Lowest point vs true profile", dev(low)]],
    pass,
    explain,
  };
}

// Circular runout: checked at each cross-section, FIM = high − low
function qRunout() {
  const T = pick([10, 20, 30]);                      // .001" to .003"
  const fails = coin();
  const bad = fails ? randInt(0, 2) : -1;            // which section fails, if any
  const sections = [0, 1, 2].map((i) => {
    const fim = i === bad ? T + randInt(2, Math.max(4, Math.round(T * 0.6))) : randInt(Math.round(T * 0.3), T - 2);
    const low = -randInt(Math.round(fim * 0.3), Math.round(fim * 0.7));
    return { high: fim + low, low, fim };
  });
  const pass = sections.every((s) => s.fim <= T);
  const lines = sections.map((s, i) =>
    `Section ${i + 1}: ${dev(s.high)} − (${dev(s.low)}) = <b>${inch(s.fim)}</b> ${s.fim <= T ? "✔" : "✘"}`).join("<br>");
  let explain = `Circular runout is the <b>full indicator movement</b> (FIM) as the part spins on datum A:
    the highest reading minus the lowest, at each cross-section separately. Each one must be ≤ ${inch(T)}.<br>
    ${lines}<br>${pass ? "Every section is in, so it passes." : "One section is over, so it <b>fails</b>."}`;
  if (!pass && sections[bad].high <= T && -sections[bad].low <= T) {
    explain += `<br><br>⚠️ <b>The trap:</b> neither reading on its own is over ${inch(T)}, but
      runout is the total swing of the needle, high minus low.`;
  }
  return {
    type: "Circular runout",
    drawing: { feature: "shaft", frame: [{ sym: "runout" }, { text: inch(T, 3) }, { text: "A" }] },
    report: sections.map((s, i) => [`Section ${i + 1}: high / low`, `${dev(s.high)} / ${dev(s.low)}`]),
    pass,
    explain,
  };
}

// =====================================================================
// The two modes. Each mode has three tiers; the round ramps from
// tier 1 (questions 1–3) to tier 2 (4–6) to tier 3 (7–10).
// =====================================================================
const MODES = {
  beginner: {
    name: "Beginner",
    seconds: 30,
    tiers: [
      [bLinear, bDiameter],
      [bLimit, bUnilateral, bRadius, bLinear, bDiameter],
      [bTitleBlock, bAngle, bUnilateral, bLimit, bRadius],
    ],
  },
  advanced: {
    name: "Advanced",
    seconds: 60,
    tiers: [
      [qFlatness, qPositionRFS, qProfile],
      [() => qPositionMod(true, "M"), () => qPositionMod(false, "M"), qRunout, qProfile, qPositionRFS],
      [() => qPositionMod(true, "L"), qPerpMMC, () => qPositionMod(true, "M"), () => qPositionMod(false, "M"), qRunout],
    ],
  },
};

const tierFor = (i) => (i < 3 ? 0 : i < 6 ? 1 : 2);
