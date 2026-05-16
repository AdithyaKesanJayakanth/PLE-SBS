// Physics sanity checks for sim/core.js.  Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../sim/core.js');

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

// A rigid straight wire: enormous tension removes sag from the cable and the pods.
function straight(over) {
  const cfg = S.resolve(Object.assign({
    accessHeight: 50, terminusHeight: 0, span: 300, tension: 1e9,
    mu: 0, cdaPod: 0, cdaPerson: 0, brakeK: 0, brakeLength: 0, brakeRunout: 0, dt: 0.005,
  }, over));
  return { cfg, wire: S.makeWire(cfg) };
}

test('energy: frictionless, drag-free pod arrives at sqrt(2 g h)', () => {
  const { cfg, wire } = straight();
  const r = S.simulateWire(cfg, wire, [{ depart: 0, m: 500, cda: 0 }])[0];
  close(r.vArr, Math.sqrt(2 * S.G * 50), 0.05, 'arrival speed');
});

test('incline with friction matches t = sqrt(2 s / a)', () => {
  const mu = 0.03;
  const { cfg, wire } = straight({ mu });
  const s = Math.hypot(300, 50), sin = 50 / s, cos = 300 / s;
  const a = S.G * (sin - mu * cos);
  const r = S.simulateWire(cfg, wire, [{ depart: 0, m: 500, cda: 0 }])[0];
  close(r.arrive, Math.sqrt((2 * s) / a), 0.02, 'run time');
});

test('drag: long steep run approaches terminal speed sqrt(2 m g sinθ / (ρ CdA))', () => {
  const { cfg, wire } = straight({ accessHeight: 600, span: 3000 });
  const m = 500, cda = 1.5;
  const r = S.simulateWire(cfg, wire, [{ depart: 0, m, cda }])[0];
  const sin = 600 / Math.hypot(3000, 600);
  const vt = Math.sqrt((2 * m * S.G * sin) / (1.2 * cda));
  close(r.vPeak, vt, 0.02 * vt, 'terminal speed');
});

test('taut string: point load P at midspan deflects P L / (4 T)', () => {
  const wire = { L: 400, H: 40, hb: 0, T: 100e3, w: 0, chord: -0.1 };
  close(S.deflection(wire, 200, [{ x: 200, P: 5000 }]), (5000 * 400) / (4 * 100e3), 1e-9, 'midspan deflection');
});

test('taut string: self-weight sag is w L^2 / (8 T)', () => {
  const wire = { L: 400, H: 40, hb: 0, T: 100e3, w: 40, chord: -0.1 };
  close(S.deflection(wire, 200, []), (40 * 400 * 400) / (8 * 100e3), 1e-9, 'midspan sag');
});

test('hazard: K40 blast radius matches the hand calculation', () => {
  // 10 t of LOX/RP-1, f = 1: W = 1000 kg TNT = 2204.6 lb; R = 40 * 2204.6^(1/3) ft
  const hz = S.hazard(S.resolve({ stages: [{ name: 't', prop: 'LOX_RP1', massT: 10 }], dangerLevel: 4, kFactor: 40 }));
  close(hz.tntKg, 1000, 1e-6, 'TNT');
  close(hz.rBlast, (40 * Math.cbrt(1000 * 2.20462)) / 3.28084, 1e-6, 'R_blast');
  close(hz.psiAt(hz.rBlast), 1.2, 1e-9, 'overpressure at K40');
});

test('hazard: bigger danger level never shrinks the required distance', () => {
  let last = 0;
  for (let lvl = 1; lvl <= 5; lvl++) {
    const r = S.hazard(S.resolve({ dangerLevel: lvl })).rReq;
    assert.ok(r >= last, `level ${lvl}`);
    last = r;
  }
});

test('series pods: auto headway keeps followers off the leader and out of the dock', () => {
  const r = S.evacuate({ wires: 1, podsPerWire: 3, crew: 3, ground: 6, podCapacity: 3 });
  assert.equal(r.flags.filter((f) => /dock|within/.test(f.msg)).length, 0, JSON.stringify(r.flags));
  for (let i = 1; i < r.pods.length; i++) assert.ok(r.pods[i].arrive >= r.pods[i - 1].arrive + r.cfg.tClear - 1e-6);
});

test('a zero headway on one wire is caught as a conflict', () => {
  const r = S.evacuate({ wires: 1, podsPerWire: 3, podCapacity: 3, headway: 0, tGap: 0.5, tHatch: 0 });
  assert.ok(r.flags.some((f) => /dock|within/.test(f.msg)));
});

test('more wires never make the evacuation slower (same pods per wire)', () => {
  const t1 = S.evacuate({ wires: 3, podsPerWire: 1 }).tAll;
  const t2 = S.evacuate({ wires: 5, podsPerWire: 1 }).tAll;
  assert.ok(t2 <= t1 + 1e-9);
});

test('Monte Carlo is reproducible for a fixed seed', () => {
  const a = S.monteCarlo({}, 20, 7), b = S.monteCarlo({}, 20, 7);
  assert.equal(a.p95, b.p95);
});

test('scale-model fit recovers a known friction coefficient', () => {
  const runs = [2, 3, 4].map((m) => ({ wire_length_m: 6, drop_m: 0.8, mass_kg: m }));
  for (const r of runs) r.time_s = S.scaleRunTime(r, 0.04, 0.003);
  const fit = S.fitScaleModel(runs, { fitCda: false, cdaFixed: 0.003 });
  close(fit.mu, 0.04, 0.0015, 'mu');
});

test('drag-chain bed: simple-harmonic stop, distance v/w and peak v*w', () => {
  const cfg = S.resolve({ arrester: 'chain', terminal: 'dock', chainKc: 40, chainMu: 0.6, bedLength: 100 });
  const m = 600, v = 20, w = Math.sqrt((0.6 * S.G * 40) / m);
  const st = S.arrest(cfg, m, v);
  close(st.dist, v / w, 1e-9, 'stop distance');
  close(st.peakG, (v * w) / S.G, 1e-9, 'peak g');
  close(st.t, Math.PI / (2 * w), 1e-9, 'stop time');
});

test('switch-yard bay brake on level rail loses k L / m of speed', () => {
  const cfg = S.resolve({ terminal: 'switchyard', arrester: 'chain', brakeLength: 60, brakeK: 100 });
  const st = S.arrest(cfg, 600, 20, 1);
  close(st.vExit, 20 - (100 * 60) / 600, 1e-9, 'exit speed');
});

test('D5 tolerates a failed magnetic brake on every pod (stops below 1.5 g, no failures)', () => {
  const cfg = S.prepare({ wires: 1, podsPerWire: 3, terminal: 'switchyard', bays: 3, arrester: 'chain', dispatch: 'block', failSafeHeadway: true, tWalk: 8, tBoard: 3, tUnload: 8, bayWalk: 15 });
  const r = S.evacuate(Object.assign({}, cfg, { brakeCondition: 'all' }));
  assert.equal(r.flags.filter((f) => f.level === 'fail').length, 0, JSON.stringify(r.flags));
  for (const p of r.pods) assert.ok(p.stop.peakG <= 1.5, `pod ${p.id} ${p.stop.peakG}`);
});

test('block marker holds the next pod at the platform if the pod ahead stalls', () => {
  const cfg = S.resolve({ terminal: 'dock' });
  const wire = S.makeWire(cfg);
  // an absurd brake stalls the leader in the brake zone; the follower must never leave
  const res = S.simulateWire(cfg, wire, [{ depart: 0, m: 600, cda: 1.45, brakeScale: 1 }, { depart: 0, m: 600, cda: 1.45, blockAfter: 0, blockX: 290 }], { brakeK: 50000, sample: 1, tMax: 200 });
  assert.ok(res[0].stalled, 'leader stalls');
  assert.ok(res[1].held, 'follower held');
});
