---
title: Live Expression Reader
emoji: 🙂
colorFrom: indigo
colorTo: pink
sdk: static
pinned: false
license: apache-2.0
short_description: Calibrated in-browser facial expression reader
---

# Live Expression Reader

Real-time facial-expression analysis with **calibrated confidence**, **literature-grounded cognitive states** (tired / focused / bored / stressed / engaged / confused / calm), and **AI-powered explanations** grounded in the Facial Action Coding System. Runs entirely in your browser — webcam frames never leave your device.

[![Live demo](https://img.shields.io/badge/Live%20demo-arjun10g--live--expression--reader-indigo?style=for-the-badge)](https://arjun10g-live-expression-reader.static.hf.space)
[![Source on Hugging Face](https://img.shields.io/badge/Source-Hugging%20Face%20Spaces-orange?style=for-the-badge&logo=huggingface)](https://huggingface.co/spaces/arjun10g/live-expression-reader/tree/main)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-green?style=for-the-badge)](https://www.apache.org/licenses/LICENSE-2.0)

> **Live demo:** <https://arjun10g-live-expression-reader.static.hf.space>
>
> **Source:** <https://huggingface.co/spaces/arjun10g/live-expression-reader/tree/main>

---

## What it does

- **HSEmotion ONNX** classifier in-browser: 8 emotions (anger, contempt, disgust, fear, happy, neutral, sad, surprised) plus continuous valence / arousal.
- **MediaPipe FaceLandmarker** for 478 landmarks + 52 ARKit blendshapes per face.
- **Personal baseline calibration** (3-second resting-face capture) used to subtract neutral asymmetry from every downstream signal.
- **DTM14 compound emotions** when top-2 are sustained close (e.g. *bittersweet*, *angrily disgusted*, *fearfully surprised*).
- **Russell circumplex** valence / arousal trail with a 2-second fading inset.
- **Stability sparkline** — top-1 confidence over the last ~6 s.
- **Cognitive states** computed from PERCLOS (Wierwille 1994), blink rate (Stern 1984), expression entropy (D'Mello 2010), AU4 + AU7 (D'Mello & Graesser 2010), affect-lability V-flux (Kuppens 2010 / 2013), and Russell circumplex (1980). Hidden until 60 s of data is in the window.
- **Personal classifier** — opt-in: hold each emotion for 3 s; a diagonal-Gaussian Naive Bayes fits to your samples and runs alongside the model.
- **Why? / Ask / Summarize / Discuss recording** — an LLM reads the muscles + V/A + cognitive states + personal templates and explains them in plain language. Multi-turn chat with conversation history.
- **Recording** + **JSON export** — clip up to 10 minutes of session data for later analysis or research.

## Privacy

- Webcam frames are processed locally. **No frames ever leave the device.**
- The "Why?" feature sends only numerical features (calibrated probabilities, blendshape activations, valence / arousal) to the LLM, and only when you click.
- Personal templates and saved recordings stay in your browser tab. Persistence to `localStorage` is opt-in and off by default; "Clear stored data" wipes it instantly.
- No analytics, no tracking, no cookies.

## Local development

```bash
npm install
cp .env.example .env.local        # set VITE_DEMO_ANTHROPIC_API_KEY for local dev only
npm run dev
```

Open <http://127.0.0.1:5173/>.

## Deploy

Two pieces:

1. **Frontend** → Hugging Face Spaces (Static SDK).
2. **LLM proxy** → Cloudflare Worker (free tier). Holds the API key as a server-side secret so the browser bundle never sees it.

### 1. Cloudflare Worker (one-time)

```bash
cd proxy
npm install
npx wrangler login                              # opens browser
npx wrangler secret put ANTHROPIC_API_KEY       # paste your sk-ant-... key
# Edit wrangler.toml -> ALLOWED_ORIGIN to include your future HF Space URL.
npx wrangler deploy
```

Note the deployed URL (e.g. `https://expression-explain-proxy.<account>.workers.dev`). Set `VITE_EXPLAIN_PROXY_URL` to that URL when building the frontend.

In the Cloudflare dashboard → Workers & Pages → your Worker → Settings → add a **rate-limit rule**: 30 requests / 5 minutes per IP, action: block 5m. Free.

### 2. Frontend on Hugging Face Spaces

```bash
# Build with the proxy URL baked in (the only env var the public bundle sees).
VITE_EXPLAIN_PROXY_URL=https://expression-explain-proxy.<account>.workers.dev \
  npm run build

# Push the built files to your Space.
huggingface-cli login           # one-time, with your HF write token
git clone https://huggingface.co/spaces/<your-username>/<space-name> hf-space
cp -r dist/* hf-space/
cp README.md hf-space/          # the frontmatter at the top of this file is what HF Spaces reads
cd hf-space
git add -A
git commit -m "Deploy"
git push
```

The Space serves at `https://<your-username>-<space-name>.static.hf.space`.

## Stack

| Component | Library | License |
|-----------|---------|---------|
| Face landmarks + 52 ARKit blendshapes | [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) | Apache-2.0 |
| Emotion classifier | [HSEmotion `enet_b0_8_va_mtl`](https://github.com/HSE-asavchenko/face-emotion-recognition) | Apache-2.0 |
| ONNX inference | [`onnxruntime-web`](https://www.npmjs.com/package/onnxruntime-web) | MIT |
| AI explanations | LLM (proxied via Cloudflare Worker) | API |
| Build + UI | Vite, TypeScript, Tailwind CDN, Inter / JetBrains Mono | MIT / Apache-2.0 |

## Research backing the cognitive-states layer

- **PERCLOS** drowsiness threshold (≥ 0.15 over 60 s): Wierwille et al. 1994 (NHTSA); Dinges & Grace 1998 (FHWA TB98-006); Abe 2023 (*SLEEP Advances*).
- **Blink rate** baseline ~0.25 Hz, decreases with visual attention, increases with stress / cognitive load: Stern, Walrath & Goldstein 1984 (*Psychophysiology* 21:22-33); Maffei & Angrilli 2018 (*Neurosci Lett* 736).
- **Confusion** AU4 + AU7 co-firing: D'Mello & Graesser 2010 (*Cog Emotion* 24(1):67-76).
- **Boredom** = expressive flatness + low intensity + slow blink: D'Mello & Graesser 2010; Craig, D'Mello, Witherspoon & Graesser 2008.
- **Stress** AU pattern (fear-blend brow + AU20 + AU24): Harrigan & O'Connell 1996; Giannakakis et al. 2017 (*BSPC* 31:89-101).
- **Engagement** features (positive V + sustained gaze + AU spikes): Whitehill et al. 2014 (*IEEE T-AffComp* 5(1):86-98).
- **Calm** (low arousal Russell quadrant) + **affect lability** (V-flux): Russell 1980 (*JPSP* 39(6)); Kuppens et al. 2010, 2013 (*Emotion*).
- **Compound emotions** (bittersweet, fearfully surprised, etc.): Du, Tao & Martinez 2014 (*PNAS* 111(15) E1454).

## Project status

See [STATUS.md](./STATUS.md) for an end-to-end breakdown of what's been built, the architecture decisions, and what's planned. See [CLAUDE.md](./CLAUDE.md) for project working agreements.

## License

Apache-2.0. The HSEmotion weights are also Apache-2.0; MediaPipe is Apache-2.0; onnxruntime-web is MIT. No GPL/CC-BY-NC dependencies anywhere in the stack.
