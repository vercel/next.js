import { SatoriOptions } from "next/dist/compiled/@vercel/og/satori";
import { OutgoingHttpHeader } from 'http';

declare const apis: {
    twemoji: (code: any) => string;
    openmoji: string;
    blobmoji: string;
    noto: string;
    fluent: (code: any) => string;
    fluentFlat: (code: any) => string;
};
type EmojiType = keyof typeof apis;

type ImageOptions = {
    /**
     * The width of the image.
     *
     * @type {number}
     * @default 1200
     */
    width?: number;
    /**
     * The height of the image.
     *
     * @type {number}
     * @default 630
     */
    height?: number;
    /**
     * Display debug information on the image.
     *
     * @type {boolean}
     * @default false
     */
    debug?: boolean;
    /**
     * A list of fonts to use.
     *
     * @type {{ data: ArrayBuffer; name: string; weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900; style?: 'normal' | 'italic' }[]}
     * @default Noto Sans Latin Regular.
     */
    fonts?: SatoriOptions['fonts'];
    /**
     * Using a specific Emoji style. Defaults to `twemoji`.
     *
     * @type {EmojiType}
     * @default 'twemoji'
     */
    emoji?: EmojiType;
};
type ImageResponseNodeOptions = ImageOptions & {
    status?: number;
    statusText?: string;
    headers?: OutgoingHttpHeader[];
};
type ImageResponseOptions = ImageOptions & ConstructorParameters<typeof Response>[1];
declare module 'react' {
    interface HTMLAttributes<T> {
        /**
         * Specify styles using Tailwind CSS classes. This feature is currently experimental.
         * If `style` prop is also specified, styles generated with `tw` prop will be overridden.
         *
         * Example:
         * - `tw='w-full h-full bg-blue-200'`
         * - `tw='text-9xl'`
         * - `tw='text-[80px]'`
         *
         * @type {string}
         */
        tw?: string;
    }
}

export { ImageResponseOptions as I, ImageResponseNodeOptions as a };
