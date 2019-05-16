// Type definitions for loader-utils 1.1
// Project: https://github.com/webpack/loader-utils#readme
// Definitions by: Gyusun Yeom <https://github.com/Perlmint>
//                 Totooria Hyperion <https://github.com/TotooriaHyperion>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

/// <reference types="node" />

declare module "loader-utils" {
    import { loader } from 'next/dist/compiled/webpack';

    export interface InterpolateOption {
        context?: string;
        content?: string | Buffer;
        regExp?: string | RegExp;
    }
    export interface OptionObject {
        [key: string]: any;
    }
    export type HashType = "sha1" | "md5" | "sha256" | "sha512";
    export type DigestType = "hex" | "base26" | "base32" | "base36" | "base49" | "base52" | "base58" | "base62" | "base64";

    export function getOptions(loaderContext: loader.LoaderContext): OptionObject;
    export function parseQuery(optionString: string): OptionObject;
    export function stringifyRequest(loaderContext: loader.LoaderContext, resource: string): string;
    export function getRemainingRequest(loaderContext: loader.LoaderContext): string;
    export function getCurrentRequest(loaderContext: loader.LoaderContext): string;
    export function isUrlRequest(url: string, root?: string): boolean;
    export function parseString(str: string): string;
    export function urlToRequest(url: string, root?: string): string;
    export function interpolateName(loaderContext: loader.LoaderContext, name: string, options?: any): string;
    export function getHashDigest(buffer: Buffer, hashType: HashType, digestType: DigestType, maxLength: number): string;
}
