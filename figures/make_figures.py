"""Paper figures for PLE-SBS, drawn from data/results.json (written by sim/export.js).

Run:  .venv/bin/python figures/make_figures.py
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Rectangle, Polygon, Ellipse

ROOT = Path(__file__).resolve().parent.parent
R = json.loads((ROOT / "data" / "results.json").read_text())
OUT = ROOT / "figures"

INK = "#18283a"
GRAPHITE = "#56636f"
RULE = "#c8d0d8"
STEEL = "#2c6390"
STEEL_SOFT = "#d6e3ee"
HAZARD = "#e4570e"
HAZARD_SOFT = "#fbe3d6"
SAFE = "#237a3b"
MARGINAL = "#b86e00"
UNSAFE = "#c0282d"
WIRES = [STEEL, "#6a4c93", "#1f8a8a", "#8a5a2b"]

plt.rcParams.update({
    "font.family": ["Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 7.5,
    "axes.titlesize": 8,
    "axes.labelsize": 7.5,
    "axes.edgecolor": GRAPHITE,
    "axes.linewidth": 0.6,
    "axes.labelcolor": INK,
    "xtick.color": GRAPHITE,
    "ytick.color": GRAPHITE,
    "xtick.major.width": 0.5,
    "ytick.major.width": 0.5,
    "axes.grid": True,
    "grid.color": "#e3e8ed",
    "grid.linewidth": 0.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "legend.frameon": False,
    "legend.fontsize": 7,
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.02,
})
COL = 3.35  # one column, inches
FULL = 7.0  # page width, inches


def save(fig, name):
    fig.savefig(OUT / f"{name}.png")
    plt.close(fig)
    print("wrote", name)


# ---------------------------------------------------------------------------
# Fig 1: final PLE-SBS geometry for the reference launcher (elevation, real model profile)
# ---------------------------------------------------------------------------
def fig_geometry():
    F = R["final"]
    cfg = F["cfg"]
    prof = np.array(F["profile"])
    off = cfg["towerOffset"]
    H = cfg["accessHeight"]
    L = F["wireL"]
    fig, ax = plt.subplots(figsize=(FULL, 1.75))
    ax.grid(False)
    ax.spines["left"].set_visible(False)
    ax.set_yticks([])
    # fireball (true scale)
    rfb = [h for h in R["hazard"] if h["key"] == "REF"][0]["fireballD"] / 2
    ax.add_patch(Ellipse((-off, 0), 2 * rfb, 2 * rfb, facecolor=HAZARD_SOFT, edgecolor=HAZARD, ls="--", lw=0.8, alpha=0.9, zorder=0))
    ax.text(-off + rfb * 0.78, 3, f"fireball\nradius {rfb:.0f} m", color=HAZARD, fontsize=6.5, va="bottom")
    ax.axhline(0, color=GRAPHITE, lw=0.7)
    # rocket
    rh = H + 8
    ax.add_patch(Polygon([[-off - 2.5, 0], [-off - 2.5, rh * 0.9], [-off, rh], [-off + 2.5, rh * 0.9], [-off + 2.5, 0]], closed=True, fc="white", ec=INK, lw=0.8))
    ax.text(-off - 4, rh + 2, "launcher", ha="center", fontsize=7, color=INK)
    # tower + arm
    ax.add_patch(Rectangle((-5, 0), 5, H + 4, fill=False, ec=GRAPHITE, lw=0.7))
    for y in range(0, int(H), 7):
        ax.plot([-5, 0], [y, min(y + 7, H + 4)], color=GRAPHITE, lw=0.4)
    ax.plot([-off + 2.5, 0], [H, H], color=INK, lw=1.4)
    ax.annotate(f"crew access level {H:.0f} m", (2, H), (40, H + 8), fontsize=7, color=INK,
                arrowprops=dict(arrowstyle="-", lw=0.5, color=GRAPHITE))
    # wire (unloaded) and chord
    ax.plot(prof[:, 0], prof[:, 1], color=STEEL, lw=1.3)
    ax.plot([0, L], [H, cfg["terminusHeight"]], color=STEEL, lw=0.5, ls=":")
    xm = L * 0.5
    ym = np.interp(xm, prof[:, 0], prof[:, 1])
    ax.annotate(f"steel rope, {cfg['cableDiameter']:.0f} mm at {cfg['tension']:.0f} kN;\nsags {F['sag']:.1f} m below the chord (dotted)",
                (xm, ym), (xm + 30, ym + 18), fontsize=6.5, color=STEEL, arrowprops=dict(arrowstyle="-", lw=0.5, color=STEEL))
    # brake zone
    xbE = L - cfg["brakeRunout"]
    xbS = xbE - cfg["brakeLength"]
    sel = (prof[:, 0] >= xbS) & (prof[:, 0] <= xbE)
    ax.plot(prof[sel, 0], prof[sel, 1], color=INK, lw=4, alpha=0.25, solid_capstyle="butt")
    yb = np.interp(xbS, prof[:, 0], prof[:, 1])
    ax.text(xbS - 4, yb - 7, f"eddy-current brake\n{cfg['brakeLength']:.0f} m", fontsize=6.5, color=INK, ha="right", va="top")
    # pit, net, bunker
    ax.add_patch(Rectangle((L - 14, cfg["terminusHeight"] - 1), 28, -cfg["terminusHeight"] + 1, fc="#e8edf1", ec=GRAPHITE, lw=0.5))
    bx = L + cfg["bunkerWalk"]
    ax.add_patch(Polygon([[bx - 8, 0], [bx - 5, 6], [bx + 5, 6], [bx + 8, 0]], closed=True, fc=RULE, ec=GRAPHITE, lw=0.6))
    ax.text(bx + 12, 4, "landing pit with 10 m catch net;\nbunker 20 m from the dock", fontsize=6.5, color=GRAPHITE, va="bottom")
    # hazard distance arrows
    hz = [h for h in R["hazard"] if h["key"] == "REF"][0]
    for dist, lab, yy in [(hz["rBlast"], "blast, K40 (1.2 psi)", -14), (R["final"]["rReq"], "required safe distance (fireball heat)", -24)]:
        x = dist - off
        ax.annotate("", (x, yy), (-off, yy), arrowprops=dict(arrowstyle="->", lw=0.6, color=HAZARD))
        ax.text(x, yy + 1.5, f"{lab} {dist:.0f} m", fontsize=6.5, color=HAZARD, ha="right", va="bottom")
    ax.set_xlim(-off - 25, max(L + 70, R["final"]["rReq"] - off + 5))
    ax.set_ylim(-28, H + 16)
    ax.set_xlabel("Horizontal distance from the tower (m)")
    ax.set_aspect(2.2)
    ax.text(0.995, 0.97, "vertical scale ×2.2", transform=ax.transAxes, ha="right", va="top", fontsize=6.5, color=GRAPHITE)
    save(fig, "fig1_geometry")


# ---------------------------------------------------------------------------
# Fig 2: hazard distance per vehicle vs reach of its slidewire
# ---------------------------------------------------------------------------
def fig_hazard():
    hz = R["hazard"]
    names = {"REF": "Reference medium-lift", "SLS": "SLS / Orion", "F9": "Falcon 9 / Dragon", "ATLAS": "Atlas V / Starliner", "SHUTTLE": "Space Shuttle"}
    fig, ax = plt.subplots(figsize=(COL, 1.75))
    y = np.arange(len(hz))[::-1]
    ax.barh(y + 0.18, [h["rThermal"] for h in hz], height=0.34, color=HAZARD, label="heat (fireball dose)")
    ax.barh(y - 0.18, [h["rBlast"] for h in hz], height=0.34, color=GRAPHITE, label="blast, K40 (1.2 psi)")
    for yi, h in zip(y, hz):
        ax.plot([h["wireReach"]] * 2, [yi - 0.42, yi + 0.42], color=STEEL, lw=2)
        ax.text(h["rThermal"] + 20, yi + 0.18, f"{h['tntT']:.0f} t TNT", va="center", fontsize=6.5, color=GRAPHITE)
    ax.plot([], [], color=STEEL, lw=2, label="end of slidewire")
    ax.set_yticks(y, [names[h["key"]] for h in hz])
    ax.set_xlabel("Distance from the rocket (m), danger level 4")
    ax.set_xlim(0, 1700)
    ax.grid(axis="y", visible=False)
    ax.legend(loc="lower center", bbox_to_anchor=(0.42, 1.0), ncol=3, fontsize=6.3, handlelength=1.4, columnspacing=1.0)
    save(fig, "fig2_hazard")


# ---------------------------------------------------------------------------
# Fig 3: validation against Shuttle-era and Artemis-era slidewires
# ---------------------------------------------------------------------------
def fig_validation():
    V = R["validation"]
    fig, ax = plt.subplots(figsize=(COL, 1.8))
    mph = 0.44704
    ax.axhspan(40 * mph, 55 * mph, color=STEEL_SOFT, lw=0, label="Artemis reported 40–55 mph")
    ax.axhline(55 * mph, color=GRAPHITE, lw=0.6, ls="--")
    ax.text(5, 55 * mph + 0.6, "Shuttle reported ≈55 mph", fontsize=6.5, color=GRAPHITE)
    ax.plot(V["shuttle"]["x"], V["shuttle"]["v"], color=INK, lw=1.2, label=f"Shuttle LC-39B model ({V['shuttle']['ride']:.0f} s ride)")
    ax.plot(V["artemis"]["x"], V["artemis"]["v"], color=HAZARD, lw=1.2, label="Artemis LC-39B, gravity only")
    ax.plot(V["artemisBraked"]["x"], V["artemisBraked"]["v"], color=HAZARD, lw=1.2, ls="--",
            label=f"Artemis with {V['artemisBraked']['brakeLength']:.0f} m eddy brake")
    ax.set_xlabel("Distance along the wire (m)")
    ax.set_ylabel("Pod speed (m/s)")
    ax.set_xlim(0, 420)
    ax.set_ylim(0, 38)
    ax.legend(loc="lower center", fontsize=6.2, ncol=1)
    save(fig, "fig3_validation")


# ---------------------------------------------------------------------------
# Fig 4: passive-brake feasibility window (launch height × span)
# ---------------------------------------------------------------------------
def fig_feasibility():
    FE = R["feasibility"]
    Hs, spans = FE["Hs"], FE["spans"]
    fig, ax = plt.subplots(figsize=(FULL, 2.15))
    ax.grid(False)
    for c in FE["cells"]:
        if c["ok"]:
            col = SAFE
        elif c["stall"]:
            col = "#cfd8e0"
        elif c["cable"]:
            col = "#9aa5af"
        else:
            t = min(1, (c["gMax"] - 1.5) / 8)
            col = matplotlib.colors.to_hex(np.array(matplotlib.colors.to_rgb(HAZARD_SOFT)) * (1 - t) + np.array(matplotlib.colors.to_rgb(HAZARD)) * t)
        ax.add_patch(Rectangle((c["span"] - 12.5, c["H"] - 2.5), 25, 5, fc=col, ec="white", lw=0.4))
    # sizing rule
    f = FE["fit"]
    hh = np.array([30, 120])
    ax.plot(f["icpt"] + f["slope"] * hh, hh, color=INK, lw=1.0, ls="--")
    ax.annotate(f"sizing rule:\nspan ≈ {f['icpt']:.0f} m + {f['slope']:.1f} × height", (f["icpt"] + f["slope"] * 95, 95), (610, 70),
                fontsize=7, color=INK, arrowprops=dict(arrowstyle="-", lw=0.6, color=INK))
    # existing and generic pads
    names = {"GENERIC_LOW": "generic low pad\n(worked example)", "LC39B_ARTEMIS": "LC-39B Artemis", "LC39A": "LC-39A",
             "SLC41": "SLC-41", "LC39B_SHUTTLE": "LC-39B Shuttle"}
    offs = {"GENERIC_LOW": (-95, 6), "LC39B_ARTEMIS": (-118, 2), "LC39A": (-70, 3), "SLC41": (12, -8), "LC39B_SHUTTLE": (12, 3)}
    for p in FE["pads"]:
        ax.plot([p["span"]], [p["H"]], marker="*" if p["key"] == "GENERIC_LOW" else "o", ms=9 if p["key"] == "GENERIC_LOW" else 5,
                color=INK, mec="white", mew=0.6, zorder=5)
        dx, dy = offs[p["key"]]
        ax.text(p["span"] + dx, p["H"] + dy, names[p["key"]], fontsize=6.5, color=INK, zorder=6)
    ax.set_xlim(spans[0] - 12.5, spans[-1] + 12.5)
    ax.set_ylim(Hs[0] - 2.5, Hs[-1] + 2.5)
    ax.set_xlabel("Wire span (m)")
    ax.set_ylabel("Crew access height (m)")
    from matplotlib.patches import Patch
    ax.legend(handles=[Patch(fc=SAFE, label="passive brake works at both wind corners"), Patch(fc=HAZARD, label="stop too hard (> 1.5 g); darker = harder"),
                       Patch(fc="#cfd8e0", label="light pod stalls in headwind"), Patch(fc="#9aa5af", label="cable overloaded")],
              loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=4, fontsize=6.3, handlelength=1.1, columnspacing=1.0)
    for sp in ["left", "bottom"]:
        ax.spines[sp].set_visible(False)
    save(fig, "fig4_feasibility")


# ---------------------------------------------------------------------------
# Fig 5: series vs parallel (24 people on the platform)
# ---------------------------------------------------------------------------
def fig_topology():
    SW = R["singleWire"]
    fig, (a, b) = plt.subplots(1, 2, figsize=(FULL, 2.0), gridspec_kw={"width_ratios": [1.05, 1]})
    k = [r["pods"] for r in SW]
    for key, col, mk, lab in [("dock", HAZARD, "o", "one wire, single dock"), ("switchyard", SAFE, "s", "one wire, switch yard (D5 rule)"),
                              ("parallel", STEEL, "^", "one wire per pod (parallel)")]:
        a.plot(k, [r[key]["tAll"] for r in SW], marker=mk, color=col, lw=1.3, ms=3.5, label=lab)
        a.plot(k, [r[key]["tHead"] for r in SW], marker=mk, color=col, lw=0.9, ms=2.5, ls="--", alpha=0.8)
    a.plot([], [], color=GRAPHITE, ls="--", lw=0.9, label="dashed: 17.5 m/s headwind")
    a.set_xlabel("Pods (4 people each, all on the platform)")
    a.set_ylabel("Time until all are safe (s)")
    a.set_title("(a) Series on one wire: dock vs switch yard", loc="left")
    a.set_ylim(0, 300)
    a.legend(loc="upper left", fontsize=6.2)

    b.axhspan(0, 1.5, color="#e7f2ea", lw=0)
    b.axhline(1.5, color=SAFE, lw=0.7)
    b.axhline(3.0, color=UNSAFE, lw=0.7, ls=":")
    b.text(29.5, 1.58, "1.5 g limit", fontsize=6, color=SAFE, ha="right")
    b.text(29.5, 3.08, "3 g double-fault limit", fontsize=6, color=UNSAFE, ha="right")
    c = [c for c in R["arresterCurves"] if c["m"] == 700][0]
    for key, col, lab in [("net", HAZARD, "D4: 10 m catch net at the end of the wire"), ("bay", SAFE, "D5 bay: magnetic brake + chain bed"),
                          ("bayFailed", INK, "D5 bay with the magnetic brake failed")]:
        v, g = zip(*c[key])
        b.plot(v, g, color=col, lw=1.3, label=lab)
    b.axvspan(21, 28, color="#eef1f4", lw=0, zorder=0)
    b.text(24.5, 4.6, "arrival speeds\nin design wind", fontsize=5.8, color=GRAPHITE, ha="center", va="top")
    b.set_xlabel("Arrival speed at the end of the wire (m/s)")
    b.set_ylabel("Peak stopping deceleration (g)")
    b.set_ylim(0, 5)
    b.set_xlim(0, 30)
    b.set_title("(b) Stopping a full 700 kg pod, with and without its brake", loc="left")
    b.legend(loc="upper left", fontsize=6.0)
    fig.tight_layout(w_pad=2.0)
    save(fig, "fig5_topology")


# ---------------------------------------------------------------------------
# Fig 6: final design — timeline, Monte Carlo, sensitivity
# ---------------------------------------------------------------------------
def fig_final():
    F = R["final"]
    fig = plt.figure(figsize=(FULL, 2.05))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.2, 1, 0.8], wspace=0.55)
    a, b, c = fig.add_subplot(gs[0]), fig.add_subplot(gs[1]), fig.add_subplot(gs[2])

    # (a) timeline
    a.grid(axis="y", visible=False)
    segs = [("first arrival", "ready", RULE, "arrive + board"), ("ready", "depart", MARGINAL, "headway hold"),
            ("depart", "arrive", STEEL, "ride"), ("arrive", "unloaded", GRAPHITE, "unload"), ("unloaded", "safe", SAFE, "to bunker")]
    pods = F["pods"]
    for i, p in enumerate(pods):
        y = len(pods) - 1 - i
        vals = {"first arrival": p["firstArrival"], **p}
        for s0, s1, col, lab in segs:
            x0, x1 = vals[s0], vals[s1]
            if x1 - x0 > 0.05:
                a.barh(y, x1 - x0, left=x0, height=0.55, color=col, label=lab if i == 0 or (lab == "headway hold") else None)
    a.axvline(F["warn"], color=HAZARD, ls="--", lw=0.9)
    a.text(F["warn"] + 1, len(pods) - 0.55, f"level-4 window {F['warn']:.0f} s", color=HAZARD, fontsize=6.3)
    a.set_yticks(range(len(pods)), [f"pod {p['id'] + 1} (wire {p['wire'] + 1}, {p['n']} ppl)" for p in pods][::-1])
    a.set_xlabel("Seconds after the alarm")
    a.set_xlim(0, 175)
    a.set_ylim(-0.6, len(pods) + 0.1)
    h, l = a.get_legend_handles_labels()
    seen = {}
    for hh, ll in zip(h, l):
        seen.setdefault(ll, hh)
    a.legend(seen.values(), seen.keys(), loc="upper left", bbox_to_anchor=(0.0, -0.22), ncol=3, fontsize=6.0, handlelength=1.2, columnspacing=0.8)
    a.set_title("(a) Deterministic timeline", loc="left")

    # (b) Monte Carlo
    t = np.array([x for x in F["mc"]["times"] if x is not None])
    b.hist(t, bins=40, color=STEEL, edgecolor="white", linewidth=0.3)
    top = b.get_ylim()[1]
    b.set_ylim(0, top * 1.25)
    for v, col, lab, ha, yf in [(F["warn"], HAZARD, "window", "right", 1.15), (F["mc"]["p50"], INK, "P50", "left", 1.03), (F["mc"]["p95"], INK, "P95", "left", 1.15)]:
        b.axvline(v, color=col, ls="--" if lab != "P50" else ":", lw=0.9)
        b.text(v + (1.5 if ha == "left" else -1.5), top * yf, f"{lab} {v:.0f} s", fontsize=6.2, color=col, ha=ha)
    b.set_xlabel("Time until everyone is safe (s)")
    b.set_ylabel("Runs (of 2000)")
    b.set_title("(b) Monte Carlo spread", loc="left")

    # (c) tornado
    rows = [r for r in F["sens"]["rows"] if r["lo"] is not None and r["hi"] is not None][:7][::-1]
    yy = np.arange(len(rows))
    c.barh(yy, [r["lo"] for r in rows], color=STEEL, height=0.6, label="input −20%")
    c.barh(yy, [r["hi"] for r in rows], color=HAZARD, height=0.6, label="input +20%")
    c.axvline(0, color=INK, lw=0.6)
    short = {"Capsule hatch / unstrap time": "capsule exit", "Launch height": "launch height", "Reaction time": "reaction",
             "Boarding time per person": "boarding", "Walk to platform": "walk to pods", "Unload at terminus": "unload",
             "Single-file spacing": "file spacing", "Person mass": "person mass", "Cable tension": "cable tension"}
    c.set_yticks(yy, [short.get(r["label"], r["label"]) for r in rows])
    c.set_xlabel("Change in total time (s)")
    c.grid(axis="y", visible=False)
    c.legend(loc="upper left", bbox_to_anchor=(-0.1, -0.22), ncol=2, fontsize=6.0, handlelength=1.2)
    c.set_title("(c) Sensitivity", loc="left")
    save(fig, "fig6_final")


# ---------------------------------------------------------------------------
# Fig 7: D5 receiving end (plan view schematic, not to scale)
# ---------------------------------------------------------------------------
def fig_switchyard():
    fig, ax = plt.subplots(figsize=(COL, 1.85))
    ax.set_axis_off()
    ax.set_xlim(0, 100)
    ax.set_ylim(-4, 44)
    # wire from the tower
    ax.plot([0, 24], [20, 20], color=STEEL, lw=1.6)
    ax.text(1, 22.3, "wire", fontsize=6.2, color=STEEL)
    ax.plot([9, 9], [17.5, 22], color=INK, lw=1.2)
    ax.text(9, 14.2, "block\nmarker", fontsize=5.6, color=INK, ha="center", va="top")
    ax.plot([24], [20], marker="o", ms=3.5, color=INK)
    ax.annotate("rope-to-rail handover", (24, 20), (13, 30), fontsize=5.6, color=INK, ha="center", arrowprops=dict(arrowstyle="-", lw=0.5, color=INK))
    # points and bays
    ys = [34, 20, 6]
    ax.plot([24, 31], [20, 20], color=GRAPHITE, lw=1.4)
    for y in ys:
        ax.plot([31, 38], [20, y], color=GRAPHITE, lw=1.4)
        ax.plot([38, 90], [y, y], color=GRAPHITE, lw=1.4)
        ax.add_patch(Rectangle((40, y - 1.6), 22, 3.2, fc=STEEL_SOFT, ec=STEEL, lw=0.6, hatch="////"))
        ax.add_patch(Rectangle((63, y - 1.6), 21, 3.2, fc="#efe6d6", ec=GRAPHITE, lw=0.6))
        ax.plot([86, 86], [y - 2.4, y + 2.4], color=HAZARD, lw=1.6)
    ax.add_patch(plt.Circle((31, 20), 1.6, fc="white", ec=INK, lw=0.8))
    ax.annotate("self-indexing\npoints", (31, 18.4), (27, 8), fontsize=5.6, color=INK, ha="right", va="top", arrowprops=dict(arrowstyle="-", lw=0.5, color=INK))
    ax.text(51, 37.8, "magnetic brake", fontsize=5.6, color=STEEL, ha="center")
    ax.text(73.5, 37.8, "chain bed", fontsize=5.6, color=GRAPHITE, ha="center")
    ax.text(86, 39.5, "net", fontsize=5.6, color=HAZARD, ha="center")
    for i, y in enumerate(ys):
        ax.text(39, y - 4.2, f"bay {i + 1}", fontsize=5.6, color=GRAPHITE)
    # bunker
    ax.add_patch(Rectangle((92, 2), 7, 36, fc=RULE, ec=GRAPHITE, lw=0.7))
    ax.text(95.5, 20, "bunker", fontsize=6.2, color=INK, ha="center", va="center", rotation=90)
    for y in ys:
        ax.annotate("", (92, y), (88, y), arrowprops=dict(arrowstyle="->", lw=0.6, color=SAFE))
    ax.text(0, -3, "not to scale; each pod is sent to the next bay as it passes", fontsize=5.6, color=GRAPHITE)
    save(fig, "fig7_switchyard")


if __name__ == "__main__":
    fig_geometry()
    fig_hazard()
    fig_validation()
    fig_feasibility()
    fig_topology()
    fig_final()
    fig_switchyard()
