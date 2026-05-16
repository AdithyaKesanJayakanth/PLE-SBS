// Runs every study the paper reports and writes data/results.json.
// Usage: node sim/export.js        (about a minute)
const fs = require('fs');
const path = require('path');
const S = require('./core.js');

const out = {};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const pick = (r) => ({
  tAll: r.tAll, status: r.status, margin: r.margin, headway: r.headway, brakeK: r.brakeK,
  flags: r.flags.map((f) => f.msg), peakTension: r.peakTension, allow: r.wire.cable.allow,
  vPeak: Math.max(...r.pods.map((p) => p.vPeak || 0)),
  gPeak: Math.max(...r.pods.map((p) => Math.max(p.aPeakG || 0, p.impactG || 0))),
  ride: r.pods.filter((p) => p.arrive != null).map((p) => p.arrive - p.depart),
});

// ---------------------------------------------------------------------------
// 1. Hazard distances for every preset vs the length of its real slidewire
// ---------------------------------------------------------------------------
out.hazard = Object.entries(S.VEHICLES).map(([k, v]) => {
  const hz = S.hazard(S.resolve({ vehicle: k, dangerLevel: 4 }));
  return {
    key: k, label: v.label, tntT: hz.tntKg / 1000, rBlast: hz.rBlast, rThermal: hz.rThermal,
    fireballD: hz.fireballD, fireballT: hz.fireballT, rReq: hz.rReq, wireReach: v.site.span + v.site.towerOffset,
    stages: v.stages,
  };
});
log('hazard');

// ---------------------------------------------------------------------------
// 2. Validation: Shuttle-era and Artemis-era slidewires (single full pod)
// ---------------------------------------------------------------------------
function singleRun(cfgIn, n) {
  const cfg = S.resolve(cfgIn);
  cfg.brakeK = cfgIn.brakeK != null ? cfgIn.brakeK : S.designBrake(cfg);
  const wire = S.makeWire(cfg);
  const r = S.simulateWire(cfg, wire, [{ depart: 0, m: S.podMass(cfg, n), cda: S.podCdA(cfg, n) }], { sample: 0.25 })[0];
  return { ride: r.arrive, vPeak: r.vPeak, vArr: r.vArr, x: r.traj.x, v: r.traj.v, brakeK: cfg.brakeK, L: wire.L };
}
out.validation = {
  shuttle: Object.assign(singleRun(Object.assign({ vehicle: 'SHUTTLE', podCapacity: 3, crew: 7, ground: 0 }, S.VEHICLES.SHUTTLE.site), 3),
    { reportedPeakMph: 55, reportedRideS: [30, 35], wireFt: 1200, levelFt: 195 }),
  artemis: Object.assign(singleRun(Object.assign({ vehicle: 'SLS', podCapacity: 5, crew: 4, ground: 1 }, S.VEHICLES.SLS.site), 5),
    { reportedPeakMph: [40, 55], wireFt: 1335 }),
};
// Artemis: brake strength that would hold the peak to 55 mph (24.6 m/s) with a long brake section
{
  const site = Object.assign({}, S.VEHICLES.SLS.site, { vehicle: 'SLS', podCapacity: 5, crew: 4, ground: 1, brakeLength: 300, brakeRunout: 0 });
  let lo = 0, hi = 3000;
  for (let i = 0; i < 25; i++) {
    const mid = (lo + hi) / 2;
    const r = singleRun(Object.assign({}, site, { brakeK: mid }), 5);
    if (r.vPeak > 24.6 || r.ride == null) lo = mid; else hi = mid;
  }
  out.validation.artemisBraked = Object.assign(singleRun(Object.assign({}, site, { brakeK: hi }), 5), { brakeLength: 300 });
}
log('validation');

// ---------------------------------------------------------------------------
// 3. Design iterations for the reference launcher (each failure feeds the next design)
// ---------------------------------------------------------------------------
const ITER = [
  { id: 'D0', name: 'Copy the Artemis layout', change: '400 m span, 1 wire with 3 pods in series, fill each pod, eddy brake + 2 m buffer, armoured vehicle',
    cfg: { span: 400, wires: 1, podsPerWire: 3, loading: 'fill', bufferLength: 2, safeMode: 'vehicle', terminusHeight: 0, brakeRunout: 15 } },
  { id: 'D1', name: 'Go parallel, balance the load', change: '2 wires × 2 pods; spread people evenly over pods',
    cfg: { span: 400, wires: 2, podsPerWire: 2, loading: 'balance', bufferLength: 2, safeMode: 'vehicle', terminusHeight: 0, brakeRunout: 15 } },
  { id: 'D2', name: 'Fix the brake for wind', change: 'shorter, steeper 300 m span into a 3 m landing pit; light eddy brake + 10 m catch net',
    cfg: { span: 300, wires: 2, podsPerWire: 2, loading: 'balance', bufferLength: 10, safeMode: 'vehicle', terminusHeight: -3, brakeRunout: 15 } },
  { id: 'D3', name: 'Shelter at the terminus', change: 'blast bunker 40 m from the dock instead of an armoured vehicle',
    cfg: { span: 300, wires: 2, podsPerWire: 2, loading: 'balance', bufferLength: 10, safeMode: 'bunker', terminusHeight: -3, brakeRunout: 15 } },
  { id: 'D4', name: 'Design the human part', change: 'crew pod parked at the arm exit (walk 20→8 s), open-sided pods (board 5→3 s), unload 15→8 s, bunker door 20 m away',
    cfg: { span: 300, wires: 2, podsPerWire: 2, loading: 'balance', bufferLength: 10, safeMode: 'bunker', terminusHeight: -3, brakeRunout: 15, tWalk: 8, tBoard: 3, tUnload: 8, bunkerWalk: 20 } },
];
out.iterations = ITER.map((it) => {
  const cfg = S.resolve(it.cfg);
  cfg.brakeK = S.designBrake(cfg);
  cfg.headway = cfg.podsPerWire > 1 ? S.minHeadway(cfg) : 0;
  const r = S.evacuate(cfg);
  const head = S.evacuate(Object.assign({}, cfg, { wind: -17.5 }));
  const tail = S.evacuate(Object.assign({}, cfg, { wind: 17.5 }));
  const mc = S.monteCarlo(cfg, 1000, 2026);
  log('iteration', it.id, r.tAll.toFixed(1), 'P95', mc.p95.toFixed(1), 'fail', mc.pFail);
  return Object.assign({}, it, {
    base: pick(r), headwind: pick(head), tailwind: pick(tail),
    mc: { p50: mc.p50, p95: mc.p95, max: mc.max, pLate: mc.pLate, pFail: mc.pFail, warn: mc.warn },
  });
});

// Full detail for the final design: timeline, speed traces, MC histogram, sensitivity
const FINAL = ITER[ITER.length - 1].cfg;
{
  const cfg = S.resolve(FINAL);
  cfg.brakeK = S.designBrake(cfg);
  cfg.headway = S.minHeadway(cfg);
  const r = S.evacuate(cfg);
  out.final = {
    cfg: Object.assign({}, cfg, { stages: undefined }),
    tAll: r.tAll, warn: r.hazard.warn, rReq: r.hazard.rReq, dTerminus: r.dTerminus, psiTerminus: r.hazard.psiAt(r.dTerminus),
    pods: r.pods.map((p) => ({
      id: p.id, wire: p.wire, slot: p.slot, n: p.n, m: p.m, ready: p.ready, depart: p.depart, arrive: p.arrive,
      unloaded: p.unloaded, safe: p.safe, vPeak: p.vPeak, vArr: p.vArr, aPeakG: p.aPeakG, impactG: p.impactG,
      firstArrival: r.people[p.people[0]].t, x: p.traj.x, v: p.traj.v,
    })),
    people: r.people.map((p) => ({ group: p.group, t: p.t, safe: p.safe })),
    brakeK: r.brakeK, headway: r.headway, peakTension: r.peakTension, allow: r.wire.cable.allow,
    sag: S.deflection(r.wire, r.wire.L / 2, []), wireL: r.wire.L,
    profile: Array.from({ length: 61 }, (_, i) => { const x = (r.wire.L * i) / 60; return [x, S.heightAt(r.wire, x, [])]; }),
  };
  const mc = S.monteCarlo(cfg, 2000, 7);
  out.final.mc = { times: mc.runs.map((x) => x.tAll), p50: mc.p50, p95: mc.p95, pLate: mc.pLate, pFail: mc.pFail, warn: mc.warn };
  out.final.sens = S.sensitivity(cfg, 0.2);
  // required warning time at each danger level (P95)
  out.final.levels = Object.entries(S.DANGER_LEVELS).map(([k, v]) => {
    const c2 = Object.assign({}, cfg, { dangerLevel: +k });
    const rr = S.evacuate(c2);
    return { level: +k, label: v.label, warn: v.warn, rReq: rr.hazard.rReq, tAll: rr.tAll, ok: mc.p95 <= v.warn, flags: rr.flags.map((f) => f.msg) };
  });
  log('final', r.tAll.toFixed(1), 'P95', mc.p95.toFixed(1));
}

// ---------------------------------------------------------------------------
// 4. Passive-brake feasibility map: launch height × span (reference-launcher hazard, D2+ hardware)
// ---------------------------------------------------------------------------
{
  const Hs = Array.from({ length: 19 }, (_, i) => 30 + 5 * i); // 30-120 m: every crew level in use
  const spans = Array.from({ length: 23 }, (_, i) => 150 + 25 * i); // 150-700 m
  const cells = [];
  for (const H of Hs) {
    for (const span of spans) {
      // brake section scales with launch height (60 m at 42 m): the energy to remove grows with H
      const cfg = S.resolve(Object.assign({}, FINAL, { accessHeight: H, span, headway: 0, wires: 3, podsPerWire: 1, brakeLength: Math.round((60 * H) / 42) }));
      cfg.brakeK = S.designBrake(cfg);
      const head = S.evacuate(Object.assign({}, cfg, { wind: -17.5 }));
      const tail = S.evacuate(Object.assign({}, cfg, { wind: 17.5 }));
      const stall = head.flags.some((f) => /stalls/.test(f.msg)) || tail.flags.some((f) => /stalls/.test(f.msg));
      const gMax = Math.max(...tail.pods.map((p) => Math.max(p.aPeakG, p.impactG || 0)), ...head.pods.map((p) => Math.max(p.aPeakG, p.impactG || 0)));
      const cable = head.flags.concat(tail.flags).some((f) => /Cable tension/.test(f.msg));
      cells.push({ H, span, stall, gMax, cable, ok: !stall && !cable && gMax <= cfg.aMaxG,
        ride: tail.pods[0].arrive != null ? tail.pods[0].arrive - tail.pods[0].depart : null });
    }
  }
  // design rule for any pad: centre of the feasible band at each height, and a straight-line fit
  const band = Hs.map((H) => {
    const ok = cells.filter((c) => c.H === H && c.ok).map((c) => c.span);
    return ok.length ? { H, lo: Math.min(...ok), hi: Math.max(...ok), mid: (Math.min(...ok) + Math.max(...ok)) / 2 } : { H, lo: null, hi: null, mid: null };
  });
  const pts = band.filter((b) => b.mid != null);
  const n = pts.length, sx = pts.reduce((a, p) => a + p.H, 0), sy = pts.reduce((a, p) => a + p.mid, 0);
  const sxx = pts.reduce((a, p) => a + p.H * p.H, 0), sxy = pts.reduce((a, p) => a + p.H * p.mid, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
  const pads = Object.entries(S.PADS).map(([k, p]) => ({ key: k, label: p.label, H: p.site.accessHeight, span: p.site.span }));
  out.feasibility = { Hs, spans, cells, band, fit: { slope, icpt }, pads, brakePerMetre: 60 / 42, bufferLength: FINAL.bufferLength || S.DEFAULTS.bufferLength };
  log('feasibility fit: span ≈', icpt.toFixed(0), '+', slope.toFixed(2), '× H');
  log('feasibility');
}

// ---------------------------------------------------------------------------
// 5. Series vs parallel: 24 and 36 people already on the platform
// ---------------------------------------------------------------------------
out.topology = {};
for (const P of [12, 24, 36]) {
  const base = Object.assign({}, FINAL, { crew: 0, ground: P, tHatch: 0, tWalk: 0, tGap: 0.5 });
  const ts = S.tradeStudy(base, 6, 6);
  out.topology[P] = { headway: ts.headway, cells: ts.cells };
}
log('topology');

// Pod capacity sweep (series-only vs parallel-only, 24 people on the platform)
out.capacity = [];
for (const c of [2, 3, 4, 5, 6, 8]) {
  const base = Object.assign({}, FINAL, { crew: 0, ground: 24, tHatch: 0, tWalk: 0, tGap: 0.5, podCapacity: c });
  const nP = Math.ceil(24 / c);
  const row = { c, pods: nP };
  for (const [name, m, k] of [['parallel', Math.min(nP, 6), Math.ceil(nP / Math.min(nP, 6))], ['series', 1, nP], ['twoWires', 2, Math.ceil(nP / 2)]]) {
    const r = S.evacuate(Object.assign({}, base, { wires: m, podsPerWire: k }));
    row[name] = { m, k, tAll: r.tAll, fails: r.flags.filter((f) => f.level === 'fail').map((f) => f.msg) };
  }
  out.capacity.push(row);
}
log('capacity');

// ---------------------------------------------------------------------------
// 6. Improvements: magnetic-brake failure, drag-chain arrester, single wire + switch yard
// ---------------------------------------------------------------------------
const D5 = Object.assign({}, FINAL, { wires: 1, podsPerWire: 3, arrester: 'chain', terminal: 'switchyard', bays: 3, bayWalk: 15, failSafeHeadway: true, dispatch: 'block' });
out.improved = { cfg: D5 };
{
  // brake-failure matrix for D4 (2 wires, single dock, catch net) and D5
  const designs = [['D4', FINAL], ['D5', D5]];
  out.brakeFailure = [];
  for (const [id, c] of designs) {
    const cfg = S.prepare(c);
    for (const bc of ['ok', 'half', 'one', 'all']) {
      for (const wind of [0, 17.5]) {
        const r = S.evacuate(Object.assign({}, cfg, { brakeCondition: bc, wind }));
        const worst = r.pods.reduce((a, p) => (p.stop && (!a || p.stop.peakG > a.stop.peakG) ? p : a), null);
        out.brakeFailure.push({
          design: id, brake: bc, wind, tAll: r.tAll, headway: r.headway, stopType: worst && worst.stop ? worst.stop.type : null,
          vArr: worst ? worst.vArr : null, stopG: worst ? worst.stop.peakG : null, stopDist: worst ? worst.stop.dist : null,
          conflicts: r.flags.filter((f) => /reaches|within/.test(f.msg)).length,
          fails: r.flags.filter((f) => f.level === 'fail').map((f) => f.msg),
        });
      }
    }
  }
  log('brake failure');
  // arrester curves: peak deceleration against arrival speed for three pod masses
  // stop deceleration against arrival speed: D4 end-of-wire catch net vs D5 bay
  // (magnetic brake + chain bed), and D5 with the magnetic brake failed
  const base = S.prepare(D5);
  const d4 = S.resolve(Object.assign({}, FINAL, { arrester: 'net', terminal: 'dock' }));
  const speeds = Array.from({ length: 30 }, (_, i) => i + 1);
  out.arresterCurves = [400, 700].map((m) => ({
    m,
    net: speeds.map((v) => [v, S.arrest(d4, m, v).peakG]),
    bay: speeds.map((v) => [v, S.arrest(base, m, v, 1).peakG]),
    bayFailed: speeds.map((v) => [v, S.arrest(base, m, v, 0).peakG]),
  }));
  // D5 evacuation: deterministic + Monte Carlo
  const c5 = S.prepare(D5);
  const r5 = S.evacuate(c5);
  const mc5 = S.monteCarlo(c5, 1000, 2026);
  out.improved.tAll = r5.tAll;
  out.improved.blockX = c5.blockX;
  out.improved.brakeK = c5.brakeK;
  out.improved.headwayFlown = r5.headway;
  out.improved.pods = r5.pods.map((p) => ({ id: p.id, n: p.n, m: p.m, depart: p.depart, arrive: p.arrive, vArr: p.vArr, stop: p.stop, bay: p.bay, safe: p.safe }));
  out.improved.flags = r5.flags.map((f) => f.msg);
  out.improved.mc = { p50: mc5.p50, p95: mc5.p95, pFail: mc5.pFail, pLate: mc5.pLate };
  out.improved.bom = S.bom(c5, r5);
  log('D5', r5.tAll.toFixed(1), 'P95', mc5.p95.toFixed(1), 'hw', c5.headway);
  // series on ONE wire: single dock vs switch yard, against parallel wires (24 people on the platform)
  const H = { crew: 0, ground: 24, tHatch: 0, tWalk: 0, tGap: 0.5, podCapacity: 4 };
  out.singleWire = [];
  for (const k of [1, 2, 3, 4, 5, 6]) {
    const row = { pods: k };
    const variants = {
      dock: { wires: 1, podsPerWire: k, arrester: 'net', terminal: 'dock', failSafeHeadway: false },
      switchyard: { wires: 1, podsPerWire: k, arrester: 'chain', terminal: 'switchyard', bays: k, bayWalk: 15, failSafeHeadway: true, dispatch: 'block' },
      parallel: { wires: k, podsPerWire: 1, arrester: 'net', terminal: 'dock' },
    };
    for (const [name, v] of Object.entries(variants)) {
      const people = Object.assign({}, H, { ground: Math.min(24, k * 4) });
      const cfg = S.prepare(Object.assign({}, FINAL, people, v));
      const r = S.evacuate(cfg);
      const rh = S.evacuate(Object.assign({}, cfg, { wind: -17.5 }));
      row[name] = { tAll: r.tAll, tHead: rh.tAll, headway: r.headway, fails: r.flags.filter((f) => f.level === 'fail').length + rh.flags.filter((f) => f.level === 'fail').length };
    }
    out.singleWire.push(row);
  }
  log('single wire');
  // bunker window for D5 at danger levels 3 and 4, from the deterministic run and from P95
  const c5w = S.prepare(D5);
  const r5w = S.evacuate(c5w);
  const runT = S.bunkerDistance(c5w) - S.bunkerDistance(Object.assign({}, c5w, { bayWalk: 0 }));
  out.bunkerWindow = [3, 4].map((lvl) => {
    const cc = Object.assign({}, c5w, { dangerLevel: lvl });
    const rr = S.evacuate(cc);
    const det = S.bunkerWindow(cc, rr);
    const p95 = S.bunkerWindow(cc, rr, out.improved.mc.p95 - runT / cc.runSpeed);
    return { level: lvl, det, p95 };
  });
  log('bunker window', out.bunkerWindow.map((b) => `L${b.level}: ${b.det.dMin.toFixed(0)}-${b.p95.dMax.toFixed(0)} m (bunker ${b.det.dBunker})`).join(', '));
}

fs.writeFileSync(path.join(__dirname, '..', 'data', 'results.json'), JSON.stringify(out, (k, v) => (typeof v === 'number' ? (isFinite(v) ? +v.toFixed(4) : null) : v)));
log('wrote data/results.json');
