// Type definitions for Platform 1.3
// Project: https://github.com/bestiejs/platform.js
// Definitions by: Jake Hickman <https://github.com/JakeH>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

export as namespace platform;

/**
 * The platform object.
 */
interface Platform {
    /**
     * The platform description.
     */
    description?: string | undefined;
    /**
     * The name of the browser's layout engine.
     *
     * The list of common layout engines include:
     * "Blink", "EdgeHTML", "Gecko", "Trident" and "WebKit"
     */
    layout?: string | undefined;
    /**
     * The name of the product's manufacturer.
     *
     * The list of manufacturers include:
     * "Apple", "Archos", "Amazon", "Asus", "Barnes & Noble", "BlackBerry",
     * "Google", "HP", "HTC", "LG", "Microsoft", "Motorola", "Nintendo",
     * "Nokia", "Samsung" and "Sony"
     */
    manufacturer?: string | undefined;
    /**
     * The name of the browser/environment.
     *
     * The list of common browser names include:
     * "Chrome", "Electron", "Firefox", "Firefox for iOS", "IE",
     * "Microsoft Edge", "PhantomJS", "Safari", "SeaMonkey", "Silk",
     * "Opera Mini" and "Opera"
     *
     * Mobile versions of some browsers have "Mobile" appended to their name:
     * eg. "Chrome Mobile", "Firefox Mobile", "IE Mobile" and "Opera Mobile"
     */
    name?: string | undefined;
    /**
     * The alpha/beta release indicator.
     */
    prerelease?: string | undefined;
    /**
     * The name of the product hosting the browser.
     *
     * The list of common products include:
     *
     * "BlackBerry", "Galaxy S4", "Lumia", "iPad", "iPod", "iPhone", "Kindle",
     * "Kindle Fire", "Nexus", "Nook", "PlayBook", "TouchPad" and "Transformer"
     */
    product?: string | undefined;
    /**
     * The browser's user agent string.
     */
    ua?: string | undefined;
    /**
     * The version of the OS.
     */
    version?: string | undefined;
    /**
     * The name of the operating system.
     */
    os?: OperatingSystem | undefined;
    /**
     * Creates a new platform object.
     * @param [ua=navigator.userAgent] The user agent string or
     *  context object.
     */
    parse(ua?: object | string): Platform;
    /**
     * Returns `platform.description` when the platform object is coerced to a string.
     */
    toString(): string;
}

interface OperatingSystem {
    /**
     * The CPU architecture the OS is built for.
     */
    architecture?: number | undefined;
    /**
     * The family of the OS.
     *
     * Common values include:
     * "Windows", "Windows Server 2008 R2 / 7", "Windows Server 2008 / Vista",
     * "Windows XP", "OS X", "Linux", "Ubuntu", "Debian", "Fedora", "Red Hat",
     * "SuSE", "Android", "iOS" and "Windows Phone"
     */
    family?: string | undefined;
    /**
     * The version of the OS.
     */
    version?: string | undefined;
    /**
     * Returns the OS string.
     */
    toString(): string;
}

declare const platform: Platform;

export = platform;
