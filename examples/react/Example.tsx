"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { scrollCanvas, releaseScrollCanvas } from "@plusguard/scroll-canvas";
import "@plusguard/scroll-canvas/index.css";

/*
 * Next (App Router). GSAP is the site's own — npm install gsap @gsap/react —
 * registered once. With Lenis, mount gsap-connector's GsapConnector once in
 * the root layout (see its example): ScrollTrigger then moves with Lenis.
 */
gsap.registerPlugin(ScrollTrigger, useGSAP);

/*
 * The frames live in public/frames: made from a video with tools/convert.html
 * (or exported from a 3D program). Two sets — the first is the default; the
 * phone one where the CSS says so:
 *
 *   @media (width < 48rem) { .scene canvas { --pg-scroll-canvas-set: phone; } }
 *
 * Outside the component: the same object on every render.
 */
const frames = {
    wide: { src: "/frames/wide/{0000}.webp", count: 256 },
    phone: { src: "/frames/phone/{0000}.webp", count: 128 },
};

/*
 * A scene pinned for five screens of scrolling: the frames play through the
 * whole timeline, a title comes in at 30%, a button at 80%.
 *
 * useGSAP reverts the timeline and its ScrollTrigger on unmount; the
 * returned function lets scroll-canvas go too — its observers, its frames.
 */
export function ScrollCanvasScene() {
    const scene = useRef<HTMLElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);

    useGSAP(
        () => {
            const c = canvas.current;
            if (!c) return;
            const tl = gsap.timeline({
                scrollTrigger: { trigger: scene.current, start: "top top", end: "+=500%", pin: true, scrub: 1 },
            });
            tl.add(scrollCanvas(c, { gsap, frames }), 0)
                .from(".title", { opacity: 0, y: 30, duration: 0.1 }, 0.3)
                .from(".btn", { opacity: 0, y: 40, duration: 0.1 }, 0.8);
            return () => releaseScrollCanvas(c);
        },
        { scope: scene },
    );

    return (
        <section ref={scene} className="scene" style={{ position: "relative", height: "100svh", overflow: "hidden" }}>
            <canvas ref={canvas} aria-label="The product, taken apart and put together" />
            <p className="title" style={{ position: "absolute", top: "10%", width: "100%", textAlign: "center" }}>
                Every module, more possibilities
            </p>
            <a className="btn" href="/products" style={{ position: "absolute", bottom: "8%", left: "50%", translate: "-50% 0" }}>
                Discover the product →
            </a>
        </section>
    );
}

/*
 * Played once, when it comes into view: play: true. When half the canvas is
 * on screen and every frame is in, it plays by itself — at 30 frames a
 * second, or play.duration — and stops on its last frame. Its timeline is
 * its own, so the caption on it is in seconds.
 *
 * Not on every screen: the CSS below rests it on its still frame on phones
 * and screens that are not Retina, and data-pg-scroll-canvas-still lets a
 * picture of its own take its place:
 *
 *   @media (width < 64rem), (resolution < 2x) { .hero canvas { --pg-scroll-canvas-motion: none; } }
 *   .hero .picture { display: none; }
 *   .hero:has(canvas[data-pg-scroll-canvas-still="true"]) .picture { display: block; }
 *
 * Nor when the frames are late: not in within 5 seconds of coming into view,
 * it rests on the last frame with the caption in.
 */
export function PlayOnce() {
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);

    useGSAP(
        () => {
            const c = canvas.current;
            if (!c) return;
            const tl = gsap.timeline();
            tl.add(scrollCanvas(c, { gsap, frames, play: true }), 0).from(
                ".caption",
                { opacity: 0, y: 20, duration: 0.6 },
                3,
            );
            return () => releaseScrollCanvas(c);
        },
        { scope: box },
    );

    return (
        <div ref={box} className="hero" style={{ position: "relative", aspectRatio: "16 / 9" }}>
            <canvas ref={canvas} aria-label="The product, put together" />
            <img className="picture" src="/frames/wide/0255.webp" alt="The product, put together" />
            <p className="caption" style={{ position: "absolute", bottom: "6%", width: "100%", textAlign: "center" }}>
                Put together in seconds
            </p>
        </div>
    );
}
