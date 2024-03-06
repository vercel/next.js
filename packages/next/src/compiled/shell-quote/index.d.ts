// Type definitions for shell-quote 1.7
// Project: https://github.com/substack/node-shell-quote
// Definitions by: Jason Cheatham <https://github.com/jason0x43>
//                 Cameron Diver <https://github.com/CameronDiver>
//                 Opportunity Liu <https://github.com/OpportunityLiu>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.2

export type ControlOperator = '||' | '&&' | ';;' | '|&' | '<(' | '>>' | '>&' | '&' | ';' | '(' | ')' | '|' | '<' | '>';

export type ParseEntry =
    | string
    | { op: ControlOperator }
    | { op: 'glob'; pattern: string }
    | { comment: string };

export interface ParseOptions {
    /**
     * Custom escape character, default value is `\`
     */
    escape?: string | undefined;
}

/**
 * Return a quoted string for the array `args` suitable for using in shell commands.
 */
export function quote(args: ReadonlyArray<string>): string;

/**
 * Return an array of arguments from the quoted string `cmd`.
 *
 * Interpolate embedded bash-style `$VARNAME` and `${VARNAME}` variables with the `env` object which like bash will replace undefined variables with `""`.
 */
export function parse(
    cmd: string,
    env?: { readonly [key: string]: string | undefined },
    opts?: ParseOptions,
): ParseEntry[];

/**
 * Return an array of arguments from the quoted string `cmd`.
 *
 * Interpolate embedded bash-style `$VARNAME` and `${VARNAME}` variables
 * with the `env` object which like bash will replace undefined variables with `""`.
 *
 * @param env
 *   A function to perform lookups.
 *   When env(key) returns a string, its result will be output just like env[key] would.
 *   When env(key) returns an object, it will be inserted into the result array like the operator objects.
 */
export function parse<T extends object | string>(
    cmd: string,
    env: (key: string) => T | undefined,
    opts?: ParseOptions,
): Array<ParseEntry | T>;
