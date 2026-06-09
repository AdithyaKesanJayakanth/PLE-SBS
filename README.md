# PLE-SBS — Pre-Launch Emergency: The Slidewire Basket System

A student engineering study of a gravity-driven slidewire escape system for crew and close-out technicians at a crewed launch pad, with a sizing method for any launch pad (span ≈ 100 m + 4 × crew access height) and a worked example for a low, 42 m pad. It goes from the safety problem and its requirements, through physical models and a simulator, to a design that has been run, checked against NASA systems and revised.

> [!IMPORTANT]
> **My special add-on to the existing egress system: one wire, a switch yard and a bay for every pod.**
>
> Existing slidewires give every basket its own wire and brake it at the end of that wire. PLE-SBS keeps the proven ride but moves the braking off the wire. At the bottom, self-indexing points send each pod into its own braked bay beside the bunker, so:
>
> - all the pods share **one wire** and leave about 8 s apart (37 s with a single dock);
> - one wire clears 24 people in 113 s in a design headwind, close to six separate wires (111 s);
> - a pod whose magnetic brake has failed still stops at 1.4 g in its bay's drag-chain bed;
> - nothing needs power: the points, brakes and release interlock are all passive.
>
> See Section 6.2 of the paper and the switch-yard option in the simulator.

**Simulator:** https://adithyakesan.com/ple_sbs/

- **Paper** (≤ 7 pages): `paper/PLE-SBS.pdf`, editable copy `paper/PLE-SBS.docx`, source `paper/paper.md`
- **Simulator**: `web/index.html`. Pick any rocket and pad, choose a single dock or a switch yard, a catch net or drag-chain bed, fail a magnetic brake, and watch the evacuation. A Materials & BOM tab lists what the chosen design is made of.
- **Physics**: `sim/core.js`, one dependency-free file shared by the website and the paper's figures

Author: Adithya Kesan Jayakanth, Padma Seshadri Bala Bhavan, K.K. Nagar, Chennai. Mentor and guide: Mrs. Abitha Peter, Class 12 physics teacher.

## Run the simulator

Open `web/index.html` in a browser. No build step and no server are needed. Or serve the folder and open `http://localhost:8737/web/`:

```bash
python3 -m http.server 8737
```

## Rebuild the paper

Needs Node 18+, Python 3, pandoc, poppler (`pdfinfo`) and Google Chrome.

```bash
python3 -m venv .venv && .venv/bin/pip install matplotlib numpy
```

```bash
./paper/build.sh
```

This runs the tests, re-runs every study into `data/results.json`, redraws `figures/*.png`, builds the PDF and DOCX, and fails if the PDF is longer than 7 pages. Use `./paper/build.sh --quick` after editing only the text.

## Tests

```bash
node --test test/*.test.js
```

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder.
2. Settings → Pages → Deploy from branch → `main`, folder `/ (root)`.
3. The simulator will be at `https://<user>.github.io/<repo>/web/`. The root `index.html` redirects there.
4. Put that URL into `paper/paper.md` (the `simulator:` line and ref [16]) and rebuild.

## Layout

```
sim/core.js                  physics: hazard, cable, pod dynamics, evacuation, Monte Carlo, trade, sensitivity, scale-model fit
sim/export.js                runs every study in the paper -> data/results.json
figures/make_figures.py      paper figures from data/results.json
paper/                       paper.md (source), template.html + paper.css (layout), build.sh
web/                         simulator UI (index.html, app.js, style.css)
data/scale_model.csv         scale-model runs (template; add measurements)
docs/scale-model-protocol.md how to test the 1:50 tabletop rig
docs/scale-model-bom.md      rig parts list, prices, assembly; docs/scale-model-bom.csv
cad/make_parts.py            parametric 3D-printed parts -> cad/stl/*.stl (+ cad/parts_preview.png)
cad/make_drawings.py         rig layout and trolley assembly drawings
test/core.test.js            physics unit tests
site/build.sh                packages the simulator as a static site under /ple-sbs/
private/                     author notes (sources, checklist); git-ignored, never published
```

## Honesty notes

- All results are model predictions from public data and stated assumptions. This is not a certified safety analysis.
- The reference launcher and pad are generic; their dimensions are estimates.
- Unconfirmed facts are marked `[VERIFY]` in the paper and listed in `docs/author-checklist.md`.
