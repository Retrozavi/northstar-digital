# Northstar Solutions — v2 (scroll-driven build)

A standalone, deploy-ready site. No build step, no framework, no CDN dependencies.
Three files plus assets:

```
site/
├── index.html     structure and all copy
├── styles.css     tokens, components, and every animated CSS state
├── motion.js      the scroll engine
└── assets/        northstar-og.png · xavier.jpg · hero.mp4 (you supply)
```

## Run it locally

```bash
python3 -m http.server 4173 --directory site
```

Then open `http://localhost:4173`. Open it over `http://`, not by double-clicking
the file — `file://` blocks video loading in most browsers.

---

## Drop in your hero video

Put your file at `assets/hero.mp4`. Nothing else needs changing; the page picks
it up automatically. Until it exists, a generated stand-in stage renders in its
place, so the page is never broken while you're sourcing footage.

**Encode it for scrubbing.** Scroll-scrubbed video seeks constantly, and a normal
export will stutter because its keyframes are too far apart. Re-encode with a
keyframe every few frames:

```bash
ffmpeg -i your-video.mov -an -vf "scale=1920:-2,fps=25" -c:v libx264 -crf 24 -g 5 -keyint_min 5 -sc_threshold 0 -movflags +faststart assets/hero.mp4
```

- `-g 5` is what makes scrubbing smooth — one keyframe every 5 frames.
- `-an` strips audio. The video is muted and decorative; audio is dead weight.
- Aim for **10–20 seconds** and **under ~8 MB**. The playhead is mapped across the
  whole argument, so a longer file does not buy you more; it just costs load time.
- Compose for a dark, low-contrast image. Copy sits directly on top of it, and a
  busy or bright clip will fight the text.

---

## How the motion is built

The page is a **filmic one-shot**: one fixed stage runs underneath the entire
document, four acts pin over it, and everything past the pricing section
deliberately stops moving.

There is exactly one `requestAnimationFrame` loop and one source of truth, so the
film, the acts, the orrery and the nav can never disagree about where the reader
is. A `scroll` listener backs it up, so a dropped frame can't leave the page
showing a stale state.

| Layer | What it does | Where to tune |
|---|---|---|
| Smoother | Wheel is lerped into real scroll position. Pointer devices only — touch and keyboard stay native. | `smooth.ease` in `motion.js` — currently `0.075`; lower is a longer glide |
| Nav | Hides on the way down, returns the moment you scroll up or come back near the top. | the `140` threshold in `driveNav` |
| Stage | Document progress drives the video playhead and the ground state (`--scene-dim`, `--scene-blur`, `--scene-scale`). | `.stage__*` in `styles.css` |
| Acts | Each act writes `--p` (0→1) onto itself as it travels through. | `data-scroll` on each `<section class="act">` |
| Orrery | Scroll rotates the orbits; each node opens at **its own angle, at its own size**. | `data-dock` / `data-size` per node, `ORBIT_TURNS` in `motion.js` |
| Peak | Act progress builds the lead journey one step at a time. | `SILENCE` / `SETTLE` in `motion.js` |
| Field | North stars behind the whole page — each drifts on its own clock and is carried further by scroll at its own depth, so it parallaxes rather than sliding as one sheet. | star count and `depth` in `initField` |
| Reveals | One-way `IntersectionObserver`. Siblings stagger via `--i`. | `.reveal` in `styles.css` |

### Act lengths

`data-scroll` is a multiple of viewport height:

| Act | Value | Why |
|---|---|---|
| Hero | 5.6 | Enough travel for the orbit to turn a full revolution and hold each card open long enough to read |
| **How it works** | **5** | The engineered peak — the diagram starts building after ~180px, not ~880px |
| Results | 2 | Graphics land by ~55% of the act, then it releases straight through |

Raise these to slow the page down, lower them to tighten it. Every other section
scrolls normally.

### Orbit calibration

`ORBIT_TURNS` (currently `1.05`) sets how many revolutions the outer track makes
across the hero act; `motion.js` derives the degrees-per-pixel rate from the
measured act height, so the turn count holds at any viewport size. Three nodes
120° apart means one turn is three cards. The inner track runs at 1.35× and
backwards, so **all six cards open** before the hero lets go.

`DOCK_WINDOW` (currently `60°`) is how far either side of its dock a card stays
open. At a 5.6-viewport hero act that works out to roughly **1,370px of scroll
per outer card and 1,015px per inner one** — raise `DOCK_WINDOW` to hold each one
longer, raise the act's `data-scroll` to slow the whole dial down.

Each node carries its own `data-dock` (the angle it opens at) and `data-size`
(`sm` / `md` / `lg`). Cards open at six different points around the dial, at
three different sizes, three to the left and three to the right — information
arrives and leaves all the way around rather than queueing in one spot.

### The signature move

The orrery no longer spins on a timer. Scroll turns it, and each node's card
opens only while that node passes the docking angle — stop scrolling and the
system stops with you. That interaction exists on this site and nowhere else.

### The peak

`#how` is the only moment given full weight: the longest pin and the darkest
ground. `SILENCE = 0.05` is a beat before the first mark, not a wait — the
diagram starts building almost immediately and all six steps are complete by
`SETTLE = 0.85`, leaving a short beat to read it before the act releases. The
diagram isn't shown, it's *built*, and the reader's own scroll is what builds it.

---

## Grounds

Three palettes over one layout, switchable from the swatches in the nav and
remembered in `localStorage` (applied before first paint, so a saved choice
never flashes).

| Ground | What it is |
|---|---|
| **Midnight** | The original — near-black with blue. |
| **Cobalt** | A cool blue gradient, well off black. Stars stay light. |
| **Daybreak** | A pale cool gradient. The field inverts to navy so the stars still read, and the brand mark gets a dark plate so the white half of it does not disappear. |

Every colour on the page resolves through channel tokens (`--accent-rgb`,
`--gray-rgb`, `--ice-rgb`, `--panel-rgb`, `--ground-rgb`, `--text-rgb`,
`--star-rgb`), so a ground is just a token override — there are no per-theme
component rules to keep in sync. The star field and the stand-in stage read
`--star-rgb` and `--stage-base` at runtime, once per ground change.

To ship a single ground, delete the `.themes` block from `index.html` and move
that ground's tokens onto `:root`.

---

## The interaction layer

Three places the reader can dig in. All three are keyboard-operable and work on
touch.

**Service cards → zoom sheet.** Click anywhere on a card. It opens a sheet that
scales up out of the card carrying four sections: where it starts, how it gets
built, what moves the price (drivers marked ↑ push a quote up, ↓ bring it down),
and a collapsed "the technical bit" naming the real stack. The deep copy lives in
the document — crawlable — and is *moved* into the sheet on open and put back on
close, so it can never fall out of sync. Escape closes, focus is trapped while
open, and focus returns to the card afterwards.

To edit a service, edit the `.deep` block inside its `<article class="card">`.

**Built for → example scenarios.** Each category expands to five concrete
problem-to-solution pairs under the heading "What this usually looks like" —
framed as typical cases, not delivered work, consistent with the page's stance on
invented proof. Every line carries its own icon (booking gets a calendar,
after-hours gets a moon, and so on), drawn from a sprite at the top of
`index.html` and referenced by `<use href="#ic-name">`.

The four categories are **independent switches** — opening one leaves the other
three exactly as they were.

**Lead journey → per-step detail.** Every step of the diagram has a transparent
hit target. Hover on a pointer, tap on touch, or Tab to it with a keyboard, and a
detail card opens below the diagram, aligned to the step you're on. It's anchored
to the section rather than the panel, so it can never be clipped.

---

## Accessibility and fallbacks

Verified as built, not assumed:

- **`prefers-reduced-motion`** — smoothing off, video scrubbing off, acts un-pin,
  every diagram renders complete. The page becomes a normal document.
- **No video file** — a generated stand-in stage renders instead. Verified: the
  only failing request is `hero.mp4`, and the page is fully functional without it.
- **Touch devices** — native scroll, no hijacking; video loops instead of
  scrubbing (iOS can't seek reliably under scroll).
- **Under 760px** — acts un-pin and the page flows normally. A 100vh frame can't
  hold this much copy on a phone, and forcing it is how scroll sites become
  unreadable.
- **A pin that doesn't fit** — `motion.js` measures each act against the viewport
  and drops the pin when the content is taller, so a short laptop or a zoomed
  browser can never clip content. Verified: zero clipped pins at 1440×900.
- **Keyboard** — anchors, focus states and tab order all work; the smoother yields
  scroll ownership the moment anything other than the wheel moves the page. Every
  journey step is tabbable, the sheet traps focus and restores it on close, and
  Escape closes the sheet.
- **Throttled frames** — nothing that controls visibility waits on
  `requestAnimationFrame`. A dropped or throttled frame can't leave the sheet
  present but invisible.
- **Nav clearance** — `--nav-h` is a real token, and every act frame pads past it
  in both pinned and un-pinned states, so nothing can slide under the bar.
- **Short laptops** — under 900px tall the hero, peak and results acts tighten
  their type and gaps so they still fit a pinned frame instead of dropping the
  pin. Verified pinning at 1440×820.

---

## Pricing ladder

| Tier | Build | Timeline | Monthly |
|---|---|---|---|
| Starter Presence | **$600** | 1–2 weeks | $30/mo maintained · $75/mo hosted |
| Working System | **$1,200** | 2–3 weeks | $60/mo maintained · $125/mo hosted |
| Operations Build | **$3,500** | 4–6 weeks | $90/mo maintained · $200/mo hosted |

**Maintained** means the system runs on the client's own accounts and you keep it
working. **Hosted** means it runs on your infrastructure and you own the uptime —
that is what the higher figure pays for.

Per service: landing pages $600, automations $1,200, chatbots $900, branding
$400, content systems $600, team training $250.

The monthly is **optional** and only applies when you keep running the system.
The website says so explicitly, which protects the "you own everything" promise
already in the billing section.

Website budget chips match the Notion intake options exactly — Around $500 /
$800 / $1.5k / Above $1.5k / Not sure yet — so a submission maps straight onto a
row without re-typing.

---

## Where the inquiry goes

Three constants at the bottom of `motion.js`:

```js
var CONTACT_EMAIL = 'northstarsolutions.work@gmail.com';
var FORM_ENDPOINT = '';   // paste your form endpoint here
var BOOKING_URL   = '';   // paste your Notion Form share link here
```

**With `FORM_ENDPOINT` empty** (today) the form opens a pre-filled email to
`CONTACT_EMAIL`. It works right now, but it depends on the visitor having a mail
client, so it is a stopgap.

**To make it post silently**, create a free form endpoint (Formspree or
Web3Forms both work with a plain JSON POST) and paste the URL in. If the POST
ever fails, the page falls back to the pre-filled email rather than showing a
success the submission never earned.

The form refuses to submit without an email or a phone number — it will not
pretend to have sent something that has no way back to you.

---

## The Notion consultation form

A **Consultation Requests** database now lives under your Northstar Solutions page,
with an interview template inside it.

**One step is left, and it must be done in the Notion UI:**

1. Open **Consultation Requests** → **+** next to the view tabs → **Form**.
2. Show only: Name, Email, Phone, Business, Preferred date, Budget, Service
   interest, What they want. Leave Status, Source, Submitted and Request ID off
   the form — those are yours.
3. **Share** → copy the form link → paste it into `BOOKING_URL` in `motion.js`.

> **Do not share the database page itself to the web.** A Form link shows the
> submitter only the empty form: they cannot see other entries, cannot browse
> your workspace, and cannot edit anything. Publishing the *database* page would
> expose every request you have ever received. This is why the footer booking
> link currently points at `#contact` rather than the database URL.

Open the **TEMPLATE — Consultation interview** row and use the ••• menu →
**Turn into template** so every new request opens with the call script inside.

---

## Choosing where the system lives

You asked which is better: host it yourself, or build on the client's systems.

**Default to building on their systems.** It costs you nothing in subscriptions,
carries no uptime liability, keeps their customer data off your infrastructure,
and it is the only option consistent with the "you own everything at the end"
promise already on your pricing page. You still charge the monthly — you are
selling attention, not servers, so $30/$60/$90 is close to pure margin.

**The trap to avoid:** paying a per-client Zapier or Make seat and charging
$30/mo for it. A Zapier paid seat is roughly $20–30/mo, so you would clear about
$5 for carrying responsibility when it breaks at 2am. That is a losing trade at
every volume.

**When a client genuinely will not manage accounts**, host them on a *single*
self-hosted n8n instance on one small VPS (roughly $6–12/mo total) with isolated
workflows per client. Your marginal cost for each additional client approaches
zero, which is the only way hosting stays profitable at these prices. Even then,
use **their** Anthropic/OpenAI and Twilio keys so token and telephony costs pass
through to them instead of eating your monthly.

**Both models are now priced on the site.** $30/$60/$90 maintained,
$75/$125/$200 hosted. The intake database captures **Hosting preference** and
**Monthly model** so the decision is recorded before you quote.

---

## Before launch

- `[YOUR PHONE]` — still a placeholder in the contact section and the footer.
  Email and booking are wired.
- `FORM_ENDPOINT` and `BOOKING_URL` — see above.
- **Client results** — the reserved section in `#about` is still a placeholder.
  Real testimonials drop straight into it.
