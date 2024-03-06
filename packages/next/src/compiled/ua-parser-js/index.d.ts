// Type definitions for ua-parser-js 0.7
// Project: https://github.com/faisalman/ua-parser-js
// Definitions by: Viktor Miroshnikov <https://github.com/superduper>
//                 Lucas Woo <https://github.com/legendecas>
//                 Pablo Rodríguez <https://github.com/MeLlamoPablo>
//                 Piotr Błażejewicz <https://github.com/peterblazejewicz>
//                 BendingBender <https://github.com/BendingBender>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

declare namespace UAParser {
    // tslint:disable:interface-name backward compatible exclusion

    interface IBrowser {
        /**
         * Possible values :
         * Amaya, Android Browser, Arora, Avant, Baidu, Blazer, Bolt, Camino, Chimera, Chrome,
         * Chromium, Comodo Dragon, Conkeror, Dillo, Dolphin, Doris, Edge, Epiphany, Fennec,
         * Firebird, Firefox, Flock, GoBrowser, iCab, ICE Browser, IceApe, IceCat, IceDragon,
         * Iceweasel, IE [Mobile], Iron, Jasmine, K-Meleon, Konqueror, Kindle, Links,
         * Lunascape, Lynx, Maemo, Maxthon, Midori, Minimo, MIUI Browser, [Mobile] Safari,
         * Mosaic, Mozilla, Netfront, Netscape, NetSurf, Nokia, OmniWeb, Opera [Mini/Mobi/Tablet],
         * Phoenix, Polaris, QQBrowser, RockMelt, Silk, Skyfire, SeaMonkey, SlimBrowser, Swiftfox,
         * Tizen, UCBrowser, Vivaldi, w3m, Yandex
         *
         */
        name: string | undefined;

        /**
         * Determined dynamically
         */
        version: string | undefined;

        /**
         * Determined dynamically
         * @deprecated
         */
        major: string | undefined;
    }

    interface IDevice {
        /**
         * Determined dynamically
         */
        model: string | undefined;

        /**
         * Possible type:
         * console, mobile, tablet, smarttv, wearable, embedded
         */
        type: string | undefined;

        /**
         * Possible vendor:
         * Acer, Alcatel, Amazon, Apple, Archos, Asus, BenQ, BlackBerry, Dell, GeeksPhone,
         * Google, HP, HTC, Huawei, Jolla, Lenovo, LG, Meizu, Microsoft, Motorola, Nexian,
         * Nintendo, Nokia, Nvidia, Ouya, Palm, Panasonic, Polytron, RIM, Samsung, Sharp,
         * Siemens, Sony-Ericsson, Sprint, Xbox, ZTE
         */
        vendor: string | undefined;
    }

    interface IEngine {
        /**
         * Possible name:
         * Amaya, EdgeHTML, Gecko, iCab, KHTML, Links, Lynx, NetFront, NetSurf, Presto,
         * Tasman, Trident, w3m, WebKit
         */
        name: string | undefined;
        /**
         * Determined dynamically
         */
        version: string | undefined;
    }

    interface IOS {
        /**
         * Possible 'os.name'
         * AIX, Amiga OS, Android, Arch, Bada, BeOS, BlackBerry, CentOS, Chromium OS, Contiki,
         * Fedora, Firefox OS, FreeBSD, Debian, DragonFly, Gentoo, GNU, Haiku, Hurd, iOS,
         * Joli, Linpus, Linux, Mac OS, Mageia, Mandriva, MeeGo, Minix, Mint, Morph OS, NetBSD,
         * Nintendo, OpenBSD, OpenVMS, OS/2, Palm, PCLinuxOS, Plan9, Playstation, QNX, RedHat,
         * RIM Tablet OS, RISC OS, Sailfish, Series40, Slackware, Solaris, SUSE, Symbian, Tizen,
         * Ubuntu, UNIX, VectorLinux, WebOS, Windows [Phone/Mobile], Zenwalk
         */
        name: string | undefined;
        /**
         * Determined dynamically
         */
        version: string | undefined;
    }

    interface ICPU {
        /**
         * Possible architecture:
         *  68k, amd64, arm, arm64, avr, ia32, ia64, irix, irix64, mips, mips64, pa-risc,
         *  ppc, sparc, sparc64
         */
        architecture: string | undefined;
    }

    interface IResult {
        ua: string;
        browser: IBrowser;
        device: IDevice;
        engine: IEngine;
        os: IOS;
        cpu: ICPU;
    }

    interface BROWSER {
        NAME: "name";
        /**
         * @deprecated
         */
        MAJOR: "major";
        VERSION: "version";
    }

    interface CPU {
        ARCHITECTURE: "architecture";
    }

    interface DEVICE {
        MODEL: "model";
        VENDOR: "vendor";
        TYPE: "type";
        CONSOLE: "console";
        MOBILE: "mobile";
        SMARTTV: "smarttv";
        TABLET: "tablet";
        WEARABLE: "wearable";
        EMBEDDED: "embedded";
    }

    interface ENGINE {
        NAME: "name";
        VERSION: "version";
    }

    interface OS {
        NAME: "name";
        VERSION: "version";
    }

    interface UAParserInstance {
        /**
         *  Returns browser information
         */
        getBrowser(): IBrowser;

        /**
         *  Returns OS information
         */
        getOS(): IOS;

        /**
         *  Returns browsers engine information
         */
        getEngine(): IEngine;

        /**
         *  Returns device information
         */
        getDevice(): IDevice;

        /**
         *  Returns parsed CPU information
         */
        getCPU(): ICPU;

        /**
         *  Returns UA string of current instance
         */
        getUA(): string;

        /**
         *  Set & parse UA string
         */
        setUA(uastring: string): UAParserInstance;

        /**
         *  Returns parse result
         */
        getResult(): IResult;
    }
}

type UAParser = UAParser.UAParserInstance;

declare const UAParser: {
    VERSION: string;
    BROWSER: UAParser.BROWSER;
    CPU: UAParser.CPU;
    DEVICE: UAParser.DEVICE;
    ENGINE: UAParser.ENGINE;
    OS: UAParser.OS;

    /**
     * Create a new parser with UA prepopulated and extensions extended
     */
    new (uastring?: string, extensions?: Record<string, unknown>): UAParser.UAParserInstance;
    new (extensions?: Record<string, unknown>): UAParser.UAParserInstance;
    (uastring?: string, extensions?: Record<string, unknown>): UAParser.IResult;
    (extensions?: Record<string, unknown>): UAParser.IResult;

    // alias for older syntax
    UAParser: typeof UAParser;
};

export as namespace UAParser;
export = UAParser;
