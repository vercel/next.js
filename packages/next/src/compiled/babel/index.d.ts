// Type definitions for @babel/core 7.1
// Project: https://github.com/babel/babel/tree/master/packages/babel-core, https://babeljs.io
// Definitions by: Troy Gerwien <https://github.com/yortus>
//                 Marvin Hagemeister <https://github.com/marvinhagemeister>
//                 Melvin Groenhoff <https://github.com/mgroenhoff>
//                 Jessica Franco <https://github.com/Jessidhia>
//                 Ifiok Jr. <https://github.com/ifiokjr>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// Minimum TypeScript Version: 3.4

import { GeneratorOptions } from '@babel/generator';
import traverse, { Visitor, NodePath, Hub, Scope } from '@babel/traverse';
import template from '@babel/template';
import * as t from '@babel/types';
import { ParserOptions } from '@babel/parser';

export { ParserOptions, GeneratorOptions, t as types, template, traverse, NodePath, Visitor };

export type Node = t.Node;
export type ParseResult = t.File | t.Program;
export const version: string;
export const DEFAULT_EXTENSIONS: ['.js', '.jsx', '.es6', '.es', '.mjs'];

export interface TransformOptions {
    /**
     * Include the AST in the returned object
     *
     * Default: `false`
     */
    ast?: boolean | null;

    /**
     * Attach a comment after all non-user injected code
     *
     * Default: `null`
     */
    auxiliaryCommentAfter?: string | null;

    /**
     * Attach a comment before all non-user injected code
     *
     * Default: `null`
     */
    auxiliaryCommentBefore?: string | null;

    /**
     * Specify the "root" folder that defines the location to search for "babel.config.js", and the default folder to allow `.babelrc` files inside of.
     *
     * Default: `"."`
     */
    root?: string | null;

    /**
     * This option, combined with the "root" value, defines how Babel chooses its project root.
     * The different modes define different ways that Babel can process the "root" value to get
     * the final project root.
     *
     * @see https://babeljs.io/docs/en/next/options#rootmode
     */
    rootMode?: 'root' | 'upward' | 'upward-optional';

    /**
     * The config file to load Babel's config from. Defaults to searching for "babel.config.js" inside the "root" folder. `false` will disable searching for config files.
     *
     * Default: `undefined`
     */
    configFile?: string | boolean | null;

    /**
     * Specify whether or not to use .babelrc and
     * .babelignore files.
     *
     * Default: `true`
     */
    babelrc?: boolean | null;

    /**
     * Specify which packages should be search for .babelrc files when they are being compiled. `true` to always search, or a path string or an array of paths to packages to search
     * inside of. Defaults to only searching the "root" package.
     *
     * Default: `(root)`
     */
    babelrcRoots?: boolean | MatchPattern | MatchPattern[] | null;

    /**
     * Defaults to environment variable `BABEL_ENV` if set, or else `NODE_ENV` if set, or else it defaults to `"development"`
     *
     * Default: env vars
     */
    envName?: string;

    /**
     * If any of patterns match, the current configuration object is considered inactive and is ignored during config processing.
     */
    exclude?: MatchPattern | MatchPattern[];

    /**
     * Enable code generation
     *
     * Default: `true`
     */
    code?: boolean | null;

    /**
     * Output comments in generated output
     *
     * Default: `true`
     */
    comments?: boolean | null;

    /**
     * Do not include superfluous whitespace characters and line terminators. When set to `"auto"` compact is set to `true` on input sizes of >500KB
     *
     * Default: `"auto"`
     */
    compact?: boolean | 'auto' | null;

    /**
     * The working directory that Babel's programmatic options are loaded relative to.
     *
     * Default: `"."`
     */
    cwd?: string | null;

    /**
     * Utilities may pass a caller object to identify themselves to Babel and
     * pass capability-related flags for use by configs, presets and plugins.
     *
     * @see https://babeljs.io/docs/en/next/options#caller
     */
    caller?: TransformCaller;

    /**
     * This is an object of keys that represent different environments. For example, you may have: `{ env: { production: { \/* specific options *\/ } } }`
     * which will use those options when the `envName` is `production`
     *
     * Default: `{}`
     */
    env?: { [index: string]: TransformOptions | null | undefined } | null;

    /**
     * A path to a `.babelrc` file to extend
     *
     * Default: `null`
     */
    extends?: string | null;

    /**
     * Filename for use in errors etc
     *
     * Default: `"unknown"`
     */
    filename?: string | null;

    /**
     * Filename relative to `sourceRoot`
     *
     * Default: `(filename)`
     */
    filenameRelative?: string | null;

    /**
     * An object containing the options to be passed down to the babel code generator, @babel/generator
     *
     * Default: `{}`
     */
    generatorOpts?: GeneratorOptions | null;

    /**
     * Specify a custom callback to generate a module id with. Called as `getModuleId(moduleName)`. If falsy value is returned then the generated module id is used
     *
     * Default: `null`
     */
    getModuleId?: ((moduleName: string) => string | null | undefined) | null;

    /**
     * ANSI highlight syntax error code frames
     *
     * Default: `true`
     */
    highlightCode?: boolean | null;

    /**
     * Opposite to the `only` option. `ignore` is disregarded if `only` is specified
     *
     * Default: `null`
     */
    ignore?: MatchPattern[] | null;

    /**
     * This option is a synonym for "test"
     */
    include?: MatchPattern | MatchPattern[];

    /**
     * A source map object that the output source map will be based on
     *
     * Default: `null`
     */
    inputSourceMap?: object | null;

    /**
     * Should the output be minified (not printing last semicolons in blocks, printing literal string values instead of escaped ones, stripping `()` from `new` when safe)
     *
     * Default: `false`
     */
    minified?: boolean | null;

    /**
     * Specify a custom name for module ids
     *
     * Default: `null`
     */
    moduleId?: string | null;

    /**
     * If truthy, insert an explicit id for modules. By default, all modules are anonymous. (Not available for `common` modules)
     *
     * Default: `false`
     */
    moduleIds?: boolean | null;

    /**
     * Optional prefix for the AMD module formatter that will be prepend to the filename on module definitions
     *
     * Default: `(sourceRoot)`
     */
    moduleRoot?: string | null;

    /**
     * A glob, regex, or mixed array of both, matching paths to **only** compile. Can also be an array of arrays containing paths to explicitly match. When attempting to compile
     * a non-matching file it's returned verbatim
     *
     * Default: `null`
     */
    only?: MatchPattern[] | null;

    /**
     * Allows users to provide an array of options that will be merged into the current configuration one at a time.
     * This feature is best used alongside the "test"/"include"/"exclude" options to provide conditions for which an override should apply
     */
    overrides?: TransformOptions[];

    /**
     * An object containing the options to be passed down to the babel parser, @babel/parser
     *
     * Default: `{}`
     */
    parserOpts?: ParserOptions | null;

    /**
     * List of plugins to load and use
     *
     * Default: `[]`
     */
    plugins?: PluginItem[] | null;

    /**
     * List of presets (a set of plugins) to load and use
     *
     * Default: `[]`
     */
    presets?: PluginItem[] | null;

    /**
     * Retain line numbers. This will lead to wacky code but is handy for scenarios where you can't use source maps. (**NOTE**: This will not retain the columns)
     *
     * Default: `false`
     */
    retainLines?: boolean | null;

    /**
     * An optional callback that controls whether a comment should be output or not. Called as `shouldPrintComment(commentContents)`. **NOTE**: This overrides the `comment` option when used
     *
     * Default: `null`
     */
    shouldPrintComment?: ((commentContents: string) => boolean) | null;

    /**
     * Set `sources[0]` on returned source map
     *
     * Default: `(filenameRelative)`
     */
    sourceFileName?: string | null;

    /**
     * If truthy, adds a `map` property to returned output. If set to `"inline"`, a comment with a sourceMappingURL directive is added to the bottom of the returned code. If set to `"both"`
     * then a `map` property is returned as well as a source map comment appended. **This does not emit sourcemap files by itself!**
     *
     * Default: `false`
     */
    sourceMaps?: boolean | 'inline' | 'both' | null;

    /**
     * The root from which all sources are relative
     *
     * Default: `(moduleRoot)`
     */
    sourceRoot?: string | null;

    /**
     * Indicate the mode the code should be parsed in. Can be one of "script", "module", or "unambiguous". `"unambiguous"` will make Babel attempt to guess, based on the presence of ES6
     * `import` or `export` statements. Files with ES6 `import`s and `export`s are considered `"module"` and are otherwise `"script"`.
     *
     * Default: `("module")`
     */
    sourceType?: 'script' | 'module' | 'unambiguous' | null;

    /**
     * If all patterns fail to match, the current configuration object is considered inactive and is ignored during config processing.
     */
    test?: MatchPattern | MatchPattern[];

    /**
     * An optional callback that can be used to wrap visitor methods. **NOTE**: This is useful for things like introspection, and not really needed for implementing anything. Called as
     * `wrapPluginVisitorMethod(pluginAlias, visitorType, callback)`.
     */
    wrapPluginVisitorMethod?:
        | ((
              pluginAlias: string,
              visitorType: 'enter' | 'exit',
              callback: (path: NodePath, state: any) => void,
          ) => (path: NodePath, state: any) => void)
        | null;
}

export interface TransformCaller {
    // the only required property
    name: string;
    // e.g. set to true by `babel-loader` and false by `babel-jest`
    supportsStaticESM?: boolean;
    supportsDynamicImport?: boolean;
    supportsExportNamespaceFrom?: boolean;
    supportsTopLevelAwait?: boolean;
    // augment this with a "declare module '@babel/core' { ... }" if you need more keys
}

export type FileResultCallback = (err: Error | null, result: BabelFileResult | null) => any;

export interface MatchPatternContext {
    envName: string;
    dirname: string;
    caller: TransformCaller | undefined;
}
export type MatchPattern = string | RegExp | ((filename: string | undefined, context: MatchPatternContext) => boolean);

/**
 * Transforms the passed in code. Calling a callback with an object with the generated code, source map, and AST.
 */
export function transform(code: string, callback: FileResultCallback): void;

/**
 * Transforms the passed in code. Calling a callback with an object with the generated code, source map, and AST.
 */
export function transform(code: string, opts: TransformOptions | undefined, callback: FileResultCallback): void;

/**
 * Here for backward-compatibility. Ideally use `transformSync` if you want a synchronous API.
 */
export function transform(code: string, opts?: TransformOptions): BabelFileResult | null;

/**
 * Transforms the passed in code. Returning an object with the generated code, source map, and AST.
 */
export function transformSync(code: string, opts?: TransformOptions): BabelFileResult | null;

/**
 * Transforms the passed in code. Calling a callback with an object with the generated code, source map, and AST.
 */
export function transformAsync(code: string, opts?: TransformOptions): Promise<BabelFileResult | null>;

/**
 * Asynchronously transforms the entire contents of a file.
 */
export function transformFile(filename: string, callback: FileResultCallback): void;

/**
 * Asynchronously transforms the entire contents of a file.
 */
export function transformFile(filename: string, opts: TransformOptions | undefined, callback: FileResultCallback): void;

/**
 * Synchronous version of `babel.transformFile`. Returns the transformed contents of the `filename`.
 */
export function transformFileSync(filename: string, opts?: TransformOptions): BabelFileResult | null;

/**
 * Asynchronously transforms the entire contents of a file.
 */
export function transformFileAsync(filename: string, opts?: TransformOptions): Promise<BabelFileResult | null>;

/**
 * Given an AST, transform it.
 */
export function transformFromAst(ast: Node, code: string | undefined, callback: FileResultCallback): void;

/**
 * Given an AST, transform it.
 */
export function transformFromAst(
    ast: Node,
    code: string | undefined,
    opts: TransformOptions | undefined,
    callback: FileResultCallback,
): void;

/**
 * Here for backward-compatibility. Ideally use ".transformSync" if you want a synchronous API.
 */
export function transformFromAstSync(ast: Node, code?: string, opts?: TransformOptions): BabelFileResult | null;

/**
 * Given an AST, transform it.
 */
export function transformFromAstAsync(
    ast: Node,
    code?: string,
    opts?: TransformOptions,
): Promise<BabelFileResult | null>;

// A babel plugin is a simple function which must return an object matching
// the following interface. Babel will throw if it finds unknown properties.
// The list of allowed plugin keys is here:
// https://github.com/babel/babel/blob/4e50b2d9d9c376cee7a2cbf56553fe5b982ea53c/packages/babel-core/src/config/option-manager.js#L71
export interface PluginObj<S = PluginPass> {
    name?: string;
    manipulateOptions?(opts: any, parserOpts: any): void;
    pre?(this: S, file: BabelFile): void;
    visitor: Visitor<S>;
    post?(this: S, file: BabelFile): void;
    inherits?: any;
}

export interface BabelFile {
    ast: t.File;
    opts: TransformOptions;
    hub: Hub;
    metadata: object;
    path: NodePath<t.Program>;
    scope: Scope;
    inputMap: object | null;
    code: string;
}

export interface PluginPass {
    file: BabelFile;
    key: string;
    opts: PluginOptions;
    cwd: string;
    filename: string;
    [key: string]: unknown;
}

export interface BabelFileResult {
    ast?: t.File | null;
    code?: string | null;
    ignored?: boolean;
    map?: {
        version: number;
        sources: string[];
        names: string[];
        sourceRoot?: string;
        sourcesContent?: string[];
        mappings: string;
        file: string;
    } | null;
    metadata?: BabelFileMetadata;
}

export interface BabelFileMetadata {
    usedHelpers: string[];
    marked: Array<{
        type: string;
        message: string;
        loc: object;
    }>;
    modules: BabelFileModulesMetadata;
}

export interface BabelFileModulesMetadata {
    imports: object[];
    exports: {
        exported: object[];
        specifiers: object[];
    };
}

export type FileParseCallback = (err: Error | null, result: ParseResult | null) => any;

/**
 * Given some code, parse it using Babel's standard behavior.
 * Referenced presets and plugins will be loaded such that optional syntax plugins are automatically enabled.
 */
export function parse(code: string, callback: FileParseCallback): void;

/**
 * Given some code, parse it using Babel's standard behavior.
 * Referenced presets and plugins will be loaded such that optional syntax plugins are automatically enabled.
 */
export function parse(code: string, options: TransformOptions | undefined, callback: FileParseCallback): void;

/**
 * Given some code, parse it using Babel's standard behavior.
 * Referenced presets and plugins will be loaded such that optional syntax plugins are automatically enabled.
 */
export function parse(code: string, options?: TransformOptions): ParseResult | null;

/**
 * Given some code, parse it using Babel's standard behavior.
 * Referenced presets and plugins will be loaded such that optional syntax plugins are automatically enabled.
 */
export function parseSync(code: string, options?: TransformOptions): ParseResult | null;

/**
 * Given some code, parse it using Babel's standard behavior.
 * Referenced presets and plugins will be loaded such that optional syntax plugins are automatically enabled.
 */
export function parseAsync(code: string, options?: TransformOptions): Promise<ParseResult | null>;

/**
 * Resolve Babel's options fully, resulting in an options object where:
 *
 * * opts.plugins is a full list of Plugin instances.
 * * opts.presets is empty and all presets are flattened into opts.
 * * It can be safely passed back to Babel. Fields like babelrc have been set to false so that later calls to Babel
 * will not make a second attempt to load config files.
 *
 * Plugin instances aren't meant to be manipulated directly, but often callers will serialize this opts to JSON to
 * use it as a cache key representing the options Babel has received. Caching on this isn't 100% guaranteed to
 * invalidate properly, but it is the best we have at the moment.
 */
export function loadOptions(options?: TransformOptions): object | null;

/**
 * To allow systems to easily manipulate and validate a user's config, this function resolves the plugins and
 * presets and proceeds no further. The expectation is that callers will take the config's .options, manipulate it
 * as then see fit and pass it back to Babel again.
 *
 * * `babelrc: string | void` - The path of the `.babelrc` file, if there was one.
 * * `babelignore: string | void` - The path of the `.babelignore` file, if there was one.
 * * `options: ValidatedOptions` - The partially resolved options, which can be manipulated and passed back
 * to Babel again.
 *  * `plugins: Array<ConfigItem>` - See below.
 *  * `presets: Array<ConfigItem>` - See below.
 *  * It can be safely passed back to Babel. Fields like `babelrc` have been set to false so that later calls to
 * Babel will not make a second attempt to load config files.
 *
 * `ConfigItem` instances expose properties to introspect the values, but each item should be treated as
 * immutable. If changes are desired, the item should be removed from the list and replaced with either a normal
 * Babel config value, or with a replacement item created by `babel.createConfigItem`. See that function for
 * information about `ConfigItem` fields.
 */
export function loadPartialConfig(options?: TransformOptions): Readonly<PartialConfig> | null;

export interface PartialConfig {
    options: TransformOptions;
    babelrc?: string;
    babelignore?: string;
    config?: string;
    hasFilesystemConfig: () => boolean;
}

export interface ConfigItem {
    /**
     * The name that the user gave the plugin instance, e.g. `plugins: [ ['env', {}, 'my-env'] ]`
     */
    name?: string;

    /**
     * The resolved value of the plugin.
     */
    value: object | ((...args: any[]) => any);

    /**
     * The options object passed to the plugin.
     */
    options?: object | false;

    /**
     * The path that the options are relative to.
     */
    dirname: string;

    /**
     * Information about the plugin's file, if Babel knows it.
     *  *
     */
    file?: {
        /**
         * The file that the user requested, e.g. `"@babel/env"`
         */
        request: string;

        /**
         * The full path of the resolved file, e.g. `"/tmp/node_modules/@babel/preset-env/lib/index.js"`
         */
        resolved: string;
    } | null;
}

export type PluginOptions = object | undefined | false;

export type PluginTarget = string | object | ((...args: any[]) => any);

export type PluginItem =
    | ConfigItem
    | PluginObj<any>
    | PluginTarget
    | [PluginTarget, PluginOptions]
    | [PluginTarget, PluginOptions, string | undefined];

export function resolvePlugin(name: string, dirname: string): string | null;
export function resolvePreset(name: string, dirname: string): string | null;

export interface CreateConfigItemOptions {
    dirname?: string;
    type?: 'preset' | 'plugin';
}

/**
 * Allows build tooling to create and cache config items up front. If this function is called multiple times for a
 * given plugin, Babel will call the plugin's function itself multiple times. If you have a clear set of expected
 * plugins and presets to inject, pre-constructing the config items would be recommended.
 */
export function createConfigItem(
    value: PluginTarget | [PluginTarget, PluginOptions] | [PluginTarget, PluginOptions, string | undefined],
    options?: CreateConfigItemOptions,
): ConfigItem;

// NOTE: the documentation says the ConfigAPI also exposes @babel/core's exports, but it actually doesn't
/**
 * @see https://babeljs.io/docs/en/next/config-files#config-function-api
 */
export interface ConfigAPI {
    /**
     * The version string for the Babel version that is loading the config file.
     *
     * @see https://babeljs.io/docs/en/next/config-files#apiversion
     */
    version: string;
    /**
     * @see https://babeljs.io/docs/en/next/config-files#apicache
     */
    cache: SimpleCacheConfigurator;
    /**
     * @see https://babeljs.io/docs/en/next/config-files#apienv
     */
    env: EnvFunction;
    // undocumented; currently hardcoded to return 'false'
    // async(): boolean
    /**
     * This API is used as a way to access the `caller` data that has been passed to Babel.
     * Since many instances of Babel may be running in the same process with different `caller` values,
     * this API is designed to automatically configure `api.cache`, the same way `api.env()` does.
     *
     * The `caller` value is available as the first parameter of the callback function.
     * It is best used with something like this to toggle configuration behavior
     * based on a specific environment:
     *
     * @example
     * function isBabelRegister(caller?: { name: string }) {
     *   return !!(caller && caller.name === "@babel/register")
     * }
     * api.caller(isBabelRegister)
     *
     * @see https://babeljs.io/docs/en/next/config-files#apicallercb
     */
    caller<T extends SimpleCacheKey>(callerCallback: (caller: TransformOptions['caller']) => T): T;
    /**
     * While `api.version` can be useful in general, it's sometimes nice to just declare your version.
     * This API exposes a simple way to do that with:
     *
     * @example
     * api.assertVersion(7) // major version only
     * api.assertVersion("^7.2")
     *
     * @see https://babeljs.io/docs/en/next/config-files#apiassertversionrange
     */
    assertVersion(versionRange: number | string): boolean;
    // NOTE: this is an undocumented reexport from "@babel/parser" but it's missing from its types
    // tokTypes: typeof tokTypes
}

/**
 * JS configs are great because they can compute a config on the fly,
 * but the downside there is that it makes caching harder.
 * Babel wants to avoid re-executing the config function every time a file is compiled,
 * because then it would also need to re-execute any plugin and preset functions
 * referenced in that config.
 *
 * To avoid this, Babel expects users of config functions to tell it how to manage caching
 * within a config file.
 *
 * @see https://babeljs.io/docs/en/next/config-files#apicache
 */
export interface SimpleCacheConfigurator {
    // there is an undocumented call signature that is a shorthand for forever()/never()/using().
    // (ever: boolean): void
    // <T extends SimpleCacheKey>(callback: CacheCallback<T>): T
    /**
     * Permacache the computed config and never call the function again.
     */
    forever(): void;
    /**
     * Do not cache this config, and re-execute the function every time.
     */
    never(): void;
    /**
     * Any time the using callback returns a value other than the one that was expected,
     * the overall config function will be called again and a new entry will be added to the cache.
     *
     * @example
     * api.cache.using(() => process.env.NODE_ENV)
     */
    using<T extends SimpleCacheKey>(callback: SimpleCacheCallback<T>): T;
    /**
     * Any time the using callback returns a value other than the one that was expected,
     * the overall config function will be called again and all entries in the cache will
     * be replaced with the result.
     *
     * @example
     * api.cache.invalidate(() => process.env.NODE_ENV)
     */
    invalidate<T extends SimpleCacheKey>(callback: SimpleCacheCallback<T>): T;
}

// https://github.com/babel/babel/blob/v7.3.3/packages/babel-core/src/config/caching.js#L231
export type SimpleCacheKey = string | boolean | number | null | undefined;
export type SimpleCacheCallback<T extends SimpleCacheKey> = () => T;

/**
 * Since `NODE_ENV` is a fairly common way to toggle behavior, Babel also includes an API function
 * meant specifically for that. This API is used as a quick way to check the `"envName"` that Babel
 * was loaded with, which takes `NODE_ENV` into account if no other overriding environment is set.
 *
 * @see https://babeljs.io/docs/en/next/config-files#apienv
 */
export interface EnvFunction {
    /**
     * @returns the current `envName` string
     */
    (): string;
    /**
     * @returns `true` if the `envName` is `===` any of the given strings
     */
    (envName: string | ReadonlyArray<string>): boolean;
    // the official documentation is misleading for this one...
    // this just passes the callback to `cache.using` but with an additional argument.
    // it returns its result instead of necessarily returning a boolean.
    <T extends SimpleCacheKey>(envCallback: (envName: NonNullable<TransformOptions['envName']>) => T): T;
}

export type ConfigFunction = (api: ConfigAPI) => TransformOptions;

export as namespace babel;
