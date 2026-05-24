"""Build drawings for the 1:50 scale-model rig: rig layout and trolley/pod assembly.

Run:  .venv/bin/python cad/make_drawings.py   -> cad/rig_layout.png, cad/trolley_assembly.png
Dimensions match cad/make_parts.py and docs/scale-model-protocol.md.
"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, FancyArrowPatch, Polygon, Rectangle

OUT = Path(__file__).resolve().parent
INK, GRAPHITE, STEEL, HAZARD, SAFE, RULE = "#18283a", "#56636f", "#2c6390", "#e4570e", "#237a3b", "#c8d0d8"
plt.rcParams.update({"font.family": ["Arial", "DejaVu Sans"], "font.size": 8})


def dim(ax, p0, p1, text, off=(0, 0), color=GRAPHITE):
    ax.add_patch(FancyArrowPatch(p0, p1, arrowstyle="<->", mutation_scale=8, lw=0.7, color=color))
    ax.text((p0[0] + p1[0]) / 2 + off[0], (p0[1] + p1[1]) / 2 + off[1], text, color=color, ha="center", va="center", fontsize=7.5,
            bbox=dict(fc="white", ec="none", pad=0.6))


def rig_layout():
    fig, ax = plt.subplots(figsize=(10, 3.6))
    ax.set_aspect(2.2)
    ax.axis("off")
    L, H, sag = 6.0, 0.9, 0.13
    # ground and supports
    ax.plot([-0.5, 6.9], [0, 0], color=GRAPHITE, lw=1)
    ax.add_patch(Rectangle((-0.35, 0), 0.25, H + 0.15, fc=RULE, ec=GRAPHITE, lw=0.8))
    ax.text(-0.22, H + 0.22, "top anchor\n(board + 2 G-clamps)", ha="center", fontsize=7)
    ax.add_patch(Rectangle((L + 0.1, 0), 0.25, 0.25, fc=RULE, ec=GRAPHITE, lw=0.8))
    # wire with sag (parabola under a pod at mid-span)
    import numpy as np
    x = np.linspace(0, L, 200)
    y = H - H * x / L - 4 * sag * (x / L) * (1 - x / L)
    ax.plot(x, y, color=STEEL, lw=1.6)
    ax.text(2.2, 0.62, "1.5 mm stainless wire rope, 7×7", color=STEEL, fontsize=7.5)
    # pulley + counterweight at the low end
    ax.add_patch(Circle((L + 0.22, 0.26), 0.06, fc="white", ec=INK, lw=1))
    ax.plot([L + 0.28, L + 0.28], [0.26, -0.25], color=STEEL, lw=1.2)
    ax.add_patch(Rectangle((L + 0.18, -0.45), 0.2, 0.2, fc=GRAPHITE, ec=INK))
    ax.text(L + 0.45, -0.36, "counterweight\n16 kg (1.5 kg pod)\n30 kg (3 kg pod)", fontsize=7, va="center")
    # start gate, trolley, magnets, foam
    ax.add_patch(Rectangle((0.05, H - 0.02), 0.12, 0.08, fc=HAZARD, ec=INK, lw=0.6))
    ax.text(0.28, H + 0.05, "start gate + pull-pin (lever release)", fontsize=7, color=HAZARD)
    xb0, xb1 = L - 0.12 - 0.6, L - 0.12
    ax.add_patch(Rectangle((xb0, 0.03), xb1 - xb0, 0.05, fc="#d6e3ee", ec=STEEL, lw=0.8))
    ax.text((xb0 + xb1) / 2, 0.14, "magnet channel\n4 × 150 mm (optional)", ha="center", fontsize=7, color=STEEL)
    ax.add_patch(Rectangle((L - 0.1, 0.0), 0.12, 0.12, fc="#f6e2b8", ec=GRAPHITE, lw=0.6))
    ax.text(L - 0.05, -0.08, "foam stop", ha="center", fontsize=7)
    for m in np.arange(0.5, L, 0.5):
        ax.plot([m, m], [-0.03, 0.0], color=INK, lw=0.8)
    ax.text(3.0, -0.12, "tape marks on the floor (or a wall behind) every 0.5 m, never on the wire", ha="center", fontsize=7)
    dim(ax, (0, -0.28), (L, -0.28), "6.00 m horizontal (1:50 of 300 m)")
    dim(ax, (-0.55, 0), (-0.55, H), "0.90 m\ndrop", off=(-0.18, 0))
    dim(ax, (L / 2, H - H / 2 - sag), (L / 2, H - H / 2), "", color=STEEL)
    ax.text(L / 2 + 0.08, H / 2 - sag / 2 - 0.02, "sag 12–14 cm\nwith the pod here", fontsize=7, color=STEEL)
    ax.set_xlim(-1.0, 7.6)
    ax.set_ylim(-0.6, 1.25)
    ax.set_title("PLE-SBS 1:50 scale-model rig (side view, heights exaggerated ×2.2). Also test drops of 0.60 m and 1.20 m.", fontsize=9, loc="left")
    fig.savefig(OUT / "rig_layout.png", dpi=170, bbox_inches="tight")
    plt.close(fig)


def trolley_assembly():
    fig, (a, b) = plt.subplots(1, 2, figsize=(10, 4.6), gridspec_kw={"width_ratios": [1.35, 1]})
    for ax in (a, b):
        ax.set_aspect("equal")
        ax.axis("off")
    # --- (a) side view: plate outline, wheels on top of the wire, keeper under it, basket below
    AX_Y, PITCH, R = 34.0, 40.0, 14.0
    wire_y = AX_Y - 11.0 - 0.75
    a.add_patch(Rectangle((-36, 0), 72, 50, fc="#eef1f4", ec=GRAPHITE, lw=0.8))
    a.plot([-70, 70], [wire_y, wire_y], color=STEEL, lw=2)
    a.text(48, wire_y + 2, "wire", color=STEEL)
    for x in (-PITCH / 2, PITCH / 2):
        a.add_patch(Circle((x, AX_Y), R, fc="white", ec=INK, lw=1))
        a.add_patch(Circle((x, AX_Y), 6.5, fc="#dfe5ea", ec=INK, lw=0.6))
        a.add_patch(Circle((x, AX_Y), 2.0, fc=INK))
    a.text(-PITCH / 2, AX_Y + R + 3, "wheel + 624ZZ\nM4×25 axle", ha="center", fontsize=7)
    for x in (-12, 12):
        a.add_patch(Circle((x, wire_y - 0.75 - 0.8 - 3), 3, fc=HAZARD, ec=INK, lw=0.5))
    a.text(-74, wire_y - 12, "keeper sleeves (M3)\nstop derailment", ha="left", fontsize=7, color=HAZARD)
    a.add_patch(Circle((0, AX_Y + 9), 1.6, fc="white", ec=INK))
    a.text(4, AX_Y + 11, "release eye\n(start-gate pin)", fontsize=7)
    a.add_patch(Circle((0, 6), 2.0, fc=INK))
    a.add_patch(Rectangle((-8, -16), 16, 22, fc="#d6e3ee", ec=STEEL, lw=0.8))
    a.add_patch(Rectangle((-52, -22), 104, 6, fc="#d6e3ee", ec=STEEL, lw=0.8))
    a.text(10, -8, "hanger (M4 pin)", fontsize=7, color=STEEL)
    a.add_patch(Rectangle((-55, -82), 110, 60, fc="none", ec=INK, lw=1))
    a.add_patch(Rectangle((-43, -76), 39, 26, fc="white", ec=GRAPHITE, lw=0.6))
    a.add_patch(Rectangle((4, -76), 39, 26, fc="white", ec=GRAPHITE, lw=0.6))
    a.text(0, -64, "basket 110×75×60\n(ballast inside)", ha="center", fontsize=7)
    a.add_patch(Rectangle((-40, -94), 80, 12, fc="#eef1f4", ec=GRAPHITE, lw=0.8))
    a.add_patch(Rectangle((-26, -115), 52, 30, fc="#c9a46b", ec=INK, lw=0.6, alpha=0.8))
    a.text(30, -108, "2 mm Al (or Cu) brake fin\nin fin clamp", fontsize=7)
    a.set_xlim(-75, 80)
    a.set_ylim(-125, 62)
    a.set_title("(a) Side view of one pod (mm)", loc="left", fontsize=9)
    # --- (b) end view across the wire: plates, wheel, washers, M4 axle
    b.add_patch(Rectangle((-9.5, 0), 4, 50, fc="#eef1f4", ec=GRAPHITE))
    b.add_patch(Rectangle((5.5, 0), 4, 50, fc="#eef1f4", ec=GRAPHITE))
    b.add_patch(Rectangle((-4.5, AX_Y - R), 9, 2 * R, fc="white", ec=INK))
    b.add_patch(Rectangle((-2.5, AX_Y - 6.5), 5, 13, fc="#dfe5ea", ec=INK, lw=0.6))
    b.add_patch(Rectangle((-5.5, AX_Y - 4), 1, 8, fc=GRAPHITE))
    b.add_patch(Rectangle((4.5, AX_Y - 4), 1, 8, fc=GRAPHITE))
    b.plot([-13, 14], [AX_Y, AX_Y], color=INK, lw=1.5)
    b.add_patch(Circle((0, wire_y), 0.75, fc=STEEL))
    b.add_patch(Rectangle((-5.5, wire_y - 0.75 - 0.8 - 6), 11, 6, fc=HAZARD, ec=INK, lw=0.5))
    b.add_patch(Rectangle((-5.5, -16), 11, 22, fc="#d6e3ee", ec=STEEL))
    b.text(15, AX_Y, "M4×25 bolt, washer, nyloc", fontsize=7, va="center")
    b.text(15, wire_y, "wire runs in the groove", fontsize=7, va="center", color=STEEL)
    b.text(15, wire_y - 5, "keeper sleeve, 0.8 mm below", fontsize=7, va="center", color=HAZARD)
    b.text(15, -6, "hanger fills the 11 mm gap", fontsize=7, va="center", color=STEEL)
    dim(b, (-9.5, 56), (9.5, 56), "19 mm")
    b.set_xlim(-16, 52)
    b.set_ylim(-22, 62)
    b.set_title("(b) End view across the wire", loc="left", fontsize=9)
    fig.tight_layout()
    fig.savefig(OUT / "trolley_assembly.png", dpi=170, bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    rig_layout()
    trolley_assembly()
    print("wrote cad/rig_layout.png, cad/trolley_assembly.png")
