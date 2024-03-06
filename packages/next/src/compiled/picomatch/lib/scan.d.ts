declare function scan(input: string, options?: scan.Options): scan.State;

declare namespace scan {
    interface Options {
        /**
         * When `true`, the returned object will include an array of strings representing each path "segment"
         * in the scanned glob pattern. This is automatically enabled when `options.tokens` is true
         */
        parts?: boolean | undefined;
        scanToEnd?: boolean | undefined;
        noext?: boolean | undefined;
        nonegate?: boolean | undefined;
        noparen?: boolean | undefined;
        unescape?: boolean | undefined;
        /**
         * When `true`, the returned object will include an array of tokens (objects),
         * representing each path "segment" in the scanned glob pattern
         */
        tokens?: boolean | undefined;
    }

    interface Token {
        value: string;
        depth: number;
        isGlob: boolean;
        backslashes?: boolean | undefined;
        isBrace?: boolean | undefined;
        isExtglob?: boolean | undefined;
        isGlobstar?: boolean | undefined;
        negated?: boolean | undefined;
    }

    interface State {
        prefix: string;
        input: string;
        start: number;
        base: string;
        glob: string;
        isBrace: boolean;
        isBracket: boolean;
        isGlob: boolean;
        isExtglob: boolean;
        isGlobstar: boolean;
        negated: boolean;
        maxDepth?: number | undefined;
        tokens?: Token[] | undefined;
        slashes?: number[] | undefined;
        parts?: string[] | undefined;
    }
}

export = scan;
