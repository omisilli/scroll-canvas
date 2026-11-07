# scroll-canvas

Scenes the way Apple's product pages make them: an image sequence drawn on
a canvas, frame by frame — with the scroll, forwards and back, or played
once by itself when it comes into view.
GSAP's ScrollTrigger pins the scene and drives it; this package is the
sequence's part: it loads the frames in a smart order, draws them sharp on
every screen, gives phones a lighter set, and rests on a still frame for
reduced motion. Titles, buttons, fades go on the same GSAP timeline.

> **Built for GSAP, and GSAP is not in this package — install it yourself.**
> `scrollCanvas()` takes the GSAP your site already has: one copy on the
> page. On a page with Lenis, connect the two with
> [gsap-connector](https://github.com/omisilli/gsap-connector) — this
> package relies on it, as every GSAP scroll effect here does.

```sh
npm install gsap
npm install github:omisilli/gsap-connector#v1.0.1
npm install github:omisilli/scroll-canvas#v1.1.0
```

```html
<section class="scene">
    <canvas aria-label="The sofa, taken apart and put together"></canvas>
    <h2 class="title">Every module, more possibilities</h2>
    <a class="btn" href="/products">Discover →</a>
</section>
```

```css
.scene {
    height: 100svh;
}
/* Phones get the phone set: fewer, smaller frames. */
@media (width < 48rem) {
    .scene canvas {
        --pg-scroll-canvas-set: phone;
    }
}
```

```ts
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { connectGsap } from "@plusguard/gsap-connector";
import { scrollCanvas } from "@plusguard/scroll-canvas";
import "@plusguard/scroll-canvas/index.css";

gsap.registerPlugin(ScrollTrigger);
connectGsap({ gsap, ScrollTrigger, lenis }); // lenis, or nothing without Lenis

const frames = {
    wide: { src: "/frames/wide/{0000}.webp", count: 256 }, // the first: the default
    phone: { src: "/frames/phone/{0000}.webp", count: 128 },
};

const tl = gsap.timeline({
    scrollTrigger: { trigger: ".scene", start: "top top", end: "+=500%", pin: true, scrub: 1 },
});
tl.add(scrollCanvas(document.querySelector(".scene canvas"), { gsap, frames }), 0) // the frames, start to end
    .from(".title", { opacity: 0, y: 30, duration: 0.1 }, 0.3)                    // a title at 30%
    .from(".btn", { opacity: 0, y: 40, duration: 0.1 }, 0.8);                     // a button at 80%
```

### Without a build step

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/omisilli/scroll-canvas@v1.1.0/index.css" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/ScrollTrigger.min.js"></script>
<script type="module">
    import { connectGsap } from "https://cdn.jsdelivr.net/gh/omisilli/gsap-connector@v1.0.1/dist/index.js";
    import { scrollCanvas } from "https://cdn.jsdelivr.net/gh/omisilli/scroll-canvas@v1.1.0/dist/index.js";
    …
</script>
```

Pin the versions on a live site. A pinned URL never changes; `@1` follows
the newest 1.x release.

## Why a canvas, not a video

The same scene can be a video whose time follows the scroll. We built that
first, and measured both on the same scene — Gaga Furniture's sofa coming
apart, 256 frames — in Chrome at 1440px on a Retina screen:

|                              | Video                                 | Canvas (image sequence)                     |
| ---------------------------- | ------------------------------------- | ------------------------------------------- |
| Showing one frame            | 5 ms on average, 13 ms at worst (a seek) | **0.1 ms** (a draw)                      |
| Frames missed, fast scrolling | none                                 | none                                        |
| Total size                   | 7.6 MB (one file)                     | **7.2 MB** wide (2176px), **1.2 MB** phone (half the width, every other frame) |

A video has to decode every frame it seeks to — fine on a desktop, but on
iOS and slower phones that is where the stutter comes from. A canvas only
draws a picture it already has: fifty times lighter, and the files came out
no larger.

|                  | Video                                         | Image sequence (Apple)                                  |
| ---------------- | --------------------------------------------- | ------------------------------------------------------- |
| Smoothness       | Good; seeking depends on the browser, may stutter on iOS | Flawless on every frame, every device: the frame is ready, only drawn |
| Picture quality  | Limited by the video's compression            | Every frame a full picture                              |
| Transparent background | Not in practice                         | Yes (WebP / PNG): the product can float over the page   |
| Encoding         | H.264 with a keyframe on **every** frame (`-g 1`) and `faststart` — otherwise scrolling back stutters, rebuilding from the last keyframe | None: every frame is a picture of its own. The source video only has to open in the browser — any codec, any keyframes |
| Size             | One file, small                               | Frames × picture size; heavier, many requests           |
| Preparing        | One ffmpeg line                               | Exporting the frames — from a 3D program, or from a video ([`tools/convert.html`](tools/convert.html)) |

## Why GSAP

The frames alone need no GSAP: a tall section, a sticky canvas and a few
lines that turn the scroll into a frame number would do it. We wrote it for
GSAP on purpose:

- **A scene is more than its frames.** A title that comes in at 30%, a
  button at 80%, a fade at the end, a caption that follows a part of the
  product — all on the same scroll. That is what GSAP's timeline is for:
  everything placed on one line, pinned, scrubbed, measured again when the
  page changes. A package that ran its own scroll would have to grow a
  second, smaller GSAP to do any of it.
- **One scroll engine on the page.** ScrollTrigger already drives every
  other scroll effect; a second engine beside it would measure the same page
  twice, and part ways with it.
- **Lenis is solved once.** gsap-connector runs Lenis on GSAP's clock and
  keeps ScrollTrigger measured; the sequence, as one more tween, is in step
  with no extra wiring.

So without GSAP it can be done — but it stays a picture that moves, and
every scene after it starts from nothing. GSAP and ScrollTrigger cost about
45 KB (compressed), once, for all of them.

## Two ways to play it

**With the scroll** — the sequence is one tween of a ScrollTrigger timeline,
as above: scroll down, it plays; scroll back, it plays backwards.

**Once, when it comes into view** — `play: true`. The way Apple's hero films
play: when half the canvas is on screen and every frame is in, the sequence
plays by itself, at 30 frames a second, and stops on its last frame. Put it
on a timeline of its own, and the titles on that timeline play with it — in
seconds now:

```ts
const tl = gsap.timeline();
tl.add(scrollCanvas(canvas, { gsap, frames, play: true }), 0) // 100 frames: 3.3 seconds
    .from(".title", { opacity: 0, y: 20, duration: 0.6 }, 2);  // the title at 2 s
```

scroll-canvas holds that timeline at its start, and plays it — or, if it
should not play, jumps it to its end: the last frame, the titles in.

| `play` option | Default                               | Meaning                                                   |
| ------------- | ------------------------------------- | --------------------------------------------------------- |
| `duration`    | the frames at 30 a second             | Seconds                                                   |
| `timeout`     | `5000`                                | Milliseconds after it came into view to give up waiting for the frames — and show the still frame instead |
| `visible`     | `0.5`                                 | How much of the canvas is on screen before it plays       |

Apple's Mac mini page does the same with a video: it plays once, unless it
has not loaded within five seconds or reduced motion is asked for — then a
still picture takes its place.

## Resting on one frame

Sometimes the scene should not move — and show one frame instead, `still`
(0 to 1: default `0`, the first; with `play`, `1`, the last):

- **Reduced motion** asked for by the visitor.
- **`--pg-scroll-canvas-motion: none`** — your CSS, per screen size or per
  pixel density, in a media query:

  ```css
  /* Only on wide Retina screens; a still frame everywhere else. */
  @media (width < 64rem), (resolution < 2x) {
      .hero canvas {
          --pg-scroll-canvas-motion: none;
      }
  }
  ```

- **`play`, timed out** — the frames did not come in time.

The canvas then carries `data-pg-scroll-canvas-still="true"`. The still
frame is drawn on it; a picture of your own can take its place instead:

```html
<div class="hero">
    <canvas></canvas>
    <img class="picture" src="/hero-still.webp" alt="…" />
</div>
```

```css
.hero .picture {
    display: none;
}
.hero:has(canvas[data-pg-scroll-canvas-still="true"]) .picture {
    display: block;
}
```

Apple picks by screen too: one file for small screens, another for large,
a sharper one for Retina. Here that is the frame sets
(`--pg-scroll-canvas-set`) — and whether it moves at all,
`--pg-scroll-canvas-motion`.

## What it does

`scrollCanvas(canvas, options)` returns a tween of one second (ease `none`)
that runs the sequence from its first frame to its last. Put it on a
timeline — its one second is the timeline's whole length, so the other
tweens' positions read as fractions — or give it a ScrollTrigger of its own:

```ts
scrollCanvas(canvas, { gsap, frames, scrollTrigger: { trigger: ".scene", pin: true, scrub: 1, end: "+=400%" } });
```

- **Frame sets.** `frames` names one or more sets, `{ src, count, start? }`.
  `src` holds the frame number in braces, padded to their length —
  `"{0000}"` gives `0000`, `0001`, … — and `start` is the first number
  (default `0`). The first set is the default; which one a screen uses is
  CSS, `--pg-scroll-canvas-set: <name>` in a media query — so the screen
  size stays in CSS, and a phone downloads only its own.
- **Loads in a smart order.** The first frame at once. The rest once the
  canvas is within two screens: first a frame here and there across the
  whole sequence, then the gaps between, a few at a time. On a slow
  connection (8 Mbit/s) every eighth of the sequence had frames after three
  seconds — an early fast scroll still moves the scene, coarsely, and fills
  in. A frame not there yet is stood in for by the nearest one that is.
- **Sharp on every screen.** The canvas is its box × the pixel density (up
  to 2), redrawn when its size changes.
- **Fit.** `--pg-scroll-canvas-fit: cover` (default) fills the box and cuts
  the rest, as `object-fit: cover`; `contain` shows the whole frame — for
  frames on a transparent background, floating over the page.
- **Resting on one frame** with reduced motion, `--pg-scroll-canvas-motion:
  none`, or `play` timed out — see above.
- **States, for your CSS.** On the canvas: `data-pg-scroll-canvas`
  `"loading"`, `"ready"` (a frame is drawn), `"complete"` (every frame is
  in); `data-pg-scroll-canvas-still` `"true"` while resting on one frame;
  with `play`, `data-pg-scroll-canvas-play` `"waiting"`, `"playing"`,
  `"played"`.

| Option   | Default | Meaning                                                      |
| -------- | ------- | ------------------------------------------------------------ |
| `gsap`   | —       | Your GSAP. Required                                          |
| `frames` | —       | The frame sets, by name. Required                            |
| `still`  | `0` (`1` with `play`) | The frame to rest on, `0` to `1` — see "Resting on one frame" |
| `play`   | —       | `true`, or `{ duration, timeout, visible }`: play once when it comes into view |
| anything else | —  | Handed to `gsap.to` — `scrollTrigger`, `onUpdate`, …         |

| CSS variable              | Default        | Meaning                                       |
| ------------------------- | -------------- | --------------------------------------------- |
| `--pg-scroll-canvas-set`  | the first set  | Which set this screen uses, by name           |
| `--pg-scroll-canvas-fit`  | `cover`        | `cover` or `contain`                          |
| `--pg-scroll-canvas-motion` | `auto`       | `none`: rest on the still frame               |

`releaseScrollCanvas(canvas)` lets a canvas go: its observers off, its
frames dropped. Calling `scrollCanvas` again on the same canvas does it
first.

## Making the frames

**From a video: [`tools/convert.html`](tools/convert.html).** Open it by
double-clicking, drop the video: it reads how many frames it has, takes
every one, and saves them as WebP — once at full width for wide screens,
once at half the width and every other frame for phones (both can be
changed). Out comes one zip: `wide/`, `phone/` and `frames.js`, the
`frames` setting to paste. Nothing is uploaded: it all happens in the
browser.

**With ffmpeg,** if you prefer (`brew install ffmpeg` on a Mac):

```sh
mkdir -p wide phone
ffmpeg -i video.mp4 -vf "scale=2176:-2" -c:v libwebp -quality 80 -start_number 0 wide/%04d.webp
ffmpeg -i video.mp4 -vf "select=not(mod(n\,2)),scale=1088:-2" -vsync vfr -c:v libwebp -quality 80 -start_number 0 phone/%04d.webp
```

**From a 3D program** — the best of all: render the frames straight out,
as PNG or WebP with a transparent background, and use
`--pg-scroll-canvas-fit: contain`: the product floats over the page instead
of sitting in a white box.

- **Width.** A wide screen at 1440px on a Retina display is 2880 pixels
  across; frames of 1600–2200px look sharp, wider ones only weigh more. For
  phones, half that.
- **How many.** Smoothness is frames per screen of scrolling: 256 frames
  over five screens is about 50 a screen — smooth. Fewer frames, a shorter
  scroll (`end: "+=300%"`).
- **Memory.** Every frame in memory is its width × height × 4 bytes once
  decoded — which is why phones get half the width and half the frames: a
  quarter of the pixels, half as many pictures.
- **Quality 0.75–0.85** is the right range for WebP; a white or plain
  background compresses to very little.

## React (Next)

```tsx
useGSAP(
    () => {
        const c = canvas.current!;
        const tl = gsap.timeline({ scrollTrigger: { trigger: scene.current, pin: true, scrub: 1, end: "+=500%" } });
        tl.add(scrollCanvas(c, { gsap, frames }), 0).from(".title", { opacity: 0 }, 0.3);
        return () => releaseScrollCanvas(c);
    },
    { scope: scene },
);
```

Keep `frames` outside the component, so it is the same object on every
render. useGSAP reverts the timeline and its ScrollTrigger on unmount; the
returned function lets the canvas go. With Lenis, mount gsap-connector's
`GsapConnector` once in the root layout. See
[`examples/react/Example.tsx`](examples/react/Example.tsx).

## Alongside

- **Lenis** — through gsap-connector, nothing else. Do not create a second
  Lenis for the scene.
- **The PlusGuard scrollbar** — the pin adds the scene's length to the page;
  gsap-connector refreshes ScrollTrigger, the scrollbar watches the page's
  size: both follow.
- **Not ScrollSmoother** — see gsap-connector.

## Example

[`examples/static/index.html`](examples/static/index.html) — open it by
double-clicking. Gaga Furniture's "Yan Yana" sofa (used with permission):
256 frames for wide screens, 128 for phones. Switches for Lenis (with
gsap-connector), the frame set (by screen, or either one), `cover` against
`contain`, `scrub: 1` against `scrub: true`, and the title and button on
the timeline against the frames alone; a panel shows the set, how many
frames are in, the state, and the frame. Below it, two scenes that play
once when they come into view: one always, one only on a wide Retina
screen — a picture elsewhere — with switches for playing and resting. To
see one give up waiting, slow the network in the browser's tools and
reload.

## From the old Gaga page

The scene was a video there:

| Before                                                         | Now                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------ |
| A video, its time set on every scroll — a decode per frame     | Pictures already decoded, only drawn                   |
| A second `new Lenis` and its own loop, beside the site's       | The site's one Lenis, through gsap-connector           |
| `unpkg.com/gsap@3` — whatever 3.x is newest                    | The site's own GSAP, pinned                            |
| `setInterval` every 500 ms until the video is ready            | The first frame at once, the rest in order             |
| The same 2176px file for desktop and phone                     | A phone set: half the width, half the frames           |
| play/pause on the first touch, to wake the video on iOS        | Not needed: no video                                   |
