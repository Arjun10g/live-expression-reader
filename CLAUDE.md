# CLAUDE.md

> Project context and working agreements for Claude (and humans) building this project.
> Read this first before making changes.

## Project: Live Expression Reader

A browser-based real-time facial expression overlay with **calibrated confidence regions** and **blendshape-grounded AI explanations**. Runs entirely client-side. Hosted free on Hugging Face Spaces.

**One-line pitch:** Most emotion overlays show fake-precise softmax noise. This one shows you what the model actually knows, with calibrated confidence and an "explain why" button that reasons over real facial muscle activations.

## Why this exists (the actual differentiation)

Emotion overlays are a saturated demo space. There are ~50 "FER in the browser" projects on GitHub. The thing that makes this worth building is three concrete commitments:

1. **Calibrated confidence.** Predicted probabilities reflect actual accuracy via temperature scaling fit on validation data. "76% surprised" should mean ~76% accurate across calibration set bins.
2. **Confidence-region visualization.** Top-2 ambiguity treatment, temporal stability sparklines, valence/arousal 2D plot — uncertainty is the UI, not a hidden afterthought.
3. **Blendshape-grounded explanations.** A "Why?" button feeds the actual ARKit blendshape activations to Claude (Haiku) which produces interpretable, grounded explanations rather than post-hoc rationalizations.

If a change weakens any of these three, push back before implementing.

## Hard constraints

- **Budget: $0/month for the product itself.** Hosting on HF Spaces (Static SDK), models loaded from HF Hub CDN, all inference in-browser. Claude API is bring-your-own-key for users; demo mode capped at $5/month with a hard limit on the Anthropic dashboard.
- **No backend server.** No database, no Python runtime, no auth system. The Space is static files. If a feature requires a server, the answer is "not in v1."
- **No webcam frames leave the device.** Privacy is a real selling point. Only numerical features (blendshapes, emotion probabilities, valence/arousal) get sent to Anthropic on explicit "Why?" click.
- **No `localStorage`/`sessionStorage` in artifact previews** if any are made. (`localStorage` *is* fine in the actual deployed app — used for BYO API key.)
- **Apache 2.0 / MIT dependencies only.** Anything more restrictive needs explicit discussion.

## Architecture

```
Webcam (getUserMedia)
    ↓
MediaPipe FaceLandmarker (LIVE_STREAM mode, WebGL delegate)
    ↓ 478 3D landmarks + 52 ARKit blendshapes per face
    ↓
Blendshape → Emotion head (in-app, see Step 4 below)
    ↓ 8 emotion logits + valence + arousal
    ↓
Temperature scaling (calibration.ts, learned τ)
    ↓ calibrated probabilities
    ↓
UI overlay (canvas, multi-face IoU tracker for stable IDs)
    ↓
[On user click] → Claude Haiku via BYO key → streaming explanation
```

**Two architecture variants exist:**

- **Architecture A (current default):** MediaPipe FaceLandmarker only. ~10MB total payload. Blendshapes → emotions via heuristic or tiny MLP head.
- **Architecture B (upgrade path):** Add HSEmotion (EmotiEffLib) ONNX model for emotions, keep FaceLandmarker for blendshapes used in explanations. ~40-50MB payload. Use only if A's accuracy proves insufficient.

Default to A. Don't switch to B without measured evidence A is the bottleneck.

## Tech stack

- **Build:** Vite + TypeScript (vanilla, no framework). React is acceptable if a component genuinely needs it but avoid the default.
- **Styling:** Tailwind via CDN (no build step). If complexity grows, add the proper Tailwind build but not before.
- **ML runtime:**
  - `@mediapipe/tasks-vision` (FaceLandmarker)
  - `onnxruntime-web` (only if Architecture B is adopted)
- **Hosting:** Hugging Face Spaces, Static SDK. Auto-deploy on git push.
- **Models:** Served from Hugging Face Hub CDN, cached aggressively in browser after first load.
- **AI:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) via Messages API with `stream: true`. Direct browser fetch (CORS allowed).

## File layout

```
/
├── README.md                    # HF Spaces frontmatter (sdk: static)
├── CLAUDE.md                    # this file
├── index.html
├── src/
│   ├── main.ts                  # entry point, render loop
│   ├── face-pipeline.ts         # MediaPipe wrapper, frame → features
│   ├── emotion-head.ts          # blendshapes → emotions/V/A
│   ├── calibration.ts           # temperature scaling, learned τ hardcoded
│   ├── tracker.ts               # IoU-based multi-face ID tracker
│   ├── ui/
│   │   ├── overlay.ts           # canvas drawing, bounding boxes
│   │   ├── confidence-viz.ts    # sparkline + top-2 ambiguity
│   │   └── valence-arousal-viz.ts
│   └── claude/
│       ├── explain.ts           # streaming API call
│       └── settings.ts          # BYO key UI, localStorage
├── models/                      # NOT committed; fetched at runtime
├── public/
└── vite.config.ts
```

## Build plan (16 working days, ~4 calendar weeks at 4 days/week)

### Step 1 — Scaffold + HF Spaces (1 day)
Vite TS project, Tailwind CDN, deploy "hello world" to HF Space. Confirm auto-deploy works.

### Step 2 — Webcam + frame loop (0.5 days)
`getUserMedia` 1280×720, mirrored video, canvas overlay matching dimensions, `requestAnimationFrame` loop, pause toggle. Handle Safari autoplay gesture requirement.

### Step 3 — MediaPipe FaceLandmarker (1 day)
`@mediapipe/tasks-vision`, LIVE_STREAM mode, WebGL delegate, `outputFaceBlendshapes: true`, `numFaces: 5`. Derive bounding boxes from landmark min/max with padding. Cache the FaceLandmarker instance — init is slow.

### Step 4 — Blendshape → emotion head (1 day for 4a, 2-3 days for 4b)

**Approach 4a (default):** Hand-tuned linear combinations per emotion using documented blendshape semantics:
- Happy: `mouthSmile{Left,Right}` + `cheekSquint{Left,Right}` (Duchenne)
- Surprised: `browInnerUp` + `eyeWide{Left,Right}` + `jawOpen`
- Angry: `browDown{Left,Right}` + `mouthFrown{Left,Right}` + `noseSneer{Left,Right}`
- Sad: `browInnerUp` + `mouthFrown{Left,Right}` + `mouthLowerDown{Left,Right}`
- Disgust: `noseSneer{Left,Right}` + `mouthUpperUp{Left,Right}`
- Fear: `browInnerUp` + `eyeWide{Left,Right}` + `mouthStretch{Left,Right}`
- Contempt: asymmetric `mouthSmile{Left|Right}` (one-sided)
- Neutral: low activation across all of the above

Output logits, not probabilities. Calibration handles the softmax.

**Approach 4b (upgrade):** Train MLP (52 → 64 → 8) on (blendshape, emotion) pairs by running MediaPipe over AffectNet validation set. Free Colab T4 trains it in minutes. Export to ONNX <1MB. Only do this if 4a measurably underperforms.

Valence/arousal: separate linear regression from blendshapes (or hand-tuned: smile-related → +V, frown → -V, eye/jaw open → +A, eye closure/relaxation → -A).

### Step 5 — Calibration (2 days)
Temperature scaling per Guo et al. 2017. One scalar τ, learned by minimizing NLL on a 200-500 sample held-out set with LBFGS (50 iters, in Python on Colab). Hardcode the resulting τ in `calibration.ts`. Implementation is ~10 lines:

```typescript
export function calibratedSoftmax(logits: number[], tau = TAU): number[] {
  const scaled = logits.map(l => l / tau);
  const m = Math.max(...scaled);
  const exps = scaled.map(s => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sum);
}
```

Generate a reliability diagram once during development to confirm calibration is meaningful. Save the figure for the README.

### Step 6 — Confidence visualization (4 days)
This is where the product lives or dies. Five UI elements:

- **6a. Bounding box opacity scales with max-class confidence.** Bright at 90%+, translucent at 40%.
- **6b. Top-2 ambiguity treatment.** When |p1 − p2| < 0.15, show both with a split-bar OR layout. Make it clear the model is torn.
- **6c. Temporal stability sparkline.** 60-frame (~2s) rolling history of top emotion probability. Flat = stable, jittery = uncertain.
- **6d. Valence/arousal 2D plot.** Small inset, point with 2s fading trail. More accurate to actual affective psychology than discrete bars.
- **6e. Top-3 active blendshapes panel.** "Active: browInnerUp 0.84, mouthFrown 0.61, eyeBlink 0.42." Grounds the explain feature.

### Step 7 — Claude "Why?" integration (1.5 days)
- BYO key in settings panel, stored in `localStorage`.
- Demo mode with shared rate-limited key (capped $5/month hard limit).
- Streaming Messages API call with structured prompt including emotion probs (calibrated), V/A, top blendshapes.
- Cache last 5 explanations per session.
- Handle missing key, rate limit, network errors gracefully.

Prompt template (keep this prompt grounded — it should never invent activations not in the input):

```
The user is looking at a face in a webcam feed. A facial analysis model 
has produced these features:

Top emotion predictions (calibrated):
- {emotion}: {pct}%
[...]

Valence: {v} (negative ↔ positive)
Arousal: {a} (low ↔ high)

Top active facial muscles (ARKit blendshape scores):
- {name}: {score}  ({plain-english description})
[...]

Write a 2-3 sentence explanation of what this expression likely means 
and how confident the model should be. Be specific about which muscle 
activations support or contradict the predicted emotion. If the signal 
is genuinely ambiguous, say so directly. Do not invent activations not 
listed above.
```

### Step 8 — Multi-face tracking (0.5 days)
IoU-based tracker, ~30 lines TypeScript. Match new bounding boxes to most-overlapping previous box. Assign new IDs to unmatched. Drop IDs unseen for 30 frames. Hungarian assignment is overkill for ≤5 faces.

### Step 9 — Polish + ship (4-5 days)
- Demographic spot-checks (you + 2-3 friends across age/skin tone/glasses)
- Performance budget: 30 FPS mid-range laptop, 15 FPS mobile web
- Privacy disclosure on the page (clear sentence about what stays local)
- Loading states for model download (~10-50MB first load)
- Mobile responsive layout
- Dark/light mode (Tailwind freebie)
- Friendly error states (webcam denied, no faces, model load failed)
- README with reliability diagram, BYO-key instructions, source link

## Working agreements for Claude

When making changes:

- **Don't suggest paid services** without flagging the cost change explicitly. The $0/month constraint is real.
- **Don't suggest server-side anything** without a strong reason. Static + browser-ML is the architecture, not an MVP shortcut.
- **Don't reach for heavy frameworks** (Next.js, NestJS, etc.). Vanilla TS + Vite is intentional.
- **Don't suggest training a custom model** as the first solution. The pretrained MediaPipe + heuristic head is the default. Training is a v2 lever pulled with measured evidence.
- **Don't add tracking/analytics** without asking. Privacy story is a feature.
- **Do push back** if asked to ship "an emotion overlay" without the three differentiators. The differentiation is the project.
- **Do search the web** for current model availability, API changes, package versions before suggesting them — this stack changes fast.
- **Do prefer paraphrase over copy** when referencing research. One short quote per source maximum if absolutely needed.

When writing code:

- TypeScript, strict mode, no `any` without comment justifying it
- Explicit types on exported functions
- Comment the *why*, not the *what*
- Keep `face-pipeline.ts` and `emotion-head.ts` independently testable — they're the two pieces most likely to be swapped out
- The render loop in `main.ts` should be the only place `requestAnimationFrame` is called. Everything else is pure functions over feature data.

When changing the calibration:

- Re-fit τ if `emotion-head.ts` changes architecture
- Save the validation set used to fit τ in `calibration_data/` (commit it; it's small)
- Update the reliability diagram in the README when τ changes

## Reference / prior art

Worth knowing exists; do not reimplement:

- **MediaPipe FaceLandmarker** — Google AI Edge, 478 landmarks + 52 ARKit blendshapes, BlazeFace under the hood. The base of our pipeline.
- **EmotiEffLib (HSEmotion)** — sb-ai-lab/EmotiEffLib on GitHub, Apache 2.0. ABAW competition winner (8th, expression recognition 1st place). EfficientNet/MobileViT/MobileFaceNet backbones, ONNX-ready, 8 emotions + valence/arousal + engagement. Architecture B fallback.
- **LibreFace** — USC ihp-lab/LibreFace. Action Unit detection. Could replace the blendshape-from-MediaPipe approach for stronger AU intensity but adds complexity.
- **Temperature scaling** — Guo, Pleiss, Sun, Weinberger 2017. The calibration method we're using. github.com/gpleiss/temperature_scaling has reference implementation.
- **AffectNet** — the in-the-wild dataset modern FER models train on. ~450K labeled faces. Free for research use.
- **FER2013** — DO NOT USE. 2013-era, 48×48 grayscale, noisy labels, ~75% accuracy ceiling. Most random GitHub FER demos use this. We don't.

## Things to consider for v2

(Not for v1. Resist scope creep. These are notes for later.)

- WebGPU delegate when MediaPipe ships it (issue #5826, tracking) — likely 2-3× speedup for free.
- Train MLP head on AffectNet via the blendshape-extraction pipeline (Approach 4b).
- Compound expressions (sad+surprised, happy+disgusted) — HSEmotion supports these, MediaPipe blendshapes are sufficient features.
- Layer-Stack Temperature Scaling or Neural Clamping for better calibration (current basic τ is probably fine).
- LibreFace AU intensity for richer "Why?" explanations.
- Optional video-file upload (drag & drop a clip, get the same analysis offline).
- Mobile-native wrapper (Capacitor) — only if there's evidence of demand.

## Things explicitly out of scope

- Real-time emotion analysis of multiple-person *meetings* (different product, different problems)
- Recording/exporting video (encourages non-consensual use)
- Identification of individuals (we detect faces, we don't recognize them — privacy boundary)
- Mood/health/clinical claims of any kind (regulatory, ethical)
- "Lie detection" or anything adjacent (the science doesn't support it)

## Open questions

(Things to resolve before or during build, not yet decided.)

- Exactly which 200-500 samples for calibration — AffectNet validation, RAF-DB, or self-collected? Probably AffectNet for label quality.
- Demo-mode shared key strategy — tight per-IP rate limit vs. monthly cap vs. don't ship demo mode at all and require BYO key.
- Whether to ship Architecture B (HSEmotion ONNX) as an opt-in "high-accuracy mode" toggle in v1, or wait for v2.
