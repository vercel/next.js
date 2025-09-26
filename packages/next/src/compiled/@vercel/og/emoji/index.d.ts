/**
 * Modified version of https://unpkg.com/twemoji@13.1.0/dist/twemoji.esm.js.
 */
export declare function getIconCode(char: string): string;
declare const apis: {
    twemoji: (code: any) => string;
    openmoji: string;
    blobmoji: string;
    noto: string;
    fluent: (code: any) => string;
    fluentFlat: (code: any) => string;
};
export type EmojiType = keyof typeof apis;
export declare function loadEmoji(code: string, type?: EmojiType): Promise<Response>;
export {};
