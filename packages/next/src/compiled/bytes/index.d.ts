// Type definitions for bytes 3.1
// Project: https://github.com/visionmedia/bytes.js
// Definitions by: Zhiyuan Wang <https://github.com/danny8002>
//                 Rickard Laurin <https://github.com/believer>
//                 Florian Keller <https://github.com/ffflorian>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/**
 * Convert the given value in bytes into a string.
 */
declare function bytes(value: number, options?: bytes.BytesOptions): string;

/**
 * Parse string to an integer in bytes.
 */
declare function bytes(value: string): number;

declare namespace bytes {
    type Unit = 'b' | 'gb' | 'kb' | 'mb' | 'pb' | 'tb' | 'B' | 'GB' | 'KB' | 'MB' | 'PB' | 'TB';

    interface BytesOptions {
        decimalPlaces?: number | undefined;
        fixedDecimals?: boolean | undefined;
        thousandsSeparator?: string | undefined;
        unit?: Unit | undefined;
        unitSeparator?: string | undefined;
    }

    /**
     * Format the given value in bytes into a string.
     *
     * If the value is negative, it is kept as such.
     * If it is a float, it is rounded.
     */
    function format(value: number, options?: BytesOptions): string;

    /**
     * Parse the string value into an integer in bytes.
     *
     * If no unit is given, it is assumed the value is in bytes.
     */
    function parse(value: string | number): number;
}

export = bytes;
