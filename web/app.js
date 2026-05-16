/* PLE-SBS simulator UI. All physics lives in ../sim/core.js (window.PLESBS). */
(function () {
  'use strict';
  const S = window.PLESBS;
  const $ = (sel) => document.querySelector(sel);
  const fmt = (x, d = 0) => (isFinite(x) ? x.toFixed(d) : '—');

  // ---------------------------------------------------------------------------
  // Inputs
  // ---------------------------------------------------------------------------
  const vehicleOptions = Object.entries(S.VEHICLES).map(([k, v]) => [k, v.label]).concat([['CUSTOM', 'Custom rocket']]);
  const padOptions = Object.entries(S.PADS).map(([k, v]) => [k, v.label]).concat([['CUSTOM', 'Custom pad (set below)']]);
  const propOptions = Object.entries(S.PROPELLANTS).map(([k, v]) => [k, v.label]);

  const GROUPS = [
    { title: 'Rocket and hazard', open: true, items: [
      { key: 'vehicle', type: 'select', label: 'Rocket', options: vehicleOptions },
      { key: 'stages', type: 'stages' },
      { key: 'dangerLevel', type: 'range', label: 'Danger level', min: 1, max: 5, step: 1, hint: (v) => S.DANGER_LEVELS[v].label },
      { key: 'kFactor', type: 'select', label: 'Blast criterion for people in the open', options: Object.entries(S.K_FACTORS).map(([k, v]) => [k, v.label]), num: true },
      { key: 'solidTntFraction', type: 'number', label: 'Solid propellant blast yield (fraction)', min: 0, max: 0.5, step: 0.01 },
    ] },
    { title: 'Launch pad', open: true, items: [
      { key: 'pad', type: 'select', label: 'Launch pad', options: padOptions },
      { key: 'accessHeight', type: 'range', label: 'Crew access height', unit: 'm', min: 20, max: 130, step: 1 },
      { key: 'span', type: 'range', label: 'Wire span (horizontal)', unit: 'm', min: 100, max: 800, step: 5 },
      { pair: [
        { key: 'terminusHeight', type: 'number', label: 'Terminus height', unit: 'm', min: -15, max: 20, step: 0.5 },
        { key: 'towerOffset', type: 'number', label: 'Tower to rocket', unit: 'm', min: 5, max: 60, step: 1 },
      ] },
    ] },
    { title: 'Pods and wires', open: true, items: [
      { key: 'wires', type: 'range', label: 'Wires side by side (parallel)', min: 1, max: 6, step: 1 },
      { key: 'podsPerWire', type: 'range', label: 'Pods on each wire (series)', min: 1, max: 6, step: 1 },
      { key: 'podCapacity', type: 'range', label: 'People per pod', min: 1, max: 8, step: 1 },
      { key: 'loading', type: 'select', label: 'Loading rule', options: [['balance', 'Balance people across pods'], ['fill', 'Fill each pod before the next']] },
    ] },
    { title: 'People', items: [
      { pair: [
        { key: 'crew', type: 'number', label: 'Flight crew', min: 0, max: 8, step: 1 },
        { key: 'ground', type: 'number', label: 'Close-out crew', min: 0, max: 30, step: 1 },
      ] },
      { pair: [
        { key: 'tReact', type: 'number', label: 'Reaction', unit: 's', min: 0, max: 60, step: 1 },
        { key: 'tHatch', type: 'number', label: 'Capsule exit', unit: 's', min: 0, max: 240, step: 5 },
      ] },
      { pair: [
        { key: 'tWalk', type: 'number', label: 'Walk to pods', unit: 's', min: 0, max: 120, step: 1 },
        { key: 'tGap', type: 'number', label: 'Single-file gap', unit: 's', min: 0.5, max: 10, step: 0.5 },
      ] },
      { pair: [
        { key: 'tBoard', type: 'number', label: 'Board, per person', unit: 's', min: 1, max: 20, step: 0.5 },
        { key: 'tRelease', type: 'number', label: 'Lever release (inside pod)', unit: 's', min: 0, max: 15, step: 0.5 },
      ] },
      { key: 'personMass', type: 'number', label: 'Mass per person with gear', unit: 'kg', min: 50, max: 150, step: 1 },
    ] },
    { title: 'Cable and brakes', items: [
      { pair: [
        { key: 'cableDiameter', type: 'number', label: 'Steel rope', unit: 'mm', min: 12, max: 60, step: 1 },
        { key: 'tension', type: 'number', label: 'Tension', unit: 'kN', min: 20, max: 600, step: 5 },
      ] },
      { key: 'brakeAuto', type: 'check', label: 'Size the magnetic brake automatically' },
      { key: 'brakeK', type: 'number', label: 'Magnetic brake strength', unit: 'N·s/m', min: 0, max: 20000, step: 5 },
      { pair: [
        { key: 'brakeLength', type: 'number', label: 'Brake zone', unit: 'm', min: 0, max: 200, step: 5 },
        { key: 'brakeRunout', type: 'number', label: 'Run-out after brake', unit: 'm', min: 0, max: 60, step: 1 },
      ] },
      { pair: [
        { key: 'bufferLength', type: 'number', label: 'Catch-net stroke', unit: 'm', min: 0.5, max: 30, step: 0.5 },
        { key: 'aMaxG', type: 'number', label: 'Deceleration limit', unit: 'g', min: 0.5, max: 6, step: 0.1 },
      ] },
    ] },
    { title: 'Receiving end and brake failure', open: true, items: [
      { key: 'design', type: 'select', label: 'Design preset', options: [['', 'Keep my settings'], ['D5', 'D5: one wire, switch yard, chain beds'], ['D4', 'D4: two wires, single dock, catch net']] },
      { key: 'terminal', type: 'select', label: 'Receiving end', options: [['switchyard', 'Switch yard: points send each pod to its own bay'], ['dock', 'Single dock: unload in place']] },
      { key: 'bays', type: 'number', label: 'Bays in the switch yard (per wire)', min: 1, max: 8, step: 1 },
      { key: 'arrester', type: 'select', label: 'What stops the pod at the end', options: [['chain', 'Drag-chain bed + backup net'], ['net', 'Catch net only']] },
      { pair: [
        { key: 'bedLength', type: 'number', label: 'Chain bed', unit: 'm', min: 5, max: 120, step: 5 },
        { key: 'chainKc', type: 'number', label: 'Chain picked up', unit: 'kg/m', min: 5, max: 150, step: 5 },
      ] },
      { key: 'brakeCondition', type: 'select', label: 'Magnetic brake condition', options: [['ok', 'Working on every pod'], ['one', 'Failed on one pod (the second to leave)'], ['all', 'Failed on every pod'], ['half', 'Half strength on every pod']] },
      { key: 'dispatch', type: 'select', label: 'Release lever unlocks', options: [['block', 'When the pod ahead passes a block marker'], ['timed', 'After a fixed headway']] },
      { key: 'failSafeHeadway', type: 'check', label: 'Space pods so one with a failed brake cannot catch the pod ahead' },
    ] },
    { title: 'Terminus and shelter', items: [
      { key: 'safeMode', type: 'select', label: 'After the ride', options: [['bunker', 'Run into a blast bunker at the terminus'], ['vehicle', 'Drive out in an armoured vehicle']] },
      { pair: [
        { key: 'tUnload', type: 'number', label: 'Unload pod', unit: 's', min: 2, max: 60, step: 1 },
        { key: 'tClear', type: 'number', label: 'Clear the dock', unit: 's', min: 2, max: 60, step: 1 },
      ] },
      { pair: [
        { key: 'bunkerWalk', type: 'number', label: 'Run to bunker', unit: 'm', min: 0, max: 300, step: 5 },
        { key: 'bunkerPsi', type: 'number', label: 'Bunker rating', unit: 'psi', min: 1, max: 50, step: 1 },
      ] },
      { pair: [
        { key: 'vehicleLoad', type: 'number', label: 'Board vehicle', unit: 's', min: 5, max: 120, step: 1 },
        { key: 'vehicleSpeed', type: 'number', label: 'Vehicle speed', unit: 'm/s', min: 3, max: 30, step: 1 },
      ] },
    ] },
    { title: 'Weather', items: [
      { key: 'wind', type: 'range', label: 'Wind along the wire (+ tail, − head)', unit: 'm/s', min: -20, max: 20, step: 0.5 },
    ] },
  ];

  const SITE_KEYS = ['accessHeight', 'span', 'towerOffset', 'brakeRunout', 'terminusHeight'];
  // Design presets from the paper (worked example on the generic pad)
  const HUMAN = { tWalk: 8, tBoard: 3, tUnload: 8, brakeCondition: 'ok' };
  const PRESETS = {
    D4: Object.assign({ wires: 2, podsPerWire: 2, terminal: 'dock', arrester: 'net', dispatch: 'timed', failSafeHeadway: false, bunkerWalk: 20 }, HUMAN),
    D5: Object.assign({ wires: 1, podsPerWire: 3, terminal: 'switchyard', bays: 3, arrester: 'chain', dispatch: 'block', failSafeHeadway: true, bayWalk: 15 }, HUMAN),
  };
  const START = () => Object.assign({}, PRESETS.D5);
  let state = START();

  // rocket preset (crew, usual pad) + pad preset (geometry) + the user's own changes
  function currentCfg() {
    const vehicle = state.vehicle || S.DEFAULTS.vehicle;
    const veh = S.VEHICLES[vehicle];
    const pad = state.pad || (veh ? veh.pad : 'CUSTOM');
    const padSite = S.PADS[pad] ? S.PADS[pad].site : {};
    const cfg = Object.assign({}, S.DEFAULTS, veh ? { crew: veh.crew } : {}, padSite, { pad }, state);
    if (vehicle === 'CUSTOM') {
      cfg.stages = state.stages || [
        { name: 'Boosters', prop: 'SOLID', massT: 200 },
        { name: 'Core', prop: 'LOX_RP1', massT: 150 },
        { name: 'Upper', prop: 'LOX_LH2', massT: 25 },
      ];
    } else cfg.stages = null;
    if (cfg.brakeAuto !== false) cfg.brakeK = null;
    delete cfg.brakeAuto;
    return cfg;
  }

  function fieldEl(f) {
    const id = 'f-' + f.key;
    const wrap = document.createElement('div');
    wrap.className = 'field';
    wrap.dataset.key = f.key;
    if (f.type === 'stages') {
      wrap.classList.add('stages');
      wrap.id = 'stage-editor';
      return wrap;
    }
    if (f.type === 'check') {
      wrap.innerHTML = `<label class="check" for="${id}"><span><input type="checkbox" id="${id}"> ${f.label}</span></label>`;
      return wrap;
    }
    const unit = f.unit ? ` <span class="unit">${f.unit}</span>` : '';
    let control;
    if (f.type === 'select') {
      control = `<select id="${id}">${f.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
    } else {
      control = `<input type="${f.type}" id="${id}" min="${f.min}" max="${f.max}" step="${f.step}">`;
    }
    const out = f.type === 'range' ? `<output id="${id}-out"></output>` : '';
    wrap.innerHTML = `<label for="${id}"><span>${f.label}${f.type === 'range' ? '' : unit}</span>${out}</label>${control}${f.hint ? `<p class="hint" id="${id}-hint"></p>` : ''}`;
    return wrap;
  }

  function buildForm() {
    const form = $('#form');
    for (const g of GROUPS) {
      const d = document.createElement('details');
      d.className = 'group';
      if (g.open && window.innerWidth > 980) d.open = true;
      d.innerHTML = `<summary>${g.title}</summary><div class="body"></div>`;
      const body = d.querySelector('.body');
      for (const it of g.items) {
        if (it.pair) {
          const p = document.createElement('div');
          p.className = 'pair';
          it.pair.forEach((f) => p.appendChild(fieldEl(f)));
          body.appendChild(p);
        } else body.appendChild(fieldEl(it));
      }
      form.appendChild(d);
    }
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
  }

  const allFields = () => GROUPS.flatMap((g) => g.items.flatMap((it) => (it.pair ? it.pair : [it])));

  function syncForm() {
    const cfg = currentCfg();
    for (const f of allFields()) {
      if (f.type === 'stages') continue;
      const el = document.getElementById('f-' + f.key);
      if (!el) continue;
      if (f.type === 'check') el.checked = f.key === 'brakeAuto' ? state.brakeAuto !== false : !!cfg[f.key];
      else if (f.key === 'design') el.value = '';
      else if (f.key === 'brakeK') {
        el.value = lastResult ? Math.round(lastResult.brakeK) : '';
        el.disabled = state.brakeAuto !== false;
      } else el.value = cfg[f.key];
      if (f.type === 'range') {
        const o = document.getElementById('f-' + f.key + '-out');
        o.textContent = cfg[f.key] + (f.unit ? ' ' + f.unit : '');
      }
      if (f.hint) document.getElementById('f-' + f.key + '-hint').textContent = f.hint(cfg[f.key]);
    }
    renderStageEditor(cfg);
  }

  function renderStageEditor(cfg) {
    const box = $('#stage-editor');
    const custom = (state.vehicle || S.DEFAULTS.vehicle) === 'CUSTOM';
    const stages = custom ? cfg.stages : S.VEHICLES[cfg.vehicle].stages;
    box.innerHTML = `<label><span>Propellant on board${custom ? '' : ' (edit by choosing Custom)'}</span></label>` +
      stages.map((s, i) => `<div class="stage-row">
        <select data-stage="${i}" data-part="prop" ${custom ? '' : 'disabled'} aria-label="${s.name} propellant">${propOptions.map(([v, l]) => `<option value="${v}" ${v === s.prop ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input type="number" data-stage="${i}" data-part="massT" value="${s.massT}" min="0" step="1" ${custom ? '' : 'disabled'} aria-label="${s.name} mass in tonnes" title="${s.name}, tonnes">
      </div>`).join('') + `<p class="hint">Masses in tonnes. ${stages.map((s) => s.name).join(', ')}.</p>`;
  }

  function onInput(e) {
    const t = e.target;
    if (t.dataset.stage != null) {
      const cfg = currentCfg();
      const stages = cfg.stages.map((s) => Object.assign({}, s));
      const s = stages[+t.dataset.stage];
      s[t.dataset.part] = t.dataset.part === 'massT' ? +t.value : t.value;
      state.stages = stages;
      schedule();
      return;
    }
    const key = t.id.replace(/^f-/, '');
    const f = allFields().find((x) => x.key === key);
    if (!f) return;
    if (f.type === 'check') state[key] = t.checked;
    else if (key === 'design') {
      if (t.value && PRESETS[t.value]) Object.assign(state, PRESETS[t.value]);
      for (const k of ['headway', 'blockX']) delete state[k];
      t.value = '';
      schedule(true);
      return;
    } else if (f.type === 'select' && !f.num) {
      if (key === 'pad' && t.value === 'CUSTOM') {
        const cur = currentCfg();
        for (const k of SITE_KEYS) state[k] = cur[k];
      } else if (key === 'pad') {
        for (const k of SITE_KEYS) delete state[k];
      }
      state[key] = t.value;
      if (key === 'vehicle') {
        for (const k of SITE_KEYS.concat(['crew', 'stages', 'pad'])) delete state[k];
      }
    } else {
      if (t.value === '') return;
      // moving a pad slider turns the named pad into a custom one
      if (SITE_KEYS.includes(key) && currentCfg().pad !== 'CUSTOM') {
        const cur = currentCfg();
        for (const k of SITE_KEYS) state[k] = cur[k];
        state.pad = 'CUSTOM';
        const padEl = $('#f-pad');
        if (padEl) padEl.value = 'CUSTOM';
      }
      state[key] = +t.value;
      if (key === 'brakeK') state.brakeAuto = false;
    }
    if (f.type === 'range') {
      const o = document.getElementById('f-' + key + '-out');
      if (o) o.textContent = t.value + (f.unit ? ' ' + f.unit : '');
      if (f.hint) document.getElementById('f-' + key + '-hint').textContent = f.hint(+t.value);
    }
    if (e.type === 'change' || f.type === 'range') schedule(key === 'vehicle' || key === 'pad' || f.type === 'check');
  }

  let timer = null;
  function schedule(resync) {
    clearTimeout(timer);
    timer = setTimeout(() => { run(); if (resync) syncForm(); writeHash(); }, 120);
  }

  function writeHash() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) p.set(k, typeof v === 'object' ? JSON.stringify(v) : v);
    history.replaceState(null, '', p.toString() ? '#' + p.toString() : location.pathname);
  }
  function readHash() {
    const h = location.hash.slice(1);
    if (!h || h === 'model') return;
    const p = new URLSearchParams(h);
    state = {};
    for (const [k, v] of p) {
      if (k === 'stages') { try { state.stages = JSON.parse(v); } catch (e) { /* ignore */ } }
      else if (v === 'true' || v === 'false') state[k] = v === 'true';
      else state[k] = isNaN(+v) ? v : +v;
    }
  }

  // ---------------------------------------------------------------------------
  // Run + summary
  // ---------------------------------------------------------------------------
  let lastResult = null;
  let tradeCache = null, sensCache = null, mcStale = true;

  function run() {
    const cfg = S.prepare(currentCfg());
    const r = S.evacuate(cfg);
    r.window = r.leg.mode === 'bunker' ? S.bunkerWindow(cfg, r) : null;
    if (r.window && isFinite(r.tAll) && r.window.dBunker > r.window.dMax + 0.5) {
      r.flags.push({ level: 'warn', msg: `The bunker is ${S.bunkerDistance(cfg).toFixed(0)} m from the rocket, but only ${r.window.dMax.toFixed(0)} m can be reached before the ${r.hazard.warn} s warning window closes.` });
    }
    lastResult = r;
    tradeCache = sensCache = null;
    mcStale = true;
    const brakeEl = $('#f-brakeK');
    if (brakeEl && state.brakeAuto !== false) brakeEl.value = Math.round(r.brakeK);
    renderVerdict(r);
    renderKpis(r);
    renderFlags(r);
    anim.reset(r);
    renderActiveTab();
  }

  const STATUS_LABEL = { safe: 'Safe', marginal: 'Marginal', unsafe: 'Too slow', fail: 'Fails' };

  function renderVerdict(r) {
    const hz = r.hazard;
    const P = r.people.length;
    const fails = r.flags.filter((f) => f.level === 'fail');
    const line = $('#verdict');
    const sub = $('#verdict-sub');
    const chip = `<span class="status ${r.status}">${STATUS_LABEL[r.status]}</span>`;
    if (r.status === 'fail') {
      line.innerHTML = `${chip}${fails.length ? fails[0].msg : 'Not everyone can be evacuated with this layout'}.`;
    } else {
      line.innerHTML = `${chip}All ${P} people are clear ${fmt(r.tAll)} s after the alarm.`;
    }
    const lvl = r.cfg.dangerLevel;
    const pods = r.pods.length;
    const m = r.margin;
    const marginTxt = isFinite(m)
      ? (m >= 0 ? `${fmt(m)} s inside` : `${fmt(-m)} s beyond`)
      : 'not measurable against';
    const rocket = S.VEHICLES[r.cfg.vehicle] ? S.VEHICLES[r.cfg.vehicle].label : 'Custom rocket';
    const padName = S.PADS[r.cfg.pad] ? S.PADS[r.cfg.pad].label : `custom pad (${r.cfg.accessHeight} m crew level)`;
    sub.textContent = `${rocket} on ${padName}. ${P} people in ${pods} pod${pods === 1 ? '' : 's'} on ${r.cfg.wires} wire${r.cfg.wires === 1 ? '' : 's'}. ` +
      `Danger level ${lvl} assumes ${hz.warn} s of warning, so this design is ${marginTxt} the warning window.`;
  }

  function renderKpis(r) {
    const hz = r.hazard;
    const vPk = Math.max(0, ...r.pods.map((p) => p.vPeak || 0));
    const gPk = Math.max(0, ...r.pods.map((p) => Math.max(p.aPeakG || 0, p.impactG || 0)));
    const ride = r.pods.filter((p) => p.arrive != null).map((p) => p.arrive - p.depart);
    const cableUse = r.peakTension / r.wire.cable.allow;
    const items = [
      ['Required safe distance', `${fmt(hz.rReq)}<small>m</small>`, `set by ${hz.governing === 'thermal' ? 'fireball heat' : 'blast'}; blast ${fmt(hz.rBlast)} m, heat ${fmt(hz.rThermal)} m`],
      r.window
        ? ['Bunker from the rocket', `${fmt(r.window.dBunker)}<small>m</small>`, `allowed ${fmt(r.window.dMin)}–${fmt(r.window.dMax)} m (typical run); ${fmt(hz.psiAt(r.window.dBunker), 1)} psi here; wire reach ${r.window.spanReach ? fmt(r.window.spanReach) + ' m' : '—'}`, r.window.dBunker < r.window.dMin || r.window.dBunker > r.window.dMax + 0.5 ? 'warn' : '']
        : ['Terminus distance', `${fmt(r.dTerminus)}<small>m</small>`, r.leg.mode === 'terminus' ? 'outside the hazard zone: no bunker needed' : `then ${fmt(hz.rReq - r.dTerminus)} m by vehicle`],
      ['Everyone safe', `${fmt(r.tAll)}<small>s</small>`, `warning window ${hz.warn} s`, r.status === 'safe' ? '' : r.status === 'marginal' ? 'warn' : 'bad'],
      ['Ride down the wire', ride.length ? `${fmt(Math.min(...ride))}–${fmt(Math.max(...ride))}<small>s</small>` : '—',
        r.cfg.podsPerWire < 2 ? 'one pod per wire' : r.cfg.dispatch === 'block' ? `block marker ${fmt(r.blockX)} m down the wire` : `series headway ${fmt(r.headway, 1)} s`],
      ['Peak pod speed', `${fmt(vPk, 1)}<small>m/s</small>`, `${fmt(vPk * 3.6)} km/h`],
      ['Peak deceleration', `${fmt(gPk, 2)}<small>g</small>`, `limit ${r.cfg.aMaxG} g${r.cfg.brakeCondition !== 'ok' ? '; brake ' + ({ one: 'failed on one pod', all: 'failed on all pods', half: 'at half strength' })[r.cfg.brakeCondition] : ''}`, gPk > 2 * r.cfg.aMaxG ? 'bad' : gPk > r.cfg.aMaxG ? 'warn' : ''],
      ['Cable load', `${fmt(cableUse * 100)}<small>%</small>`, `${fmt(r.peakTension / 1000)} of ${fmt(r.wire.cable.allow / 1000)} kN allowed`, cableUse > 1 ? 'bad' : ''],
      ['TNT equivalent', `${fmt(hz.tntKg / 1000, 1)}<small>t</small>`, `fireball ${fmt(hz.fireballD)} m wide, ${fmt(hz.fireballT, 1)} s`],
    ];
    $('#kpis').innerHTML = items.map(([k, v, n, cls]) => `<div class="kpi ${cls || ''}"><dt>${k}</dt><dd>${v}</dd><div class="note">${n}</div></div>`).join('');
  }

  function renderFlags(r) {
    const list = $('#flags');
    const items = r.flags.slice();
    if (!items.length) items.push({ level: 'ok', msg: 'Hardware checks pass: every pod reaches the terminus, spacing and clearance hold, every stop is within the deceleration limit and the cable is within its safety factor.' });
    if (r.cfg.brakeCondition !== 'ok') {
      const failed = r.pods.filter((p) => p.brakeScale < 1 && p.stop);
      if (failed.length) {
        const worst = failed.reduce((a, p) => (p.stop.peakG > a.stop.peakG ? p : a));
        items.unshift({ level: worst.stop.peakG > 2 * r.cfg.aMaxG ? 'fail' : worst.stop.peakG > r.cfg.aMaxG ? 'warn' : 'ok',
          msg: `Brake ${r.cfg.brakeCondition === 'half' ? 'at half strength' : 'failed'} on ${failed.length} pod${failed.length > 1 ? 's' : ''}: the worst arrives at ${fmt(worst.vArr, 1)} m/s and is stopped by the ${worst.stop.type} at ${fmt(worst.stop.peakG, 2)} g over ${fmt(worst.stop.dist)} m.` });
      }
    }
    if (r.status === 'unsafe') items.unshift({ level: 'fail', msg: `Evacuation takes ${fmt(r.tAll)} s but danger level ${r.cfg.dangerLevel} allows ${r.hazard.warn} s. See Sensitivity for what to change first.` });
    list.innerHTML = items.map((f) => `<li class="${f.level}">${f.msg}</li>`).join('');
  }

  // ---------------------------------------------------------------------------
  // Canvas helpers
  // ---------------------------------------------------------------------------
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const wireColor = (w) => css('--wire-' + ((w % 6) + 1));

  function setupCanvas(c) {
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function podPos(p, t, L) {
    if (p.depart == null || t < p.depart) return { x: 0, state: 'wait' };
    if (p.stalled && (p.traj.t.length === 0 || t >= p.traj.t[p.traj.t.length - 1])) return { x: p.stallX, state: 'stall' };
    if (p.arrive != null && t >= p.arrive) return { x: L, state: 'dock' };
    const T = p.traj.t, X = p.traj.x;
    if (!T.length) return { x: 0, state: 'ride' };
    let i = 0;
    while (i < T.length - 1 && T[i + 1] < t) i++;
    const t0 = T[i], t1 = T[i + 1] ?? T[i];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return { x: X[i] + f * ((X[i + 1] ?? X[i]) - X[i]), state: 'ride' };
  }

  function loadsAt(r, w, t) {
    const L = r.wire.L;
    return r.pods.filter((p) => p.wire === w).map((p) => ({ p, pos: podPos(p, t, L) }))
      .filter((o) => o.pos.state === 'ride' || o.pos.state === 'stall')
      .map((o) => ({ x: o.pos.x, P: o.p.m * S.G }));
  }

  function drawElevation(r, t) {
    const c = $('#elev');
    const { ctx, w, h } = setupCanvas(c);
    if (w < 120 || h < 80) return; // canvas not laid out yet (hidden tab)
    const cfg = r.cfg, hz = r.hazard, wire = r.wire;
    const off = cfg.towerOffset;
    const rocketH = Math.max(cfg.accessHeight + 10, cfg.accessHeight * 1.15);
    const x0 = -off - 25, x1 = cfg.span + 45;
    const yMin = Math.min(cfg.terminusHeight, 0) - 6, yMax = rocketH + 6;
    const padL = 12, padR = 12, padT = 26, padB = 28;
    const sx = (w - padL - padR) / (x1 - x0);
    const sy = (h - padT - padB) / (yMax - yMin);
    const X = (x) => padL + (x - x0) * sx;
    const Y = (y) => h - padB - (y - yMin) * sy;
    const exag = sy / sx;
    $('#drawing-note').textContent = `Side view. Heights are drawn ${fmt(exag, 1)}× taller than lengths so the sag is visible. Rocket at left, terminus and ${cfg.safeMode === 'bunker' ? 'bunker' : 'vehicle pick-up'} at right.`;

    const ink = css('--ink'), graphite = css('--graphite'), rule = css('--rule'), hazard = css('--hazard');

    // fireball outline (true radius, same exaggeration as the drawing)
    const rfb = hz.fireballD / 2;
    if (rfb > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(X(-off), Y(0), rfb * sx, rfb * sy, 0, Math.PI, 2 * Math.PI);
      ctx.fillStyle = css('--hazard-soft');
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = hazard;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = hazard;
      ctx.font = '600 12px Barlow, sans-serif';
      const lx = Math.min(X(-off + rfb) + 4, w - 120);
      ctx.fillText(`fireball radius ${fmt(rfb)} m`, Math.max(lx, X(-off) + 30), Y(4));
    }

    // ground
    ctx.strokeStyle = graphite; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(x0), Y(0)); ctx.lineTo(X(x1), Y(0)); ctx.stroke();
    // terminus pit
    if (cfg.terminusHeight < 0) {
      ctx.fillStyle = css('--rule-soft');
      ctx.fillRect(X(cfg.span - 12), Y(0), X(cfg.span + 12) - X(cfg.span - 12), Y(cfg.terminusHeight - 1) - Y(0));
    }
    // distance ticks along the ground: blast and thermal radius
    ctx.font = '12px Barlow, sans-serif';
    const tick = (dist, label, col) => {
      const xx = dist - off;
      if (xx > x1) {
        ctx.fillStyle = col;
        ctx.fillText(`${label} ${fmt(dist)} m (off the drawing)`, X(x1) - 190, Y(yMin) + 18);
        return;
      }
      ctx.strokeStyle = col; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(xx), Y(0) + 2); ctx.lineTo(X(xx), Y(yMin) + 6); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col;
      ctx.fillText(`${label} ${fmt(dist)} m`, X(xx) + 3, Y(yMin) + 18);
    };
    tick(hz.rReq, 'safe distance', hazard);

    // rocket
    const rw = Math.max(5, 4.5 * sx);
    ctx.fillStyle = css('--sheet'); ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(X(-off) - rw, Y(0));
    ctx.lineTo(X(-off) - rw, Y(rocketH * 0.9));
    ctx.lineTo(X(-off), Y(rocketH));
    ctx.lineTo(X(-off) + rw, Y(rocketH * 0.9));
    ctx.lineTo(X(-off) + rw, Y(0));
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // tower
    const tw = Math.max(6, 6 * sx);
    ctx.strokeStyle = graphite; ctx.lineWidth = 1;
    ctx.strokeRect(X(0) - tw, Y(cfg.accessHeight + 4), tw, Y(0) - Y(cfg.accessHeight + 4));
    for (let y = 0; y < cfg.accessHeight; y += 8) {
      ctx.beginPath(); ctx.moveTo(X(0) - tw, Y(y)); ctx.lineTo(X(0), Y(Math.min(y + 8, cfg.accessHeight + 4))); ctx.stroke();
    }
    // crew access arm
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(-off) + rw, Y(cfg.accessHeight)); ctx.lineTo(X(0), Y(cfg.accessHeight)); ctx.stroke();
    ctx.fillStyle = graphite; ctx.font = '12px Barlow, sans-serif';
    ctx.fillText(`${cfg.accessHeight} m`, X(0) + 4, Y(cfg.accessHeight) - 6);

    // brake zone marker
    const xbE = wire.L - cfg.brakeRunout, xbS = xbE - cfg.brakeLength;
    // wires
    for (let wi = cfg.wires - 1; wi >= 0; wi--) {
      const loads = loadsAt(r, wi, t);
      const dy = wi * 0.9 / sy; // tiny offset so parallel wires stay visible
      ctx.strokeStyle = wireColor(wi); ctx.lineWidth = 1.4; ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const x = (wire.L * i) / 120;
        const y = S.heightAt(wire, x, loads) + dy;
        if (i === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (wi === 0 && cfg.brakeLength > 0 && cfg.terminal !== 'switchyard') {
        ctx.lineWidth = 5; ctx.globalAlpha = 0.25; ctx.strokeStyle = ink;
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const x = xbS + ((xbE - xbS) * i) / 20;
          const y = S.heightAt(wire, x, loads);
          if (i === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
        }
        ctx.stroke(); ctx.globalAlpha = 1;
        const yb = S.heightAt(wire, xbS, loads);
        ctx.fillStyle = graphite;
        ctx.fillText('magnetic brake', Math.min(X(xbS), w - 150), Y(yb) - 8);
      }
    }
    // bunker / terminus
    ctx.fillStyle = css('--rule'); ctx.strokeStyle = graphite;
    const bx = Math.min(X(cfg.span + 14), w - 50), by = Y(0);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 10, by - 16); ctx.lineTo(bx + 36, by - 16); ctx.lineTo(bx + 46, by); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = graphite;
    ctx.fillText(cfg.safeMode === 'bunker' ? 'bunker' : 'vehicles', bx + 4, by - 20);
    if (cfg.terminal === 'switchyard') {
      ctx.fillStyle = graphite;
      ctx.fillText(`switch yard: ${cfg.bays} braked bays`, Math.min(X(wire.L) - 40, w - 170), Y(0) + 16);
    }

    // pods
    const waitingByWire = {};
    for (const p of r.pods) {
      const pos = podPos(p, t, wire.L);
      let x = pos.x, y;
      const loads = loadsAt(r, p.wire, t);
      if (pos.state === 'wait') {
        const k = (waitingByWire[p.wire] = (waitingByWire[p.wire] || 0) + 1);
        x = 0; y = cfg.accessHeight - 1;
        drawPod(ctx, X(0) + 8 + (k - 1) * 15 + p.wire * 5, Y(y) + 4, p, pos.state);
        continue;
      }
      y = S.heightAt(wire, x, loads) + (p.wire * 0.9) / sy;
      if (pos.state === 'dock') {
        drawPod(ctx, X(wire.L) - 8 - (p.slot * cfg.wires + p.wire) * 14, Y(cfg.terminusHeight) - 4, p, pos.state);
        continue;
      }
      drawPod(ctx, X(x), Y(y), p, pos.state);
    }
  }

  function drawPod(ctx, px, py, p, st) {
    const col = wireColor(p.wire);
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 5); ctx.stroke();
    ctx.fillStyle = st === 'stall' ? css('--unsafe') : col;
    ctx.fillRect(px - 6, py + 5, 12, 11);
    ctx.fillStyle = css('--sheet');
    ctx.font = '600 10px Barlow, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(p.n), px, py + 14);
    ctx.textAlign = 'left';
  }

  function drawPlan(r, t) {
    const c = $('#plan');
    const { ctx, w, h } = setupCanvas(c);
    if (w < 80 || h < 80) return;
    const cfg = r.cfg, hz = r.hazard;
    const R = Math.max(hz.rReq, r.dTerminus) * 1.06;
    const s = Math.min((w - 20) / (R * 1.15), (h - 20) / (2 * R));
    const cx = 14 + 0.12 * R * s, cy = h / 2;
    const ink = css('--ink'), graphite = css('--graphite'), hazard = css('--hazard');
    const ring = (rad, col, dash, label, fill) => {
      if (!(rad > 0)) return;
      ctx.beginPath(); ctx.arc(cx, cy, rad * s, 0, 2 * Math.PI);
      if (fill) { ctx.fillStyle = fill; ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.setLineDash(dash); ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.font = '12px Barlow, sans-serif';
      const ang = -Math.PI / 2.6;
      const lx = cx + rad * s * Math.cos(ang), ly = cy + rad * s * Math.sin(ang);
      if (label) ctx.fillText(label, Math.min(lx + 3, w - ctx.measureText(label).width - 4), Math.max(ly - 3, 12));
    };
    ring(hz.fireballD / 2, hazard, [], 'fireball', css('--hazard-soft'));
    ring(hz.rBlast, graphite, [4, 3], `blast ${fmt(hz.rBlast)} m`);
    ring(hz.rThermal, hazard, [6, 3], `heat ${fmt(hz.rThermal)} m`);
    // rocket
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, 2 * Math.PI); ctx.fill();
    // wires fan out from the tower
    const n = cfg.wires;
    const spread = Math.min(0.06, 0.35 / Math.max(n, 1));
    const tx = cx + cfg.towerOffset * s;
    for (let wi = 0; wi < n; wi++) {
      const ang = (wi - (n - 1) / 2) * spread;
      const ex = tx + cfg.span * s * Math.cos(ang), ey = cy + cfg.span * s * Math.sin(ang);
      ctx.strokeStyle = wireColor(wi); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(tx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      for (const p of r.pods.filter((q) => q.wire === wi)) {
        const pos = podPos(p, t, r.wire.L);
        if (pos.state === 'wait') continue;
        const px = tx + pos.x * s * Math.cos(ang), py = cy + pos.x * s * Math.sin(ang);
        ctx.fillStyle = pos.state === 'stall' ? css('--unsafe') : wireColor(wi);
        ctx.fillRect(px - 3.5, py - 3.5, 7, 7);
      }
    }
    // switch yard: bays fan out beyond the end of each wire
    if (cfg.terminal === 'switchyard') {
      const bayLen = (cfg.brakeLength + (cfg.arrester === 'chain' ? cfg.bedLength : cfg.bufferLength)) * s;
      for (let wi = 0; wi < n; wi++) {
        const ang = (wi - (n - 1) / 2) * spread;
        const wx = tx + cfg.span * s * Math.cos(ang), wy = cy + cfg.span * s * Math.sin(ang);
        for (let b = 0; b < cfg.bays; b++) {
          const off = (b - (cfg.bays - 1) / 2) * 7;
          ctx.strokeStyle = css('--graphite'); ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + 6, wy + off); ctx.lineTo(Math.min(wx + 6 + bayLen, w - 6), wy + off); ctx.stroke();
          for (const p of r.pods.filter((q) => q.wire === wi && q.bay === b)) {
            if (podPos(p, t, r.wire.L).state !== 'dock') continue;
            ctx.fillStyle = wireColor(wi);
            ctx.fillRect(Math.min(wx + 6 + bayLen, w - 6) - 7, wy + off - 3, 7, 6);
          }
        }
      }
    }
    // bunker position along the wire direction
    if (r.window) {
      const bxp = cx + r.window.dBunker * s;
      ctx.fillStyle = css('--rule'); ctx.strokeStyle = graphite;
      ctx.fillRect(Math.min(bxp, w - 14) - 4, cy + 10, 10, 10); ctx.strokeRect(Math.min(bxp, w - 14) - 4, cy + 10, 10, 10);
      ctx.fillStyle = graphite; ctx.font = '12px Barlow, sans-serif';
      ctx.fillText('bunker', Math.min(bxp - 16, w - 50), cy + 34);
    }
    // terminus
    const ex = tx + cfg.span * s;
    ctx.fillStyle = graphite; ctx.fillRect(ex + 3, cy - 6, 10, 12);
    ctx.font = '12px Barlow, sans-serif';
    ctx.fillText('terminus', Math.min(ex - 20, w - 60), cy + 22);
    // scale bar
    const bar = niceStep(R / 3);
    ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(10, h - 10); ctx.lineTo(10 + bar * s, h - 10); ctx.stroke();
    ctx.fillStyle = ink; ctx.fillText(`${bar} m`, 12, h - 14);
  }

  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / p;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------
  const anim = {
    t: 0, speed: 4, playing: false, raf: null, tEnd: 100, r: null, last: 0,
    reset(r) {
      this.r = r;
      const ends = r.pods.map((p) => (isFinite(p.safe) ? p.safe : (p.traj.t[p.traj.t.length - 1] || 0)));
      this.tEnd = Math.max(30, ...ends) + 5;
      const sc = $('#scrub');
      sc.max = this.tEnd.toFixed(1);
      if (this.t > this.tEnd) this.t = this.tEnd;
      this.draw();
    },
    draw() {
      if (!this.r) return;
      drawElevation(this.r, this.t);
      drawPlan(this.r, this.t);
      $('#scrub').value = this.t;
      $('#clock').textContent = `t = ${fmt(this.t)} s`;
    },
    play() {
      if (this.t >= this.tEnd - 0.01) this.t = 0;
      this.playing = true; $('#play').textContent = 'Pause'; $('#play').setAttribute('aria-label', 'Pause');
      this.last = performance.now();
      const step = (now) => {
        if (!this.playing) return;
        this.t = Math.min(this.tEnd, this.t + ((now - this.last) / 1000) * this.speed);
        this.last = now;
        this.draw();
        if (this.t >= this.tEnd) return this.pause();
        this.raf = requestAnimationFrame(step);
      };
      this.raf = requestAnimationFrame(step);
    },
    pause() {
      this.playing = false; cancelAnimationFrame(this.raf);
      $('#play').textContent = 'Play'; $('#play').setAttribute('aria-label', 'Play');
    },
  };

  // ---------------------------------------------------------------------------
  // SVG charts
  // ---------------------------------------------------------------------------
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function ticks(lo, hi, n) {
    const step = niceStep((hi - lo) / (n || 5));
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
    return out;
  }
  function frame(container, opts) {
    const W = Math.max(320, container.clientWidth || 640), H = opts.height || 300;
    const m = Object.assign({ l: 52, r: 16, t: 14, b: 40 }, opts.margin || {});
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.label || '' });
    const x = (v) => m.l + ((v - opts.x[0]) / (opts.x[1] - opts.x[0])) * (W - m.l - m.r);
    const y = (v) => H - m.b - ((v - opts.y[0]) / (opts.y[1] - opts.y[0])) * (H - m.t - m.b);
    const g = el('g', { class: 'grid' }, svg);
    const ax = el('g', { class: 'axis' }, svg);
    if (!opts.noX) {
      for (const v of ticks(opts.x[0], opts.x[1], opts.xTicks || 6)) {
        el('line', { x1: x(v), x2: x(v), y1: m.t, y2: H - m.b }, g);
        el('text', { x: x(v), y: H - m.b + 16, 'text-anchor': 'middle' }, ax).textContent = v;
      }
    }
    if (!opts.noY) {
      for (const v of ticks(opts.y[0], opts.y[1], opts.yTicks || 5)) {
        el('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, g);
        el('text', { x: m.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, ax).textContent = v;
      }
    }
    el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b }, ax);
    if (opts.xLabel) el('text', { x: (m.l + W - m.r) / 2, y: H - 6, 'text-anchor': 'middle' }, ax).textContent = opts.xLabel;
    if (opts.yLabel) el('text', { x: 12, y: (m.t + H - m.b) / 2, transform: `rotate(-90 12 ${(m.t + H - m.b) / 2})`, 'text-anchor': 'middle' }, ax).textContent = opts.yLabel;
    container.appendChild(svg);
    return { svg, x, y, W, H, m };
  }
  function vline(f, v, col, label) {
    el('line', { x1: f.x(v), x2: f.x(v), y1: f.m.t, y2: f.H - f.m.b, stroke: col, 'stroke-width': 1.5, 'stroke-dasharray': '5 3' }, f.svg);
    if (label) {
      const t = el('text', { x: f.x(v) + 4, y: f.m.t + 12, style: `fill:${col}` }, f.svg);
      t.textContent = label;
    }
  }

  function renderTimeline() {
    const r = lastResult, box = $('#panel-timeline');
    box.innerHTML = '';
    const pods = r.pods;
    const tMax = Math.max(r.hazard.warn, ...pods.map((p) => (isFinite(p.safe) ? p.safe : p.depart + 60))) * 1.05;
    const rowH = 26;
    const H = 50 + pods.length * rowH + 10;
    const f = frame(box, { x: [0, tMax], y: [0, pods.length], height: H, noY: true, xLabel: 'Seconds after the alarm', margin: { l: 92, t: 10 }, label: 'Evacuation timeline per pod' });
    const segs = [
      ['board', css('--rule'), 'People arriving and boarding'],
      ['wait', css('--marginal'), 'Held for headway'],
      ['ride', css('--steel'), 'Riding the wire'],
      ['unload', css('--graphite'), 'Unloading'],
      ['safe', css('--safe'), r.leg.mode === 'vehicle' ? 'Driving clear' : 'Running to shelter'],
    ];
    pods.forEach((p, i) => {
      const y0 = f.y(pods.length - i) + 4;
      const first = r.people[p.people[0]].t;
      const parts = [
        ['board', first, p.ready],
        ['wait', p.ready, p.depart],
        ['ride', p.depart, p.arrive ?? (p.traj.t[p.traj.t.length - 1] || p.depart)],
        ['unload', p.arrive, p.unloaded],
        ['safe', p.unloaded, p.safe],
      ];
      for (const [k, a, b] of parts) {
        if (a == null || b == null || !isFinite(b) || b - a <= 0.05) continue;
        const seg = segs.find((s) => s[0] === k);
        el('rect', { x: f.x(a), y: y0, width: Math.max(1, f.x(b) - f.x(a)), height: rowH - 8, fill: seg[1], rx: 2 }, f.svg);
      }
      const lab = el('text', { x: f.m.l - 8, y: y0 + rowH / 2, 'text-anchor': 'end' }, f.svg);
      lab.textContent = `Pod ${p.id + 1} · wire ${p.wire + 1} · ${p.n}p`;
      if (p.stalled) {
        const s = el('text', { x: f.x(p.depart) + 4, y: y0 + rowH / 2, style: `fill:${css('--unsafe')}` }, f.svg);
        s.textContent = 'stalls';
      }
    });
    vline(f, r.hazard.warn, css('--hazard'), `warning window ${r.hazard.warn} s`);
    if (isFinite(r.tAll)) vline(f, r.tAll, css('--ink'), `all safe ${fmt(r.tAll)} s`);
    const leg = document.createElement('div');
    leg.className = 'legend';
    leg.innerHTML = segs.map((s) => `<span><i style="background:${s[1]}"></i>${s[2]}</span>`).join('');
    box.appendChild(leg);
  }

  function renderSpeed() {
    const r = lastResult, box = $('#panel-speed');
    box.innerHTML = r.cfg.terminal === 'switchyard'
      ? '<p class="panel-intro">Speed of each pod along the wire. With a switch yard there is no brake on the wire: pods cross the points at speed and are stopped in their own bay. The table shows each stop.</p>'
      : '<p class="panel-intro">Speed of each pod along the wire. The shaded band is the magnetic brake; the arrester stops the pod at the right edge.</p>';
    const vMax = Math.max(5, ...r.pods.map((p) => p.vPeak || 0)) * 1.1;
    const f = frame(box, { x: [0, r.wire.L], y: [0, vMax], height: 300, xLabel: 'Distance along the wire (m)', yLabel: 'Speed (m/s)', label: 'Pod speed versus distance' });
    const xbE = r.wire.L - r.cfg.brakeRunout, xbS = r.cfg.terminal === 'switchyard' ? xbE : xbE - r.cfg.brakeLength;
    el('rect', { x: f.x(Math.max(0, xbS)), y: f.m.t, width: f.x(xbE) - f.x(Math.max(0, xbS)), height: f.H - f.m.b - f.m.t, fill: css('--steel-soft') }, f.svg);
    for (const p of r.pods) {
      const pts = p.traj.x.map((x, i) => `${f.x(x).toFixed(1)},${f.y(p.traj.v[i]).toFixed(1)}`).join(' ');
      el('polyline', { points: pts, fill: 'none', stroke: wireColor(p.wire), 'stroke-width': 1.8, 'stroke-dasharray': p.slot ? '6 3' : '' }, f.svg);
    }
    const t = document.createElement('table');
    t.className = 'data';
    t.innerHTML = '<tr><th>Pod</th><th>People</th><th>Mass kg</th><th>Ride s</th><th>Peak m/s</th><th>Arrival m/s</th><th>How it stops</th><th>Stop g</th><th>Stop m</th></tr>' +
      r.pods.map((p) => `<tr><td>Pod ${p.id + 1} (wire ${p.wire + 1}${p.bay != null ? ', bay ' + (p.bay + 1) : ''})</td><td>${p.n}</td><td>${fmt(p.m)}</td><td>${p.arrive != null ? fmt(p.arrive - p.depart, 1) : p.held ? 'held' : 'stalls'}</td><td>${fmt(p.vPeak, 1)}</td><td>${fmt(p.vArr, 1)}</td><td>${p.stop ? p.stop.type : '—'}${p.brakeScale < 1 ? ' (brake ' + (p.brakeScale ? 'weak' : 'failed') + ')' : ''}</td><td>${p.stop ? fmt(p.stop.peakG, 2) : '—'}</td><td>${p.stop ? fmt(p.stop.dist) : '—'}</td></tr>`).join('');
    box.appendChild(t);
  }

  function renderMc(result) {
    const out = $('#mc-out');
    out.innerHTML = '';
    if (!result) { out.innerHTML = '<p class="panel-intro">Press Run Monte Carlo to see the spread.</p>'; return; }
    const mc = result;
    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.innerHTML = [
      ['Median', fmt(mc.p50) + ' s'], ['95th percentile', fmt(mc.p95) + ' s'], ['Worst run', fmt(mc.max) + ' s'],
      ['Later than warning', fmt(mc.pLate * 100, 1) + '%'], ['Runs with a failure', fmt(mc.pFail * 100, 1) + '%'],
    ].map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('');
    out.appendChild(stats);
    const ts = mc.runs.map((r) => r.tAll).filter(isFinite);
    const lo = Math.floor(Math.min(...ts, mc.warn) / 5) * 5, hi = Math.ceil(Math.max(...ts, mc.warn) / 5) * 5 + 5;
    const bw = Math.max(1, niceStep((hi - lo) / 30));
    const bins = [];
    for (let b = lo; b < hi; b += bw) bins.push({ a: b, n: 0 });
    for (const t of ts) { const i = Math.min(bins.length - 1, Math.floor((t - lo) / bw)); bins[i].n++; }
    const nMax = Math.max(...bins.map((b) => b.n));
    const f = frame(out, { x: [lo, hi], y: [0, nMax * 1.1], height: 280, xLabel: 'Time until everyone is safe (s)', yLabel: 'Runs', label: 'Histogram of evacuation times' });
    for (const b of bins) {
      el('rect', { x: f.x(b.a) + 0.5, y: f.y(b.n), width: Math.max(1, f.x(b.a + bw) - f.x(b.a) - 1), height: f.y(0) - f.y(b.n), fill: css('--steel') }, f.svg);
    }
    vline(f, mc.p95, css('--ink'), `P95 ${fmt(mc.p95)} s`);
    vline(f, mc.warn, css('--hazard'), `warning ${mc.warn} s`);
  }

  function heatColor(v, lo, hi) {
    const t = Math.max(0, Math.min(1, (v - lo) / Math.max(hi - lo, 1e-9)));
    // steel (fast) to hazard (slow)
    const a = [44, 99, 144], b = [228, 87, 14];
    const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function renderTrade() {
    const box = $('#trade-out');
    box.innerHTML = '<p class="panel-intro">Working…</p>';
    setTimeout(() => {
      const scn = $('#trade-scn').value;
      const tcfg = scn === 'inputs' ? currentCfg()
        : Object.assign(currentCfg(), { crew: 0, ground: +scn, tHatch: 0, tWalk: 0, tGap: 0.5 });
      if (!tradeCache || tradeCache.scn !== scn) tradeCache = Object.assign(S.tradeStudy(tcfg, 6, 6), { scn });
      const ts = tradeCache;
      box.innerHTML = '';
      const ok = ts.cells.filter((c) => c.feasible && !c.fails && isFinite(c.tAll));
      const lo = Math.min(...ok.map((c) => c.tAll)), hi = Math.max(...ok.map((c) => c.tAll));
      const W = Math.min(440, box.clientWidth || 440), cell = (W - 70) / 6, H = cell * 6 + 60;
      const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, style: `width:${W}px;max-width:100%;height:auto`, role: 'img', 'aria-label': 'Evacuation time for each layout' });
      for (const c of ts.cells) {
        const x = 60 + (c.k - 1) * cell, y = 10 + (6 - c.m) * cell;
        const fill = !c.feasible ? css('--rule-soft') : c.fails ? css('--unsafe') : heatColor(c.tAll, lo, hi);
        el('rect', { x: x + 1, y: y + 1, width: cell - 2, height: cell - 2, fill, rx: 3, opacity: c.feasible && !c.fails ? 0.9 : 0.6 }, svg);
        if (c.pareto) el('rect', { x: x + 3, y: y + 3, width: cell - 6, height: cell - 6, fill: 'none', stroke: css('--ink'), 'stroke-width': 2.5, rx: 2 }, svg);
        const t = el('text', { x: x + cell / 2, y: y + cell / 2 + 5, 'text-anchor': 'middle', style: `fill:${c.feasible ? '#fff' : css('--graphite')};font-weight:600;font-size:${Math.max(11, cell / 4.2)}px` }, svg);
        t.textContent = !c.feasible ? 'too few' : c.fails ? 'fails' : fmt(c.tAll);
        if (c.m === currentCfg().wires && c.k === currentCfg().podsPerWire) {
          el('circle', { cx: x + cell - 10, cy: y + 10, r: 4, fill: '#fff' }, svg);
        }
      }
      for (let i = 1; i <= 6; i++) {
        el('text', { x: 60 + (i - 0.5) * cell, y: H - 30, 'text-anchor': 'middle' }, svg).textContent = i;
        el('text', { x: 50, y: 10 + (6 - i + 0.5) * cell + 4, 'text-anchor': 'end' }, svg).textContent = i;
      }
      el('text', { x: 60 + 3 * cell, y: H - 8, 'text-anchor': 'middle' }, svg).textContent = 'Pods per wire (series)';
      el('text', { x: 14, y: 10 + 3 * cell, transform: `rotate(-90 14 ${10 + 3 * cell})`, 'text-anchor': 'middle' }, svg).textContent = 'Wires (parallel)';
      box.appendChild(svg);
      const best = ok.slice().sort((a, b) => a.tAll - b.tAll || a.cost - b.cost)[0];
      const cheapest = ok.filter((c) => c.pareto).sort((a, b) => a.cost - b.cost)[0];
      const p = document.createElement('p');
      p.className = 'panel-intro';
      p.innerHTML = best ? `Fastest layout: ${best.m} wire${best.m > 1 ? 's' : ''} × ${best.k} pod${best.k > 1 ? 's' : ''}, ${fmt(best.tAll)} s. Cheapest layout on the best-for-cost line: ${cheapest.m} × ${cheapest.k}, ${fmt(cheapest.tAll)} s. Series pods leave at least ${fmt(ts.headway, 1)} s apart so the one behind cannot reach the dock before it is cleared. The white dot marks the layout you have chosen.` : 'No layout works with these inputs.';
      box.appendChild(p);
    }, 20);
  }

  function renderSens() {
    const box = $('#sens-out');
    box.innerHTML = '<p class="panel-intro">Working…</p>';
    setTimeout(() => {
      if (!sensCache) sensCache = S.sensitivity(currentCfg(), 0.2);
      const se = sensCache;
      box.innerHTML = '';
      const rows = se.rows.filter((r) => isFinite(r.lo) && isFinite(r.hi));
      const broken = se.rows.filter((r) => !(isFinite(r.lo) && isFinite(r.hi)));
      const span = Math.max(1, ...rows.map((r) => Math.max(Math.abs(r.lo), Math.abs(r.hi))));
      const H = 30 + rows.length * 24 + 40;
      const f = frame(box, { x: [-span * 1.1, span * 1.1], y: [0, rows.length], height: H, noY: true, xLabel: `Change in time until everyone is safe (s), baseline ${fmt(se.t0)} s`, margin: { l: 190, t: 8 }, label: 'Sensitivity tornado chart' });
      rows.forEach((r, i) => {
        const y = f.y(rows.length - i) + 4;
        const draw = (v, col) => el('rect', { x: Math.min(f.x(0), f.x(v)), y, width: Math.abs(f.x(v) - f.x(0)), height: 16, fill: col, rx: 2 }, f.svg);
        draw(r.lo, css('--steel'));
        draw(r.hi, css('--hazard'));
        el('text', { x: f.m.l - 8, y: y + 12, 'text-anchor': 'end' }, f.svg).textContent = r.label;
      });
      el('line', { x1: f.x(0), x2: f.x(0), y1: f.m.t, y2: f.H - f.m.b, stroke: css('--ink') }, f.svg);
      const leg = document.createElement('div');
      leg.className = 'legend';
      leg.innerHTML = `<span><i style="background:${css('--steel')}"></i>Input 20% lower</span><span><i style="background:${css('--hazard')}"></i>Input 20% higher</span>`;
      box.appendChild(leg);
      if (broken.length) {
        const p = document.createElement('p');
        p.className = 'stale';
        p.textContent = `Moving ${broken.map((b) => b.label.toLowerCase()).join(', ')} by 20% makes the design fail outright (a pod stalls or the cable is overloaded), so it is not on the chart.`;
        box.appendChild(p);
      }
    }, 20);
  }

  // ---------------------------------------------------------------------------
  // Scale model
  // ---------------------------------------------------------------------------
  function parseCsv(text) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    if (!lines.length) return [];
    const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const hasHead = head.includes('time_s');
    const cols = hasHead ? head : ['run', 'wire_length_m', 'drop_m', 'mass_kg', 'time_s', 'notes'];
    return lines.slice(hasHead ? 1 : 0).map((l) => {
      const v = l.split(',');
      const o = {};
      cols.forEach((c, i) => (o[c] = c === 'notes' || c === 'run' ? (v[i] || '').trim() : parseFloat(v[i])));
      return o;
    });
  }

  function renderScale(runs) {
    const out = $('#scale-out');
    out.innerHTML = '';
    const fit = S.fitScaleModel(runs);
    if (!fit) { out.innerHTML = '<p class="stale">No usable rows. Each row needs wire length, drop, mass and time, all above zero.</p>'; return; }
    const stats = document.createElement('div');
    stats.className = 'stats';
    stats.innerHTML = [['Runs', fit.points.length], ['Fitted μ', fmt(fit.mu, 3)], ['Fitted drag area', fmt(fit.cda * 1e4, 0) + ' cm²'], ['RMS error', fmt(fit.rmse, 3) + ' s']]
      .map(([k, v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join('');
    out.appendChild(stats);
    const all = fit.points.flatMap((p) => [p.time_s, p.predicted]).filter(isFinite);
    const lo = Math.min(...all) * 0.9, hi = Math.max(...all) * 1.1;
    const f = frame(out, { x: [lo, hi], y: [lo, hi], height: 300, xLabel: 'Measured time (s)', yLabel: 'Predicted time (s)', label: 'Measured versus predicted run times' });
    el('line', { x1: f.x(lo), y1: f.y(lo), x2: f.x(hi), y2: f.y(hi), stroke: css('--graphite'), 'stroke-dasharray': '4 3' }, f.svg);
    for (const p of fit.points) el('circle', { cx: f.x(p.time_s), cy: f.y(p.predicted), r: 4.5, fill: css('--steel') }, f.svg);
    const t = document.createElement('table');
    t.className = 'data';
    t.innerHTML = '<tr><th>Run</th><th>Length m</th><th>Drop m</th><th>Mass kg</th><th>Measured s</th><th>Predicted s</th></tr>' +
      fit.points.map((p) => `<tr><td>${p.run || ''}</td><td>${p.wire_length_m}</td><td>${p.drop_m}</td><td>${p.mass_kg}</td><td>${fmt(p.time_s, 2)}</td><td>${fmt(p.predicted, 2)}</td></tr>`).join('');
    out.appendChild(t);
    const note = document.createElement('p');
    note.className = 'panel-intro';
    note.textContent = 'Use the fitted μ as the trolley rolling resistance only if the full-size trolley uses the same kind of wheels and bearings. Drag area from a small model does not carry over directly; see the protocol for scaling.';
    out.appendChild(note);
  }

  // ---------------------------------------------------------------------------
  // Model notes
  // ---------------------------------------------------------------------------
  function renderModel() {
    $('#panel-model').innerHTML = `
      <h3>1. How far is safe</h3>
      <p>Propellant that could take part in an explosion is turned into an equivalent mass of TNT, W. The DoD rule for LOX/LH₂ is the larger of 14% of the propellant mass or 8W<sup>2/3</sup> (pounds); LOX/RP-1 is 10%. Methane and hypergolic values are stated assumptions. The danger level sets what fraction of the propellant takes part and how much warning there is.</p>
      <p class="eq">R<sub>blast</sub> = K · W<sup>1/3</sup>  (feet, pounds; K40 ≈ 1.2 psi)</p>
      <p>The fireball from the liquid propellant M follows High's fits, D = 3.86 M<sup>0.32</sup> m and t = 0.299 M<sup>0.32</sup> s. Heat reaching a person falls as (R<sub>fireball</sub>/r)², and the safe distance is where the thermal dose q<sup>4/3</sup>t drops below the burn threshold.</p>
      <p class="eq">R<sub>safe</sub> = max(R<sub>blast</sub>, R<sub>heat</sub>)</p>
      <h3>2. The shape of the wire</h3>
      <p>The steel rope is held at constant tension T by a counterweight. Its own weight w and each pod's weight P<sub>j</sub> pull it down from the straight line between the tower and the terminus:</p>
      <p class="eq">δ(x) = [ w x (L − x) / 2 + Σ P<sub>j</sub> G(x, x<sub>j</sub>) ] / T,   G(x,a) = x(L−a)/L for x ≤ a, a(L−x)/L for x ≥ a</p>
      <p>Because every pod changes the slope under every other pod on the same wire, all pods on a wire are simulated together.</p>
      <h3>3. The ride</h3>
      <p class="eq">m dv/dt = m g sin θ − μ m g cos θ − ½ ρ C<sub>d</sub>A (v − u cos θ)|v − u cos θ| − k<sub>b</sub> v</p>
      <p>The last term is the magnetic (eddy-current) brake, which only acts in the brake zone. It needs no power, but its force grows with speed and falls with mass, so a brake that slows a full pod can almost stop a light one. The model sizes k<sub>b</sub> for both corners: a full pod with a 17.5 m/s tailwind, and the lightest pod into the same headwind. Whatever speed is left is taken by the catch net at the dock. Integration is fourth-order Runge–Kutta with a 0.02 s step.</p>
      <h3>4. People and pods</h3>
      <p>People reach the platform single file. The close-out crew come first; the flight crew follow after leaving the capsule. Pods leave when their occupants have boarded. Pods in series on one wire also wait for the headway: the smallest gap at which the pod behind never closes within 5 m and reaches the dock only after the one ahead has been cleared.</p>
      <h3>5. What the model leaves out</h3>
      <ul><li>Flying debris, which in practice can set the safe distance.</li><li>Swinging and crosswind sway of the pods; only wind along the wire is modelled.</li><li>Cable stretch and dynamic waves in the cable.</li><li>A real pad layout. Real layouts are not public, so the reference launcher's heights and distances are estimates.</li></ul>
      <h3>6. Release, brake failure and the switch yard</h3>
      <p>Each pod is released from the inside: an occupant pulls a lever that drops the latch. The lever is interlocked. With a fixed headway it unlocks after a set time; with a block marker it unlocks only when the pod ahead has passed a marker on the wire, so a stalled pod ahead keeps the next one safely on the platform.</p>
      <p>If a magnetic brake fails, the pod must still stop. A catch net's deceleration grows with the square of speed (a = v²/2s). A drag-chain bed picks up k<sub>c</sub> kilograms of chain per metre, so its force grows with distance, F = μ<sub>s</sub> g k<sub>c</sub> s, and the stop is simple-harmonic:</p>
      <p class="eq">ω² = μ<sub>s</sub> g k<sub>c</sub> / m,   stop distance = v/ω,   peak deceleration = v ω</p>
      <p>With a switch yard, the wire hands each pod to a ground rail and self-indexing points send pod 1 to bay 1, pod 2 to bay 2, and so on. The magnetic brake sits in each level bay (speed falls by k<sub>b</sub>L/m), followed by the chain bed, so the shared wire clears in seconds and the next pod can follow closely.</p>
      <h3>7. How far from the pad the bunker can be</h3>
      <p class="eq">d<sub>B</sub> = x<sub>tower</sub> + L<sub>span</sub> + L<sub>stop</sub> + d<sub>run</sub></p>
      <p>Rocket-to-tower offset, wire span, the track a pod uses after the wire (arrester, or a switch-yard bay), and the run to the bunker door. Three limits apply:</p>
      <ul>
        <li><strong>Hazard, the minimum:</strong> d<sub>min</sub> = max(R(bunker rating), 1.5 × fireball radius).</li>
        <li><strong>Reach:</strong> the span cannot exceed the longest span on which the lightest pod, with no magnetic brake, still arrives in the design headwind; very steep short spans are limited by rope tension instead.</li>
        <li><strong>Time, the maximum:</strong> d<sub>max</sub> = x<sub>tower</sub> + L<sub>span</sub> + L<sub>stop</sub> + v<sub>run</sub>(T<sub>warn</sub> − t<sub>out</sub>), where t<sub>out</sub> is when the last person leaves a pod.</li>
      </ul>
      <p>The bunker KPI shows the window for your design. If the bunker can be placed beyond the safe distance, it is not needed at all.</p>
      <h3>8. Sizing for any pad</h3>
      <p>Running the brake check for crew access heights of 30–120 m gives a working band near <span class="eq" style="display:inline;padding:2px 6px">span ≈ 100 m + 4 × crew height</span>, with a brake section of about 1.4 × the height. Pick any rocket and any pad above to test a design against it.</p>
      <h3>Sources</h3>
      <ul class="sources">
        <li>NASA, <a href="https://www.nasa.gov/missions/artemis/artemis-2/artemis-emergency-egress-system-emphasizes-crew-safety">Artemis Emergency Egress System Emphasizes Crew Safety</a> (2024)</li>
        <li>NASA, <a href="https://www.nasa.gov/missions/artemis/artemis-2/nasa-teams-change-brakes-to-keep-artemis-crew-safe">NASA Teams Change Brakes to Keep Artemis Crew Safe</a> (2024)</li>
        <li>P. Pranit, Starlust, <a href="https://starlust.org/artemis-ii-crew-will-use-this-roller-coaster-inspired-system-to-escape-to-safety-during-emergency/">Artemis II crew will use this roller-coaster-inspired system to escape to safety</a> (2026)</li>
        <li>Jeffcoat and Stephan, <a href="https://ntrs.nasa.gov/citations/19810013861">Space shuttle slidewire emergency egress system</a> (NASA, 1981)</li>
        <li>NASA KSC, <a href="https://discmaster.textfiles.com/view/10606/Space%20and%20Astronomy%20(October%201993).iso/mac/TEXT/SHUTTLE/CREWSAF.TXT">Changes to the Emergency Egress System at Pad 39-B</a> (1988)</li>
        <li>Spaceflight Now, <a href="https://www.spaceflightnow.com/news/n1203/19baskets/">Escape baskets for shuttle crews removed from pad</a> (2011)</li>
        <li>NASA, <a href="https://blogs.nasa.gov/commercialcrew/2017/04/03/zip-lines-installed-at-slc-41-for-starliner-missions/">Zip Lines Installed at SLC-41 for Starliner Missions</a> (2017)</li>
        <li>Reveles, Bangham et al., <a href="https://ndia.dtic.mil/wp-content/uploads/2018/intexpsafety/Bangham.pdf">Results from Gaseous Methane/Oxygen Mixture Testing</a> (2018): DoD TNT equivalences</li>
        <li>DoD, <a href="https://everyspec.com/DoD/DoD-PUBLICATIONS/DOD_6055x9-STD_JUL1999_21387/">DoD 6055.9-STD Ammunition and Explosives Safety Standards</a></li>
        <li>Bransford and Gayle, <a href="https://ntrs.nasa.gov/citations/19650022652">Size and duration of fireballs from propellant explosions</a> (NASA, 1965)</li>
        <li>Lihou and Maund, <a href="https://www.icheme.org/media/25181/the-assessment-of-major-hazards-icheme-symposium-series-71-1982-15-lihou.pdf">Thermal radiation hazard from fireballs</a> (IChemE, 1982)</li>
        <li>UK HSE, <a href="https://www.hse.gov.uk/research/hsl_pdf/2004/hsl04-04.pdf">Human Vulnerability to Thermal Radiation Offshore</a> (HSL/2004/04)</li>
        <li>Unirope, <a href="https://www.unirope.com/ropes/class-6x36-iwrc-and-fiber-core">Class 6×36 IWRC wire rope table</a></li>
      </ul>
      <p>Full derivations and validation are in the paper.</p>`;
  }

  // ---------------------------------------------------------------------------
  // Tabs and wiring
  // ---------------------------------------------------------------------------
  let activeTab = 'timeline';
  let mcResult = null;
  function renderBom() {
    const box = $('#panel-bom');
    const b = S.bom(lastResult.cfg, lastResult);
    const total = Object.values(b.totals).reduce((a, x) => a + x, 0);
    const kg = (m) => (m == null ? '–' : m >= 1000 ? (m / 1000).toFixed(1) + ' t' : Math.round(m) + ' kg');
    box.innerHTML = `<p class="panel-intro">Bill of materials for the design you have chosen, recalculated from it. Total about ${kg(total)}. Property values are typical handbook figures; a real build uses certified mill data.</p>
      <div class="table-scroll"><table class="data bom"><tr><th>Group</th><th>Component</th><th>Material</th><th>Sizing</th><th>Qty</th><th>Mass</th></tr>
      ${b.rows.map((row) => `<tr><td>${row.group}</td><td>${row.item}</td><td>${row.material}</td><td>${row.spec}</td><td>${row.qty} ${row.unit}</td><td>${kg(row.massKg)}</td></tr>`).join('')}</table></div>
      <h3 class="sub">Materials and why they were chosen</h3>
      <div class="table-scroll"><table class="data bom"><tr><th>Material</th><th>Standard</th><th>Density</th><th>Stiffness</th><th>Strength and other properties</th><th>Why</th></tr>
      ${Object.values(b.materials).map((m) => `<tr><td>${m.name}</td><td>${m.standard}</td><td>${m.density}</td><td>${m.E}</td><td>${m.strength}</td><td>${m.why}</td></tr>`).join('')}</table></div>`;
  }

  function renderActiveTab() {
    if (!lastResult) return;
    if (activeTab === 'bom') renderBom();
    else if (activeTab === 'timeline') renderTimeline();
    else if (activeTab === 'speed') renderSpeed();
    else if (activeTab === 'trade') renderTrade();
    else if (activeTab === 'sens') renderSens();
    else if (activeTab === 'mc') {
      renderMc(mcResult);
      if (mcResult && mcStale) {
        const p = document.createElement('p');
        p.className = 'stale';
        p.textContent = 'Inputs have changed since this run. Run it again to update.';
        $('#mc-out').prepend(p);
      }
    }
  }
  function selectTab(name) {
    activeTab = name;
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.panel').forEach((p) => (p.hidden = p.id !== 'panel-' + name));
    renderActiveTab();
  }

  function init() {
    buildForm();
    readHash();
    syncForm();
    renderModel();
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => selectTab(b.dataset.tab)));
    document.querySelector('[data-tab-link="model"]').addEventListener('click', (e) => {
      e.preventDefault();
      selectTab('model');
      document.querySelector('.analysis').scrollIntoView({ behavior: 'smooth' });
    });
    $('#play').addEventListener('click', () => (anim.playing ? anim.pause() : anim.play()));
    $('#scrub').addEventListener('input', (e) => { anim.pause(); anim.t = +e.target.value; anim.draw(); });
    document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
      anim.speed = +b.dataset.speed;
      document.querySelectorAll('[data-speed]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('#mc-run').addEventListener('click', () => {
      const btn = $('#mc-run');
      btn.disabled = true; btn.textContent = 'Running…';
      setTimeout(() => {
        mcResult = S.monteCarlo(currentCfg(), +$('#mc-n').value, 2026);
        mcStale = false;
        btn.disabled = false; btn.textContent = 'Run Monte Carlo';
        renderActiveTab();
      }, 30);
    });
    $('#reset').addEventListener('click', () => { state = START(); syncForm(); run(); syncForm(); writeHash(); });
    $('#share').addEventListener('click', async () => {
      writeHash();
      try { await navigator.clipboard.writeText(location.href); $('#share').textContent = 'Link copied'; }
      catch (e) { $('#share').textContent = 'Copy the address bar'; }
      setTimeout(() => ($('#share').textContent = 'Copy link to this design'), 2000);
    });
    $('#csv').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      $('#csv-text').value = await file.text();
      renderScale(parseCsv($('#csv-text').value));
    });
    $('#fit').addEventListener('click', () => renderScale(parseCsv($('#csv-text').value)));
    $('#trade-scn').addEventListener('change', renderTrade);
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { anim.draw(); renderActiveTab(); }, 150); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { anim.draw(); renderActiveTab(); });
    run();
    syncForm();
    if (location.hash === '#model') selectTab('model');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) anim.play();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
