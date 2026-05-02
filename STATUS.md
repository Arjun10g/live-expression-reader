# Live Expression Reader — Build Status

A privacy-first, browser-only facial expression overlay with calibrated AI emotion classification, FACS-grounded explanations, and per-user model adaptation. This document covers what has been built so far. The hard constraints in [CLAUDE.md](./CLAUDE.md) (no backend, $0/month, Apache/MIT only, no frames leave the device) still hold throughout.

## The product, today

Open the page → click **Start** → 3-second neutral baseline capture → live overlay shows:

- Bounding box per face, opacity scaled to top-1 confidence
- Top-3 emotions with horizontal bars + V/A readout
- Compound-emotion label when the top-2 are sustained close (e.g. *bittersweet*, *fearfully surprised*)
- Stability sparkline over the last ~2s of inference
- Top-3 active facial muscles (ARKit blendshapes), baseline-subtracted
- Personal classifier pick (when ≥2 emotions calibrated): cyan if it agrees with the main model, amber if it disagrees
- Russell-circumplex V/A inset bottom-left of the video, with a 2-second fading trail

Plus a **Why?** button that streams a Claude-Haiku-4.5 explanation grounded in muscle activations and the V/A trajectory, scoped to a user-selectable time window (2–30 s).

## Architecture

```
Webcam (getUserMedia, mirrored)
    ↓
MediaPipe FaceLandmarker (LIVE_STREAM, GPU delegate)  ── 478 landmarks + 52 ARKit blendshapes
    ↓
HSEmotion enet_b0_8_va_mtl ONNX  ── 8 emotions + valence + arousal, AffectNet-trained
    ↓                              ↘
Display pipeline                    Personal Gaussian-Naive-Bayes classifier
(top-3, sparkline, V/A trail,        (trained from user's calibration snapshots)
 compound labels, blendshape panel)
    ↓
[Why?] → Cloudflare Worker proxy → Claude API (streaming SSE)
```

**Architecture B (HSEmotion ONNX)** was adopted after evidence Architecture A's heuristic head misclassified several emotions; the upgrade is justified per CLAUDE.md's "measured evidence" rule. ~26 MB total payload (10 MB MediaPipe + 16 MB HSEmotion) cached aggressively after first load.

## Three differentiators (still intact)

1. **Calibrated confidence.** HSEmotion logits run through `calibratedSoftmax` with a hardcoded τ. τ proper-fitting on AffectNet validation is still pending (see "What's left").
2. **Confidence-region UI.** Top-2 ambiguity strip → DTM14 compound label after 1s of sustained ambiguity. Stability sparkline. V/A circumplex with fading trail. Bbox opacity scales with confidence.
3. **Blendshape-grounded "Why?".** Prompt feeds Claude only muscle activations + V/A trajectory + (when calibrated) personal templates as muscle patterns. Explicit instruction: every claim must reference a listed muscle by name; emotion labels are conclusions Claude derives, never observations parroted from a model output.

## Build plan progress

CLAUDE.md mapped a 9-step build plan. Current state:

| Step | Status | Notes |
|------|--------|-------|
| 1. Scaffold + HF Spaces | ✓ | Vite + TS + Tailwind CDN |
| 2. Webcam + frame loop | ✓ | gesture-gated, Safari-safe, 1280×720 |
| 3. MediaPipe FaceLandmarker | ✓ | VIDEO mode + GPU delegate |
| 4a. Heuristic emotion head | ✓ then retired | replaced by Architecture B |
| 4b. Trained MLP head | skipped | replaced by HSEmotion B |
| 5. Calibration (τ-fit) | partial | placeholder τ=1.0; offline LBFGS fit pending |
| 6a. Bbox confidence opacity | ✓ | |
| 6b. Top-2 ambiguity strip | ✓ | with DTM14 compound names for all 28 pairs |
| 6c. Stability sparkline | ✓ | 60-sample rolling, with 0.5 reference |
| 6d. V/A 2D plot | ✓ | Russell circumplex inset, 2 s fade |
| 6e. Top-3 active blendshapes | ✓ | baseline-subtracted, descriptions in Why? |
| 7. Claude "Why?" | ✓ | streaming SSE, time-window slider, FACS-grounded prompt, proxy-protected |
| 8. Multi-face IoU tracker | not started | currently classifies face[0] only |
| 9. Polish + ship | partial | dev complete; deploy pending |

## Beyond the original plan: Personal calibration system

Added beyond CLAUDE.md scope after measured evidence that off-the-shelf classification under-fires for several emotions per user.

**What it does:**
- Opt-in 3-second-per-emotion capture (warning + confirm dialog before overwriting)
- Big amber recording overlay with pulsing dot, large emotion name, countdown digit, progress bar
- Captures per-frame raw blendshape snapshots (not just the mean) — typically ~30 frames per emotion
- Trains a closed-form **diagonal-Gaussian Naive Bayes** classifier with shared per-feature variance, refit on every new template
- Resting-face calibration also feeds neutral training samples
- Personal classifier output rendered alongside HSEmotion's; agreement and disagreement are visually distinguished
- Why? prompt receives templates as concrete muscle patterns (not probabilities), and instructs Claude to compare current activations against them in muscle-level terms

**Storage** ([src/main.ts](src/main.ts) + opt-in localStorage):
- Off by default. User toggles "Remember my templates on this device" inside the advanced calibration panel.
- When on: serializes baseline + neutral frames + per-emotion templates (mean + samples) as JSON; restored on page load before the user clicks Start.
- "Clear stored data" button (confirm dialog) wipes the payload.
- Survives `QuotaExceeded` gracefully with a status message instead of a crash.
- Only numerical features stored. Never frames, never landmarks, never identity-bearing data.

## Why? prompt design

Every claim must trace to observed data. The prompt forbids generic emotion statements and emotion-percentage parroting. The structure:

1. **Currently active muscles** (top-5 baseline-subtracted blendshapes with plain-English descriptions)
2. **V/A trajectory** subsampled to 5 points across the user-selected window (2–30 s)
3. **Personal templates** (when calibrated) as muscle patterns, with capture timestamps
4. **Hard rules:** every claim references a listed signal by name; emotion labels are derivations, not observations; no general feeling statements; honor the V/A trajectory's movement.

Streaming through `claude-haiku-4-5-20251001` via Anthropic's Messages SSE API.

## Privacy & security model

- **Frames never leave the device.** Only numerical features (blendshapes, V/A, calibrated probabilities) are sent to Claude, and only on explicit Why? click.
- **API key never leaves the server.** Browser bundle has no key. The Cloudflare Worker proxy ([proxy/](proxy/)) holds it as a Worker secret. Origin-pinned + payload-shape-validated to prevent system-prompt smuggling.
- **Storage is opt-in.** Default off. Clear button. Numerical features only.
- **Apache 2.0 / MIT throughout.** HSEmotion (Apache-2.0), MediaPipe (Apache-2.0), onnxruntime-web (MIT), Vite (MIT), TypeScript (Apache-2.0).
- **No analytics, no tracking.**

## File layout

```
/
├── README.md                        — HF Spaces frontmatter + quick start
├── CLAUDE.md                        — project context (do not edit lightly)
├── STATUS.md                        — this file
├── index.html                       — single-page app shell
├── package.json / tsconfig.json / vite.config.ts
├── .env.example                     — required env vars + comments
├── .claude/settings.json            — local autonomous-mode permissions
├── src/
│   ├── main.ts                      — render loop + UI wiring (the only rAF caller)
│   ├── face-pipeline.ts             — MediaPipe FaceLandmarker wrapper
│   ├── emotion-onnx.ts              — HSEmotion ONNX classifier + crop pipeline
│   ├── emotion-head.ts              — Emotion type + EMOTIONS constant (heuristic head retired)
│   ├── personal-classifier.ts       — diagonal-Gaussian Naive Bayes from user snapshots
│   ├── calibration.ts               — temperature-scaled softmax (Guo et al. 2017)
│   ├── tracker.ts                   — IoU multi-face tracker (stub, Step 8)
│   ├── vite-env.d.ts                — typed import.meta.env
│   ├── ui/
│   │   ├── overlay.ts               — (stub, currently inlined in main.ts)
│   │   ├── confidence-viz.ts        — sparkline + ambiguity threshold + DTM14 lookup
│   │   └── valence-arousal-viz.ts   — Russell circumplex + trail rendering
│   └── claude/
│       ├── explain.ts               — prompt builder + streaming Messages API call
│       └── settings.ts              — localStorage helpers (BYO key path retired)
└── proxy/                           — Cloudflare Worker proxy (separate deploy)
    ├── README.md                    — deploy instructions
    ├── package.json / tsconfig.json / wrangler.toml
    └── src/worker.ts                — origin-pinned, payload-validated, streaming pass-through
```

## Tech stack

- **Build:** Vite + TypeScript (strict mode, `noUnusedLocals/Parameters`).
- **Styling:** Tailwind CDN.
- **ML runtime:** `@mediapipe/tasks-vision` + `onnxruntime-web` (single-threaded WASM, SIMD).
- **AI:** Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) via Messages API + SSE.
- **Proxy:** Cloudflare Worker (free tier; rate-limit rule applied at dashboard).
- **Hosting (planned):** Hugging Face Spaces, Static SDK.

## What's left

Ranked by leverage:

1. **Deploy.** Wire `wrangler deploy` for the proxy, set `ALLOWED_ORIGIN` to the final HF Space URL, push the Vite build to Spaces. Until this happens, Why? only works locally.
2. **Session summary card on Pause.** % time per emotion, dominant V/A quadrant, transition rate, top blendshapes — engaging "wrap" UX. Builds on the existing storage layer.
3. **Step 5 — proper τ calibration.** Run AffectNet validation through HSEmotion + the current pipeline, fit τ via LBFGS on a held-out set, hardcode in [src/calibration.ts](src/calibration.ts), commit a reliability diagram.
4. **Step 8 — multi-face emotion.** Today only `face[0]` gets a readout panel. IoU tracker for stable IDs + per-face slot for the personal classifier.
5. **Mobile responsiveness + dark/light polish.** Step 9 finishing.

## Things deliberately out of scope

(Carried over from CLAUDE.md, still in force.)

- Multi-person meeting analytics
- Recording / exporting webcam video
- Identification of individuals (we detect, not recognize)
- Mood / health / clinical claims of any kind
- "Lie detection" or anything adjacent
