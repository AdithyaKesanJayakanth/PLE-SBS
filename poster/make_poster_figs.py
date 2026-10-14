"""Poster-only figure panels, drawn from data/results.json with the paper's palette.

Run:  .venv/bin/python poster/make_poster_figs.py
Writes poster/img/*.png (the paper's figures are used unchanged from figures/).
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
R = json.loads((ROOT / "data" / "results.json").read_text())
OUT = ROOT / "poster" / "img"
OUT.mkdir(exist_ok=True)

INK, GRAPHITE, STEEL, HAZARD = "#18283a", "#56636f", "#2c6390", "#e4570e"
plt.rcParams.update({
    "font.family": ["Arial", "Helvetica", "DejaVu Sans"], "font.size": 7.5, "axes.titlesize": 8,
    "axes.labelsize": 7.5, "axes.edgecolor": GRAPHITE, "axes.linewidth": 0.6, "axes.labelcolor": INK,
    "xtick.color": GRAPHITE, "ytick.color": GRAPHITE, "axes.grid": True, "grid.color": "#e3e8ed",
    "grid.linewidth": 0.5, "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False,
    "legend.fontsize": 7, "savefig.dpi": 300, "savefig.bbox": "tight", "savefig.pad_inches": 0.02,
})

F = R["final"]

# Monte Carlo spread and sensitivity (panels b and c of the paper's Fig. 6, without panel a)
fig = plt.figure(figsize=(4.6, 2.0))
gs = fig.add_gridspec(1, 2, width_ratios=[1.1, 0.9], wspace=0.6)
b, c = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])
t = np.array([x for x in F["mc"]["times"] if x is not None])
b.hist(t, bins=40, color=STEEL, edgecolor="white", linewidth=0.3)
top = b.get_ylim()[1]
b.set_ylim(0, top * 1.25)
for v, col, lab, ha, yf in [(F["warn"], HAZARD, "window", "right", 1.15), (F["mc"]["p50"], INK, "P50", "left", 1.03), (F["mc"]["p95"], INK, "P95", "left", 1.15)]:
    b.axvline(v, color=col, ls="--" if lab != "P50" else ":", lw=0.9)
    b.text(v + (1.5 if ha == "left" else -1.5), top * yf, f"{lab} {v:.0f} s", fontsize=6.2, color=col, ha=ha)
b.set_xlabel("Time until everyone is safe (s)")
b.set_ylabel("Runs (of 2000)")
b.set_title("(a) Monte Carlo spread, design D4", loc="left")

rows = [r for r in F["sens"]["rows"] if r["lo"] is not None and r["hi"] is not None][:7][::-1]
yy = np.arange(len(rows))
c.barh(yy, [r["lo"] for r in rows], color=STEEL, height=0.6, label="input −20%")
c.barh(yy, [r["hi"] for r in rows], color=HAZARD, height=0.6, label="input +20%")
c.axvline(0, color=INK, lw=0.6)
short = {"Capsule hatch / unstrap time": "capsule exit", "Launch height": "launch height", "Reaction time": "reaction",
         "Boarding time per person": "boarding", "Walk to platform": "walk to pods", "Unload at terminus": "unload",
         "Single-file spacing": "file spacing"}
c.set_yticks(yy, [short.get(r["label"], r["label"]) for r in rows])
c.set_xlabel("Change in total time (s)")
c.grid(axis="y", visible=False)
c.legend(loc="upper left", bbox_to_anchor=(-0.1, -0.22), ncol=2, fontsize=6.0, handlelength=1.2)
c.set_title("(b) Sensitivity", loc="left")
fig.savefig(OUT / "mc_sensitivity.png")

print("poster/img written")

# The rig drawing with its white margins trimmed
from PIL import ImageChops
rig = Image.open(ROOT / "cad" / "rig_layout.png").convert("RGB")
bg = Image.new("RGB", rig.size, (255, 255, 255))
box = ImageChops.difference(rig, bg).getbbox()
pad = 12
rig.crop((max(box[0] - pad, 0), max(box[1] - pad, 0), min(box[2] + pad, rig.width), min(box[3] + pad, rig.height))).save(OUT / "rig_layout_tight.png")
print("rig_layout_tight written")
