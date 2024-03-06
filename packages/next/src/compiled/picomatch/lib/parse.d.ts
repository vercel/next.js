declare function parse(input: string, options: { maxLength?: number | undefined }): parse.ParseState;

declare namespace parse {
    interface Token {
        type: string;
        value: string;
        output: any;
    }

    interface ParseState {
        input: string;
        index: number;
        start: number;
        dot: boolean;
        consumed: string;
        output: string;
        prefix: string;
        backtrack: boolean;
        negated: boolean;
        negatedExtglob?: boolean | undefined;
        brackets: number;
        braces: number;
        parens: number;
        quotes: number;
        globstar: boolean;
        tokens: Token[];
    }
}

export = parse;
