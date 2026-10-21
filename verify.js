// Answer checker: re-solves every question type using only what the player sees
// (the drawing text and the report), and compares with the generator's answer.
// Run with:  node verify.js
const fs = require('fs');
eval(fs.readFileSync(require('path').join(__dirname, 'questions.js'),'utf8') + ';global.MODES=MODES;');
const num = s => { s = s.replace(/[ØR−]/g, m => m==='−'?'-':'').trim(); return Math.round(parseFloat(s.replace(/^([+-]?)\./,'$10.'))*10000); };
const minutes = s => { const m = s.match(/(\d+)°(?:(\d+)')?/); return +m[1]*60 + (m[2]?+m[2]:0); };
function limits(label) {
  if (typeof label === 'string') {
    const m = label.match(/^([ØR]?[\d.]+)(?: PIN)?(?: ±([\d.]+))?$/);
    const range = label.match(/^Ø([\d.]+)–([\d.]+)$/);
    if (range) return [num(range[1]), num(range[2])];
    if (!m) throw new Error('bad label '+label);
    const nom = num(m[1]);
    let tol;
    if (m[2]) tol = num(m[2]); else { const places = m[1].split('.')[1].length; tol = places===2?100:50; }
    return [nom-tol, nom+tol];
  }
  if (label.upper) return [num(label.lower), num(label.upper)];
  const nom = num(label.main); return [nom + num(label.minus), nom + num(label.plus)];
}
function solve(q) {
  const d = q.drawing, r = Object.fromEntries(q.report);
  const val = q.report[q.report.length-1][1];
  switch (q.type) {
    case 'Linear dimension': case 'Diameter': case 'Limit dimension': case 'Unilateral tolerance': case 'Radius': case 'Title block tolerance': {
      const [lo,hi] = limits(d.dim || d.size); const a = num(val); return a>=lo && a<=hi; }
    case 'Angle': {
      const m = d.dim.match(/^(\S+)(?: ±(\S+))?$/); const nom = minutes(m[1]); const tol = m[2]?minutes(m[2]):60;
      const a = Math.round(parseFloat(val)*60); return Math.abs(a-nom) <= tol; }
    case 'Flatness': return num(val) <= num(d.frame[1].text);
    case 'Profile of a surface': { const h = num(d.frame[1].text)/2; return num(q.report[1][1]) <= h && -num(q.report[2][1]) <= h; }
    case 'Circular runout': { const T = num(d.frame[1].text); return q.report.every(([,v]) => { const [a,b]=v.split(' / ').map(num); return a-b <= T; }); }
    case 'Perpendicularity at MMC': {
      const [lo,hi] = limits(d.size); const a = num(r['Measured size']); if (a<lo||a>hi) return false;
      return num(r['Axis perpendicularity to A']) <= num(d.frame[1].text) + (hi - a); }
    default: { // position
      const [lo,hi] = limits(d.size); const a = num(r['Measured size']); if (a<lo||a>hi) return false;
      const T = num(d.frame[1].text); const mod = d.frame[1].mod; const hole = d.feature==='hole';
      let bonus = 0;
      if (mod==='M') bonus = hole ? a-lo : hi-a;
      if (mod==='L') bonus = hole ? hi-a : a-lo;
      const dx = num(q.report[1][1]), dy = num(q.report[2][1]);
      return 2*Math.hypot(dx,dy) <= T + bonus + 1e-9; }
  }
}
const stats = {};
let bad = 0, total = 0;
for (const m of Object.values(MODES)) for (const tier of m.tiers) for (const g of tier) for (let i=0;i<3000;i++) {
  const q = g(); total++;
  const s = solve(q); if (s !== q.pass) { bad++; if (bad<4) console.log('MISMATCH', JSON.stringify(q).slice(0,400)); }
  stats[q.type] = stats[q.type] || [0,0]; stats[q.type][0]++; if (q.pass) stats[q.type][1]++;
  if (/undefined|NaN/.test(JSON.stringify(q))) { bad++; console.log('BAD TEXT', q.type); }
}
console.log('checked', total, 'mismatches', bad);
for (const [t,[n,p]] of Object.entries(stats)) console.log(t.padEnd(28), (p/n).toFixed(2));
