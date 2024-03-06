// Type definitions for text-table 0.2
// Project: https://github.com/substack/text-table
// Definitions by: Saad Quadri <https://github.com/saadq>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/**
 * Generates borderless text table strings suitable for printing to stdout.
 */
declare function table(
    /** An array of arrays containing strings, numbers, or other printable values. */
    rows: Array<Array<{}>>,

    /** A configuration object to customize table output. */
    options?: table.Options
): string;

declare namespace table {
    interface Options {
        /** Separator to use between columns, (default: ' '). */
        hsep?: string;

        /** An array of alignment types for each column, default ['l','l',...]. */
        align?: Array<'l' | 'r' | 'c' | '.' | null | undefined>;

        /** A callback function to use when calculating the string length. */
        stringLength?(str: string): number;
    }
}

export = table;
