"""PLE-SBS 1:50 scale-model rig: printable parts.

Builds every 3D-printed part as a watertight solid (manifold3d), writes STL files to
cad/stl/ and a preview sheet to cad/parts_preview.png.

Run:  .venv/bin/python cad/make_parts.py

All dimensions in millimetres. Change the parameters below and re-run to resize.
Designed around: 1.5 mm stainless wire rope (7x7), 624ZZ bearings (4 x 13 x 5 mm),
M4 and M3 screws, 20 x 10 x 5 mm N42 magnets, 2 mm aluminium (or copper) fin.
"""
from pathlib import Path

import numpy as np
import trimesh
from manifold3d import CrossSection, Manifold

OUT = Path(__file__).resolve().parent / "stl"
OUT.mkdir(exist_ok=True)
SEG = 96  # circle smoothness

# ---- parameters ----------------------------------------------------------------
WIRE_D = 1.5            # wire rope diameter
BRG_OD, BRG_W = 13.0, 5.0
FIT = 0.15              # press-fit allowance for the bearing pocket (tune for your printer)
M4, M3 = 4.3, 3.3       # clearance holes
WHEEL_OD, WHEEL_W = 28.0, 9.0
GROOVE_R = 11.0         # radius at the bottom of the rope groove
AXLE_PITCH = 40.0       # distance between the two wheel axles
PLATE_T = 4.0
GAP = WHEEL_W + 2.0     # inside gap between trolley plates (wheel + two 1 mm washers)
BASKET = (110.0, 75.0, 60.0)   # length along wire, width, height
WALL, FLOOR = 2.5, 3.0
FIN_T = 2.0             # aluminium/copper fin thickness
MAG = (20.0, 10.0, 5.0)        # magnet length (along wire), height, thickness
MAG_GAP = 6.0           # face-to-face gap between the two magnet rows (fin 2 mm + 2 mm each side)
CHANNEL_L = 150.0


def cyl(h, d, center=False):
    return Manifold.cylinder(h, d / 2, d / 2, SEG, center)


def box(x, y, z, center=False):
    return Manifold.cube([x, y, z], center)


def save(part, name):
    mesh = part.to_mesh()
    tm = trimesh.Trimesh(vertices=np.asarray(mesh.vert_properties)[:, :3], faces=np.asarray(mesh.tri_verts), process=True)
    assert tm.is_watertight, name
    tm.export(OUT / f"{name}.stl")
    vol_cm3 = part.volume() / 1000
    print(f"{name:24s} {vol_cm3:7.1f} cm³ solid  ≈ {vol_cm3 * 1.27 * 0.55:5.0f} g printed (PETG, ~40 % infill)  "
          f"bbox {np.round(tm.extents, 1)}")
    return tm


# ---- 1. V-groove wheel (rides ON the wire; a 624ZZ bearing presses in) -------------
def wheel():
    r_out = WHEEL_OD / 2
    w = WHEEL_W
    gr = GROOVE_R
    gw = WIRE_D + 0.6  # flat at the groove bottom
    r_in = BRG_OD / 2 - 1.0  # 1 mm lip that the bearing seats against
    # half profile in (r, z), revolved: flanges, V flanks, flat groove floor for the rope
    prof = [(r_in, 0), (r_out, 0), (r_out, 1.2), (gr, w / 2 - gw / 2),
            (gr, w / 2 + gw / 2), (r_out, w - 1.2), (r_out, w), (r_in, w)]
    body = CrossSection([prof]).revolve(SEG)
    # bearing pocket open at the top face; the bearing (5 mm) sits on a 2 mm lip so it
    # is centred under the groove
    lip = (w - BRG_W) / 2
    return body - cyl(w, BRG_OD + FIT).translate([0, 0, lip])


# ---- 2. Trolley side plate (two per trolley, identical) ----------------------------
AXLE_Y = 34.0
WIRE_Y = AXLE_Y - GROOVE_R - WIRE_D / 2  # wire centreline in plate coordinates
KEEPER_Y = WIRE_Y - WIRE_D / 2 - 0.8 - 3.0  # keeper sleeve (OD 6) sits 0.8 mm under the wire
HANG_Y = 6.0
EYE_Y = AXLE_Y + 9.0  # release eye between the wheels, above the wire


def trolley_plate():
    L, H = AXLE_PITCH + WHEEL_OD + 4, AXLE_Y + WHEEL_OD / 2 + 2
    outline = CrossSection.square([L, H]).translate([-L / 2, 0]).offset(-3).offset(3)  # rounded corners
    p = outline.extrude(PLATE_T)
    for x, y, d in [(-AXLE_PITCH / 2, AXLE_Y, M4), (AXLE_PITCH / 2, AXLE_Y, M4), (0, HANG_Y, M4),
                    (-12, KEEPER_Y, M3), (12, KEEPER_Y, M3), (0, EYE_Y, M3)]:
        p -= cyl(PLATE_T + 2, d).translate([x, y, -1])
    return p


# ---- 3. Keeper sleeve: under the wire between the plates, stops derailment ---------
def keeper_sleeve():
    return cyl(GAP, 6.0) - cyl(GAP + 2, M3).translate([0, 0, -1])


# ---- 4. Hanger: joins the basket to the trolley's bottom M4 pin ---------------------
# Printed flat; profile (x along the wire, z up) extruded GAP thick so it fills the
# space between the trolley plates.
def hanger():
    L = BASKET[0] - 2 * WALL - 0.6   # sits inside the end walls
    bar = CrossSection.square([L, 6]).translate([-L / 2, 0])
    tab = CrossSection.square([16, 22]).translate([-8, 0])
    lugs = CrossSection.square([6, 14]).translate([-L / 2, -14]) + CrossSection.square([6, 14]).translate([L / 2 - 6, -14])
    prof = (bar + tab + lugs)
    h = prof.extrude(GAP)  # extrusion along +z here = across the wire (y) in use
    h -= cyl(GAP + 2, M4).translate([0, 16, -1])           # pin to the trolley
    for x in (-L / 2 + 3, L / 2 - 3):                       # M3 bolts through the end walls
        h -= cyl(20, M3).rotate([0, 90, 0]).translate([x - 10, -8, GAP / 2])
    return h


# ---- 5. Basket (open-sided pod, holds the ballast) ---------------------------------
def basket():
    X, Y, Z = BASKET
    b = box(X, Y, Z) - box(X - 2 * WALL, Y - 2 * WALL, Z).translate([WALL, WALL, FLOOR])
    # open sides like the full-size pod: two windows in each long wall
    for x0 in (12.0, X / 2 + 4):
        b -= box(X / 2 - 16, Y + 2, 26).translate([x0, -1, Z - 32])
    # hanger bolt holes through the end walls
    for x in (-1, X - WALL - 1):
        b -= cyl(WALL + 2, M3).rotate([0, 90, 0]).translate([x, Y / 2, Z - 8])  # matches the hanger lug holes
    # floor holes for the fin clamp (two M3, 66 mm apart)
    for x in (X / 2 - 33, X / 2 + 33):
        b -= cyl(FLOOR + 2, M3).translate([x, Y / 2, -1])
    # ballast tie-down slots
    for x in (20, X - 20):
        b -= box(4, 12, FLOOR + 2).translate([x - 2, 6, -1])
        b -= box(4, 12, FLOOR + 2).translate([x - 2, Y - 18, -1])
    return b


# ---- 6. Fin clamp: bolts under the basket floor, holds the brake fin ---------------
def fin_clamp():
    # 80 mm block; the fin slot (52 mm long, open at the bottom) sits between the two
    # floor bolts so the bolts never cross the fin
    c = box(80, 12, 12)
    c -= box(52, FIN_T + 0.3, 9).translate([14, 6 - (FIN_T + 0.3) / 2, -1])
    for x in (7, 73):
        c -= cyl(14, M3).translate([x, 6, -1])                                 # to the basket floor
    c -= cyl(14, M3).rotate([90, 0, 0]).translate([40, 13, 4])                 # cross bolt through the fin
    return c


# ---- 7. Magnet channel segment (eddy-current brake demo) ---------------------------
def magnet_channel():
    ml, mh, mt = MAG
    wall = mt + 3.0
    base_t = 5.0
    W = MAG_GAP + 2 * wall
    H = base_t + mh + 4.0
    c = box(CHANNEL_L, W + 24, base_t) + box(CHANNEL_L, wall, H).translate([0, 12, 0]) + box(CHANNEL_L, wall, H).translate([0, 12 + wall + MAG_GAP, 0])
    n = int(CHANNEL_L // (ml + 1.4))
    pitch = CHANNEL_L / n
    for i in range(n):
        x0 = i * pitch + (pitch - ml - 0.3) / 2
        # pockets open on the inner faces of both walls
        c -= box(ml + 0.3, mt + 0.2, mh + 0.3).translate([x0, 12 + wall - mt - 0.2, base_t + 2])
        c -= box(ml + 0.3, mt + 0.2, mh + 0.3).translate([x0, 12 + wall + MAG_GAP, base_t + 2])
    for x in (12, CHANNEL_L - 12):
        for y in (6, W + 18):
            c -= cyl(base_t + 2, M4).translate([x, y, -1])
    return c, n


# ---- 8. Start gate: holds the trolley at the top until the pin is pulled -----------
def start_gate():
    # base screws to the top anchor board; the upright stands beside the trolley and the
    # pull-pin passes through it into the trolley's release eye. Shim the base so the
    # pin lines up with the eye.
    up_h = 60.0
    g = box(40, 30, 6) + box(14, 8, up_h).translate([13, 22, 0])
    g -= cyl(12, M3 + 0.2).rotate([90, 0, 0]).translate([20, 34, up_h - 8])
    for x in (7, 33):
        g -= cyl(8, M4).translate([x, 9, -1])
    return g


def start_pin():
    shaft = cyl(30, M3 - 0.4)
    ring = (cyl(4, 22) - cyl(6, 14).translate([0, 0, -1])).translate([0, -14, 0])
    stem = box(4, 8, 4).translate([-2, -8, 0])
    return shaft.rotate([90, 0, 0]).translate([0, 30, 2]) + ring + stem


PARTS = []


def main():
    print("part                       volume        mass (approx)              bounding box (mm)")
    PARTS.append(("wheel", save(wheel(), "wheel_x4"), 4))
    PARTS.append(("trolley plate", save(trolley_plate(), "trolley_plate_x4"), 4))
    PARTS.append(("keeper sleeve", save(keeper_sleeve(), "keeper_sleeve_x4"), 4))
    PARTS.append(("hanger", save(hanger(), "hanger_x2"), 2))
    PARTS.append(("basket", save(basket(), "basket_x2"), 2))
    PARTS.append(("fin clamp", save(fin_clamp(), "fin_clamp_x2"), 2))
    ch, n = magnet_channel()
    PARTS.append(("magnet channel", save(ch, "magnet_channel_150mm_x4"), 4))
    print(f"   magnet channel holds {n} magnets per wall, {2 * n} per segment")
    PARTS.append(("start gate", save(start_gate(), "start_gate_x1"), 1))
    PARTS.append(("start pin", save(start_pin(), "start_pin_x2"), 2))
    preview()


def preview():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection

    fig = plt.figure(figsize=(12, 6.5))
    for i, (name, tm, qty) in enumerate(PARTS):
        ax = fig.add_subplot(2, 5, i + 1, projection="3d")
        v = tm.vertices - tm.bounds.mean(axis=0)
        tris = v[tm.faces]
        shade = np.clip(0.35 + 0.65 * np.abs(tm.face_normals @ np.array([0.4, -0.5, 0.75])), 0, 1)
        col = Poly3DCollection(tris, facecolors=[(0.17 * s + 0.1, 0.39 * s + 0.1, 0.56 * s + 0.1) for s in shade], edgecolor="none")
        ax.add_collection3d(col)
        r = np.abs(v).max()
        ax.set_xlim(-r, r); ax.set_ylim(-r, r); ax.set_zlim(-r, r)
        ax.set_box_aspect([1, 1, 1])
        ax.view_init(24, -58)
        ax.set_axis_off()
        ax.set_title(f"{name} ×{qty}\n{tm.extents[0]:.0f}×{tm.extents[1]:.0f}×{tm.extents[2]:.0f} mm", fontsize=9)
    fig.suptitle("PLE-SBS 1:50 scale-model rig: 3D-printed parts", fontsize=12)
    fig.tight_layout()
    fig.savefig(Path(__file__).resolve().parent / "parts_preview.png", dpi=130)
    print("wrote cad/parts_preview.png")


if __name__ == "__main__":
    main()
