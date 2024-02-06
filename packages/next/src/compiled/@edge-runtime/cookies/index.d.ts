// Type definitions for cookie 0.5
// Project: https://github.com/jshttp/cookie
// Definitions by: Pine Mizune <https://github.com/pine>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/**
 * Basic HTTP cookie parser and serializer for HTTP servers.
 */

/**
 * Additional serialization options
 */
interface CookieSerializeOptions {
    /**
     * Specifies the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.3|Domain Set-Cookie attribute}. By default, no
     * domain is set, and most clients will consider the cookie to apply to only
     * the current domain.
     */
    domain?: string | undefined;

    /**
     * Specifies a function that will be used to encode a cookie's value. Since
     * value of a cookie has a limited character set (and must be a simple
     * string), this function can be used to encode a value into a string suited
     * for a cookie's value.
     *
     * The default function is the global `encodeURIComponent`, which will
     * encode a JavaScript string into UTF-8 byte sequences and then URL-encode
     * any that fall outside of the cookie range.
     */
    encode?(value: string): string;

    /**
     * Specifies the `Date` object to be the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.1|`Expires` `Set-Cookie` attribute}. By default,
     * no expiration is set, and most clients will consider this a "non-persistent cookie" and will delete
     * it on a condition like exiting a web browser application.
     *
     * *Note* the {@link https://tools.ietf.org/html/rfc6265#section-5.3|cookie storage model specification}
     * states that if both `expires` and `maxAge` are set, then `maxAge` takes precedence, but it is
     * possible not all clients by obey this, so if both are set, they should
     * point to the same date and time.
     */
    expires?: Date | undefined;
    /**
     * Specifies the boolean value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.6|`HttpOnly` `Set-Cookie` attribute}.
     * When truthy, the `HttpOnly` attribute is set, otherwise it is not. By
     * default, the `HttpOnly` attribute is not set.
     *
     * *Note* be careful when setting this to true, as compliant clients will
     * not allow client-side JavaScript to see the cookie in `document.cookie`.
     */
    httpOnly?: boolean | undefined;
    /**
     * Specifies the number (in seconds) to be the value for the `Max-Age`
     * `Set-Cookie` attribute. The given number will be converted to an integer
     * by rounding down. By default, no maximum age is set.
     *
     * *Note* the {@link https://tools.ietf.org/html/rfc6265#section-5.3|cookie storage model specification}
     * states that if both `expires` and `maxAge` are set, then `maxAge` takes precedence, but it is
     * possible not all clients by obey this, so if both are set, they should
     * point to the same date and time.
     */
    maxAge?: number | undefined;
    /**
     * Specifies the value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.4|`Path` `Set-Cookie` attribute}.
     * By default, the path is considered the "default path".
     */
    path?: string | undefined;
    /**
     * Specifies the `string` to be the value for the [`Priority` `Set-Cookie` attribute][rfc-west-cookie-priority-00-4.1].
     *
     * - `'low'` will set the `Priority` attribute to `Low`.
     * - `'medium'` will set the `Priority` attribute to `Medium`, the default priority when not set.
     * - `'high'` will set the `Priority` attribute to `High`.
     *
     * More information about the different priority levels can be found in
     * [the specification][rfc-west-cookie-priority-00-4.1].
     *
     * **note** This is an attribute that has not yet been fully standardized, and may change in the future.
     * This also means many clients may ignore this attribute until they understand it.
     */
    priority?: "low" | "medium" | "high" | undefined;
    /**
     * Specifies the boolean or string to be the value for the {@link https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-4.1.2.7|`SameSite` `Set-Cookie` attribute}.
     *
     * - `true` will set the `SameSite` attribute to `Strict` for strict same
     * site enforcement.
     * - `false` will not set the `SameSite` attribute.
     * - `'lax'` will set the `SameSite` attribute to Lax for lax same site
     * enforcement.
     * - `'strict'` will set the `SameSite` attribute to Strict for strict same
     * site enforcement.
     *  - `'none'` will set the SameSite attribute to None for an explicit
     *  cross-site cookie.
     *
     * More information about the different enforcement levels can be found in {@link https://tools.ietf.org/html/draft-ietf-httpbis-rfc6265bis-03#section-4.1.2.7|the specification}.
     *
     * *note* This is an attribute that has not yet been fully standardized, and may change in the future. This also means many clients may ignore this attribute until they understand it.
     */
    sameSite?: true | false | "lax" | "strict" | "none" | undefined;
    /**
     * Specifies the boolean value for the {@link https://tools.ietf.org/html/rfc6265#section-5.2.5|`Secure` `Set-Cookie` attribute}. When truthy, the
     * `Secure` attribute is set, otherwise it is not. By default, the `Secure` attribute is not set.
     *
     * *Note* be careful when setting this to `true`, as compliant clients will
     * not send the cookie back to the server in the future if the browser does
     * not have an HTTPS connection.
     */
    secure?: boolean | undefined;
}

/**
 * {@link https://wicg.github.io/cookie-store/#dictdef-cookielistitem CookieListItem}
 * as specified by W3C.
 */
interface CookieListItem extends Pick<CookieSerializeOptions, 'domain' | 'path' | 'secure' | 'sameSite'> {
    /** A string with the name of a cookie. */
    name: string;
    /** A string containing the value of the cookie. */
    value: string;
    /** A number of milliseconds or Date interface containing the expires of the cookie. */
    expires?: number | CookieSerializeOptions['expires'];
}
/**
 * Superset of {@link CookieListItem} extending it with
 * the `httpOnly`, `maxAge` and `priority` properties.
 */
type ResponseCookie = CookieListItem & Pick<CookieSerializeOptions, 'httpOnly' | 'maxAge' | 'priority'>;
/**
 * Subset of {@link CookieListItem}, only containing `name` and `value`
 * since other cookie attributes aren't be available on a `Request`.
 */
type RequestCookie = Pick<CookieListItem, 'name' | 'value'>;

/**
 * A class for manipulating {@link Request} cookies (`Cookie` header).
 */
declare class RequestCookies {
    constructor(requestHeaders: Headers);
    [Symbol.iterator](): IterableIterator<[string, RequestCookie]>;
    /**
     * The amount of cookies received from the client
     */
    get size(): number;
    get(...args: [name: string] | [RequestCookie]): RequestCookie | undefined;
    getAll(...args: [name: string] | [RequestCookie] | []): RequestCookie[];
    has(name: string): boolean;
    set(...args: [key: string, value: string] | [options: RequestCookie]): this;
    /**
     * Delete the cookies matching the passed name or names in the request.
     */
    delete(
    /** Name or names of the cookies to be deleted  */
    names: string | string[]): boolean | boolean[];
    /**
     * Delete all the cookies in the cookies in the request.
     */
    clear(): this;
    toString(): string;
}

/**
 * A class for manipulating {@link Response} cookies (`Set-Cookie` header).
 * Loose implementation of the experimental [Cookie Store API](https://wicg.github.io/cookie-store/#dictdef-cookie)
 * The main difference is `ResponseCookies` methods do not return a Promise.
 */
declare class ResponseCookies {
    constructor(responseHeaders: Headers);
    /**
     * {@link https://wicg.github.io/cookie-store/#CookieStore-get CookieStore#get} without the Promise.
     */
    get(...args: [key: string] | [options: ResponseCookie]): ResponseCookie | undefined;
    /**
     * {@link https://wicg.github.io/cookie-store/#CookieStore-getAll CookieStore#getAll} without the Promise.
     */
    getAll(...args: [key: string] | [options: ResponseCookie] | []): ResponseCookie[];
    has(name: string): boolean;
    /**
     * {@link https://wicg.github.io/cookie-store/#CookieStore-set CookieStore#set} without the Promise.
     */
    set(...args: [key: string, value: string, cookie?: Partial<ResponseCookie>] | [options: ResponseCookie]): this;
    /**
     * {@link https://wicg.github.io/cookie-store/#CookieStore-delete CookieStore#delete} without the Promise.
     */
    delete(...args: [key: string] | [options: Omit<ResponseCookie, 'value' | 'expires'>]): this;
    toString(): string;
}

declare function stringifyCookie(c: ResponseCookie | RequestCookie): string;
/** Parse a `Cookie` header value */
declare function parseCookie(cookie: string): Map<string, string>;
/** Parse a `Set-Cookie` header value */
declare function parseSetCookie(setCookie: string): undefined | ResponseCookie;

export { CookieListItem, RequestCookie, RequestCookies, ResponseCookie, ResponseCookies, parseCookie, parseSetCookie, stringifyCookie };
