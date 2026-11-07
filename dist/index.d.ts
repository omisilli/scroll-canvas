type Vars = {
    [key: string]: unknown;
};
export type GsapLike<T> = {
    to(target: object, vars: Vars): T;
};
export type FrameSet = {
    src: string;
    count: number;
    start?: number;
};
export type PlayOptions = {
    duration?: number;
    timeout?: number;
    visible?: number;
};
export type ScrollCanvasOptions<T> = Vars & {
    gsap: GsapLike<T>;
    frames: {
        [name: string]: FrameSet;
    };
    still?: number;
    play?: boolean | PlayOptions;
};
export declare function releaseScrollCanvas(canvas: HTMLCanvasElement): void;
export declare function scrollCanvas<T>(canvas: HTMLCanvasElement, options: ScrollCanvasOptions<T>): T;
export {};
