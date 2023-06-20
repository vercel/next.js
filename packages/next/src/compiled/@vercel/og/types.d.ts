/// <reference types="node" />
import type { SatoriOptions } from "next/dist/compiled/@vercel/og/satori";
import type { EmojiType } from './emoji';
import type { OutgoingHttpHeader } from 'http';
declare type ImageOptions = {
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
     * @link https://github.com/vercel/og#emoji
     * @type {EmojiType}
     * @default 'twemoji'
     */
    emoji?: EmojiType;
};
export declare type ImageResponseNodeOptions = ImageOptions & {
    status?: number;
    statusText?: string;
    headers?: OutgoingHttpHeader[];
};
export declare type ImageResponseOptions = ImageOptions & ConstructorParameters<typeof Response>[1];
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
export {};
