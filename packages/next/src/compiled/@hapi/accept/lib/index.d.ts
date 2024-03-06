/**
 * Identifies the best character-set for an HTTP response based on the HTTP request Accept-Charset header.
 * 
 * @param header - the HTTP Accept-Charset header content.
 * @param preferences - an optional array of character-set strings in order of server preference.
 * 
 * @return a string with the preferred accepted character-set.
 */
export function charset(header?: string, preferences?: string[]): string;


/**
 * Sorts the character-sets in the HTTP request Accept-Charset header based on client preference from most to least desired.
 *
 * @param header - the HTTP Accept-Charset header content.
 *
 * @return an array of strings of character-sets sorted from the most to the least desired.
 */
export function charsets(header?: string): string[];


/**
 * Identifies the best encoding for an HTTP response based on the HTTP request Accept-Encoding header.
 *
 * @param header - the HTTP Accept-Encoding header content.
 * @param preferences - an optional array of encoding strings in order of server preference.
 *
 * @return a string with the preferred accepted encoding.
 */
export function encoding(header?: string, preferences?: string[]): string;


/**
 * Sorts the encodings in the HTTP request Accept-Encoding header based on client preference from most to least desired.
 *
 * @param header - the HTTP Accept-Encoding header content.
 *
 * @return an array of strings of encodings sorted from the most to the least desired.
 */
export function encodings(header?: string): string[];


/**
 * Identifies the best language for an HTTP response based on the HTTP request Accept-Language header.
 *
 * @param header - the HTTP Accept-Language header content.
 * @param preferences - an optional array of language strings in order of server preference.
 *
 * @return a string with the preferred accepted language.
 */
export function language(header?: string, preferences?: string[]): string;


/**
 * Sorts the languages in the HTTP request Accept-Language header based on client preference from most to least desired.
 *
 * @param header - the HTTP Accept-Language header content.
 *
 * @return an array of strings of languages sorted from the most to the least desired.
 */
export function languages(header?: string): string[];


/**
 * Identifies the best media-type for an HTTP response based on the HTTP request Accept header.
 *
 * @param header - the HTTP Accept header content.
 * @param preferences - an optional array of media-type strings in order of server preference.
 *
 * @return a string with the preferred accepted media-type.
 */
export function mediaType(header?: string, preferences?: string[]): string;


/**
 * Sorts the media-types in the HTTP request Accept header based on client preference from most to least desired.
 *
 * @param header - the HTTP Accept header content.
 *
 * @return an array of strings of media-types sorted from the most to the least desired.
 */
export function mediaTypes(header?: string): string[];


/**
 * Parses the Accept-* headers of an HTTP request and returns an array of client preferences for each header.
 * 
 * @param headers - the HTTP request headers object.
 * 
 * @return an object with a key for each accept header result.
 */
export function parseAll(headers: parseAll.Headers): parseAll.Result;

export namespace parseAll {

    interface Headers {

        readonly 'accept-charset'?: string;
        readonly 'accept-encoding'?: string;
        readonly 'accept-language'?: string;
        readonly accept?: string;

        readonly [header: string]: any;
    }

    interface Result {

        charsets: string[];
        encodings: string[];
        languages: string[];
        mediaTypes: string[];
    }
}
