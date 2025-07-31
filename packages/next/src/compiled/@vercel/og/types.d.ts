/// <reference types="node" />
/// <reference types="react" />
/// <reference types="node" />
/// <reference types="node" />
import type { SatoriOptions } from "next/dist/compiled/@vercel/og/satori";
import type { EmojiType } from './emoji';
import type { OutgoingHttpHeader } from 'http';
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
export type ImageResponseNodeOptions = ImageOptions & {
    status?: number;
    statusText?: string;
    headers?: OutgoingHttpHeader[];
};
export type ImageResponseOptions = ImageOptions & ConstructorParameters<typeof Response>[1];
export interface FigmaImageResponseProps {
    /**
     * Link to the Figma template frame.
     *
     * You can get the URL in Figma by right-clicking a frame and selecting "Copy link".
     * @example https://www.figma.com/file/QjGNQixWnhu300e1Xzdl2y/OG-Images?type=design&node-id=11356-2443&mode=design&t=yLROd7ro8mP1PxMY-4
     */
    url: string;
    /**
     * A mapping between Figma layer name and the value you want to replace it with.
     *
     * @example Sets Figma text layer named "Title" to "How to create OG Images"
     * ```js
     *  { "Title": "How to create OG Images" }
     * ```
     *
     * @example Sets multiple Figma text layers and provides custom styles
     * ```js
     * {
     *   "Title": { value: "How to create OG Images", props: { color: "red", centerHorizontally: true } },
     *   "Description": { value: "A short story", props: { centerHorizontally: true } },
     * }
     * ```
     *
     * `centerHorizontally` centers text layer horizontally.
     */
    template: Record<string, FigmaComplexTemplate | string>;
    /**
     * The font names must match the font names in Figma.
     */
    fonts?: FontOptions[];
    /**
     * The same as {@link ImageResponseOptions} except `width` and `height`. `width` and `height` are automatically set from the Figma frame's size.
     */
    imageResponseOptions?: Omit<ImageResponseOptions, 'width' | 'height'>;
}
export interface FigmaComplexTemplate {
    value: string;
    props?: {
        centerHorizontally?: boolean;
    } & React.CSSProperties;
}
type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
type Style = 'normal' | 'italic';
interface FontOptions {
    data: Buffer | ArrayBuffer;
    name: string;
    weight?: Weight;
    style?: Style;
    lang?: string;
}
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
