// Type definitions for content-disposition 0.5
// Project: https://github.com/jshttp/content-disposition
// Definitions by: Stefan Reichel <https://github.com/bomret>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare namespace contentDisposition {
    /**
     * Class for parsed Content-Disposition header for v8 optimization
     */
    interface ContentDisposition {
        /**
         * The disposition type (always lower case)
         */
        type: 'attachment' | 'inline' | string;
        /**
         * An object of the parameters in the disposition
         * (name of parameter always lower case and extended versions replace non-extended versions)
         */
        parameters: any;
    }

    interface Options {
        /**
         * Specifies the disposition type.
         * This can also be "inline", or any other value (all values except `inline` are treated like attachment,
         * but can convey additional information if both parties agree to it).
         * The `type` is normalized to lower-case.
         * @default 'attachment'
         */
        type?: 'attachment' | 'inline' | string | undefined;
        /**
         * If the filename option is outside ISO-8859-1,
         * then the file name is actually stored in a supplemental field for clients
         * that support Unicode file names and a ISO-8859-1 version of the file name is automatically generated
         * @default true
         */
        fallback?: string | boolean | undefined;
    }

    /**
     * Parse a Content-Disposition header string
     */
    function parse(contentDispositionHeader: string): ContentDisposition;
}

/**
 * Create an attachment `Content-Disposition` header value using the given file name, if supplied.
 * The `filename` is optional and if no file name is desired, but you want to specify options, set `filename` to undefined.
 */
declare function contentDisposition(filename?: string, options?: contentDisposition.Options): string;

export = contentDisposition;
