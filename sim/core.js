/*
 * PLE-SBS simulation core — Pre-Launch Emergency: The Slidewire Basket System
 *
 * One file, no dependencies. Used by the web app (as a classic <script>, so it
 * also works when index.html is opened straight from disk) and by Node (tests,
 * figure export) through module.exports.
 *
 * Units are SI throughout (m, s, kg, N) unless a name says otherwise
 * (e.g. massT = tonnes, psi, kN, *_ft).
 *
 * Model map (paper section in brackets):
 *   1. hazard()          blast + fireball -> required safe distance       [Design 3.1]
 *   2. cable functions   taut-string sag under moving point loads         [Design 3.2]
 *   3. simulateWire()    pod dynamics along the cable, RK4                 [Design 3.3]
 *   4. evacuate()        people -> pods -> wires -> terminus -> safety     [Design 3.4]
 *   5. monteCarlo(), tradeStudy(), sensitivity(), fitScaleModel()          [Operate 5.x]
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PLESBS = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const G = 9.80665;
  const LB_PER_KG = 2.20462;
  const FT_PER_M = 3.28084;

  // ---------------------------------------------------------------------------
  // 1. Hazard model
  // ---------------------------------------------------------------------------

  // TNT-equivalent mass (kg) for a mass of propellant that takes part in the event.
  // LOX/LH2 and LOX/RP-1 follow the DoD energetic-liquid rules quoted in [R5];
  // the others are stated assumptions (see docs/author-checklist.md).
  const PROPELLANTS = {
    LOX_LH2: {
      label: 'LOX / LH2 (cryogenic)',
      liquid: true,
      tnt: (kg) => {
        const lb = kg * LB_PER_KG;
        return Math.min(lb, Math.max(0.14 * lb, 8 * Math.pow(lb, 2 / 3))) / LB_PER_KG;
      },
      note: 'max(14% W, 8 W^(2/3)) with W in lb (DoD energetic-liquid rule)',
    },
    LOX_RP1: { label: 'LOX / RP-1 (kerosene)', liquid: true, tnt: (kg) => 0.10 * kg, note: '10% (DoD)' },
    LOX_CH4: { label: 'LOX / CH4 (methane)', liquid: true, tnt: (kg) => 0.20 * kg, note: '20% (assumed; no standard yet)' },
    HYPERGOLIC: { label: 'UDMH / N2O4 (hypergolic)', liquid: true, tnt: (kg) => 0.10 * kg, note: '10% (assumed)' },
    SOLID: { label: 'Solid (HTPB / PBAN)', liquid: false, tnt: (kg, opt) => (opt.solidTntFraction || 0) * kg, note: 'HD 1.3 mass-fire; blast fraction user-set (default 0)' },
  };

  // Launch-pad presets. accessHeight = crew access level above ground (where pods
  // start); span = horizontal length of the slidewire (the existing one, where a pad
  // has one); towerOffset = rocket centreline to tower; terminusHeight < 0 = landing pit.
  const PADS = {
    GENERIC_LOW: {
      label: 'Generic low-tower pad (42 m crew level)',
      site: { accessHeight: 42, span: 300, towerOffset: 15, brakeRunout: 15, terminusHeight: -3 },
    },
    LC39B_ARTEMIS: {
      label: 'KSC LC-39B, Artemis mobile launcher (114 m)',
      site: { accessHeight: 114, span: 393, towerOffset: 20, brakeRunout: 0, terminusHeight: 0 },
    },
    LC39A: {
      label: 'KSC LC-39A, crew access arm (81 m)',
      site: { accessHeight: 81, span: 355, towerOffset: 20, brakeRunout: 0, terminusHeight: 0 },
    },
    SLC41: {
      label: 'CCSFS SLC-41, crew access tower (52 m)',
      site: { accessHeight: 52, span: 405, towerOffset: 15, brakeRunout: 10, terminusHeight: 0 },
    },
    LC39B_SHUTTLE: {
      label: 'KSC LC-39B, Shuttle-era service structure (59 m)',
      site: { accessHeight: 59, span: 362, towerOffset: 20, brakeRunout: 5, terminusHeight: 0 },
    },
  };

  // Rocket presets. Propellant masses are rounded public figures. Each rocket names
  // the pad it normally flies from; any rocket can be put on any pad.
  const VEHICLES = {
    REF: {
      label: 'Reference medium-lift crewed launcher (generic)',
      stages: [
        { name: '2 × solid boosters', prop: 'SOLID', massT: 410 },
        { name: 'Hypergolic liquid core', prop: 'HYPERGOLIC', massT: 115 },
        { name: 'Cryogenic upper stage', prop: 'LOX_LH2', massT: 28 },
      ],
      pad: 'GENERIC_LOW',
      crew: 3,
    },
    SLS: {
      label: 'SLS Block 1 / Orion',
      stages: [
        { name: '2 × 5-segment SRB', prop: 'SOLID', massT: 1256 },
        { name: 'Core stage', prop: 'LOX_LH2', massT: 987 },
        { name: 'ICPS', prop: 'LOX_LH2', massT: 29 },
      ],
      pad: 'LC39B_ARTEMIS',
      crew: 4,
    },
    F9: {
      label: 'Falcon 9 / Crew Dragon',
      stages: [
        { name: 'First stage', prop: 'LOX_RP1', massT: 396 },
        { name: 'Second stage', prop: 'LOX_RP1', massT: 92 },
      ],
      pad: 'LC39A',
      crew: 4,
    },
    ATLAS: {
      label: 'Atlas V N22 / Starliner',
      stages: [
        { name: '2 × GEM/AJ-60A SRB', prop: 'SOLID', massT: 82 },
        { name: 'Atlas booster', prop: 'LOX_RP1', massT: 284 },
        { name: 'Dual-engine Centaur', prop: 'LOX_LH2', massT: 21 },
      ],
      pad: 'SLC41',
      crew: 4,
    },
    SHUTTLE: {
      label: 'Space Shuttle (historical)',
      stages: [
        { name: '2 × SRB', prop: 'SOLID', massT: 1000 },
        { name: 'External tank', prop: 'LOX_LH2', massT: 735 },
      ],
      pad: 'LC39B_SHUTTLE',
      crew: 7,
    },
  };

  for (const k in VEHICLES) VEHICLES[k].site = PADS[VEHICLES[k].pad].site;

  // Danger level: judgment-based scenario table (NOT from a standard; it is the
  // knob the user turns). f = fraction of propellant assumed to take part,
  // warn = time from alarm to the possible event, in seconds.
  const DANGER_LEVELS = {
    1: { label: 'Precautionary hold — off-nominal reading, vehicle stable', f: 0.25, warn: 600 },
    2: { label: 'Contained leak, no ignition', f: 0.5, warn: 300 },
    3: { label: 'Major leak / vapour cloud forming', f: 0.75, warn: 180 },
    4: { label: 'Fire on the pad or tank over-pressure', f: 1.0, warn: 120 },
    5: { label: 'Imminent failure — confirmed structural breach', f: 1.0, warn: 60 },
  };

  // Quantity-distance K-factors (ft/lb^(1/3)) and the side-on overpressure they imply [R5, R6].
  const K_FACTORS = {
    24: { psi: 2.3, label: 'K24 — 2.3 psi (public traffic route)' },
    40: { psi: 1.2, label: 'K40 — 1.2 psi (inhabited building)' },
    50: { psi: 0.9, label: 'K50 — 0.9 psi (personnel separation)' },
  };

  // Power law through the K24/K40/K50 points: p ≈ 1.2 (K/40)^-1.28 psi. Valid ~K15–K80.
  function overpressurePsi(K) { return 1.2 * Math.pow(K / 40, -1.28); }
  function kForPsi(psi) { return 40 * Math.pow(psi / 1.2, -1 / 1.28); }

  function hazard(cfg) {
    const level = DANGER_LEVELS[cfg.dangerLevel] || DANGER_LEVELS[4];
    const f = cfg.participation != null ? cfg.participation : level.f;
    let tntKg = 0, liquidKg = 0, solidKg = 0;
    const byStage = cfg.stages.map((s) => {
      const p = PROPELLANTS[s.prop];
      const kg = s.massT * 1000 * f;
      const t = p.tnt(kg, cfg);
      tntKg += t;
      if (p.liquid) liquidKg += kg; else solidKg += kg;
      return { name: s.name, prop: s.prop, kg, tntKg: t };
    });
    const tntLb = tntKg * LB_PER_KG;
    const rBlast = tntKg > 0 ? (cfg.kFactor * Math.cbrt(tntLb)) / FT_PER_M : 0;

    // Fireball from the liquid propellant (High, 1968 [R7]): D = 3.86 M^0.32, t = 0.299 M^0.32.
    const fbD = liquidKg > 0 ? 3.86 * Math.pow(liquidKg, 0.32) : 0;
    const fbT = liquidKg > 0 ? 0.299 * Math.pow(liquidKg, 0.32) : 0;
    // Thermal: q(r) = SEP (R_fb / r)^2 ; safe when dose q^(4/3) t <= doseLimit.
    const qLim = fbT > 0 ? Math.pow(cfg.thermalDoseLimit / fbT, 0.75) : Infinity; // kW/m^2
    const rThermal = fbD > 0 ? (fbD / 2) * Math.sqrt(cfg.sep / qLim) : 0;

    const rReq = Math.max(rBlast, rThermal);
    return {
      level, f, byStage, tntKg, liquidKg, solidKg,
      rBlast, fireballD: fbD, fireballT: fbT, qLimit: qLim, rThermal, rReq,
      governing: rThermal > rBlast ? 'thermal' : 'blast',
      warn: cfg.warnTime != null ? cfg.warnTime : level.warn,
      psiAt: (r) => (tntKg > 0 ? overpressurePsi((r * FT_PER_M) / Math.cbrt(tntLb)) : 0),
      rForPsi: (psi) => (kForPsi(psi) * Math.cbrt(tntLb)) / FT_PER_M,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Cable: counterweight-tensioned taut string (constant horizontal tension T)
  //    carrying its own weight w (N/m) and pods as point loads P_j at x_j.
  //    Deflection below the chord: δ(x) = [w x (L-x)/2 + Σ P_j G(x, x_j)] / T
  //    G(x,a) = x (L-a)/L for x<=a, a (L-x)/L for x>=a  (influence line).
  // ---------------------------------------------------------------------------

  function cableProps(cfg) {
    const d = cfg.cableDiameter; // mm
    const massPerM = 0.00426 * d * d; // kg/m, 6x36 IWRC steel rope (approx.)
    const mbs = 0.70 * d * d * 1000; // N, minimum breaking strength (EIPS approx.)
    return { massPerM, w: massPerM * G, mbs, allow: mbs / cfg.cableSF };
  }

  function makeWire(cfg) {
    const L = cfg.span;
    const H = cfg.accessHeight;
    const hb = cfg.terminusHeight;
    const cp = cableProps(cfg);
    return { L, H, hb, T: cfg.tension * 1000, w: cp.w, cable: cp, chord: (hb - H) / L };
  }

  function deflection(wire, x, loads) {
    const { L, T, w } = wire;
    let d = (w * x * (L - x)) / 2;
    for (const ld of loads) {
      const a = ld.x;
      d += ld.P * (x <= a ? (x * (L - a)) / L : (a * (L - x)) / L);
    }
    return d / T;
  }

  // dy/dx of the cable at x. `self` is the index of the load sitting at x (its kink
  // is averaged), or -1 for a point not under a pod.
  function slopeAt(wire, x, loads, self) {
    const { L, T, w } = wire;
    let dd = (w * (L - 2 * x)) / 2;
    for (let j = 0; j < loads.length; j++) {
      const a = loads[j].x;
      let g;
      if (j === self) g = (L - 2 * a) / (2 * L);
      else g = x < a ? (L - a) / L : -a / L;
      dd += loads[j].P * g;
    }
    return wire.chord - dd / T;
  }

  function heightAt(wire, x, loads) {
    return wire.H + wire.chord * x - deflection(wire, x, loads);
  }

  // Peak tension: T * sqrt(1 + max slope^2); the steepest point is one of the ends.
  function peakTension(wire, loads) {
    const s0 = slopeAt(wire, 0, loads, -1);
    const sL = slopeAt(wire, wire.L, loads, -1);
    const s = Math.max(Math.abs(s0), Math.abs(sL));
    return wire.T * Math.sqrt(1 + s * s);
  }

  // ---------------------------------------------------------------------------
  // 3. Pod dynamics on one wire (all pods on that wire integrated together,
  //    because each pod's weight changes the slope the others feel).
  //    m dv/dt = m g sinθ − μ m g cosθ − ½ ρ CdA (v − u cosθ)|v − u cosθ| − k_b v [brake zone]
  //    dx/dt = v cosθ
  // ---------------------------------------------------------------------------

  function podMass(cfg, nPeople, personMasses) {
    let m = cfg.podMass;
    if (personMasses) for (const pm of personMasses) m += pm;
    else m += nPeople * cfg.personMass;
    return m;
  }

  function podCdA(cfg, n) { return cfg.cdaPod + n * cfg.cdaPerson; }

  /**
   * pods: [{ depart, m, cda, n }] in dispatch order on this wire.
   * opts: { mu, wind (along-wire tailwind m/s), brakeK, rho, dt, sample, tMax }
   */
  function simulateWire(cfg, wire, pods, opts) {
    const o = Object.assign(
      { mu: cfg.mu, wind: cfg.wind, brakeK: cfg.brakeK, rho: cfg.rho, dt: cfg.dt, sample: 0.1, tMax: 600 },
      opts || {}
    );
    const L = wire.L;
    // eddy-current brake fins from xBrake to xBrakeEnd, then an unbraked run-out to the dock
    const xBrakeEnd = L - cfg.brakeRunout;
    const xBrake = xBrakeEnd - cfg.brakeLength;
    // with a switch yard the magnetic brake sits in each receiving bay, not on the wire
    const wireBrake = cfg.terminal !== 'switchyard';
    const n = pods.length;
    const st = pods.map((p) => ({
      x: 0, v: 0, active: false, done: false, stalled: false,
      arrive: null, vArr: null, vPeak: 0, aPeak: 0, minSep: Infinity,
      traj: { t: [], x: [], v: [] },
    }));

    // forces -> acceleration along the path for pod i, given current x of active pods
    function accel(i, xs, vs, loads, loadIndexOf) {
      const p = pods[i];
      const dydx = slopeAt(wire, xs[i], loads, loadIndexOf[i]);
      const c = 1 / Math.sqrt(1 + dydx * dydx); // cosθ
      const s = -dydx * c; // sinθ, positive downhill
      const v = vs[i];
      const vr = v - o.wind * c;
      let a = G * s - o.mu * G * c * (v >= 0 ? 1 : -1) - (0.5 * o.rho * p.cda * vr * Math.abs(vr)) / p.m;
      if (wireBrake && xs[i] >= xBrake && xs[i] < xBrakeEnd) a -= (o.brakeK * (p.brakeScale ?? 1) * v) / p.m;
      return { a, c };
    }

    function buildLoads(xs) {
      const loads = [], loadIndexOf = new Array(n).fill(-1);
      for (let j = 0; j < n; j++) {
        if (st[j].active && !st[j].done && !st[j].stalled) {
          loadIndexOf[j] = loads.length;
          loads.push({ x: xs[j], P: pods[j].m * G });
        }
      }
      return { loads, loadIndexOf };
    }

    function deriv(xs, vs) {
      const { loads, loadIndexOf } = buildLoads(xs);
      const dx = new Array(n).fill(0), dv = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        if (loadIndexOf[i] < 0) continue;
        const { a, c } = accel(i, xs, vs, loads, loadIndexOf);
        dx[i] = vs[i] * c;
        dv[i] = a;
      }
      return { dx, dv };
    }

    let t = Math.min(...pods.map((p) => p.depart));
    const dt = o.dt;
    let nextSample = t;
    let peakT = 0;
    const tEnd = t + o.tMax;
    while (t < tEnd) {
      for (let i = 0; i < n; i++) {
        // block dispatch: the lever stays locked until the pod ahead passes the
        // block marker at blockX (or has arrived); a stalled pod ahead keeps it locked
        const b = pods[i].blockAfter;
        const blockClear = b == null || st[b].done || (st[b].active && !st[b].stalled && st[b].x >= pods[i].blockX);
        if (!st[i].active && t >= pods[i].depart && blockClear) {
          st[i].active = true;
          st[i].departT = t;
          st[i].x = 1e-6;
        }
      }
      if (st.every((s) => s.done || s.stalled)) break;
      if (st.every((s, i) => s.done || s.stalled || (!s.active && pods[i].blockAfter != null && st[pods[i].blockAfter].stalled))) break;

      const xs = st.map((s) => s.x), vs = st.map((s) => s.v);
      // RK4
      const k1 = deriv(xs, vs);
      const x2 = xs.map((x, i) => x + 0.5 * dt * k1.dx[i]), v2 = vs.map((v, i) => v + 0.5 * dt * k1.dv[i]);
      const k2 = deriv(x2, v2);
      const x3 = xs.map((x, i) => x + 0.5 * dt * k2.dx[i]), v3 = vs.map((v, i) => v + 0.5 * dt * k2.dv[i]);
      const k3 = deriv(x3, v3);
      const x4 = xs.map((x, i) => x + dt * k3.dx[i]), v4 = vs.map((v, i) => v + dt * k3.dv[i]);
      const k4 = deriv(x4, v4);

      const { loads } = buildLoads(xs);
      peakT = Math.max(peakT, peakTension(wire, loads));

      for (let i = 0; i < n; i++) {
        const s = st[i];
        if (!s.active || s.done || s.stalled) continue;
        const nx = xs[i] + (dt / 6) * (k1.dx[i] + 2 * k2.dx[i] + 2 * k3.dx[i] + k4.dx[i]);
        const nv = vs[i] + (dt / 6) * (k1.dv[i] + 2 * k2.dv[i] + 2 * k3.dv[i] + k4.dv[i]);
        const a = (nv - vs[i]) / dt;
        if (a < 0) s.aPeak = Math.max(s.aPeak, -a);
        s.vPeak = Math.max(s.vPeak, nv);
        if (nx >= L) {
          const frac = (L - xs[i]) / Math.max(nx - xs[i], 1e-9);
          s.arrive = t + frac * dt;
          s.vArr = vs[i] + frac * (nv - vs[i]);
          s.x = L; s.v = 0; s.done = true;
        } else if (nv < cfg.creepSpeed && t > (s.departT ?? pods[i].depart) + 5) {
          // creeping below creepSpeed short of the dock counts as a stall: the pod
          // would need to be hauled in by hand, which is not an evacuation
          s.x = nx; s.v = 0; s.stalled = true;
        } else {
          s.x = nx; s.v = Math.max(nv, 0);
        }
      }

      // spacing between consecutive pods on this wire (leader i-1 ahead of follower i)
      for (let i = 1; i < n; i++) {
        if (st[i].active && !st[i].done && st[i - 1].active && !st[i - 1].done) {
          st[i].minSep = Math.min(st[i].minSep, st[i - 1].x - st[i].x);
        }
      }

      t += dt;
      if (t >= nextSample) {
        for (let i = 0; i < n; i++) {
          const s = st[i];
          if (!s.active) continue;
          if (s.traj.t.length && s.traj.x[s.traj.x.length - 1] >= L && s.done) continue;
          s.traj.t.push(+t.toFixed(3));
          s.traj.x.push(s.x);
          s.traj.v.push(s.v);
        }
        nextSample += o.sample;
      }
    }

    const out = st.map((s, i) => ({
      depart: s.departT ?? pods[i].depart,
      held: !s.active,
      arrive: s.arrive,
      vArr: s.vArr,
      vPeak: s.vPeak,
      aPeakG: s.aPeak / G,
      impactG: s.vArr != null ? arrest(Object.assign({}, cfg, { brakeK: o.brakeK }), pods[i].m, s.vArr, pods[i].brakeScale).peakG : null,
      stalled: s.stalled,
      stallX: s.stalled ? s.x : null,
      minSep: s.minSep,
      traj: s.traj,
    }));
    out.peakTension = peakT;
    return out;
  }

  // Auto-size the eddy-current brake (k_b in N·s/m). Two passive-brake constraints:
  //   (a) a FULL pod should reach the dock no faster than dockSpeed;
  //   (b) the LIGHTEST pod we expect to dispatch must still reach the dock at
  //       >= 1 m/s (a linear eddy brake over-brakes light pods: decel = k v / m).
  // k_b = min(k_a, k_b). If (a) cannot be met, the terminal buffer takes the rest
  // and the evacuation flags the buffer deceleration.
  function designBrake(cfg) {
    if (cfg.terminal === 'switchyard') return designBayBrake(cfg);
    const wire = makeWire(cfg);
    const P = cfg.crew + cfg.ground;
    const nPods = Math.max(1, Math.ceil(P / cfg.podCapacity));
    const nLight = cfg.loading === 'balance' ? Math.max(1, Math.floor(P / nPods)) : Math.max(1, P - (nPods - 1) * cfg.podCapacity);
    const xBrake = wire.L - cfg.brakeRunout - cfg.brakeLength;
    // arrival speed, or -1 if the pod stalls or crawls below 1 m/s anywhere in the brake zone
    const arr = (k, n, wind) => {
      const pod = [{ depart: 0, m: podMass(cfg, n), cda: podCdA(cfg, n) }];
      const r = simulateWire(cfg, wire, pod, { brakeK: k, wind, sample: 0.25 })[0];
      if (r.stalled) return -1;
      for (let i = 0; i < r.traj.x.length; i++) if (r.traj.x[i] > xBrake + 5 && r.traj.x[i] < wire.L - 0.5 && r.traj.v[i] < 1) return -1;
      return r.vArr;
    };
    // largest k that satisfies "arrives at >= vMin" for occupancy n (monotone in k)
    const kMaxFor = (n, vMin, wind) => {
      let lo = 0, hi = 20000;
      if (arr(hi, n, wind) >= vMin) return hi;
      for (let it = 0; it < 24; it++) {
        const mid = 0.5 * (lo + hi);
        if (arr(mid, n, wind) >= vMin) lo = mid; else hi = mid;
      }
      return lo;
    };
    // design corners: the full pod with a tailwind (fastest case), the lightest pod
    // into a headwind (slowest case); designWind = 17.5 m/s (34 kn, Shuttle-era [R3])
    const kFull = kMaxFor(cfg.podCapacity, cfg.dockSpeed, cfg.designWind);
    const kLight = kMaxFor(nLight, 1.0, -cfg.designWind);
    return Math.round(Math.min(kFull, kLight));
  }

  // Bay brake (switch yard): pods reach the points unbraked. Size k_b so the lightest
  // pod arriving at the fastest speed (design tailwind) decelerates at <= aMax.
  function designBayBrake(cfg) {
    const wire = makeWire(cfg);
    const P = cfg.crew + cfg.ground;
    const nPods = Math.max(1, Math.ceil(P / cfg.podCapacity));
    const nLight = cfg.loading === 'balance' ? Math.max(1, Math.floor(P / nPods)) : Math.max(1, P - (nPods - 1) * cfg.podCapacity);
    const mL = podMass(cfg, nLight);
    const r = simulateWire(cfg, wire, [{ depart: 0, m: mL, cda: podCdA(cfg, nLight) }], { brakeK: 0, wind: cfg.designWind, sample: 5 })[0];
    if (!r.vArr) return 0;
    return Math.round((0.97 * cfg.aMaxG * G * mL) / r.vArr); // 3 % margin
  }

  // ---------------------------------------------------------------------------
  // Terminal arrester: what stops a pod at the end of the wire.
  //  'net'   ideal catch net with stroke s: a = v^2 / 2s, t = 2s / v.
  //  'chain' drag-chain bed (Shuttle heritage): heavier chains are picked up as the
  //          pod advances, k_c kg per metre, dragged over sand with friction mu_s.
  //          F = mu_s g k_c s  ->  simple-harmonic stop with w^2 = mu_s g k_c / m:
  //          stop distance v/w, peak deceleration v w, stop time pi / (2w).
  //          Speed only matters through v, so it stops a pod whose magnetic brake
  //          has failed. If the bed is overrun, a short backup net takes the rest.
  // ---------------------------------------------------------------------------
  function arrest(cfg, m, v, brakeScale) {
    if (v == null) return null;
    if (cfg.terminal === 'switchyard') return bayStop(cfg, m, v, (cfg.brakeK || 0) * (brakeScale ?? 1));
    return endStop(cfg, m, v);
  }

  // Switch-yard bay: level rail with the magnetic brake (length brakeLength), then the
  // arrester. Linear eddy brake on the level: m dv/dx = -k  ->  v falls linearly with
  // distance (dv = k L / m) and exponentially with time (v = v0 e^(-k t / m)).
  function bayStop(cfg, m, v0, k) {
    const Lb = cfg.brakeLength;
    const magG = (k * v0) / m / G;
    const vStop = 0.5; // m/s: counts as stopped
    if (k > 0 && (k * Lb) / m >= v0 - vStop) {
      return { type: 'bay brake', dist: (m * (v0 - vStop)) / k, peakG: magG, t: (m / k) * Math.log(v0 / vStop), vOver: 0, vExit: 0 };
    }
    const v1 = k > 0 ? v0 - (k * Lb) / m : v0;
    const tMag = k > 0 ? (m / k) * Math.log(v0 / v1) : Lb / v0;
    const end = endStop(cfg, m, v1);
    return { type: k > 0 ? 'bay brake + ' + end.type : end.type + ' (brake failed)', dist: Lb + end.dist, peakG: Math.max(magG, end.peakG), t: tMag + end.t, vOver: end.vOver, vExit: v1 };
  }

  function endStop(cfg, m, v) {
    if (cfg.arrester === 'chain') {
      const w = Math.sqrt((cfg.chainMu * G * cfg.chainKc) / m);
      const s = v / w;
      if (s <= cfg.bedLength) return { type: 'chain', dist: s, peakG: (v * w) / G, t: Math.PI / (2 * w), vOver: 0 };
      const vEnd = Math.sqrt(v * v - w * w * cfg.bedLength * cfg.bedLength);
      const aNet = (vEnd * vEnd) / (2 * cfg.netStroke);
      const t1 = Math.asin(Math.min(1, (w * cfg.bedLength) / v)) / w;
      return { type: 'chain+net', dist: cfg.bedLength + cfg.netStroke, peakG: Math.max(w * cfg.bedLength, aNet) / G, t: t1 + (2 * cfg.netStroke) / vEnd, vOver: vEnd };
    }
    const a = (v * v) / (2 * cfg.bufferLength);
    return { type: 'net', dist: cfg.bufferLength, peakG: a / G, t: v > 0 ? (2 * cfg.bufferLength) / v : 0, vOver: 0 };
  }

  // Which pods have a working magnetic brake (multiplier on k_b).
  //  'ok' all work; 'one' the second pod to leave has failed (the hardest case on a
  //  single wire: a fast pod behind a normal one); 'all' every brake failed; 'half' all at 50%.
  function brakeHealth(cfg, podIndex) {
    switch (cfg.brakeCondition) {
      case 'all': return 0;
      case 'half': return 0.5;
      case 'one': return podIndex === 1 || (podIndex === 0 && cfg.wires * cfg.podsPerWire === 1) ? 0 : 1;
      default: return 1;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Evacuation: people -> pods -> wires -> terminus -> safety
  // ---------------------------------------------------------------------------

  const DEFAULTS = {
    vehicle: 'REF',
    stages: null, // null -> from vehicle preset
    dangerLevel: 4,
    participation: null, // override f
    warnTime: null, // override warning time
    kFactor: 40,
    solidTntFraction: 0,
    sep: 200, // fireball surface emissive power, kW/m^2
    thermalDoseLimit: 100, // (kW/m^2)^(4/3)·s — first-degree-burn threshold region

    accessHeight: 42,
    terminusHeight: -3, // landing pit 3 m below grade
    span: 300,
    towerOffset: 15,

    cableDiameter: 36, // mm
    tension: 150, // kN, horizontal, held by counterweight
    cableSF: 5,

    wires: 2,
    podsPerWire: 2,
    podCapacity: 4,
    podMass: 300, // kg, empty basket + trolley
    personMass: 100, // kg incl. suit / gear
    cdaPod: 1.0, // m^2
    cdaPerson: 0.15, // m^2 per occupant
    mu: 0.02, // trolley rolling resistance
    rho: 1.2,
    wind: 0, // along-wire tailwind, m/s
    designWind: 17.5, // m/s, brake is sized for ± this along-wire wind

    brakeLength: 60,
    brakeRunout: 15, // m of unbraked track between the brake fins and the dock
    brakeK: null, // null -> auto (designBrake)
    dockSpeed: 4, // m/s target arrival speed for a full pod
    creepSpeed: 0.2, // m/s; slower than this before the dock = stalled
    bufferLength: 10, // m, catch-net stroke at the dock (arrester 'net')
    arrester: 'net', // 'net' | 'chain' (drag-chain bed + short backup net)
    chainKc: 40, // kg of chain picked up per metre of bed
    chainMu: 0.6, // steel chain sliding on sand
    bedLength: 50, // m: a full pod with a failed brake in the design tailwind stops inside it
    netStroke: 3, // m, backup net at the end of the chain bed
    brakeCondition: 'ok', // 'ok' | 'one' | 'all' | 'half'
    aMaxG: 1.5, // human deceleration limit used for checks

    crew: 3, // flight crew in the capsule
    ground: 6, // close-out crew in the white room
    tReact: 10, // alarm -> start moving
    tHatch: 60, // capsule hatch open + crew unstrap
    tWalk: 20, // white room -> pod platform
    tGap: 3, // single-file spacing through the access arm
    tBoard: 5, // per person
    tRelease: 3, // occupant pulls the release lever inside the pod (lever unlocks only after the headway)
    headway: null, // null -> auto (minHeadway)
    loading: 'balance', // 'balance' | 'fill'
    tClear: 20, // single dock: pod stopped, unloaded and moved off the dock
    terminal: 'dock', // 'dock' (unload in place) | 'switchyard' (points send each pod to its own bay)
    bays: 4, // switch-yard receiving bays (each with its own arrester) per wire
    tSwitch: 3, // s: pod clears the points and they index to the next bay
    tBayReset: 20, // s: unloaded pod pushed out of its bay before the bay can be reused
    bayWalk: 15, // m: bay to bunker door
    failSafeHeadway: false, // also space pods so a follower with a failed brake cannot catch up
    dispatch: 'timed', // 'timed' (fixed headway) | 'block' (lever unlocks when the pod ahead passes a marker)
    blockX: null, // m along the wire; null -> auto (minBlock)
    podLength: 3,

    tUnload: 15,
    safeMode: 'bunker', // 'bunker' | 'vehicle'
    vehicleLoad: 20, // s to board the armoured vehicle
    vehicleSpeed: 12, // m/s average
    bunkerWalk: 40, // m terminus -> bunker door
    runSpeed: 3, // m/s
    bunkerPsi: 10, // bunker blast rating

    costWire: 10, // relative cost units per wire (cable, anchors, brake, counterweight)
    costPod: 2, // per pod
    costBay: 1.5, // per switch-yard bay (rail, points, bay brake, chain bed)

    dt: 0.02,
  };

  function resolve(cfgIn) {
    const cfg = Object.assign({}, DEFAULTS, cfgIn || {});
    const veh = VEHICLES[cfg.vehicle];
    if (!cfg.stages) cfg.stages = veh ? veh.stages : VEHICLES.REF.stages;
    return cfg;
  }

  function arrivals(cfg, rnd) {
    // returns sorted arrival times at the pod platform
    const people = [];
    const r = rnd || {};
    for (let i = 0; i < cfg.ground; i++) {
      people.push({ group: 'ground', t: (r.tReact ?? cfg.tReact) + (r.tWalk ?? cfg.tWalk) + i * (r.tGap ?? cfg.tGap) });
    }
    for (let i = 0; i < cfg.crew; i++) {
      people.push({ group: 'crew', t: (r.tReact ?? cfg.tReact) + (r.tHatch ?? cfg.tHatch) + (r.tWalk ?? cfg.tWalk) + i * (r.tGap ?? cfg.tGap) });
    }
    people.sort((a, b) => a.t - b.t);
    // the access arm is single file: nobody arrives closer than tGap behind the person ahead
    for (let i = 1; i < people.length; i++) {
      people[i].t = Math.max(people[i].t, people[i - 1].t + (r.tGap ?? cfg.tGap));
    }
    return people;
  }

  // ---------------------------------------------------------------------------
  // Where the bunker is, measured from the rocket:
  //   d_B = x_tower + L_span + L_stop + d_run
  // x_tower: rocket to tower; L_span: horizontal wire span; L_stop: track the pod uses
  // after the end of the wire (single dock: arrester stroke; switch yard: bay brake +
  // arrester + 5 m); d_run: walk/run from where the pod stops to the bunker door.
  // ---------------------------------------------------------------------------
  function stopLength(cfg) {
    const arr = cfg.arrester === 'chain' ? cfg.bedLength + cfg.netStroke : cfg.bufferLength;
    return cfg.terminal === 'switchyard' ? cfg.brakeLength + arr + 5 : arr;
  }
  function runDistance(cfg) { return cfg.terminal === 'switchyard' ? cfg.bayWalk : cfg.bunkerWalk; }
  function bunkerDistance(cfg) { return cfg.towerOffset + cfg.span + stopLength(cfg) + runDistance(cfg); }

  function terminusToSafe(cfg, hz, dTerm, rnd) {
    const r = rnd || {};
    if (dTerm >= hz.rReq) return { mode: 'terminus', t: 0 };
    if (cfg.safeMode === 'bunker') {
      // lower limit on the bunker distance: outside 1.5 fireball radii, and where the
      // blast overpressure is within the bunker's rating
      const rB = Math.max(hz.rForPsi(cfg.bunkerPsi), hz.fireballD * 0.75);
      const dB = bunkerDistance(cfg);
      const t = runDistance(cfg) / (r.runSpeed ?? cfg.runSpeed);
      return { mode: 'bunker', t, ok: dB >= rB, rBunker: rB, dBunker: dB };
    }
    const t = (r.vehicleLoad ?? cfg.vehicleLoad) + (hz.rReq - dTerm) / cfg.vehicleSpeed;
    return { mode: 'vehicle', t };
  }

  /**
   * Full evacuation for one configuration.
   * rnd (optional) supplies sampled values for Monte Carlo runs.
   */
  function evacuate(cfgIn, rnd) {
    const cfg = resolve(cfgIn);
    const r = rnd || {};
    const hz = hazard(cfg);
    const wire = makeWire(cfg);
    const flags = [];
    if (cfg.brakeK == null) cfg.brakeK = designBrake(cfg);
    const brakeK = cfg.brakeK * (r.brakeScale ?? 1);

    // people & pods
    const people = arrivals(cfg, r).map((p, i) => Object.assign(p, {
      id: i, mass: r.personMasses ? r.personMasses[i % r.personMasses.length] : cfg.personMass,
    }));
    const P = people.length;
    const c = cfg.podCapacity;
    const nPodsNeeded = Math.ceil(P / c);
    const nPodsAvail = cfg.wires * cfg.podsPerWire;
    if (nPodsNeeded > nPodsAvail) flags.push({ level: 'fail', msg: `Not enough seats: ${P} people, ${nPodsAvail} pods × ${c} = ${nPodsAvail * c}` });

    // 'fill': c, c, ..., remainder. 'balance': spread people evenly over the pods
    // needed (9 people, c=4 -> 3,3,3 instead of 4,4,1) so no pod runs nearly empty.
    const nPods = Math.min(nPodsNeeded, nPodsAvail);
    const sizes = [];
    for (let j = 0; j < nPods; j++) {
      sizes.push(cfg.loading === 'balance'
        ? Math.floor(P / nPods) + (j < P % nPods ? 1 : 0)
        : Math.min(c, P - j * c));
    }
    const pods = [];
    let first = 0;
    for (let j = 0; j < nPods; j++) {
      const occ = people.slice(first, first + sizes[j]);
      first += sizes[j];
      let done = 0;
      for (const p of occ) {
        done = Math.max(done, p.t) + (r.tBoard ?? cfg.tBoard);
        p.boarded = done;
        p.pod = j;
      }
      pods.push({
        id: j, wire: j % cfg.wires, slot: Math.floor(j / cfg.wires),
        n: occ.length, people: occ.map((p) => p.id),
        m: cfg.podMass + occ.reduce((s, p) => s + p.mass, 0),
        cda: podCdA(cfg, occ.length) * (r.cdaScale ?? 1),
        ready: done + (r.tRelease ?? cfg.tRelease),
        brakeScale: brakeHealth(cfg, j),
      });
    }

    const block = cfg.dispatch === 'block';
    const headway = block ? 0 : cfg.headway != null ? cfg.headway : (cfg.podsPerWire > 1 ? minHeadway(cfg) : 0);
    const blockX = block ? (cfg.blockX != null ? cfg.blockX : (cfg.podsPerWire > 1 ? minBlock(cfg) : 0)) : null;

    // dispatch with headway on each wire (series pods leave in slot order)
    const byWire = Array.from({ length: cfg.wires }, () => []);
    for (const p of pods) byWire[p.wire].push(p);
    let peakTension = 0;
    for (let w = 0; w < cfg.wires; w++) {
      const list = byWire[w];
      let last = -Infinity;
      for (const [i, p] of list.entries()) {
        if (cfg.dispatch === 'block') {
          p.depart = p.ready;
          if (i > 0) { p.blockAfter = i - 1; p.blockX = blockX; }
        } else {
          p.depart = Math.max(p.ready, last + headway);
          last = p.depart;
        }
      }
      if (!list.length) continue;
      const res = simulateWire(cfg, wire, list, {
        mu: r.mu ?? cfg.mu, wind: r.wind ?? cfg.wind, brakeK,
      });
      peakTension = Math.max(peakTension, res.peakTension);
      list.forEach((p, i) => Object.assign(p, res[i]));
      // terminus: the follower must not arrive before the leader has cleared the main
      // line (single dock: stopped + unloaded + moved off; switch yard: past the points)
      const clear = cfg.terminal === 'switchyard' ? cfg.tSwitch : cfg.tClear;
      for (let i = 1; i < list.length; i++) {
        const a = list[i - 1], b = list[i];
        if (a.arrive != null && b.arrive != null && b.arrive < a.arrive + clear - 0.05) {
          b.dockConflict = true;
          flags.push({ level: 'fail', msg: `Wire ${w + 1}: pod ${b.id + 1} reaches the ${cfg.terminal === 'switchyard' ? 'points' : 'dock'} ${(a.arrive + clear - b.arrive).toFixed(1)} s before pod ${a.id + 1} clears it` });
        }
        if (b.minSep < cfg.podLength + 2) {
          flags.push({ level: 'fail', msg: `Wire ${w + 1}: pods ${a.id + 1}/${b.id + 1} come within ${b.minSep.toFixed(1)} m on the wire` });
        }
      }
    }

    // arrester stop for every pod; switch-yard bay assignment (points index per pod)
    for (const p of pods) {
      p.stop = p.arrive != null ? arrest(Object.assign({}, cfg, { brakeK: brakeK }), p.m, p.vArr, p.brakeScale) : null;
      p.impactG = p.stop ? p.stop.peakG : null;
    }
    if (cfg.terminal === 'switchyard') {
      for (let w = 0; w < cfg.wires; w++) {
        const bayFree = new Array(cfg.bays).fill(-Infinity);
        byWire[w].forEach((p, i) => {
          p.bay = i % cfg.bays;
          if (p.arrive == null) return;
          if (p.arrive < bayFree[p.bay]) {
            flags.push({ level: 'fail', msg: `Wire ${w + 1}: pod ${p.id + 1} reaches bay ${p.bay + 1} ${(bayFree[p.bay] - p.arrive).toFixed(0)} s before it is empty; add bays` });
          }
          bayFree[p.bay] = p.arrive + p.stop.t + (r.tUnload ?? cfg.tUnload) + cfg.tBayReset;
        });
      }
    }

    const dTerm = cfg.towerOffset + cfg.span;
    const leg = terminusToSafe(cfg, hz, dTerm, r);
    if (leg.mode === 'bunker' && !leg.ok) flags.push({ level: 'fail', msg: `The bunker (${leg.dBunker.toFixed(0)} m from the rocket) is closer than its ${leg.rBunker.toFixed(0)} m minimum (fireball margin or ${cfg.bunkerPsi} psi rating)` });

    let tAll = 0;
    for (const p of pods) {
      if (p.held) {
        flags.push({ level: 'fail', msg: cfg.dispatch === 'block' ? `Pod ${p.id + 1} is held at the platform: the pod ahead never cleared the block marker` : `Pod ${p.id + 1} never leaves the platform within the simulated time` });
        p.safe = Infinity;
      } else if (p.stalled) {
        flags.push({ level: 'fail', msg: `Pod ${p.id + 1} stalls ${(wire.L - p.stallX).toFixed(0)} m short of the terminus` });
        p.safe = Infinity;
      } else {
        p.unloaded = p.arrive + p.stop.t + (r.tUnload ?? cfg.tUnload);
        p.safe = p.unloaded + leg.t;
      }
      if (p.aPeakG > cfg.aMaxG) flags.push({ level: 'warn', msg: `Pod ${p.id + 1}: braking peak ${p.aPeakG.toFixed(2)} g > ${cfg.aMaxG} g limit` });
      if (p.stop && p.stop.peakG > 2 * cfg.aMaxG) flags.push({ level: 'fail', msg: `Pod ${p.id + 1}: ${p.stop.type === 'net' ? 'catch-net' : 'arrester'} stop of ${p.stop.peakG.toFixed(1)} g at ${p.vArr.toFixed(1)} m/s could injure occupants${p.brakeScale < 1 ? ' (magnetic brake ' + (p.brakeScale === 0 ? 'failed' : 'weak') + ')' : ''}` });
      else if (p.stop && p.stop.peakG > cfg.aMaxG) flags.push({ level: 'warn', msg: `Pod ${p.id + 1}: arrester stop ${p.stop.peakG.toFixed(2)} g (arrives at ${p.vArr.toFixed(1)} m/s)` });
      if (p.stop && p.stop.vOver > 0) flags.push({ level: 'warn', msg: `Pod ${p.id + 1} overruns the chain bed at ${p.stop.vOver.toFixed(1)} m/s; backup net stops it` });
      for (const id of p.people) people[id].safe = p.safe;
      tAll = Math.max(tAll, p.safe);
    }
    if (nPodsNeeded > nPodsAvail) tAll = Infinity;
    if (peakTension > wire.cable.allow) {
      flags.push({ level: 'fail', msg: `Cable tension ${(peakTension / 1000).toFixed(0)} kN exceeds allowable ${(wire.cable.allow / 1000).toFixed(0)} kN (SF ${cfg.cableSF})` });
    }

    const margin = hz.warn - tAll;
    // effective headway actually flown (block dispatch varies with wind and load)
    let gaps = [];
    for (const list of byWire) for (let i = 1; i < list.length; i++) if (list[i].depart != null && !list[i].held) gaps.push(list[i].depart - list[i - 1].depart);
    const headwayFlown = gaps.length ? Math.max(...gaps) : 0;
    return {
      cfg, hazard: hz, wire, people, pods, headway: block ? headwayFlown : headway, blockX, brakeK,
      dTerminus: dTerm, leg, peakTension, tAll, margin, flags,
      status: !isFinite(tAll) || flags.some((f) => f.level === 'fail') ? 'fail' : margin < 0 ? 'unsafe' : margin < 0.25 * hz.warn ? 'marginal' : 'safe',
      cost: cfg.wires * cfg.costWire + cfg.wires * cfg.podsPerWire * cfg.costPod + (cfg.terminal === 'switchyard' ? cfg.wires * cfg.bays * cfg.costBay : 0),
    };
  }

  // Smallest dispatch interval between consecutive pods on one wire such that the
  // follower never closes within podLength+2 m and reaches the dock only after the
  // leader has been cleared. Checked for the worst pairing (a light, slow leader
  // followed by a full, fast pod), for two full pods, and at both wind corners;
  // +1 s operating margin.
  // Size the brake and the dispatch rule once, so repeated runs (Monte Carlo, trade
  // study, sensitivity) reuse them instead of re-deriving them every time.
  function prepare(cfgIn) {
    const cfg = resolve(cfgIn);
    if (cfg.brakeK == null) cfg.brakeK = designBrake(cfg);
    if (cfg.dispatch === 'block') { if (cfg.blockX == null) cfg.blockX = cfg.podsPerWire > 1 ? minBlock(cfg) : 0; }
    else if (cfg.headway == null) cfg.headway = cfg.podsPerWire > 1 ? minHeadway(cfg) : 0;
    return cfg;
  }

  // Pairs and winds used to prove a dispatch rule safe (see minHeadway / minBlock).
  function dispatchCases(cfg) {
    const P = cfg.crew + cfg.ground;
    const nPods = Math.max(1, Math.ceil(P / cfg.podCapacity));
    const nLight = Math.max(1, cfg.loading === 'balance' ? Math.floor(P / nPods) : P - (nPods - 1) * cfg.podCapacity);
    const pod = (n, brakeScale) => ({ m: podMass(cfg, n), cda: podCdA(cfg, n), brakeScale: brakeScale ?? 1 });
    const pairs = [[pod(cfg.podCapacity), pod(cfg.podCapacity)], [pod(nLight), pod(cfg.podCapacity)]];
    if (cfg.failSafeHeadway) pairs.push([pod(nLight), pod(cfg.podCapacity, 0)]);
    // a wind in which a pod stalls even on its own cannot be fixed by spacing; that
    // stall is reported by evacuate(), so such winds are left out here
    const wire = makeWire(cfg);
    const alone = (p, wind) => !simulateWire(cfg, wire, [{ depart: 0, ...p }], { sample: 5, wind })[0].stalled;
    const winds = [0, -cfg.designWind, cfg.designWind].filter((wind) => alone(pod(nLight), wind) && alone(pod(cfg.podCapacity), wind));
    return { pairs, winds, clear: cfg.terminal === 'switchyard' ? cfg.tSwitch : cfg.tClear };
  }

  // Block dispatch: smallest marker position (m along the wire) such that a follower
  // released when its leader passes the marker is safe for every case in dispatchCases.
  function minBlock(cfgIn) {
    const cfg = resolve(cfgIn);
    if (cfg.brakeK == null) cfg.brakeK = designBrake(cfg);
    const wire = makeWire(cfg);
    const { pairs, winds, clear } = dispatchCases(cfg);
    const ok = (xb) => pairs.every(([a, b]) => winds.every((wind) => {
      const res = simulateWire(cfg, wire, [{ depart: 0, ...a }, { depart: 0, blockAfter: 0, blockX: xb, ...b }], { sample: 5, wind });
      // a leader stall here is caused by the follower's weight on the cable (alone it
      // would arrive: designBrake guarantees that), so the marker is too early
      if (res[0].stalled || res[1].stalled) return false;
      return res[1].arrive >= res[0].arrive + clear && res[1].minSep >= cfg.podLength + 2;
    }));
    let lo = 0, hi = wire.L;
    if (!ok(hi)) return wire.L;
    for (let it = 0; it < 16; it++) {
      const mid = 0.5 * (lo + hi);
      if (ok(mid)) hi = mid; else lo = mid;
    }
    return Math.min(wire.L, Math.ceil(hi / 5) * 5 + 10); // round up + 10 m margin
  }

  function minHeadway(cfgIn) {
    const cfg = resolve(cfgIn);
    if (cfg.brakeK == null) cfg.brakeK = designBrake(cfg);
    const wire = makeWire(cfg);
    // checked for every pairing in dispatchCases (incl. a failed-brake follower when
    // failSafeHeadway) in calm air and at both design-wind corners
    const { pairs, winds, clear } = dispatchCases(cfg);
    const okPair = (a, b, h) => winds.every((wind) => okPairWind(a, b, h, wind));
    const okPairWind = (a, b, h, wind) => {
      const res = simulateWire(cfg, wire, [{ depart: 0, ...a }, { depart: h, ...b }], { sample: 5, wind });
      // the follower's weight flattens the end of the cable under the leader, so a
      // too-short headway can stall the leader short of the dock (cable coupling)
      if (res[0].stalled || res[1].stalled) return false; // a pair that stalls is never safe
      return res[1].arrive >= res[0].arrive + clear && res[1].minSep >= cfg.podLength + 2;
    };
    let worst = 0;
    for (const [a, b] of pairs) {
      const ok = (h) => okPair(a, b, h);
      let lo = 0, hi = 5;
      while (!ok(hi) && hi < 400) hi *= 2;
      for (let it = 0; it < 18; it++) {
        const mid = 0.5 * (lo + hi);
        if (ok(mid)) hi = mid; else lo = mid;
      }
      worst = Math.max(worst, hi);
    }
    return Math.ceil(worst) + 1;
  }

  // ---------------------------------------------------------------------------
  // The bunker window: how close and how far from the rocket the bunker may be.
  //  minimum  d_min = max( R(p_rating), 1.5 R_fireball )          (hazard)
  //  maximum  d_max = x_tower + L_span + L_stop + v_run (T_warn - t_out)   (time)
  //           with L_span <= L_reach, the longest span on which a light pod with no
  //           magnetic brake still reaches the end in the design headwind and the
  //           rope stays within its allowable tension (reach)
  // t_out = time the last person steps out of a pod; T_warn = warning window.
  // ---------------------------------------------------------------------------
  function maxSpan(cfgIn) {
    const cfg = resolve(cfgIn);
    const P = cfg.crew + cfg.ground;
    const nPods = Math.max(1, Math.ceil(P / cfg.podCapacity));
    const nLight = Math.max(1, cfg.loading === 'balance' ? Math.floor(P / nPods) : P - (nPods - 1) * cfg.podCapacity);
    const ok = (span) => {
      const c = Object.assign({}, cfg, { span });
      const wire = makeWire(c);
      const run = simulateWire(c, wire, [{ depart: 0, m: podMass(c, nLight), cda: podCdA(c, nLight) }], { brakeK: 0, wind: -c.designWind, sample: 5 })[0];
      if (run.stalled) return { ok: false, why: 'stall' };
      const T = peakTension(wire, [{ x: span / 2, P: podMass(c, c.podCapacity) * G }]);
      return T <= wire.cable.allow ? { ok: true } : { ok: false, why: 'tension' };
    };
    // very short, steep spans overload the rope (T sqrt(1 + slope^2)), so first find a
    // span that works, then search outwards for the longest
    let lo = 50;
    while (lo < 3000 && !ok(lo).ok) lo += 25;
    if (lo >= 3000) return { span: null, limit: 'none' };
    let hi = lo * 2;
    while (ok(hi).ok && hi < 20000) hi *= 2;
    const limit = ok(hi).why;
    for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (ok(mid).ok) lo = mid; else hi = mid; }
    return { span: lo, limit };
  }

  function bunkerWindow(cfgIn, res, tOutOverride) {
    const cfg = prepare(cfgIn);
    const r = res || evacuate(cfg);
    const hz = r.hazard;
    const rMinBlast = hz.rForPsi(cfg.bunkerPsi);
    const rMinFire = 0.75 * hz.fireballD;
    const reach = maxSpan(cfg);
    const run = runDistance(cfg) / cfg.runSpeed;
    const tOut = tOutOverride != null ? tOutOverride : r.tAll - run;   // last person out of a pod
    const runMax = Math.max(0, cfg.runSpeed * (hz.warn - tOut));
    const fixed = cfg.towerOffset + stopLength(cfg);
    return {
      rMinBlast, rMinFire, dMin: Math.max(rMinBlast, rMinFire), rReq: hz.rReq,
      towerOffset: cfg.towerOffset, span: cfg.span, stopLength: stopLength(cfg), run: runDistance(cfg),
      dBunker: bunkerDistance(cfg), spanReach: reach.span, reachLimit: reach.limit,
      tOut, warn: hz.warn, runMax, dMax: fixed + cfg.span + runMax,
      dMaxReach: reach.span != null ? fixed + reach.span + runMax : null,
    };
  }

  // ---------------------------------------------------------------------------
  // Materials and bill of materials (typical handbook values; final design must use
  // certified mill data). BOM quantities are computed from the chosen design.
  // ---------------------------------------------------------------------------
  const MATERIALS = {
    rope: { name: 'Steel wire rope, 6×36 IWRC, EIPS, galvanised', standard: 'ASTM A1023; wire grade ≈ 1,960 MPa', density: 'rope 0.0043 d² kg/m (d in mm)', E: 'rope modulus ≈ 100 GPa', strength: 'MBS ≈ 0.70 d² kN', why: 'Keeps about half its strength at 550 °C, unlike polymer ropes; zinc coating for salt air' },
    al6061: { name: 'Aluminium 6061-T6', standard: 'ASTM B221 (extrusions)', density: '2,700 kg/m³', E: '69 GPa', strength: 'σy 276 MPa, σu 310 MPa', why: 'Light, weldable pod frame; does not spark; good corrosion resistance' },
    s355: { name: 'Structural steel S355, hot-dip galvanised', standard: 'EN 10025-2; ISO 1461', density: '7,850 kg/m³', E: '210 GPa', strength: 'σy 355 MPa, σu 470–630 MPa', why: 'Anchors, magnet back-iron, rails; tough and easy to weld' },
    ss316: { name: 'Stainless steel 316', standard: 'ASTM A276', density: '8,000 kg/m³', E: '193 GPa', strength: 'σy 205 MPa, σu 515 MPa; PREN ≈ 24', why: 'Axles, pins and fasteners in marine air' },
    ph174: { name: 'Stainless steel 17-4PH (H1025)', standard: 'ASTM A564', density: '7,800 kg/m³', E: '197 GPa', strength: 'σy ≈ 1,000 MPa, σu ≈ 1,070 MPa', why: 'Release-latch pawl and pin: high strength, small parts' },
    ndfeb: { name: 'NdFeB magnet, grade N42SH, Ni-Cu-Ni coated', standard: 'IEC 60404-8-1', density: '7,500 kg/m³', E: '≈ 160 GPa', strength: 'Br 1.29–1.32 T; HcJ ≥ 1,592 kA/m; max 150 °C', why: 'Strong permanent field with no power; SH grade resists heat and demagnetising' },
    copper: { name: 'Copper C11000 (ETP)', standard: 'ASTM B152', density: '8,960 kg/m³', E: '117 GPa', strength: 'σ = 58 MS/m (100 % IACS)', why: 'Brake fin: eddy-current force grows with conductivity (aluminium gives ≈ 43 %)' },
    pa6: { name: 'Cast nylon PA6 sheave liner', standard: 'ISO 1874', density: '1,150 kg/m³', E: '3 GPa', strength: 'σt ≈ 80 MPa', why: 'Quiet, low-wear contact on the rope; protects rope wires' },
    chain: { name: 'Steel chain, graded 14–32 kg/m (proof-coil to stud-link)', standard: 'ASTM A413 / A391', density: '7,850 kg/m³', E: '210 GPa', strength: 'μ on dry sand ≈ 0.5–0.7', why: 'Drag-chain arrester: stopping force depends on chain picked up, not on speed' },
    pet: { name: 'Polyester (PET) webbing, UV-stabilised', standard: 'EN 1492-1 (webbing slings)', density: '1,380 kg/m³', E: '≈ 10 GPa (fibre)', strength: '50 mm strap MBS ≈ 50 kN', why: 'Backup catch net and 4-point harnesses; low stretch, does not rot' },
    concrete: { name: 'Reinforced concrete C30/37 with B500B rebar', standard: 'EN 206; EN 10080', density: '2,400 kg/m³', E: '33 GPa', strength: 'fck 30 MPa; rebar fy 500 MPa', why: 'Terminus deadman, counterweight, landing pit, bunker' },
  };

  function bom(cfgIn, res) {
    const cfg = resolve(cfgIn);
    const r = res || evacuate(cfg);
    const cp = cableProps(cfg);
    const chord = Math.hypot(cfg.span, cfg.accessHeight - cfg.terminusHeight);
    const ropeLen = Math.ceil(chord * 1.05 + 30); // + anchorage and counterweight run
    const nW = cfg.wires, nPods = cfg.wires * cfg.podsPerWire;
    const peakKN = r.peakTension / 1000;
    const cwKg = (cfg.tension * 1000) / G;
    const magnetsPerM = 33; // two facing rows of 50×25×10 mm blocks, 60 mm pitch
    const magnetKgPerM = magnetsPerM * 0.094;
    const bays = cfg.terminal === 'switchyard' ? cfg.bays : 1;
    const rows = [];
    const add = (group, item, mat, spec, qty, unit, massKg) => rows.push({ group, item, material: MATERIALS[mat] ? MATERIALS[mat].name : mat, spec, qty, unit, massKg });
    add('Wire (per wire × ' + nW + ')', 'Track rope', 'rope', `${cfg.cableDiameter} mm; MBS ${(cp.mbs / 1000).toFixed(0)} kN; allowable ${(cp.allow / 1000).toFixed(0)} kN at SF ${cfg.cableSF}; peak load ${peakKN.toFixed(0)} kN`, ropeLen * nW, 'm', ropeLen * nW * cp.massPerM);
    add('Wire (per wire × ' + nW + ')', 'Spelter rope sockets', 's355', `forged steel, resin or zinc poured, rated ≥ MBS ${(cp.mbs / 1000).toFixed(0)} kN`, 2 * nW, 'pcs', 2 * nW * 25);
    add('Wire (per wire × ' + nW + ')', 'Counterweight (constant tension)', 'concrete', `${(cwKg / 1000).toFixed(1)} t per wire in a guided pit; holds T = ${cfg.tension} kN`, nW, 'pcs', cwKg * nW);
    add('Wire (per wire × ' + nW + ')', 'Deflection sheave', 's355', `diameter ≥ 40 d = ${(0.04 * cfg.cableDiameter).toFixed(2)} m; sealed roller bearings`, nW, 'pcs', 350 * nW);
    add('Wire (per wire × ' + nW + ')', 'Tower padeye and terminus deadman', 'concrete', `S355 padeye + C30/37 deadman, each designed for ≥ 2 × ${peakKN.toFixed(0)} kN`, nW, 'sets', null);
    const brakeRuns = cfg.terminal === 'switchyard' ? bays * nW : nW; // one per bay, or one per wire
    const where = cfg.terminal === 'switchyard' ? 'in each bay' : 'on each wire';
    add('Brake', 'Eddy-current brake magnets', 'ndfeb', `${cfg.brakeLength} m zone ${where}, ${magnetsPerM} blocks/m in two facing rows, 20 mm slot; k_b ≈ ${Math.round(r.brakeK)} N·s/m`, Math.round(cfg.brakeLength * magnetsPerM * brakeRuns), 'blocks', cfg.brakeLength * magnetKgPerM * brakeRuns);
    add('Brake', 'Magnet back-iron and track frame', 's355', `galvanised channel, ${cfg.brakeLength} m ${where}`, cfg.brakeLength * brakeRuns, 'm', cfg.brakeLength * 45 * brakeRuns);
    if (cfg.arrester === 'chain') {
      add('Arrester (per bay)', 'Drag-chain bed', 'chain', `${cfg.chainKc} kg of chain picked up per metre, ${cfg.bedLength} m bed of dry sand`, bays * nW, 'beds', cfg.chainKc * cfg.bedLength * bays * nW);
      add('Arrester (per bay)', 'Backup net with energy absorbers', 'pet', `${cfg.netStroke} m stroke at the end of each bed`, bays * nW, 'pcs', 60 * bays * nW);
    } else {
      add('Arrester', 'Catch net with energy absorbers', 'pet', `${cfg.bufferLength} m stroke`, nW, 'pcs', 80 * nW);
    }
    if (cfg.terminal === 'switchyard') {
      const bayLen = cfg.brakeLength + (cfg.arrester === 'chain' ? cfg.bedLength + cfg.netStroke : cfg.bufferLength) + 5;
      add('Switch yard (per wire)', 'Landing rail and bay tracks', 's355', `rope-to-rail transfer at the points, ${bays} level bays × ${bayLen} m + 30 m lead; 50 kg/m rail`, (bays * bayLen + 30) * nW, 'm', (bays * bayLen + 30) * 50 * nW);
      add('Switch yard (per wire)', 'Self-indexing points (turnouts)', 's355', 'spring-return points advanced one bay by each passing pod (ratchet indexer); no power', Math.max(1, bays - 1) * nW, 'pcs', 400 * Math.max(1, bays - 1) * nW);
    }
    add('Pods (× ' + nPods + ')', 'Pod frame, open-sided', 'al6061', `${cfg.podCapacity} seats; mass budget ${cfg.podMass} kg with trolley; design load ${cfg.podCapacity * cfg.personMass + cfg.podMass} kg × 1.5`, nPods, 'pcs', 135 * nPods);
    add('Pods (× ' + nPods + ')', 'Trolley with 4 lined sheaves', 'pa6', 'PA6 liners on steel sheaves, sealed bearings, 316 axles, anti-derailment keeper', nPods, 'pcs', 110 * nPods);
    add('Pods (× ' + nPods + ')', 'Brake fin', 'copper', '10 mm plate, 1.2 m × 0.25 m, runs in the magnet slot', nPods, 'pcs', 0.01 * 1.2 * 0.25 * 8960 * nPods);
    add('Pods (× ' + nPods + ')', 'Release lever and latch', 'ph174', 'occupant-pulled lever, ≤ 150 N; locked by the headway interlock until the wire ahead is clear', nPods, 'sets', 4 * nPods);
    add('Pods (× ' + nPods + ')', 'Seats with 4-point harness', 'pet', '50 mm polyester webbing, quick-release buckle', cfg.podCapacity * nPods, 'pcs', 6 * cfg.podCapacity * nPods);
    add('Pods (× ' + nPods + ')', 'Accelerometer logger', 'battery-powered 3-axis, ±16 g', 'records every ride and test drop', nPods, 'pcs', 0.5 * nPods);
    add('Site', 'Bunker', 'concrete', `rated ${cfg.bunkerPsi} psi, seats ${cfg.crew + cfg.ground}, air supply`, 1, 'pcs', null);
    const totals = {};
    for (const row of rows) if (row.massKg) totals[row.group] = (totals[row.group] || 0) + row.massKg;
    return { rows, totals, materials: MATERIALS, ropeLength: ropeLen, counterweightKg: cwKg };
  }

  // ---------------------------------------------------------------------------
  // 5. Studies
  // ---------------------------------------------------------------------------

  function rng(seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normal(u, mean, sd) {
    const a = Math.max(u(), 1e-12), b = u();
    return mean + sd * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  // Uncertain inputs and their spread (documented in the paper, Table 3).
  const MC_SPEC = {
    tReact: (u, c) => clamp(normal(u, c.tReact, 3), 3, 30),
    tHatch: (u, c) => clamp(normal(u, c.tHatch, 15), 25, 150),
    tWalk: (u, c) => clamp(normal(u, c.tWalk, 4), 8, 45),
    tGap: (u, c) => clamp(normal(u, c.tGap, 0.8), 1.5, 8),
    tBoard: (u, c) => clamp(normal(u, c.tBoard, 1.5), 2, 15),
    tRelease: (u, c) => clamp(normal(u, c.tRelease, 1), 1, 8),
    tUnload: (u, c) => clamp(normal(u, c.tUnload, 4), 6, 40),
    vehicleLoad: (u, c) => clamp(normal(u, c.vehicleLoad, 5), 8, 60),
    runSpeed: (u, c) => clamp(normal(u, c.runSpeed, 0.5), 1.5, 5),
    mu: (u, c) => clamp(normal(u, c.mu, 0.004), 0.008, 0.05),
    cdaScale: (u) => clamp(normal(u, 1, 0.1), 0.7, 1.4),
    brakeScale: (u) => clamp(normal(u, 1, 0.05), 0.8, 1.2),
    // wind: speed uniform 0..17.5 m/s (34 kn, the Shuttle-era design wind [R3]), random direction
    wind: (u, c) => c.wind + 17.5 * u() * Math.cos(2 * Math.PI * u()),
  };

  function monteCarlo(cfgIn, n, seed, onProgress) {
    const cfg = prepare(cfgIn);
    const u = rng(seed || 1);
    const P = cfg.crew + cfg.ground;
    const runs = [];
    for (let i = 0; i < n; i++) {
      const rnd = {};
      for (const k in MC_SPEC) rnd[k] = MC_SPEC[k](u, cfg);
      rnd.personMasses = Array.from({ length: P }, () => clamp(normal(u, cfg.personMass, 12), 60, 140));
      const res = evacuate(Object.assign({}, cfg, { dt: Math.max(cfg.dt, 0.05) }), rnd);
      runs.push({
        tAll: res.tAll, fail: res.flags.some((f) => f.level === 'fail'),
        warn: res.flags.some((f) => f.level === 'warn'),
        wind: rnd.wind, aPeakG: Math.max(...res.pods.map((p) => Math.max(p.aPeakG || 0, p.impactG || 0))),
      });
      if (onProgress && i % 25 === 0) onProgress(i / n);
    }
    const ts = runs.map((r) => r.tAll).filter(isFinite).sort((a, b) => a - b);
    const q = (p) => ts[Math.min(ts.length - 1, Math.floor(p * ts.length))];
    const warn = hazard(cfg).warn;
    return {
      runs, n,
      mean: ts.reduce((s, x) => s + x, 0) / ts.length,
      p05: q(0.05), p50: q(0.5), p95: q(0.95), max: ts[ts.length - 1],
      pLate: runs.filter((r) => !(r.tAll <= warn)).length / n,
      pFail: runs.filter((r) => r.fail).length / n,
      warn,
    };
  }

  // Series vs parallel: every (wires m, pods per wire k) layout that seats everyone.
  function tradeStudy(cfgIn, mMax, kMax) {
    const base = resolve(cfgIn);
    if (base.brakeK == null) base.brakeK = designBrake(base);
    const block = base.dispatch === 'block';
    const hw = block ? null : minHeadway(base);
    const bx = block ? minBlock(Object.assign({}, base, { podsPerWire: Math.max(2, base.podsPerWire) })) : null;
    const cells = [];
    for (let m = 1; m <= (mMax || 6); m++) {
      for (let k = 1; k <= (kMax || 6); k++) {
        const cfg = Object.assign({}, base, { wires: m, podsPerWire: k, headway: k > 1 ? hw : 0, blockX: bx },
          base.terminal === 'switchyard' ? { bays: k } : {});
        if (m * k * cfg.podCapacity < cfg.crew + cfg.ground) { cells.push({ m, k, feasible: false }); continue; }
        const r = evacuate(cfg);
        cells.push({
          m, k, feasible: true, tAll: r.tAll, cost: r.cost, status: r.status,
          fails: r.flags.filter((f) => f.level === 'fail').length,
        });
      }
    }
    // Pareto front on (cost, time) among feasible, non-failing layouts
    const ok = cells.filter((c) => c.feasible && !c.fails && isFinite(c.tAll));
    for (const c of ok) c.pareto = !ok.some((d) => d !== c && d.cost <= c.cost && d.tAll <= c.tAll && (d.cost < c.cost || d.tAll < c.tAll));
    return { cells, headway: hw, blockX: bx };
  }

  // One-at-a-time ±20% swing of each uncertain input on total evacuation time.
  const SENS_PARAMS = [
    ['tHatch', 'Capsule hatch / unstrap time'],
    ['tReact', 'Reaction time'],
    ['tWalk', 'Walk to platform'],
    ['tBoard', 'Boarding time per person'],
    ['tGap', 'Single-file spacing'],
    ['tUnload', 'Unload at terminus'],
    ['vehicleLoad', 'Board armoured vehicle'],
    ['mu', 'Trolley rolling resistance'],
    ['cdaPod', 'Pod drag area'],
    ['personMass', 'Person mass'],
    ['tension', 'Cable tension'],
    ['accessHeight', 'Launch height'],
  ];
  function sensitivity(cfgIn, swing) {
    const s = swing || 0.2;
    const base = prepare(cfgIn);
    const t0 = evacuate(base).tAll;
    const rows = SENS_PARAMS.map(([k, label]) => {
      const lo = evacuate(Object.assign({}, base, { [k]: base[k] * (1 - s) })).tAll;
      const hi = evacuate(Object.assign({}, base, { [k]: base[k] * (1 + s) })).tAll;
      return { key: k, label, lo: lo - t0, hi: hi - t0 };
    });
    rows.sort((a, b) => Math.max(Math.abs(b.lo), Math.abs(b.hi)) - Math.max(Math.abs(a.lo), Math.abs(a.hi)));
    return { t0, swing: s, rows };
  }

  // ---------------------------------------------------------------------------
  // Scale model: predict run time on a straight taut line, and fit μ (and CdA)
  // to measured runs by least squares over a grid.
  // run: { wire_length_m, drop_m, mass_kg, time_s }
  // ---------------------------------------------------------------------------
  function scaleRunTime(run, mu, cda, rho) {
    const L = run.wire_length_m, h = run.drop_m;
    const s = h / L, c = Math.sqrt(1 - s * s);
    const m = run.mass_kg;
    let x = 0, v = 0, t = 0;
    const dt = 0.001;
    while (x < L && t < 120) {
      const a = G * s - mu * G * c - (0.5 * (rho || 1.2) * cda * v * v) / m;
      v += a * dt;
      if (v <= 0) return Infinity;
      x += v * dt; t += dt;
    }
    return t;
  }
  function fitScaleModel(runs, opts) {
    const o = Object.assign({ fitCda: true, cdaFixed: 0.003 }, opts || {});
    const good = runs.filter((r) => r.time_s > 0 && r.wire_length_m > 0 && r.drop_m > 0 && r.mass_kg > 0);
    if (!good.length) return null;
    let best = null;
    const cdas = o.fitCda ? Array.from({ length: 41 }, (_, i) => i * 0.0005) : [o.cdaFixed];
    for (let mu = 0; mu <= 0.2; mu += 0.001) {
      for (const cda of cdas) {
        let sse = 0;
        for (const r of good) {
          const tp = scaleRunTime(r, mu, cda);
          sse += (tp - r.time_s) ** 2;
        }
        if (!best || sse < best.sse) best = { mu, cda, sse };
      }
    }
    best.rmse = Math.sqrt(best.sse / good.length);
    best.points = good.map((r) => ({ ...r, predicted: scaleRunTime(r, best.mu, best.cda) }));
    return best;
  }

  return {
    G, PROPELLANTS, PADS, VEHICLES, DANGER_LEVELS, K_FACTORS, DEFAULTS, MC_SPEC, SENS_PARAMS,
    hazard, overpressurePsi, kForPsi,
    cableProps, makeWire, deflection, slopeAt, heightAt, peakTension,
    podMass, podCdA, simulateWire, designBrake, arrest, brakeHealth, bom, MATERIALS,
    stopLength, bunkerDistance, maxSpan, bunkerWindow,
    resolve, prepare, arrivals, evacuate, minHeadway, minBlock,
    rng, monteCarlo, tradeStudy, sensitivity,
    scaleRunTime, fitScaleModel,
  };
});
