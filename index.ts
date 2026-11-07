/*
 * scroll-canvas — an image sequence drawn on a canvas, frame by frame: the
 * scenes of Apple's product pages. Driven by your own GSAP, so titles and
 * buttons go on the same timeline.
 *
 * Two ways to play it:
 *
 *   With the scroll — the sequence is a tween of one second; put it on a
 *   ScrollTrigger timeline and the scroll runs it, forwards and back:
 *
 *     const tl = gsap.timeline({ scrollTrigger: { trigger: section, pin: true, scrub: lenis ? true : 1, end: "+=500%" } });
 *     tl.add(scrollCanvas(canvas, { gsap, frames }), 0).from(".title", { opacity: 0 }, 0.3);
 *
 *   One smoothing: with Lenis, scrub: true — Lenis already glides; without
 *   it, a number (scrub: 1) smooths the scroll.
 *
 *   Once, when it comes into view — play: true. The sequence plays by
 *   itself at its own pace (30 frames a second unless play.duration says
 *   otherwise) once every frame is in and half the canvas is on screen. Put
 *   it on a timeline of its own and that timeline plays with it:
 *
 *     const tl = gsap.timeline();
 *     tl.add(scrollCanvas(canvas, { gsap, frames, play: true }), 0).from(".title", { opacity: 0 }, 2);
 *
 *   Frames not in within play.timeout (5000 ms) after it came into view: it
 *   does not play — it shows the still frame, and the timeline its end.
 *
 * GSAP is not included: pass the site's own, so the page has one copy — and
 * on a page with Lenis, connect them with gsap-connector.
 *
 * frames: named sets, each { src, count, start? }. src holds the frame
 * number in braces, padded to their length: "{0000}" → 0000, 0001, …;
 * start is the first number (default 0). The first set is the default;
 * which one a screen uses is CSS — --pg-scroll-canvas-set: <name>, in a
 * media query — so a phone gets fewer, smaller frames.
 *
 * Resting on one frame — still, 0 to 1 (default 0; with play, 1, the end):
 *   - reduced motion asked for;
 *   - --pg-scroll-canvas-motion: none, in CSS — per screen size, or per
 *     pixel density: @media (resolution < 2x) { … };
 *   - play, timed out.
 * data-pg-scroll-canvas-still="true" on the canvas then, for a picture of
 * your own to take its place if you like.
 *
 * What it does besides:
 *   - Loads in a smart order: the still or first frame at once, the rest
 *     once the canvas is near the screen — first a frame here and there
 *     across the whole sequence, then the gaps between — a few at a time. A
 *     frame not there yet is stood in for by the nearest one that is.
 *   - Sharp on every screen: the canvas is its box × the pixel density
 *     (up to 2), redrawn when its size changes.
 *   - --pg-scroll-canvas-fit: cover (default) fills the box and cuts the
 *     rest, contain shows it all — for frames on a transparent background.
 *   - States on the canvas: data-pg-scroll-canvas "loading", "ready" (a
 *     frame is drawn), "complete" (every frame is in); with play,
 *     data-pg-scroll-canvas-play "waiting", "playing", "played".
 *
 * React: call it inside useGSAP and return releaseScrollCanvas(canvas) as
 * the cleanup — observers off, the frames let go.
 */

type Vars = { [key: string]: unknown };

export type GsapLike<T> = { to(target: object, vars: Vars): T };

export type FrameSet = {
    /* The frame's address, its number in braces: "/frames/{0000}.webp". */
    src: string;
    count: number;
    /* The first frame's number. Default 0. */
    start?: number;
};

export type PlayOptions = {
    /* Seconds. Default: the first set's frames at 30 a second. */
    duration?: number;
    /* Milliseconds from coming into view to give up and show the still frame. Default 5000. */
    timeout?: number;
    /* How much of the canvas is on screen before it plays, 0 to 1. Default 0.5. */
    visible?: number;
};

export type ScrollCanvasOptions<T> = Vars & {
    gsap: GsapLike<T>;
    frames: { [name: string]: FrameSet };
    /* The frame to rest on, 0 (first) to 1 (last). Default 0; with play, 1. */
    still?: number;
    /* Play once, by itself, when it comes into view — instead of with the scroll. */
    play?: boolean | PlayOptions;
};

/* What is used of a GSAP tween or timeline. */
type Anim = {
    parent?: Anim | null;
    pause(at?: number): unknown;
    play(from?: number): unknown;
    progress(value: number): unknown;
};

const STATE = "data-pg-scroll-canvas";
const STILL = "data-pg-scroll-canvas-still";
const PLAY = "data-pg-scroll-canvas-play";
const PARALLEL = 6;
const MAX_DENSITY = 2;
const FPS = 30;

type Live = { release: () => void };
const live = new WeakMap<HTMLCanvasElement, Live>();

/* Let go of a canvas: observers off, its frames dropped. */
export function releaseScrollCanvas(canvas: HTMLCanvasElement): void {
    live.get(canvas)?.release();
}

/* "/f/{0000}.webp", 7 → "/f/0007.webp" */
function address(src: string, n: number): string {
    return src.replace(/\{(0*)\}/, (_, zeros: string) => String(n).padStart(zeros.length || 1, "0"));
}

/* The order to load in: both ends, then halving the gaps — a frame here and
   there across the sequence first, so an early fast scroll still moves. */
function order(count: number): number[] {
    const out: number[] = [];
    const seen = new Uint8Array(count);
    const add = (i: number) => {
        if (i >= 0 && i < count && !seen[i]) {
            seen[i] = 1;
            out.push(i);
        }
    };
    add(0);
    add(count - 1);
    for (let step = 2 ** Math.ceil(Math.log2(Math.max(1, count))); step >= 1; step /= 2) {
        for (let i = 0; i < count; i += step) add(i);
    }
    return out;
}

export function scrollCanvas<T>(canvas: HTMLCanvasElement, options: ScrollCanvasOptions<T>): T {
    const { gsap, frames, still, play, onUpdate, onComplete, ...vars } = options;
    releaseScrollCanvas(canvas);

    const names = Object.keys(frames);
    const ctx = canvas.getContext("2d");
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const once: Required<PlayOptions> | null = play
        ? {
              duration: frames[names[0]].count / FPS,
              timeout: 5000,
              visible: 0.5,
              ...(typeof play === "object" ? play : {}),
          }
        : null;
    const stillAt = clamp(still ?? (once ? 1 : 0));

    let progress = 0;
    let released = false;
    let near = false;
    let timedOut = false;

    // The set in use, and its frames.
    let name = "";
    let set: FrameSet = frames[names[0]];
    let images: (HTMLImageElement | null)[] = [];
    let ready = new Uint8Array(0);
    let queue: number[] = [];
    let pending: number[] = [];
    let busy = 0;
    let loadedCount = 0;
    let drawnIndex = -1;

    const css = (prop: string) => getComputedStyle(canvas).getPropertyValue(prop).trim();
    const attr = (name: string, value: string) => {
        if (canvas.getAttribute(name) !== value) canvas.setAttribute(name, value);
    };

    // Resting on the still frame: reduced motion, CSS saying none, or timed out.
    const resting = () => reduced || timedOut || css("--pg-scroll-canvas-motion") === "none";
    const shown = () => (resting() ? stillAt : progress);

    // The nearest frame that is in, to stand in for one that is not yet.
    const nearest = (i: number): number => {
        for (let d = 0; d < set.count; d++) {
            if (i - d >= 0 && ready[i - d]) return i - d;
            if (i + d < set.count && ready[i + d]) return i + d;
        }
        return -1;
    };

    const draw = (force = false): void => {
        if (released || !ctx || !set) return;
        const i = nearest(Math.round(shown() * (set.count - 1)));
        if (i < 0 || (i === drawnIndex && !force)) return;
        const img = images[i];
        if (!img) return;
        const fit = css("--pg-scroll-canvas-fit") === "contain" ? Math.min : Math.max;
        const s = fit(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
        const w = img.naturalWidth * s;
        const h = img.naturalHeight * s;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
        drawnIndex = i;
        if (loadedCount < set.count) attr(STATE, "ready");
    };

    // A few at a time, in the order above; each decoded before it counts.
    const pump = (): void => {
        while (!released && busy < PARALLEL && queue.length) {
            const i = queue.shift() as number;
            const img = new Image();
            img.decoding = "async";
            img.src = address(set.src, (set.start ?? 0) + i);
            images[i] = img;
            busy++;
            const mine = set;
            img.decode()
                .then(() => {
                    if (released || mine !== set) return;
                    ready[i] = 1;
                    loadedCount++;
                    if (loadedCount === set.count) {
                        attr(STATE, "complete");
                        start();
                    }
                    draw();
                })
                .catch(() => {})
                .finally(() => {
                    // A frame of a set no longer in use does not count.
                    if (mine !== set) return;
                    busy--;
                    pump();
                });
        }
    };

    // Which set this screen uses — CSS decides; load it if it changed.
    const choose = (): void => {
        const wanted = css("--pg-scroll-canvas-set");
        const next = names.includes(wanted) ? wanted : names[0];
        if (next === name) return;
        name = next;
        set = frames[name];
        images = new Array(set.count).fill(null);
        ready = new Uint8Array(set.count);
        loadedCount = 0;
        drawnIndex = -1;
        busy = 0;
        attr(STATE, "loading");
        // The frame shown now at once; the rest when near.
        const first = Math.round(shown() * (set.count - 1));
        queue = [first];
        const rest = order(set.count).filter((i) => i !== first);
        if (near) queue.push(...rest);
        else pending = rest;
        pump();
    };

    // The canvas in device pixels: its box × the density, capped at 2.
    const size = (): void => {
        const density = Math.min(MAX_DENSITY, devicePixelRatio || 1);
        const w = Math.round(canvas.clientWidth * density);
        const h = Math.round(canvas.clientHeight * density);
        if (w && h && (canvas.width !== w || canvas.height !== h)) {
            canvas.width = w;
            canvas.height = h;
        }
        choose();
        attr(STILL, String(resting()));
        draw(true);
    };

    // What the scroll — or play — moves: a plain number, 0 to 1. The frame follows it.
    const value = { value: 0 };
    const anim = gsap.to(value, {
        ...vars,
        value: 1,
        duration: once ? once.duration : 1,
        ease: "none",
        onUpdate(this: unknown, ...args: unknown[]) {
            progress = value.value;
            draw();
            if (typeof onUpdate === "function") onUpdate.apply(this, args);
        },
        onComplete(this: unknown, ...args: unknown[]) {
            if (once) attr(PLAY, "played");
            if (typeof onComplete === "function") onComplete.apply(this, args);
        },
    });

    // ---- Play once ----
    // What plays: the timeline the tween was put on (its outermost one), or
    // the tween itself. Known a moment later, once tl.add() has run — and
    // stopped at its start then, before GSAP has drawn a single frame. (Not
    // created paused: a timeline leaves a paused tween out of its length.)
    const self = anim as unknown as Anim;
    let player: Anim = self;
    let seen = false;
    let begun = false;
    let timer = 0;

    const start = (): void => {
        if (!once || !seen || begun || timedOut || released) return;
        if (resting()) return rest();
        if (loadedCount < set.count) return;
        begun = true;
        clearTimeout(timer);
        attr(PLAY, "playing");
        player.play(0);
    };
    // Not playing: the still frame, and the timeline at its end — titles in.
    const rest = (): void => {
        begun = true;
        clearTimeout(timer);
        attr(STILL, "true");
        attr(PLAY, "played");
        player.progress(1);
        player.pause();
        draw(true);
    };

    let watch: IntersectionObserver | null = null;
    if (once) {
        attr(PLAY, "waiting");
        queueMicrotask(() => {
            let top = self;
            while (top.parent && top.parent.parent) top = top.parent;
            player = top;
            if (!begun) top.pause(0);
        });
        watch = new IntersectionObserver(
            (entries) => {
                const on = entries.some((e) => e.isIntersecting && e.intersectionRatio >= once.visible);
                if (!on || seen) return;
                seen = true;
                watch?.disconnect();
                timer = window.setTimeout(() => {
                    if (begun) return;
                    timedOut = true;
                    rest();
                }, once.timeout);
                start();
            },
            { threshold: [once.visible] },
        );
        watch.observe(canvas);
    }

    // ---- Observers ----
    const resize = new ResizeObserver(size);
    resize.observe(canvas);
    // The rest of the frames once the canvas is within two screens.
    const io = new IntersectionObserver(
        (entries) => {
            if (!entries.some((e) => e.isIntersecting) || near) return;
            near = true;
            queue.push(...pending);
            pending = [];
            pump();
        },
        { rootMargin: "200% 0px" },
    );
    io.observe(canvas);
    size();

    live.set(canvas, {
        release: () => {
            released = true;
            clearTimeout(timer);
            resize.disconnect();
            io.disconnect();
            watch?.disconnect();
            queue = [];
            pending = [];
            images.forEach((img) => img && (img.src = ""));
            images = [];
            live.delete(canvas);
        },
    });

    return anim;
}
