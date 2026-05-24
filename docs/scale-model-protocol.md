# Scale-model slidewire: build and test protocol

This rig measures what the simulator cannot know on its own: how much the trolley's rolling resistance really is, whether a pod on a sagging wire behaves the way the taut-string model says, and whether a magnetic brake really slows a light pod more than a heavy one (the effect behind the paper's main design result, Section 3.3 and Fig. 4).

Results go into `data/scale_model.csv`. The simulator's **Scale model** tab fits μ and drag area from that file and plots measured against predicted run times.

## 1. What to build

A 1:50 copy of the final design: **6.00 m horizontal span, 0.90 m drop**, tensioned by a counterweight over a pulley so it sags 12–14 cm at mid-span with a pod parked there. Two printed trolleys with open-sided baskets, a start gate with a pull-pin, a foam stop, and an optional 0.6 m magnetic-brake track.

The full parts list, the 3D-printed parts (`cad/stl/`), drawings and assembly steps are in **[scale-model-bom.md](scale-model-bom.md)**. Approximate cost: ₹4,000, or ₹5,900 with the magnetic-brake demo.

| Full size (D5) | Scale model (1:50) |
|---|---|
| 45 m drop | 0.90 m |
| 300 m span | 6.00 m |
| ≈ 7 m mid-span sag with a pod | 12–14 cm |
| 60 m magnetic brake | 1.2 m (0.6 m in the demo) |
| ≈ 21 s ride, ≈ 22 m/s | ≈ 3.0 s, ≈ 3.1 m/s |

**Safety.** Wear eye protection when the wire is under tension. A snapped wire whips. Keep faces out of the line of the wire, keep the run clear of people, and always have a soft stop at the bottom. Neodymium magnets pinch fingers; handle them one at a time.

## 2. Measure the rig before every session

1. **L**: wire length between anchor contact points, along the wire (m).
2. **Drop**: vertical height difference between the anchors (m).
3. **Sag**: with no pod, stretch a string between the anchor points and measure the gap to the wire at mid-span. Repeat with the heaviest pod parked at mid-span.
4. **Tension**: if you use a counterweight, tension = its weight in newtons. With a turnbuckle, estimate it from the sag: T ≈ w L² / (8 · sag) for the wire's own weight w (N/m), or T ≈ P L / (4 · extra sag) for a pod of weight P.

## 3. Test matrix

**A. Friction and drag (45 runs).** 3 drops × 3 masses × 5 repeats.

| | 0.5 kg | 1.5 kg | 3.0 kg |
|---|---|---|---|
| Drop 0.60 m (≈ 30 m pad) | 5 runs | 5 runs | 5 runs |
| Drop 0.90 m (≈ 45 m pad, the design) | 5 runs | 5 runs | 5 runs |
| Drop 1.20 m (≈ 60 m pad) | 5 runs | 5 runs | 5 runs |

Release the pod from rest at the top mark, without pushing. Film side-on. The run time is the number of frames from release to the bottom mark, divided by 240.

Expected scale: with a 6 m wire, a 0.9 m drop and μ = 0.02, the pod accelerates at about 1.3 m/s² and takes about 3 s. If your times are far longer, check the bearings and wheel alignment before blaming the model.

**B. Pod spacing in series (10 runs).** Two pods of equal mass on one wire, released 0.5 s, 1 s and 2 s apart. From the video, measure the gap between them at each metre mark. The model predicts that the gap grows on the steep upper part and shrinks near the bottom where the wire flattens.

**C. Magnetic brake (20 runs).** Fit the magnet slot over the last metre. For a light pod (0.5 kg) and a heavy pod (3 kg), measure speed entering and leaving the slot. Speed is distance between two tape marks divided by the time between them on video. The model predicts that the light pod loses a larger fraction of its speed. This is the light-pod over-braking effect.

## 4. Recording

Add one row per run to `data/scale_model.csv`:

```
run,wire_length_m,drop_m,mass_kg,time_s,notes
A01,6.00,0.90,1.50,3.12,drop B mass 2 rep 1
```

`mass_kg` is the total moving mass: trolley, basket and ballast. Put anything unusual in `notes`, for example "wheel rubbed" or "released with a push". Do not delete bad runs. Mark them in `notes` and decide later, with a reason, whether to exclude them.

For tests B and C, keep the measurements in a separate sheet (`data/scale_model_spacing.csv`, `data/scale_model_brake.csv`) with columns that suit the test.

## 5. Analysis

1. Open the simulator, go to **Scale model**, load the CSV and press **Fit model to runs**. It fits μ (and a drag area) by least squares and shows measured against predicted times.
2. A good fit has points close to the diagonal and an RMS error of a few hundredths of a second. A pattern, for example heavy pods consistently faster than predicted, means the model is missing something. That is worth writing about.
3. Compare the fitted μ with the 0.02 assumed for the full-size trolley. If they differ a lot, run the full-size study again with the measured value. The **Sensitivity** tab shows how much it matters; in the current design, not much.

## 6. What scales and what does not

A 6 m model of a 300 m wire is about 1:50. Under **Froude scaling**, speeds scale with √λ and times with √λ. A 3.1 s model run corresponds to about 22 s full-size, which is close to the simulator's ride time. That makes the geometry and gravity part of the rig a fair test.

Drag does **not** scale. To keep the ratio of drag to weight the same, the model pod would have to weigh 600 kg × (1/50)³ ≈ 5 g. The model pods are far heavier relative to their size, so air drag is negligible on the rig. Use the rig to measure friction, sag and brake behaviour. Take drag from published values for the full-size basket, and say so in the paper.

Rolling resistance of a ball-bearing wheel on steel wire does not depend strongly on size, so the fitted μ is a reasonable estimate for the full-size trolley, but only if it uses the same type of wheel.
