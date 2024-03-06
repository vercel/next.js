// Type definitions for fresh 0.5
// Project: https://github.com/jshttp/fresh#readme
// Definitions by: BendingBender <https://github.com/BendingBender>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

export = fresh;

declare function fresh(reqHeaders: fresh.Headers, resHeaders: fresh.Headers): boolean;

declare namespace fresh {
    interface Headers {
        [header: string]: string | string[] | number | undefined;
    }
}
