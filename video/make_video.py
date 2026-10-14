"""PLE-SBS in one minute: Adithya tells the story of the project, from the roller-coaster
paper and a visit to ISRO to the switch yard, over the simulator and the paper's figures.

Run (macOS; needs Google Chrome, ffmpeg and the `say` command):
    .venv/bin/python video/make_video.py            # writes video/PLESBS_60s.mp4 and video/script.md
    .venv/bin/python video/make_video.py --quick    # 10 fps preview, same timing

Pipeline: the narration in LINES is spoken by ElevenLabs (voice "Eric", a calm American
male, at speed 1.2; set ELEVENLABS_API_KEY, optionally ELEVENLABS_VOICE_ID and ELEVENLABS_SPEED; clips are
cached in video/.tts-cache so a rebuild does not re-bill) and timed, so every scene follows the
voice; without a key it falls back to the macOS "Eddy" voice; the simulator (web/index.html, dark theme, design D5)
is driven frame by frame through its scrub slider in headless Chrome; the switch-yard scene is
drawn here from the pod trajectories that sim/core.js returns; the paper's figures are shown
as cards; frames are composed with Pillow and encoded with ffmpeg.
"""
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "video"
FIG = ROOT / "figures"
QUICK = "--quick" in sys.argv
FPS = 10 if QUICK else 30
W, H = 1920, 1080
WORK = Path(tempfile.mkdtemp(prefix="plesbs-video-"))

# Palette: the simulator's dark theme
BG, SHEET, INK, GRAPHITE, RULE = "#131a22", "#18212b", "#e3e9ef", "#9aa7b3", "#34414e"
STEEL, HAZARD, SAFE, UNSAFE, SAND = "#7fb2dc", "#ff7a33", "#5cc27a", "#ff6b6b", "#8a7a5a"
BG_RGB = (0x13, 0x1a, 0x22)

AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
def font(size, face="regular"):
    idx = {"bold": 0, "demi": 2, "medium": 5, "regular": 7, "light": 10}[face]
    return ImageFont.truetype(AVENIR, size, index=idx)

# ---------------------------------------------------------------------------
# 1. Narration (first person), one clip per line
# ---------------------------------------------------------------------------
LINES = [
    ("coaster", "Last year I designed roller-coaster tracks around the limits of the human body. The thrill and the limit turned out to be the same number."),
    ("isro", "Then a visit to ISRO raised a different question. A crew works a hundred metres up a tower, beside a fuelled rocket. If the alarm sounds, how do they get down?"),
    ("nasa", "NASA's slidewire baskets are each built for one pad. I wanted a method for any rocket, on any tower."),
    ("model", "So I turned propellant into TNT equivalent to size the safe distance, modelled the sagging wire, and built a simulator. Untuned, it matched the Shuttle basket's speed within three percent."),
    ("broke", "Then I ran it until it broke. Copying Artemis onto a low pad failed ninety-three percent of runs. Geometry fixed it, and gave a sizing rule for any pad."),
    ("yard", "My add-on is a switch yard. Self-indexing points send each pod, from one shared wire, into its own braked bay. Eight seconds between pods, one point four g with a failed brake, and no power."),
    ("learned", "What I learned: design a safety system at its corners. Once the hardware works, the seconds left are human. I'm Adithya, and this is PLE-SBS."),
]
VOICE, RATE = "Eddy (English (US))", "240"        # macOS fallback only
EL_KEY = os.environ.get("ELEVENLABS_API_KEY")
EL_VOICE = os.environ.get("ELEVENLABS_VOICE_ID", "cjVigY5qzO86Huf0OWal")   # Eric: American male, calm and composed
EL_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
EL_SPEED = float(os.environ.get("ELEVENLABS_SPEED", "1.2"))   # fast but clear
CACHE = OUT / ".tts-cache"
GAP, LEAD, TAIL = 0.2, 1.0, 0.6

EL_NAMES = {"cjVigY5qzO86Huf0OWal": "Eric (calm, composed American male)", "bIHbv24MWmeRgasZH58o": "Will (young American male)", "iP95p4xoKVk53GoZ742B": "Chris (American male)"}

def narrator():
    return f"ElevenLabs \"{EL_NAMES.get(EL_VOICE, EL_VOICE)}\", {EL_MODEL}, speed {EL_SPEED}" if EL_KEY else f"macOS \"{VOICE.split(' (')[0]}\" at {RATE} wpm"

def tts(key, line):
    """One narration clip, from ElevenLabs when a key is set (cached), else from `say`."""
    if EL_KEY:
        CACHE.mkdir(exist_ok=True)
        h = hashlib.sha1(f"{EL_VOICE}|{EL_MODEL}|{EL_SPEED}|{line}".encode()).hexdigest()[:16]
        f = CACHE / f"{key}-{h}.mp3"
        if not f.exists():
            body = json.dumps({"text": line, "model_id": EL_MODEL,
                               "voice_settings": {"stability": 0.6, "similarity_boost": 0.75, "style": 0.15, "use_speaker_boost": True, "speed": EL_SPEED}}).encode()
            req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{EL_VOICE}?output_format=mp3_44100_128",
                                         data=body, headers={"xi-api-key": EL_KEY, "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req) as r:
                    f.write_bytes(r.read())
            except urllib.error.HTTPError as e:
                sys.exit(f"ElevenLabs refused line '{key}': HTTP {e.code} {e.read().decode()[:300]}")
        return f
    f = WORK / f"{key}.aiff"
    subprocess.run(["say", "-v", VOICE, "-r", RATE, "-o", str(f), line], check=True)
    return f

def make_voice():
    dur, start, clips, t = {}, {}, {}, LEAD
    for key, line in LINES:
        f = tts(key, line)
        clips[key] = f
        dur[key] = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)]))
        start[key] = t
        t += dur[key] + GAP
    return dur, start, t - GAP + TAIL, clips

# ---------------------------------------------------------------------------
# 2. Simulator captures (design D5; capsule exit set to zero so the three pods follow
#    each other down the wire about 9 s apart)
# ---------------------------------------------------------------------------
CFG = dict(wires=1, podsPerWire=3, terminal="switchyard", bays=3, arrester="chain", dispatch="block",
           failSafeHeadway="true", bayWalk=15, tWalk=8, tBoard=3, tUnload=8, brakeCondition="ok", tHatch=0)
HASH = "&".join(f"{k}={v}" for k, v in CFG.items())
URL = f"file://{ROOT / 'web' / 'index.html'}#{HASH}"
CSS = """
.masthead,.controls{display:none!important} .layout{grid-template-columns:0 1fr!important} .stage{padding:0!important}
.drawing{border:0!important;padding:0!important;border-radius:0!important} #elev{width:1100px!important;height:350px!important}
"""
SCALE = 1.6  # 1100x350 CSS px -> 1760x560 px

def capture(elev_times):
    from playwright.sync_api import sync_playwright
    elev = {}
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome", headless=True)
        pg = b.new_page(viewport={"width": 1400, "height": 1200}, device_scale_factor=SCALE)
        pg.goto(URL)
        pg.wait_for_timeout(1500)
        pg.evaluate("() => { document.documentElement.dataset.theme = 'dark'; }")
        pg.add_style_tag(content=CSS)
        pg.wait_for_timeout(300)
        pg.evaluate("() => { if (document.querySelector('#play').textContent === 'Pause') document.querySelector('#play').click(); window.dispatchEvent(new Event('resize')); }")
        pg.wait_for_timeout(500)
        for t in sorted(elev_times):
            pg.evaluate(f"() => {{ const sc = document.querySelector('#scrub'); sc.value = {t}; sc.dispatchEvent(new Event('input')); }}")
            pg.wait_for_timeout(25)
            f = WORK / f"elev_{t:.1f}.png"
            pg.locator("#elev").screenshot(path=str(f))
            elev[t] = f
        traj = pg.evaluate("""(cfgIn) => {
            const S = window.PLESBS;
            const cfg = S.prepare(Object.assign({}, S.DEFAULTS, cfgIn, { failSafeHeadway: true }));
            const r = S.evacuate(cfg);
            return { L: r.wire.L, brakeK: r.brakeK, blockX: r.blockX, tAll: r.tAll,
                     pods: r.pods.map(p => ({ id: p.id, n: p.n, m: p.m, depart: p.depart, arrive: p.arrive, vArr: p.vArr,
                                             stop: p.stop, bay: p.bay, unloaded: p.unloaded, safe: p.safe, traj: p.traj })) };
        }""", CFG)
        b.close()
    return elev, traj

# ---------------------------------------------------------------------------
# 3. Drawing helpers
# ---------------------------------------------------------------------------
def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)

def mixc(hexcol, a):
    """A colour faded towards the background by (1 - a)."""
    a = min(max(a, 0.0), 1.0)
    c = tuple(int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    return tuple(int(v * a + b * (1 - a)) for v, b in zip(c, BG_RGB))

def text(d, xy, s, f, fill=INK, anchor="la"):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)

def caption(img, s, sub=None, y=930):
    d = ImageDraw.Draw(img)
    d.rectangle([80, y - 2, 86, y + 50], fill=STEEL)
    text(d, (104, y - 4), s, font(42, "medium"))
    if sub:
        text(d, (104, y + 48), sub, font(27), GRAPHITE)

def header(img, s, right=None):
    d = ImageDraw.Draw(img)
    text(d, (80, 96), s, font(34, "medium"), GRAPHITE)
    if right:
        text(d, (W - 80, 96), right, font(34, "medium"), GRAPHITE, anchor="ra")

def footnote(img, s):
    ImageDraw.Draw(img).text((80, H - 46), s, font=font(22), fill="#6b7885")

def blank():
    return Image.new("RGB", (W, H), BG)

def card(img, png, box, a=1.0):
    """A paper figure on a white card centred in box=(x0,y0,x1,y1), faded in by a."""
    a = ease(a)
    if a <= 0:
        return img
    x0, y0, x1, y1 = box
    im = Image.open(png).convert("RGB")
    pad = 28
    s = min((x1 - x0 - 2 * pad) / im.width, (y1 - y0 - 2 * pad) / im.height)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    cw, ch = im.width + 2 * pad, im.height + 2 * pad
    cx, cy = (x0 + x1 - cw) // 2, (y0 + y1 - ch) // 2
    layer = img.copy()
    ImageDraw.Draw(layer).rounded_rectangle([cx, cy, cx + cw, cy + ch], radius=14, fill="#fbfcfd")
    layer.paste(im, (cx + pad, cy + pad))
    return Image.blend(img, layer, a) if a < 1 else layer

def hatch(d, box, color, step=12):
    x0, y0, x1, y1 = box
    d.rectangle(box, outline=color, width=2)
    for x in range(int(x0 - (y1 - y0)), int(x1), step):
        pa, pb = (x, y1), (x + (y1 - y0), y0)
        if pa[0] < x0: pa = (x0, y1 - (x0 - pa[0]))
        if pb[0] > x1: pb = (x1, y0 + (pb[0] - x1))
        if pa[0] < pb[0]: d.line([pa, pb], fill=color, width=2)

# ---------------------------------------------------------------------------
# 4. Scenes. Each takes u = seconds since the scene began and d_scene = its length.
# ---------------------------------------------------------------------------
def scene_title(u, d_scene):
    img = blank(); d = ImageDraw.Draw(img)
    a = ease(u / 0.8)
    text(d, (W / 2, 420), "PLE-SBS", font(170, "demi"), mixc(INK, a), anchor="mm")
    d.rectangle([W / 2 - 180 * a, 540, W / 2 + 180 * a, 543], fill=STEEL)
    a2 = ease((u - 0.3) / 0.8)
    text(d, (W / 2, 610), "A way down from a fuelled rocket, told by the student who designed it", font(40), mixc(GRAPHITE, a2), anchor="mm")
    text(d, (W / 2, 670), "Adithya Kesan Jayakanth  ·  Grade 12, Chennai", font(30), mixc(GRAPHITE, a2), anchor="mm")
    return img

# -- the roller-coaster paper: a track, a car, and the rider's g against a limit (schematic)
_XS = np.linspace(0, 1, 900)
_TRACK = (0.55 - 0.42 * np.exp(-((_XS - 0.18) / 0.09) ** 2) - 0.22 * np.exp(-((_XS - 0.55) / 0.07) ** 2)
          - 0.30 * np.exp(-((_XS - 0.82) / 0.06) ** 2) + 0.25 * np.exp(-((_XS - 0.38) / 0.10) ** 2))
_TRACK = _TRACK - _TRACK.min()
def _rider_g():
    y = _TRACK * 60.0
    x = _XS * 400.0
    dy = np.gradient(y, x); ddy = np.gradient(dy, x)
    v2 = 2 * 9.81 * (y.max() + 2 - y)
    kappa = ddy / (1 + dy ** 2) ** 1.5
    return np.cos(np.arctan(dy)) + v2 * kappa / 9.81
_G = _rider_g()

def scene_coaster(u, d_scene):
    img = blank(); d = ImageDraw.Draw(img)
    header(img, "My earlier paper  ·  roller-coaster track design under human g and jerk limits")
    f = ease(u / max(d_scene - 1.0, 1))
    x0, x1, y0, y1 = 120, 1800, 170, 540
    pts = [(x0 + (x1 - x0) * xx, y1 - (y1 - y0) * yy / _TRACK.max()) for xx, yy in zip(_XS, _TRACK)]
    for i in range(0, len(pts), 45):
        d.line([pts[i], (pts[i][0], y1 + 12)], fill=RULE, width=2)
    d.line([(x0, y1 + 12), (x1, y1 + 12)], fill=RULE, width=2)
    d.line(pts, fill=STEEL, width=5)
    i = int(f * (len(pts) - 1))
    cx, cy = pts[i]
    d.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=HAZARD)
    gx0, gx1, gy0, gy1 = 120, 1800, 620, 850
    gmin, gmax = -1.0, 6.0
    gy = lambda g: gy1 - (gy1 - gy0) * (g - gmin) / (gmax - gmin)
    d.line([(gx0, gy(0)), (gx1, gy(0))], fill=RULE, width=2)
    for g, lab in [(1, "1 g"), (4, "limit")]:
        d.line([(gx0, gy(g)), (gx1, gy(g))], fill=UNSAFE if g == 4 else RULE, width=2)
        text(d, (gx0 - 12, gy(g)), lab, font(24), UNSAFE if g == 4 else GRAPHITE, anchor="rm")
    tr = [(gx0 + (gx1 - gx0) * xx, gy(min(max(g, gmin), gmax))) for xx, g in zip(_XS[: i + 1], _G[: i + 1])]
    if len(tr) > 1:
        d.line(tr, fill=HAZARD, width=4)
    text(d, (gx1, gy0 - 10), "what the rider feels", font(26, "medium"), HAZARD, anchor="rs")
    caption(img, "The ride is designed around the forces on the rider",
            "A track is a machine for giving people forces safely: the thrill and the limit are the same number.")
    footnote(img, "Schematic drawn for this video: a track profile and the rider's g from its curvature.")
    return img

def scene_isro(u, d_scene, elev_png):
    img = blank(); d = ImageDraw.Draw(img)
    header(img, "A visit to ISRO  ·  the question", "crews work 40 to 115 m up")
    im = Image.open(elev_png).convert("RGB")
    crop = im.crop((0, 0, int(im.width * 0.38), im.height))
    s = 1.3
    crop = crop.resize((int(crop.width * s), int(crop.height * s)), Image.LANCZOS)
    x, y = 120, 150
    img.paste(crop, (x, y))
    d.rectangle([x, y, x + crop.width, y + crop.height], outline=RULE, width=1)
    ax = x + int(0.30 * crop.width)
    ay0, ay1 = y + int(0.30 * crop.height), y + int(0.78 * crop.height)
    f = ease((u - 1.5) / 2.0)
    if f > 0:
        yy = ay0 + (ay1 - ay0) * f
        d.line([(ax + 60, ay0), (ax + 60, yy)], fill=HAZARD, width=6)
        d.polygon([(ax + 60, yy + 18), (ax + 46, yy - 6), (ax + 74, yy - 6)], fill=HAZARD)
        text(d, (ax + 95, yy - 10), "how do they get down?", font(40, "demi"), mixc(HAZARD, f), anchor="lm")
    rx = 1180
    facts = [("40 to 115 m", "above a fully fuelled rocket"), ("120 s", "the Shuttle-era window to be clear"), ("no power", "it must work when everything else has failed")]
    for i, (big, small) in enumerate(facts):
        a = ease((u - 0.6 - i * 0.9) / 0.6)
        if a <= 0: continue
        yy = 240 + i * 190
        d.rectangle([rx, yy, rx + 6, yy + 120], fill=mixc(STEEL, a))
        text(d, (rx + 28, yy - 8), big, font(78, "demi"), mixc(INK, a))
        text(d, (rx + 28, yy + 84), small, font(28), mixc(GRAPHITE, a))
    caption(img, "Minutes before launch, people are working high on the tower",
            "They need a way down that beats the lifts, works with the power off and keeps working in a storm.")
    footnote(img, "Side view from the simulator, generic 42 m pad. The launcher and pad are generic; no real pad is modelled.")
    return img

def scene_nasa(u, d_scene):
    img = blank()
    header(img, "What exists  ·  NASA's slidewire baskets, Shuttle era and Artemis era", "LC-39B")
    img = card(img, FIG / "fig3_validation.png", (120, 150, 1800, 880), a=u / 0.5)
    caption(img, "Each system was engineered for one pad",
            "Model against the reported basket speeds, with no tuning: the Shuttle peak comes out within 3 %.")
    footnote(img, "Figure 3 of the paper. Shuttle: 24.0 m/s predicted, about 24.6 m/s reported. Artemis: a tall tower needs brakes along the line, and it has them.")
    return img

T_MODEL_SPLIT = 4.6

def scene_model(u, d_scene, elev, sim_t):
    if u < T_MODEL_SPLIT:
        img = blank()
        header(img, "The hazard model  ·  propellant to TNT equivalent to blast and fireball to a safe distance", "any vehicle")
        img = card(img, FIG / "fig2_hazard.png", (120, 150, 1800, 880), a=u / 0.5)
        caption(img, "One rule for any rocket: the propellant load sets the safe distance",
                "Heat sets the distance for every vehicle, and every existing wire ends inside it, so a bunker finishes the job.")
        footnote(img, "Figure 1 of the paper. DoD TNT equivalence for LOX/LH2 and LOX/RP-1; my own assumptions for hypergolic and methane propellants.")
        return img
    img = blank()
    im = Image.open(elev).convert("RGB")
    img.paste(im, (80, 190))
    d = ImageDraw.Draw(img)
    d.rectangle([80, 190, 80 + im.width, 190 + im.height], outline=RULE, width=1)
    header(img, "The simulator  ·  a taut string with every pod's weight on it  ·  16 unit tests, one physics file", f"t = {sim_t:.0f} s after the alarm")
    caption(img, "Every pod's weight changes the slope under every other pod",
            "A passive magnetic brake slows a light pod more than a heavy one, so the brake is sized at two wind corners.")
    footnote(img, "Live from the open model at adithyakesan.com/ple_sbs. Heights exaggerated so the sag is visible.")
    return img

ROWS = [("D0", "Copy Artemis: 400 m, one wire, 3 pods in series", "203 s", "231 s", "93 %", "16.4 g"),
        ("D1", "2 wires × 2 pods, balanced loading", "184 s", "213 s", "91 %", "16.4 g"),
        ("D2", "300 m span into a pit; light brake + catch net", "188 s", "218 s", "0 %", "1.4 g"),
        ("D3", "Bunker 40 m from the dock, not a vehicle", "160 s", "192 s", "0 %", "1.4 g"),
        ("D4", "Crew pod at the arm exit, open pods, faster unload", "129 s", "162 s", "0 %", "1.4 g")]
T_BROKE_SPLIT = 4.8

def scene_broke(u, d_scene):
    if u < T_BROKE_SPLIT:
        img = blank(); d = ImageDraw.Draw(img)
        header(img, "Running it until it broke  ·  nine people, danger level 4, both wind corners, 1,000 Monte Carlo runs")
        cols = [(120, "", "la"), (230, "Change", "la"), (1180, "Time", "ra"), (1380, "P95", "ra"), (1600, "Runs failing", "ra"), (1800, "Worst stop", "ra")]
        for x, lab, an in cols:
            text(d, (x, 200), lab, font(26, "medium"), GRAPHITE, anchor=an)
        d.line([(120, 240), (1800, 240)], fill=RULE, width=2)
        for i, row in enumerate(ROWS):
            a = ease((u - 0.3 - i * 0.75) / 0.4)
            if a <= 0: continue
            y = 290 + i * 100
            bold = row[0] == "D4"
            for (x, _, an), val in zip(cols, row):
                col = INK
                if val.endswith("%"): col = UNSAFE if val != "0 %" else SAFE
                if val.endswith("g") and val != "1.4 g": col = UNSAFE
                face = "demi" if (bold or x == 120) else "regular"
                text(d, (x, y), val, font(36, face), mixc(col, a), anchor=an)
        caption(img, "My first design, a copy of Artemis on a low pad, failed 93 % of runs",
                "From 42 m of height a 400 m wire ends almost flat: no brake setting works at both wind corners.")
        footnote(img, "Table 3 of the paper. Each row is a full evacuation; the fix that mattered was geometry (D2), then people (D3, D4).")
        return img
    img = blank()
    header(img, "A sizing rule for any pad  ·  passive braking works only in a narrow band", "span ≈ 100 m + 4 × crew height")
    img = card(img, FIG / "fig4_feasibility.png", (120, 150, 1800, 880), a=(u - T_BROKE_SPLIT) / 0.5)
    caption(img, "Span ≈ 100 m + 4 × the crew access height",
            "Existing pads sit where their braking choices predict; a real design is still checked in the simulator.")
    footnote(img, "Figure 4 of the paper: every crew height from 30 to 120 m and every span from 150 to 700 m, checked at both wind corners.")
    return img

# -- the switch yard, drawn from the model's trajectories
PX = 8.0
PTS = (640, 560)
BAY_Y = [360, 560, 760]
LEAD_M, BRAKE, BED, NET = 15, 60, 40, 3

def bay_path_point(bay, s):
    y = BAY_Y[bay]
    if s < LEAD_M:
        f = s / LEAD_M
        return (PTS[0] + f * LEAD_M * PX, PTS[1] + f * (y - PTS[1]))
    return (PTS[0] + LEAD_M * PX + (s - LEAD_M) * PX, y)

def pod_state(p, t, brakeK):
    if t < p["depart"]:
        return None
    if t < p["arrive"]:
        tt, xx = p["traj"]["t"], p["traj"]["x"]
        if t <= tt[0]: return ("wire", xx[0])
        if t >= tt[-1]: return ("wire", xx[-1])
        lo, hi = 0, len(tt) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if tt[mid] <= t: lo = mid
            else: hi = mid
        f = (t - tt[lo]) / max(tt[hi] - tt[lo], 1e-9)
        return ("wire", xx[lo] + f * (xx[hi] - xx[lo]))
    tau = p["m"] / brakeK
    dt = t - p["arrive"]
    if dt >= p["stop"]["t"]:
        return ("bay", p["stop"]["dist"], True)
    return ("bay", p["vArr"] * tau * (1 - math.exp(-dt / tau)), False)

def draw_pod(d, xy, n):
    x, y = xy
    d.rectangle([x - 17, y - 13, x + 17, y + 13], fill=STEEL)
    text(d, (x, y + 1), str(n), font(22, "demi"), "#18212b", anchor="mm")

def scene_switchyard(u, d_scene, traj, t_sim):
    img = blank(); d = ImageDraw.Draw(img)
    L, k = traj["L"], traj["brakeK"]
    header(img, "My add-on  ·  one wire, a switch yard and a bay for every pod", f"t = {t_sim:.0f} s after the alarm")
    wx0 = PTS[0] - 70 * PX
    d.line([(wx0, PTS[1]), PTS], fill=STEEL, width=4)
    text(d, (wx0 + 4, PTS[1] - 44), "wire from the tower", font(26, "medium"), STEEL)
    bm = PTS[0] - traj["blockX"] * PX
    d.line([(bm, PTS[1] - 22), (bm, PTS[1] + 22)], fill=INK, width=4)
    text(d, (bm, PTS[1] + 34), "block marker", font(24), GRAPHITE, anchor="ma")
    text(d, (bm, PTS[1] + 62), "unlocks the next pod's release", font(22), "#6b7885", anchor="ma")
    nxt = [p for p in traj["pods"] if t_sim < p["arrive"] + 3.0]   # the model's tSwitch: 3 s to clear the points
    active = (min(nxt, key=lambda p: p["arrive"])["bay"]) if nxt else traj["pods"][-1]["bay"]
    recent = [p for p in traj["pods"] if 0 <= t_sim - p["arrive"] < 1.2]
    bx = PTS[0] + (LEAD_M + BRAKE + BED + NET + 4) * PX + 70
    for b in range(3):
        y = BAY_Y[b]
        lead_end = (PTS[0] + LEAD_M * PX, y)
        d.line([PTS, lead_end], fill=INK if b == active else RULE, width=5 if b == active else 3)
        x = lead_end[0]
        d.line([lead_end, (x + (BRAKE + BED + NET + 4) * PX, y)], fill=RULE, width=3)
        hatch(d, (x, y - 18, x + BRAKE * PX, y + 18), STEEL, step=14)
        d.rectangle([x + BRAKE * PX, y - 14, x + (BRAKE + BED) * PX, y + 14], fill="#2a2a24", outline=SAND, width=2)
        for i in range(int(BED * PX / 16)):
            d.ellipse([x + BRAKE * PX + 6 + i * 16, y - 4, x + BRAKE * PX + 12 + i * 16, y + 2], fill=SAND)
        nx = x + (BRAKE + BED) * PX
        d.rectangle([nx, y - 26, nx + NET * PX, y + 26], fill=HAZARD)
        text(d, (x + 6, y - 58), f"bay {b + 1}", font(28, "demi"), INK)
        if b == 0:
            text(d, (x + BRAKE * PX / 2, y - 58), "magnetic brake, 60 m", font(24), STEEL, anchor="ma")
            text(d, (x + (BRAKE + BED / 2) * PX, y - 58), "drag-chain bed", font(24), SAND, anchor="ma")
            text(d, (nx + NET * PX / 2, y - 58), "net", font(24), HAZARD, anchor="ma")
    d.rectangle([bx, 300, bx + 120, 820], fill="#2a3542", outline=GRAPHITE, width=3)
    text(d, (bx + 60, 560), "bunker", font(30, "medium"), INK, anchor="mm")
    r = 22 + (10 * math.sin(t_sim * 9) if recent else 0)
    d.ellipse([PTS[0] - r, PTS[1] - r, PTS[0] + r, PTS[1] + r], outline=INK, width=4, fill=BG)
    d.ellipse([PTS[0] - 7, PTS[1] - 7, PTS[0] + 7, PTS[1] + 7], fill=INK)
    text(d, (PTS[0] - 10, PTS[1] + 110), "self-indexing points", font(28, "demi"), INK, anchor="ra")
    text(d, (PTS[0] - 10, PTS[1] + 146), "a ratchet advances them one bay per pod", font(22), GRAPHITE, anchor="ra")
    for p in traj["pods"]:
        st = pod_state(p, t_sim, k)
        if not st: continue
        if st[0] == "wire":
            x = PTS[0] + (st[1] - L) * PX
            if x >= wx0 - 20: draw_pod(d, (x, PTS[1]), p["n"])
        else:
            s, stopped = st[1], st[2]
            xy = bay_path_point(p["bay"], s)
            draw_pod(d, xy, p["n"])
            if stopped:
                y = BAY_Y[p["bay"]]
                text(d, (xy[0], y + 40), f"bay {p['bay'] + 1}: stopped at {p['stop']['peakG']:.1f} g", font(22, "medium"), SAFE, anchor="ma")
                if t_sim >= p["unloaded"]:
                    f = ease((t_sim - p["unloaded"]) / max(p["safe"] - p["unloaded"], 1e-6))
                    for i in range(p["n"]):
                        px = xy[0] + 30 + i * 16 + f * (bx - xy[0] - 60 - i * 16)
                        py = y + 2 + (i - 1) * 9 + f * (560 - y)
                        d.ellipse([px - 5, py - 5, px + 5, py + 5], fill=SAFE)
    if u < d_scene * 0.5:
        caption(img, "Self-indexing points send each pod into its own braked bay",
                "Pods cross the points at full speed, so the main line is clear about 3 s after each one.")
    else:
        caption(img, "About 8 s between pods  ·  1.4 g with a failed brake  ·  no power",
                "The drag-chain bed's force grows with distance, not speed. Points, brakes and the release interlock are all passive.")
    footnote(img, "Drawn from the model's trajectories: generic 42 m pad, nine people, flight crew already on the platform. Not to scale.")
    return img

T_LEARN_SPLIT = 5.6

def scene_learned(u, d_scene):
    if u < T_LEARN_SPLIT:
        img = blank(); d = ImageDraw.Draw(img)
        header(img, "What I learned")
        items = [("Design a safety system at its corners.", "Nothing was decided by the average case: everything by the light pod in a headwind and the full pod in a tailwind."),
                 ("Once the hardware works, the seconds left are human.", "Capsule exit moves the total more than every hardware parameter combined. The last minute belongs to the launch-escape system."),
                 ("Running it is how you find out.", "D0 looked like a sensible copy of a real system until it was operated.")]
        for i, (big, small) in enumerate(items):
            a = ease((u - 0.3 - i * 1.4) / 0.6)
            if a <= 0: continue
            y = 220 + i * 230
            d.rectangle([120, y, 126, y + 130], fill=mixc(STEEL, a))
            text(d, (150, y - 6), big, font(50, "demi"), mixc(INK, a))
            text(d, (150, y + 70), small, font(28), mixc(GRAPHITE, a))
        sens = ROOT / "poster" / "img" / "mc_sensitivity.png"
        if sens.exists():
            img = card(img, sens, (1300, 600, 1840, 900), a=(u - 1.8) / 0.6)
        footnote(img, "Monte Carlo over 2,000 runs and the sensitivity of the total time to each input, from the paper.")
        return img
    v = u - T_LEARN_SPLIT
    img = blank(); d = ImageDraw.Draw(img)
    a = ease(v / 0.6)
    text(d, (W / 2, 400), "PLE-SBS", font(150, "demi"), mixc(INK, a), anchor="mm")
    d.rectangle([W / 2 - 180 * a, 510, W / 2 + 180 * a, 513], fill=STEEL)
    text(d, (W / 2, 580), "Adithya Kesan Jayakanth  ·  Grade 12, Padma Seshadri Bala Bhavan, Chennai", font(40, "medium"), mixc(INK, a), anchor="mm")
    text(d, (W / 2, 645), "Paper, simulator and poster:  adithyakesan.com/ple_sbs   ·   Mentor: Mrs. Abitha Peter", font(28), mixc(GRAPHITE, a), anchor="mm")
    return img

# ---------------------------------------------------------------------------
# 5. Timeline, render, mix, write the script
# ---------------------------------------------------------------------------
SCENES = [
    ("Title", "Black fades up to the PLE-SBS wordmark on the dark simulator background; a thin blue rule draws itself; subtitle and name fade in.",
     ["PLE-SBS", "A way down from a fuelled rocket, told by the student who designed it", "Adithya Kesan Jayakanth · Grade 12, Chennai"], None),
    ("The roller-coaster paper", "A schematic coaster track. An orange car rides it left to right while, below, the rider's g is traced live in orange against a red 'limit' line. The two peaks of g sit just under the limit.",
     ["My earlier paper · roller-coaster track design under human g and jerk limits", "The ride is designed around the forces on the rider", "A track is a machine for giving people forces safely: the thrill and the limit are the same number."], "coaster"),
    ("The visit to ISRO, and the question", "Zoom on the launch tower from the simulator's side view: rocket, tower, the crew access level at 42 m, three waiting pods, the fireball outline. An orange arrow drops from the access level to the ground and the question appears. Three facts slide in on the right.",
     ["A visit to ISRO · the question", "how do they get down?", "40 to 115 m above a fully fuelled rocket", "120 s: the Shuttle-era window to be clear", "no power: it must work when everything else has failed", "Minutes before launch, people are working high on the tower"], "isro"),
    ("What exists", "A white card with Figure 3 of the paper: pod speed along the wire for the Shuttle-era and Artemis-era systems at LC-39B, against NASA's reported speeds.",
     ["What exists · NASA's slidewire baskets, Shuttle era and Artemis era", "Each system was engineered for one pad", "Model against the reported basket speeds, with no tuning: the Shuttle peak comes out within 3 %."], "nasa"),
    ("The model and the simulator", "First a white card with Figure 1: TNT equivalent, blast distance and fireball-heat distance for five vehicles, with every wire ending inside the hazard zone. Then the live simulator: the sagging wire from the 42 m tower to the pit 300 m away, the clock running, three pods releasing and riding down one after another.",
     ["The hazard model · propellant to TNT equivalent to blast and fireball to a safe distance", "One rule for any rocket: the propellant load sets the safe distance", "The simulator · a taut string with every pod's weight on it · 16 unit tests, one physics file", "Every pod's weight changes the slope under every other pod"], "model"),
    ("Running it until it broke", "Table 3 appears row by row: D0 to D4, with failing runs in red turning to green and the worst stop falling from 16.4 g to 1.4 g. Then a white card with Figure 4, the sizing band for any pad, with the straight-line rule across it.",
     ["Running it until it broke · nine people, danger level 4, both wind corners, 1,000 Monte Carlo runs", "My first design, a copy of Artemis on a low pad, failed 93 % of runs", "A sizing rule for any pad · passive braking works only in a narrow band", "Span ≈ 100 m + 4 × the crew access height"], "broke"),
    ("The switch yard", "Plan view of the receiving end, drawn from the model's trajectories. The wire comes in from the left past the block marker to the self-indexing points; three bays fan out, each with a hatched 60 m magnetic brake, a drag-chain bed and an orange net; the bunker stands at the right. Pods arrive about nine seconds apart; the points flip to the next bay once each pod has cleared; each pod slows in its bay and stops, and its three occupants walk to the bunker.",
     ["My add-on · one wire, a switch yard and a bay for every pod", "Self-indexing points send each pod into its own braked bay", "About 8 s between pods · 1.4 g with a failed brake · no power"], "yard"),
    ("What I learned, and the close", "Three lessons appear in turn, with the Monte Carlo histogram and the sensitivity chart on a small card. Then the end card: wordmark, name, school, mentor and the simulator address, fading to black.",
     ["Design a safety system at its corners.", "Once the hardware works, the seconds left are human.", "Running it is how you find out.", "PLE-SBS · Adithya Kesan Jayakanth · Grade 12, Padma Seshadri Bala Bhavan, Chennai", "Paper, simulator and poster: adithyakesan.com/ple_sbs · Mentor: Mrs. Abitha Peter"], "learned"),
]

def write_script(dur, start, total, bounds):
    lines = dict(LINES)
    words = sum(len(l.split()) for _, l in LINES)
    md = ["# PLE-SBS in one minute", "", "**Video script.** First person, in Adithya's voice. One continuous narration over eight scenes.", "",
          f"- Runtime {total:.0f} s · 1920×1080 · {FPS} fps · narration {words} words",
          f"- Narrator: {narrator()}",
          "- Built by `video/make_video.py`; this file is written by the same run, so the times are the ones in the video.", "",
          "## Logline", "",
          "A student who once designed roller-coaster tracks around what a human body can take asks how a launch crew gets down from a fuelled rocket, builds a validated simulator to find out, breaks his own first design, and fixes it with a switch yard: one wire, and a braked bay for every pod.", "",
          "## Script", ""]
    for i, ((name, visual, onscreen, key), a, b) in enumerate(zip(SCENES, bounds, bounds[1:])):
        md += [f"### {i + 1}. {name}  ·  {a:.1f} to {b:.1f} s", "", f"**Visual.** {visual}", "",
               "**On screen.** " + "  /  ".join(onscreen), ""]
        if key:
            md += [f"**Narration ({start[key]:.1f} to {start[key] + dur[key]:.1f} s).**", "", f"> {lines[key]}", ""]
        else:
            md += ["**Narration.** None; the first line begins as the title settles.", ""]
    md += ["## Narration only (for recording)", ""]
    for i, (key, line) in enumerate(LINES):
        md.append(f"{i + 1}. {line}")
    md += ["", "## Notes", "",
           "- Every pod position in scenes 5 and 7 comes from the model in `sim/core.js` (design D5, generic 42 m pad, nine people). The capsule-exit time is set to zero so all three pods are seen in sequence; with the paper's 60 s exit the third pod leaves at 90 s.",
           "- The figures are the paper's own (10 June 2026). The roller-coaster track in scene 2 is a schematic drawn for the video, not a figure from the earlier paper.",
           "- The launcher and pad are generic. The visit to ISRO is named only as the inspiration; no ISRO pad, vehicle or person is referred to.",
           "- Rebuild: `.venv/bin/python video/make_video.py` with `ELEVENLABS_API_KEY` set (clips are cached, so a rebuild does not re-bill). `--quick` renders a 10 fps preview; `--script-only` rewrites this file from the cached narration without rendering.", ""]
    (OUT / "script.md").write_text("\n".join(md))

def main():
    OUT.mkdir(exist_ok=True)
    dur, start, total, clips = make_voice()
    print("voice:", {k: round(v, 1) for k, v in dur.items()}, "total", round(total, 1))
    s = start
    bounds = [0.0, 2.0, s["isro"] - 0.1, s["nasa"] - 0.1, s["model"] - 0.1, s["broke"] - 0.1, s["yard"] - 0.1, s["learned"] - 0.1, total]
    if "--script-only" in sys.argv:
        write_script(dur, start, total, bounds)
        print("wrote", OUT / "script.md")
        return
    XF = 0.5

    mA, mB = bounds[4] + T_MODEL_SPLIT, bounds[5]
    def sim_model(t): return 26 + (t - mA) / max(mB - mA, 1) * 46        # 26 -> 72 s after the alarm
    yA, yB = bounds[6], bounds[7]
    def sim_yard(t): return 46 + (t - yA) / (yB - yA) * 38               # 46 -> 84 s

    n = int(round(total * FPS))
    times = [i / FPS for i in range(n)]
    elev_times = {5.0} | {round(sim_model(t), 1) for t in times if mA - XF <= t < mB + XF}
    print(f"capturing {len(elev_times)} side views ...")
    elev, traj = capture(elev_times)
    print("pods:", [(p["id"], round(p["depart"]), round(p["arrive"], 1), p["bay"], round(p["stop"]["peakG"], 2)) for p in traj["pods"]])

    def render(t):
        k = max(i for i, b0 in enumerate(bounds[:-1]) if t >= b0)
        u, dsc = t - bounds[k], bounds[k + 1] - bounds[k]
        if k == 0: return scene_title(u, dsc)
        if k == 1: return scene_coaster(u, dsc)
        if k == 2: return scene_isro(u, dsc, elev[5.0])
        if k == 3: return scene_nasa(u, dsc)
        if k == 4:
            ts = round(sim_model(t), 1)
            return scene_model(u, dsc, elev.get(ts, elev[5.0]), ts)
        if k == 5: return scene_broke(u, dsc)
        if k == 6: return scene_switchyard(u, dsc, traj, sim_yard(t))
        return scene_learned(u, dsc)

    frames = WORK / "frames"; frames.mkdir()
    for i, t in enumerate(times):
        img = render(t)
        for b0 in bounds[1:-1]:
            if b0 - XF <= t < b0:
                img = Image.blend(img, render(b0 + (t - (b0 - XF))), ease((t - (b0 - XF)) / XF))
        if t < 0.5: img = Image.blend(Image.new("RGB", (W, H), "black"), img, t / 0.5)
        if t > total - 0.8: img = Image.blend(img, Image.new("RGB", (W, H), "black"), (t - (total - 0.8)) / 0.8)
        img.save(frames / f"{i:05d}.png")
        if i % (FPS * 5) == 0: print(f"  frame {i}/{n}  t = {t:.1f} s")

    inputs, flt = [], []
    for j, (key, _) in enumerate(LINES):
        inputs += ["-i", str(clips[key])]
        ms = int(start[key] * 1000)
        flt.append(f"[{j}]aresample=48000,adelay={ms}|{ms}[a{j}]")
    mix = "".join(f"[a{j}]" for j in range(len(LINES))) + f"amix=inputs={len(LINES)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]"
    audio = WORK / "voice.wav"
    subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(flt) + ";" + mix, "-map", "[out]", "-ar", "48000", str(audio)], check=True)

    out = OUT / ("PLESBS_60s_preview.mp4" if QUICK else "PLESBS_60s.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-framerate", str(FPS), "-i", str(frames / "%05d.png"), "-i", str(audio),
                    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    "-c:a", "aac", "-b:a", "192k", "-t", f"{total:.3f}", str(out)], check=True)
    print("wrote", out, f"({total:.1f} s)")
    write_script(dur, start, total, bounds)
    shutil.copy(frames / f"{int(round((bounds[6] + 4.0) * FPS)):05d}.png", OUT / "PLESBS_60s_still.png")
    shutil.rmtree(WORK, ignore_errors=True)

if __name__ == "__main__":
    main()
