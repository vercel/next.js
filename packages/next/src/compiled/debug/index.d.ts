// Type definitions for debug 4.1
// Project: https://github.com/visionmedia/debug
// Definitions by: Seon-Wook Park <https://github.com/swook>
//                 Gal Talmor <https://github.com/galtalmor>
//                 John McLaughlin <https://github.com/zamb3zi>
//                 Brasten Sager <https://github.com/brasten>
//                 Nicolas Penin <https://github.com/npenin>
//                 Kristian Brünn <https://github.com/kristianmitk>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare var debug: debug.Debug & { debug: debug.Debug; default: debug.Debug };

export = debug;
export as namespace debug;

declare namespace debug {
    interface Debug {
        (namespace: string): Debugger;
        coerce: (val: any) => any;
        disable: () => string;
        enable: (namespaces: string) => void;
        enabled: (namespaces: string) => boolean;
        log: (...args: any[]) => any;

        names: RegExp[];
        skips: RegExp[];

        formatters: Formatters;
    }

    type IDebug = Debug;

    interface Formatters {
        [formatter: string]: (v: any) => string;
    }

    type IDebugger = Debugger;

    interface Debugger {
        (formatter: any, ...args: any[]): void;

        color: string;
        enabled: boolean;
        log: (...args: any[]) => any;
        namespace: string;
        destroy: () => boolean;
        extend: (namespace: string, delimiter?: string) => Debugger;
    }
}
