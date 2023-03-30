import { ReactNode } from 'react';
type Yoga = any;

declare const code: {
    readonly 'ja-JP': RegExp;
    readonly 'ko-KR': RegExp;
    readonly 'zh-CN': RegExp;
    readonly 'zh-TW': RegExp;
    readonly 'zh-HK': RegExp;
    readonly 'th-TH': RegExp;
    readonly 'bn-IN': RegExp;
    readonly 'ar-AR': RegExp;
    readonly 'ta-IN': RegExp;
    readonly 'ml-IN': RegExp;
    readonly 'he-IL': RegExp;
    readonly 'te-IN': RegExp;
    readonly devanagari: RegExp;
    readonly kannada: RegExp;
};
declare type Locale = keyof typeof code;

/**
 * This class handles everything related to fonts.
 */

declare type Weight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
declare type Style$1 = 'normal' | 'italic';
interface FontOptions {
    data: Buffer | ArrayBuffer;
    name: string;
    weight?: Weight;
    style?: Style$1;
    lang?: string;
}

declare type Style = {
    [key: string]: string[] | string | number | boolean | Style;
};
declare type NotImplemented = (...args: any) => unknown;
declare type AddedUtilities = Record<string, Style | string>;
declare type PluginFunction = (obj: {
    addUtilities(utilities: AddedUtilities): unknown;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    addComponents: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    addBase: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    addVariant: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    e: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    prefix: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    theme: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    variants: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    config: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    corePlugins: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    matchUtilities: NotImplemented;
    /**
     * @deprecated not supported in @jaredh159/twrn
     */
    postcss: unknown;
}) => unknown;

declare type TwFontSize = string | [string, string] | [string, {
    lineHeight?: string;
    letterSpacing?: string;
}];
declare type TwScreen = string | {
    max?: string;
    min?: string;
};
declare type TwColors<K extends keyof any = string, V = string> = {
    [key: string]: V | TwColors<K, V>;
};
interface TwTheme {
    fontSize?: Record<string, TwFontSize>;
    lineHeight?: Record<string, string>;
    spacing?: Record<string, string>;
    padding?: Record<string, string>;
    margin?: Record<string, string>;
    inset?: Record<string, string>;
    height?: Record<string, string>;
    width?: Record<string, string>;
    maxWidth?: Record<string, string>;
    maxHeight?: Record<string, string>;
    minWidth?: Record<string, string>;
    minHeight?: Record<string, string>;
    letterSpacing?: Record<string, string>;
    borderWidth?: Record<string, string>;
    borderRadius?: Record<string, string>;
    screens?: Record<string, TwScreen>;
    opacity?: Record<string, number | string>;
    flex?: Record<string, string>;
    flexGrow?: Record<string, number | string>;
    flexShrink?: Record<string, number | string>;
    fontWeight?: Record<string, number | string>;
    fontFamily?: Record<string, string | string[]>;
    zIndex?: Record<string, number | string>;
    colors?: TwColors;
    backgroundColor?: TwColors;
    borderColor?: TwColors;
    textColor?: TwColors;
    extend?: Omit<TwTheme, 'extend'>;
}
interface TwConfig {
    theme?: TwTheme;
    plugins?: Array<{
        handler: PluginFunction;
    }>;
}

declare function init(yoga: Yoga): void;

declare type SatoriOptions = ({
    width: number;
    height: number;
} | {
    width: number;
} | {
    height: number;
}) & {
    fonts: FontOptions[];
    embedFont?: boolean;
    debug?: boolean;
    graphemeImages?: Record<string, string>;
    loadAdditionalAsset?: (languageCode: string, segment: string) => Promise<FontOptions | string | undefined>;
    tailwindConfig?: TwConfig;
};

declare function satori(element: ReactNode, options: SatoriOptions): Promise<string>;

export { FontOptions as Font, Style$1 as FontStyle, Weight as FontWeight, Locale, SatoriOptions, satori as default, init };
