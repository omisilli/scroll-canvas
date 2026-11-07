/*
 * scroll-canvas — an image sequence drawn on a canvas, frame by frame, as the
 * page scrolls: the scroll scenes of Apple's product pages. Driven by your
 * own GSAP, so titles and buttons go on the same timeline.
 *
 *   const tl = gsap.timeline({ scrollTrigger: { trigger: section, pin: true, scrub: 1, end: "+=500%" } });
 *   tl.add(scrollCanvas(canvas, { gsap, frames: { wide: { src: "/f/wide/{0000}.webp", count: 256 } } }), 0)
 *     .from(".title", { opacity: 0 }, 0.3);   // a title at 30%
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
 * scrollCanvas() returns a tween of one second (ease "none") that runs the
 * sequence from its first frame to its last; put it on a timeline, or give
 * it a scrollTrigger of its own.
 *
 * What it does besides:
 *   - Loads in a smart order: the first frame at once, the rest once the
 *     canvas is near the screen — first a frame here and there across the
 *     whole sequence, then the gaps between — a few at a time. A frame not
 *     there yet is stood in for by the nearest one that is.
 *   - Sharp on every screen: the canvas is its box × the pixel density
 *     (up to 2), redrawn when its size changes.
 *   - --pg-scroll-canvas-fit: cover (default) fills the box and cuts the
 *     rest, contain shows it all — for frames on a transparent background.
 *   - Reduced motion: it rests on one frame (still, 0–1, default 0).
 *   - data-pg-scroll-canvas on the canvas: "loading", "ready" (a frame is
 *     drawn), "complete" (every frame is in).
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

export type ScrollCanvasOptions<T> = Vars & {
    gsap: GsapLike<T>;
    frames: { [name: string]: FrameSet };
    /* With reduced motion: the frame to rest on, 0 (first) to 1 (last). */
    still?: number;
};

const STATE = "data-pg-scroll-canvas";
const PARALLEL = 6;
const MAX_DENSITY = 2;

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
    const { gsap, frames, still = 0, onUpdate, ...vars } = options;
    releaseScrollCanvas(canvas);

    const names = Object.keys(frames);
    const ctx = canvas.getContext("2d");
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const clamp = (n: number) => Math.min(1, Math.max(0, n));

    let progress = reduced ? clamp(still) : 0;
    let released = false;
    let near = false;

    // The set in use, and its frames.
    let name = "";
    let set: FrameSet = frames[names[0]];
    let images: (HTMLImageElement | null)[] = [];
    let ready = new Uint8Array(0);
    let queue: number[] = [];
    let busy = 0;
    let loadedCount = 0;
    let drawnIndex = -1;

    const css = (prop: string) => getComputedStyle(canvas).getPropertyValue(prop).trim();
    const state = (value: string) => {
        if (canvas.getAttribute(STATE) !== value) canvas.setAttribute(STATE, value);
    };

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
        const want = Math.round(progress * (set.count - 1));
        const i = nearest(want);
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
        if (loadedCount < set.count) state("ready");
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
                    if (loadedCount === set.count) state("complete");
                    // Draw if this frame is closer to the wanted one than the drawn one.
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
        state("loading");
        // The first frame — or the still one — at once; the rest when near.
        const first = Math.round(progress * (set.count - 1));
        queue = [first];
        const rest = order(set.count).filter((i) => i !== first);
        if (near) queue.push(...rest);
        else pending = rest;
        pump();
    };
    let pending: number[] = [];

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
        draw(true);
    };

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
            resize.disconnect();
            io.disconnect();
            queue = [];
            pending = [];
            images.forEach((img) => img && (img.src = ""));
            images = [];
            live.delete(canvas);
        },
    });

    // What the scroll moves: a plain number, 0 to 1. The frame follows it.
    const tween = { value: progress };
    return gsap.to(tween, {
        ...vars,
        value: 1,
        duration: 1,
        ease: "none",
        onUpdate(this: unknown, ...args: unknown[]) {
            if (!reduced) {
                progress = tween.value;
                draw();
            }
            if (typeof onUpdate === "function") onUpdate.apply(this, args);
        },
    });
}
