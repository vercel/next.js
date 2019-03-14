// Type definitions for webpack 4.4
// Project: https://github.com/webpack/webpack
// Definitions by: Qubo <https://github.com/tkqubo>
//                 Benjamin Lim <https://github.com/bumbleblym>
//                 Boris Cherny <https://github.com/bcherny>
//                 Tommy Troy Lin <https://github.com/tommytroylin>
//                 Mohsen Azimi <https://github.com/mohsen1>
//                 Jonathan Creamer <https://github.com/jcreamer898>
//                 Alan Agius <https://github.com/alan-agius4>
//                 Spencer Elliott <https://github.com/elliottsj>
//                 Jason Cheatham <https://github.com/jason0x43>
//                 Dennis George <https://github.com/dennispg>
//                 Christophe Hurpeau <https://github.com/christophehurpeau>
//                 ZSkycat <https://github.com/ZSkycat>
//                 John Reilly <https://github.com/johnnyreilly>
//                 Ryan Waskiewicz <https://github.com/rwaskiewicz>
//                 Kyle Uehlein <https://github.com/kuehlein>
//                 Grgur Grisogono <https://github.com/grgur>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

/// <reference types="node" />

declare module 'webpack' {
    import { Tapable, HookMap,
            SyncBailHook, SyncHook, SyncLoopHook, SyncWaterfallHook,
            AsyncParallelBailHook, AsyncParallelHook, AsyncSeriesBailHook, AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
    import * as UglifyJS from 'uglify-js';
    import * as anymatch from 'anymatch';
    import { RawSourceMap } from 'source-map';

    export = webpack;

    function webpack(
        options: webpack.Configuration,
        handler: webpack.Compiler.Handler
    ): webpack.Compiler.Watching | webpack.Compiler;
    function webpack(options?: webpack.Configuration): webpack.Compiler;

    function webpack(
        options: webpack.Configuration[],
        handler: webpack.MultiCompiler.Handler
    ): webpack.MultiWatching | webpack.MultiCompiler;
    function webpack(options: webpack.Configuration[]): webpack.MultiCompiler;

    namespace webpack {
        interface Configuration {
            /** Enable production optimizations or development hints. */
            mode?: "development" | "production" | "none";
            /** Name of the configuration. Used when loading multiple configurations. */
            name?: string;
            /**
             * The base directory (absolute path!) for resolving the `entry` option.
             * If `output.pathinfo` is set, the included pathinfo is shortened to this directory.
             */
            context?: string;
            entry?: string | string[] | Entry | EntryFunc;
            /** Choose a style of source mapping to enhance the debugging process. These values can affect build and rebuild speed dramatically. */
            devtool?: Options.Devtool;
            /** Options affecting the output. */
            output?: Output;
            /** Options affecting the normal modules (NormalModuleFactory) */
            module?: Module;
            /** Options affecting the resolving of modules. */
            resolve?: Resolve;
            /** Like resolve but for loaders. */
            resolveLoader?: ResolveLoader;
            /**
             * Specify dependencies that shouldn’t be resolved by webpack, but should become dependencies of the resulting bundle.
             * The kind of the dependency depends on output.libraryTarget.
             */
            externals?: Externals;
            /**
             * - "web" Compile for usage in a browser-like environment (default).
             * - "webworker" Compile as WebWorker.
             * - "node" Compile for usage in a node.js-like environment (use require to load chunks).
             * - "async-node" Compile for usage in a node.js-like environment (use fs and vm to load chunks async).
             * - "node-webkit" Compile for usage in webkit, uses jsonp chunk loading but also supports builtin node.js modules plus require(“nw.gui”) (experimental)
             * - "atom" Compile for usage in electron (formerly known as atom-shell), supports require for modules necessary to run Electron.
             * - "electron-renderer" Compile for Electron for renderer process, providing a target using JsonpTemplatePlugin, FunctionModulePlugin for browser
             *   environments and NodeTargetPlugin and ExternalsPlugin for CommonJS and Electron built-in modules.
             * - "electron-main" Compile for Electron for main process.
             * - "atom" Alias for electron-main.
             * - "electron" Alias for electron-main.
             */
            target?: 'web' | 'webworker' | 'node' | 'async-node' | 'node-webkit' | 'atom' | 'electron' | 'electron-renderer' | 'electron-main' | ((compiler?: any) => void);
            /** Report the first error as a hard error instead of tolerating it. */
            bail?: boolean;
            /** Capture timing information for each module. */
            profile?: boolean;
            /** Cache generated modules and chunks to improve performance for multiple incremental builds. */
            cache?: boolean | object;
            /** Enter watch mode, which rebuilds on file change. */
            watch?: boolean;
            watchOptions?: Options.WatchOptions;
            /** Switch loaders to debug mode. */
            debug?: boolean;
            /** Include polyfills or mocks for various node stuff */
            node?: Node | false;
            /** Set the value of require.amd and define.amd. */
            amd?: { [moduleName: string]: boolean };
            /** Used for recordsInputPath and recordsOutputPath */
            recordsPath?: string;
            /** Load compiler state from a json file. */
            recordsInputPath?: string;
            /** Store compiler state to a json file. */
            recordsOutputPath?: string;
            /** Add additional plugins to the compiler. */
            plugins?: Plugin[];
            /** Stats options for logging  */
            stats?: Options.Stats;
            /** Performance options */
            performance?: Options.Performance | false;
            /** Limit the number of parallel processed modules. Can be used to fine tune performance or to get more reliable profiling results */
            parallelism?: number;
            /** Optimization options */
            optimization?: Options.Optimization;
        }

        interface Entry {
            [name: string]: string | string[];
        }

        type EntryFunc = () => (string | string[] | Entry | Promise<string | string[] | Entry>);

        interface DevtoolModuleFilenameTemplateInfo {
            identifier: string;
            shortIdentifier: string;
            resource: any;
            resourcePath: string;
            absoluteResourcePath: string;
            allLoaders: any[];
            query: string;
            moduleId: string;
            hash: string;
        }

        interface Output {
            /** When used in tandem with output.library and output.libraryTarget, this option allows users to insert comments within the export wrapper. */
            auxiliaryComment?: string | AuxiliaryCommentObject;
            /** The filename of the entry chunk as relative path inside the output.path directory. */
            filename?: string | Function;
            /** The filename of non-entry chunks as relative path inside the output.path directory. */
            chunkFilename?: string;
            /** Number of milliseconds before chunk request expires, defaults to 120,000. */
            chunkLoadTimeout?: number;
            /** This option enables cross-origin loading of chunks. */
            crossOriginLoading?: string | boolean;
            /** The JSONP function used by webpack for asnyc loading of chunks. */
            jsonpFunction?: string;
            /** Allows customization of the script type webpack injects script tags into the DOM to download async chunks. */
            jsonpScriptType?: 'text/javascript' | 'module';
            /** Filename template string of function for the sources array in a generated SourceMap. */
            devtoolModuleFilenameTemplate?: string | ((info: DevtoolModuleFilenameTemplateInfo) => string);
            /** Similar to output.devtoolModuleFilenameTemplate, but used in the case of duplicate module identifiers. */
            devtoolFallbackModuleFilenameTemplate?: string | ((info: DevtoolModuleFilenameTemplateInfo) => string);
            /**
             * Enable line to line mapped mode for all/specified modules.
             * Line to line mapped mode uses a simple SourceMap where each line of the generated source is mapped to the same line of the original source.
             * It’s a performance optimization. Only use it if your performance need to be better and you are sure that input lines match which generated lines.
             * true enables it for all modules (not recommended)
             */
            devtoolLineToLine?: boolean;
            /** This option determines the modules namespace used with the output.devtoolModuleFilenameTemplate. */
            devtoolNamespace?: string;
            /** The filename of the Hot Update Chunks. They are inside the output.path directory. */
            hotUpdateChunkFilename?: string;
            /** The JSONP function used by webpack for async loading of hot update chunks. */
            hotUpdateFunction?: string;
            /** The filename of the Hot Update Main File. It is inside the output.path directory. */
            hotUpdateMainFilename?: string;
            /** If set, export the bundle as library. output.library is the name. */
            library?: string | string[];
            /**
             * Which format to export the library:
             * - "var" - Export by setting a variable: var Library = xxx (default)
             * - "this" - Export by setting a property of this: this["Library"] = xxx
             * - "commonjs" - Export by setting a property of exports: exports["Library"] = xxx
             * - "commonjs2" - Export by setting module.exports: module.exports = xxx
             * - "amd" - Export to AMD (optionally named)
             * - "umd" - Export to AMD, CommonJS2 or as property in root
             * - "window" - Assign to window
             * - "assign" - Assign to a global variable
             * - "jsonp" - Generate Webpack JSONP module
             */
            libraryTarget?: LibraryTarget;
            /** Configure which module or modules will be exposed via the `libraryTarget` */
            libraryExport?: string | string[];
            /** If output.libraryTarget is set to umd and output.library is set, setting this to true will name the AMD module. */
            umdNamedDefine?: boolean;
            /** The output directory as absolute path. */
            path?: string;
            /** Include comments with information about the modules. */
            pathinfo?: boolean;
            /** The output.path from the view of the Javascript / HTML page. */
            publicPath?: string;
            /** The filename of the SourceMaps for the JavaScript files. They are inside the output.path directory. */
            sourceMapFilename?: string;
            /** Prefixes every line of the source in the bundle with this string. */
            sourcePrefix?: string;
            /** The encoding to use when generating the hash, defaults to 'hex' */
            hashDigest?: 'hex' | 'latin1' | 'base64';
            /** The prefix length of the hash digest to use, defaults to 20. */
            hashDigestLength?: number;
            /** Algorithm used for generation the hash (see node.js crypto package) */
            hashFunction?: string | ((algorithm: string, options?: any) => any);
            /** An optional salt to update the hash via Node.JS' hash.update. */
            hashSalt?: string;
            /** An expression which is used to address the global object/scope in runtime code. */
            globalObject?: string;
            /** Handles exceptions in module loading correctly at a performance cost. */
            strictModuleExceptionHandling?: boolean;
            /** Use the future version of asset emitting logic, which is allows freeing memory of assets after emitting. It could break plugins which assume that assets are still readable after emitting. Will be the new default in the next major version. */
            futureEmitAssets?: boolean;
            /** The filename of WebAssembly modules as relative path inside the `output.path` directory. */
            webassemblyModuleFilename?: string;
        }

        type LibraryTarget = 'var' | 'assign' | 'this' | 'window' | 'global' | 'commonjs' | 'commonjs2' | 'amd' | 'umd' | 'jsonp';

        type AuxiliaryCommentObject = { [P in LibraryTarget]: string };

        interface Module {
            /** A array of applied pre loaders. */
            preLoaders?: RuleSetRule[];
            /** A array of applied post loaders. */
            postLoaders?: RuleSetRule[];
            /** A RegExp or an array of RegExps. Don’t parse files matching. */
            noParse?: RegExp | RegExp[] | ((content: string) => boolean);
            unknownContextRequest?: string;
            unknownContextRecursive?: boolean;
            unknownContextRegExp?: RegExp;
            unknownContextCritical?: boolean;
            exprContextRequest?: string;
            exprContextRegExp?: RegExp;
            exprContextRecursive?: boolean;
            exprContextCritical?: boolean;
            wrappedContextRegExp?: RegExp;
            wrappedContextRecursive?: boolean;
            wrappedContextCritical?: boolean;
            strictExportPresence?: boolean;
            /** An array of rules applied for modules. */
            rules: RuleSetRule[];
        }

        interface Resolve {
            /**
             * A list of directories to resolve modules from.
             *
             * Absolute paths will be searched once.
             *
             * If an entry is relative, will be resolved using node's resolution algorithm
             * relative to the requested file.
             *
             * Defaults to `["node_modules"]`
             */
            modules?: string[];

            /**
             * A list of package description files to search for.
             *
             * Defaults to `["package.json"]`
             */
            descriptionFiles?: string[];

            /**
             * A list of fields in a package description object to use for finding
             * the entry point.
             *
             * Defaults to `["browser", "module", "main"]` or `["module", "main"]`,
             * depending on the value of the `target` `Configuration` value.
             */
            mainFields?: string[] | string[][];

            /**
             * A list of fields in a package description object to try to parse
             * in the same format as the `alias` resolve option.
             *
             * Defaults to `["browser"]` or `[]`, depending on the value of the
             * `target` `Configuration` value.
             *
             * @see alias
             */
            aliasFields?: string[] | string[][];

            /**
             * A list of file names to search for when requiring directories that
             * don't contain a package description file.
             *
             * Defaults to `["index"]`.
             */
            mainFiles?: string[];

            /**
             * A list of file extensions to try when requesting files.
             *
             * An empty string is considered invalid.
             */
            extensions?: string[];

            /**
             * If true, requires that all requested paths must use an extension
             * from `extensions`.
             */
            enforceExtension?: boolean;

            /**
             * Replace the given module requests with other modules or paths.
             *
             * @see aliasFields
             */
            alias?: { [key: string]: string; };

            /**
             * Whether to use a cache for resolving, or the specific object
             * to use for caching. Sharing objects may be useful when running
             * multiple webpack compilers.
             *
             * Defaults to `true`.
             */
            unsafeCache?: {} | boolean;

            /**
             * A function used to decide whether to cache the given resolve request.
             *
             * Defaults to `() => true`.
             */
            cachePredicate?(data: { path: string, request: string }): boolean;

            /**
             * A list of additional resolve plugins which should be applied.
             */
            plugins?: ResolvePlugin[];

            /**
             * Whether to resolve symlinks to their symlinked location.
             *
             * Defaults to `true`
             */
            symlinks?: boolean;

            /**
             * If unsafe cache is enabled, includes request.context in the cache key.
             * This option is taken into account by the enhanced-resolve module.
             * Since webpack 3.1.0 context in resolve caching is ignored when resolve or resolveLoader plugins are provided.
             * This addresses a performance regression.
             */
            cacheWithContext?: boolean;
        }

        interface ResolveLoader extends Resolve {
            /**
             * List of strings to append to a loader's name when trying to resolve it.
             */
            moduleExtensions?: string[];

            enforceModuleExtension?: boolean;
        }

        /**
         * This interface was referenced by `WebpackOptions`'s JSON-Schema
         * via the `definition` "Externals".
         */
        export type Externals =
            | ((
                context: string,
                request: string,
                callback: (err?: Error, result?: string) => void
            ) => void)
            | ExternalItem
            | (
                | ((
                        context: string,
                        request: string,
                        callback: (err?: Error, result?: string) => void
                ) => void)
                | ExternalItem)[];
        /**
        * This interface was referenced by `WebpackOptions`'s JSON-Schema
        * via the `definition` "ExternalItem".
        */
        export type ExternalItem =
        | string
        | {
            /**
                * The dependency used for the external
                */
            [k: string]:
                | string
                | {
                        [k: string]: any;
                    }
                | ArrayOfStringValues
                | boolean;
            }
        | RegExp;
        /**
         * This interface was referenced by `WebpackOptions`'s JSON-Schema
         * via the `definition` "ArrayOfStringValues".
         */
        export type ArrayOfStringValues = string[];

        interface Node {
            console?: boolean | 'mock';
            process?: boolean | 'mock';
            global?: boolean;
            __filename?: boolean | 'mock';
            __dirname?: boolean | 'mock';
            Buffer?: boolean | 'mock';
            setImmediate?: boolean | 'mock' | 'empty';
            [nodeBuiltin: string]: boolean | 'mock' | 'empty' | undefined;
        }

        interface NewLoader {
            loader: string;
            options?: { [name: string]: any };
        }
        type Loader = string | NewLoader;

        interface ParserOptions {
            [optName: string]: any;
            system?: boolean;
        }

        type RuleSetCondition =
            | RegExp
            | string
            | ((path: string) => boolean)
            | RuleSetConditions
            | {
                /**
                 * Logical AND
                 */
                and?: RuleSetCondition[];
                /**
                 * Exclude all modules matching any of these conditions
                 */
                exclude?: RuleSetCondition;
                /**
                 * Exclude all modules matching not any of these conditions
                 */
                include?: RuleSetCondition;
                /**
                 * Logical NOT
                 */
                not?: RuleSetCondition[];
                /**
                 * Logical OR
                 */
                or?: RuleSetCondition[];
                /**
                 * Exclude all modules matching any of these conditions
                 */
                test?: RuleSetCondition;
            };

        // A hack around circular type referencing
        interface RuleSetConditions extends Array<RuleSetCondition> {}

        interface RuleSetRule {
            /**
             * Enforce this rule as pre or post step
             */
            enforce?: "pre" | "post";
            /**
             * Shortcut for resource.exclude
             */
            exclude?: RuleSetCondition;
            /**
             * Shortcut for resource.include
             */
            include?: RuleSetCondition;
            /**
             * Match the issuer of the module (The module pointing to this module)
             */
            issuer?: RuleSetCondition;
            /**
             * Shortcut for use.loader
             */
            loader?: RuleSetUse;
            /**
             * Shortcut for use.loader
             */
            loaders?: RuleSetUse;
            /**
             * Only execute the first matching rule in this array
             */
            oneOf?: RuleSetRule[];
            /**
             * Shortcut for use.options
             */
            options?: RuleSetQuery;
            /**
             * Options for parsing
             */
            parser?: { [k: string]: any };
            /**
             * Options for the resolver
             */
            resolve?: Resolve;
            /**
             * Flags a module as with or without side effects
             */
            sideEffects?: boolean;
            /**
             * Shortcut for use.query
             */
            query?: RuleSetQuery;
            /**
             * Module type to use for the module
             */
            type?: "javascript/auto" | "javascript/dynamic" | "javascript/esm" | "json" | "webassembly/experimental";
            /**
             * Match the resource path of the module
             */
            resource?: RuleSetCondition;
            /**
             * Match the resource query of the module
             */
            resourceQuery?: RuleSetCondition;
            /**
             * Match the child compiler name
             */
            compiler?: RuleSetCondition;
            /**
             * Match and execute these rules when this rule is matched
             */
            rules?: RuleSetRule[];
            /**
             * Shortcut for resource.test
             */
            test?: RuleSetCondition;
            /**
             * Modifiers applied to the module when rule is matched
             */
            use?: RuleSetUse;
        }

        type RuleSetUse =
            | RuleSetUseItem
            | RuleSetUseItem[]
            | ((data: any) => RuleSetUseItem | RuleSetUseItem[]);

        interface RuleSetLoader {
            /**
             * Loader name
             */
            loader?: string;
            /**
             * Loader options
             */
            options?: RuleSetQuery;
            /**
             * Unique loader identifier
             */
            ident?: string;
            /**
             * Loader query
             */
            query?: RuleSetQuery;
        }

        type RuleSetUseItem =
            | string
            | RuleSetLoader
            | ((data: any) => string | RuleSetLoader);

        type RuleSetQuery =
            | string
            | { [k: string]: any };

        /**
         * @deprecated Use RuleSetCondition instead
         */
        type Condition = RuleSetCondition;

        /**
         * @deprecated Use RuleSetRule instead
         */
        type Rule = RuleSetRule;

        namespace Options {
            // tslint:disable-next-line:max-line-length
            type Devtool = 'eval' | 'inline-source-map' | 'cheap-eval-source-map' | 'cheap-source-map' | 'cheap-module-eval-source-map' | 'cheap-module-source-map' | 'eval-source-map'
                | 'source-map' | 'nosources-source-map' | 'hidden-source-map' | 'nosources-source-map' | 'inline-cheap-source-map' | 'inline-cheap-module-source-map' | '@eval'
                | '@inline-source-map' | '@cheap-eval-source-map' | '@cheap-source-map' | '@cheap-module-eval-source-map' | '@cheap-module-source-map' | '@eval-source-map'
                | '@source-map' | '@nosources-source-map' | '@hidden-source-map' | '@nosources-source-map' | '#eval' | '#inline-source-map' | '#cheap-eval-source-map'
                | '#cheap-source-map' | '#cheap-module-eval-source-map' | '#cheap-module-source-map' | '#eval-source-map' | '#source-map' | '#nosources-source-map'
                | '#hidden-source-map' | '#nosources-source-map' | '#@eval' | '#@inline-source-map' | '#@cheap-eval-source-map' | '#@cheap-source-map' | '#@cheap-module-eval-source-map'
                | '#@cheap-module-source-map' | '#@eval-source-map' | '#@source-map' | '#@nosources-source-map' | '#@hidden-source-map' | '#@nosources-source-map' | boolean;

            interface Performance {
                /** This property allows webpack to control what files are used to calculate performance hints. */
                assetFilter?(assetFilename: string): boolean;
                /**
                 * Turns hints on/off. In addition, tells webpack to throw either an error or a warning when hints are
                 * found. This property is set to "warning" by default.
                 */
                hints?: 'warning' | 'error' | false;
                /**
                 * An asset is any emitted file from webpack. This option controls when webpack emits a performance hint
                 * based on individual asset size. The default value is 250000 (bytes).
                 */
                maxAssetSize?: number;
                /**
                 * An entrypoint represents all assets that would be utilized during initial load time for a specific entry.
                 * This option controls when webpack should emit performance hints based on the maximum entrypoint size.
                 * The default value is 250000 (bytes).
                 */
                maxEntrypointSize?: number;
            }
            type Stats = Stats.ToStringOptions;
            type WatchOptions = ICompiler.WatchOptions;
            interface CacheGroupsOptions {
                /** Assign modules to a cache group */
                test?: ((...args: any[]) => boolean) | string | RegExp;
                /** Select chunks for determining cache group content (defaults to \"initial\", \"initial\" and \"all\" requires adding these chunks to the HTML) */
                chunks?: "initial" | "async" | "all" | ((chunk: compilation.Chunk) => boolean);
                /** Ignore minimum size, minimum chunks and maximum requests and always create chunks for this cache group */
                enforce?: boolean;
                /** Priority of this cache group */
                priority?: number;
                /** Minimal size for the created chunk */
                minSize?: number;
                /** Maximum size for the created chunk */
                maxSize?: number;
                /** Minimum number of times a module has to be duplicated until it's considered for splitting */
                minChunks?: number;
                /** Maximum number of requests which are accepted for on-demand loading */
                maxAsyncRequests?: number;
                /** Maximum number of initial chunks which are accepted for an entry point */
                maxInitialRequests?: number;
                /** Try to reuse existing chunk (with name) when it has matching modules */
                reuseExistingChunk?: boolean;
                /** Give chunks created a name (chunks with equal name are merged) */
                name?: boolean | string | ((...args: any[]) => any);
            }
            interface SplitChunksOptions {
                /** Select chunks for determining shared modules (defaults to \"async\", \"initial\" and \"all\" requires adding these chunks to the HTML) */
                chunks?: "initial" | "async" | "all" | ((chunk: compilation.Chunk) => boolean);
                /** Minimal size for the created chunk */
                minSize?: number;
                /** Maximum size for the created chunk */
                maxSize?: number;
                /** Minimum number of times a module has to be duplicated until it's considered for splitting */
                minChunks?: number;
                /** Maximum number of requests which are accepted for on-demand loading */
                maxAsyncRequests?: number;
                /** Maximum number of initial chunks which are accepted for an entry point */
                maxInitialRequests?: number;
                /** Give chunks created a name (chunks with equal name are merged) */
                name?: boolean | string | ((...args: any[]) => any);
                /** Assign modules to a cache group (modules from different cache groups are tried to keep in separate chunks) */
                cacheGroups?: false | string | ((...args: any[]) => any) | RegExp | { [key: string]: CacheGroupsOptions | false };
            }
            interface RuntimeChunkOptions {
                /** The name or name factory for the runtime chunks. */
                name?: string | ((...args: any[]) => any);
            }
            interface Optimization {
                /**
                 *  Modules are removed from chunks when they are already available in all parent chunk groups.
                 *  This reduces asset size. Smaller assets also result in faster builds since less code generation has to be performed.
                 */
                removeAvailableModules?: boolean;
                /** Empty chunks are removed. This reduces load in filesystem and results in faster builds. */
                removeEmptyChunks?: boolean;
                /** Equal chunks are merged. This results in less code generation and faster builds. */
                mergeDuplicateChunks?: boolean;
                /** Chunks which are subsets of other chunks are determined and flagged in a way that subsets don’t have to be loaded when the bigger chunk has been loaded. */
                flagIncludedChunks?: boolean;
                /** Give more often used ids smaller (shorter) values. */
                occurrenceOrder?: boolean;
                /** Determine exports for each module when possible. This information is used by other optimizations or code generation. I. e. to generate more efficient code for export * from. */
                providedExports?: boolean;
                /**
                 *  Determine used exports for each module. This depends on optimization.providedExports. This information is used by other optimizations or code generation.
                 *  I. e. exports are not generated for unused exports, export names are mangled to single char identifiers when all usages are compatible.
                 *  DCE in minimizers will benefit from this and can remove unused exports.
                 */
                usedExports?: boolean;
                /**
                 *  Recognise the sideEffects flag in package.json or rules to eliminate modules. This depends on optimization.providedExports and optimization.usedExports.
                 *  These dependencies have a cost, but eliminating modules has positive impact on performance because of less code generation. It depends on your codebase.
                 *  Try it for possible performance wins.
                 */
                sideEffects?: boolean;
                /** Tries to find segments of the module graph which can be safely concatenated into a single module. Depends on optimization.providedExports and optimization.usedExports. */
                concatenateModules?: boolean;
                /** Finds modules which are shared between chunk and splits them into separate chunks to reduce duplication or separate vendor modules from application modules. */
                splitChunks?: SplitChunksOptions | false;
                /** Create a separate chunk for the webpack runtime code and chunk hash maps. This chunk should be inlined into the HTML */
                runtimeChunk?: boolean | "single" | "multiple" | RuntimeChunkOptions;
                /** Avoid emitting assets when errors occur. */
                noEmitOnErrors?: boolean;
                /** Instead of numeric ids, give modules readable names for better debugging. */
                namedModules?: boolean;
                /** Instead of numeric ids, give chunks readable names for better debugging. */
                namedChunks?: boolean;
                /** Defines the process.env.NODE_ENV constant to a compile-time-constant value. This allows to remove development only code from code. */
                nodeEnv?: string | false;
                /** Use the minimizer (optimization.minimizer, by default uglify-js) to minimize output assets. */
                minimize?: boolean;
                /** Minimizer(s) to use for minimizing the output */
                minimizer?: Array<Plugin | Tapable.Plugin>;
                /** Generate records with relative paths to be able to move the context folder". */
                portableRecords?: boolean;
            }
        }

        namespace debug {
            interface ProfilingPluginOptions {
                /** A relative path to a custom output file (json) */
                outputPath?: string;
            }
            /**
             * Generate Chrome profile file which includes timings of plugins execution. Outputs `events.json` file by
             * default. It is possible to provide custom file path using `outputPath` option.
             *
             * In order to view the profile file:
             * * Run webpack with ProfilingPlugin.
             * * Go to Chrome, open the Profile Tab.
             * * Drag and drop generated file (events.json by default) into the profiler.
             *
             * It will then display timeline stats and calls per plugin!
             */
            class ProfilingPlugin extends Plugin {
                constructor(options?: ProfilingPluginOptions);
            }
        }
        namespace compilation {
            class Asset {
            }

            class Module {
            }

            class Record {
            }

            class Chunk {
                constructor(name: string);
                id: any;
                ids: any;
                debugId: number;
                name: any;
                entryModule: any;
                files: any[];
                rendered: boolean;
                hash: any;
                renderedHash: any;
                chunkReason: any;
                extraAsync: boolean;

                hasRuntime(): boolean;
                canBeInitial(): boolean;
                isOnlyInitial(): boolean;
                hasEntryModule(): boolean;

                addModule(module: any): boolean;
                removeModule(module: any): boolean;
                setModules(modules: any): void;
                getNumberOfModules(): number;
                modulesIterable: any[];

                addGroup(chunkGroup: any): boolean;
                removeGroup(chunkGroup: any): boolean;
                isInGroup(chunkGroup: any): boolean;
                getNumberOfGroups(): number;
                groupsIterable: any[];

                compareTo(otherChunk: any): -1 | 0 | 1;
                containsModule(module: any): boolean;
                getModules(): any[];
                getModulesIdent(): any[];
                remove(reason: any): void;
                moveModule(module: any, otherChunk: any): void;
                integrate(otherChunk: any, reason: any): boolean;
                split(newChunk: any): void;
                isEmpty(): boolean;
                updateHash(hash: any): void;
                canBeIntegrated(otherChunk: any): boolean;
                addMultiplierAndOverhead(size: number, options: any): number;
                modulesSize(): number;
                size(options: any): number;
                integratedSize(otherChunk: any, options: any): number;
                // tslint:disable-next-line:ban-types
                sortModules(sortByFn: Function): void;
                getAllAsyncChunks(): Set<any>;
                getChunkMaps(realHash: any): { hash: any, name: any };
                // tslint:disable-next-line:ban-types
                getChunkModuleMaps(filterFn: Function): { id: any, hash: any };
                // tslint:disable-next-line:ban-types
                hasModuleInGraph(filterFn: Function, filterChunkFn: Function): boolean;
                toString(): string;
            }

            class ChunkGroup {
            }

            class ChunkHash {
            }

            class Dependency {
                constructor();
                getResourceIdentifier(): any;
                getReference(): any;
                getExports(): any;
                getWarnings(): any;
                getErrors(): any;
                updateHash(hash: any): void;
                disconnect(): void;
                static compare(a: any, b: any): any;
            }

            interface NormalModuleFactoryHooks {
                resolver: SyncWaterfallHook;
                factory: SyncWaterfallHook;
                beforeResolve: AsyncSeriesWaterfallHook;
                afterResolve: AsyncSeriesWaterfallHook;
                createModule: SyncBailHook;
                module: SyncWaterfallHook;
                createParser: HookMap;
                parser: HookMap;
                createGenerator: HookMap;
                generator: HookMap;
            }

            class NormalModuleFactory extends Tapable {
                hooks: NormalModuleFactoryHooks;
            }

            interface ContextModuleFactoryHooks {
                beforeResolve: AsyncSeriesWaterfallHook;
                afterResolve: AsyncSeriesWaterfallHook;
                contextModuleFiles: SyncWaterfallHook;
                alternatives: AsyncSeriesWaterfallHook;
            }

            class ContextModuleFactory extends Tapable {
                hooks: ContextModuleFactoryHooks;
            }

            class DllModuleFactory extends Tapable {
                hooks: {};
            }

            interface CompilationHooks {
                buildModule: SyncHook<Module>;
                rebuildModule: SyncHook<Module>;
                failedModule: SyncHook<Module, Error>;
                succeedModule: SyncHook<Module>;

                finishModules: SyncHook<Module[]>;
                finishRebuildingModule: SyncHook<Module>;

                unseal: SyncHook;
                seal: SyncHook;

                optimizeDependenciesBasic: SyncBailHook<Module[]>;
                optimizeDependencies: SyncBailHook<Module[]>;
                optimizeDependenciesAdvanced: SyncBailHook<Module[]>;
                afterOptimizeDependencies: SyncHook<Module[]>;

                optimize: SyncHook;

                optimizeModulesBasic: SyncBailHook<Module[]>;
                optimizeModules: SyncBailHook<Module[]>;
                optimizeModulesAdvanced: SyncBailHook<Module[]>;
                afterOptimizeModules: SyncHook<Module[]>;

                optimizeChunksBasic: SyncBailHook<Chunk[], ChunkGroup[]>;
                optimizeChunks: SyncBailHook<Chunk[], ChunkGroup[]>;
                optimizeChunksAdvanced: SyncBailHook<Chunk[], ChunkGroup[]>;
                afterOptimizeChunks: SyncHook<Chunk[], ChunkGroup[]>;

                optimizeTree: AsyncSeriesHook<Chunk[], Module[]>;
                afterOptimizeTree: SyncHook<Chunk[], Module[]>;

                optimizeChunkModulesBasic: SyncBailHook<Chunk[], Module[]>;
                optimizeChunkModules: SyncBailHook<Chunk[], Module[]>;
                optimizeChunkModulesAdvanced: SyncBailHook<Chunk[], Module[]>;
                afterOptimizeChunkModules: SyncHook<Chunk[], Module[]>;
                shouldRecord: SyncBailHook;

                reviveModules: SyncHook<Module[], Record[]>;
                optimizeModuleOrder: SyncHook<Module[]>;
                advancedOptimizeModuleOrder: SyncHook<Module[]>;
                beforeModuleIds: SyncHook<Module[]>;
                moduleIds: SyncHook<Module[]>;
                optimizeModuleIds: SyncHook<Module[]>;
                afterOptimizeModuleIds: SyncHook<Module[]>;

                reviveChunks: SyncHook<Chunk[], Record[]>;
                optimizeChunkOrder: SyncHook<Chunk[]>;
                beforeChunkIds: SyncHook<Chunk[]>;
                optimizeChunkIds: SyncHook<Chunk[]>;
                afterOptimizeChunkIds: SyncHook<Chunk[]>;

                recordModules: SyncHook<Module[], Record[]>;
                recordChunks: SyncHook<Chunk[], Record[]>;

                beforeHash: SyncHook;
                afterHash: SyncHook;

                recordHash: SyncHook<Record[]>;

                record: SyncHook<Compilation, Record[]>;

                beforeModuleAssets: SyncHook;
                shouldGenerateChunkAssets: SyncBailHook;
                beforeChunkAssets: SyncHook;
                additionalChunkAssets: SyncHook<Chunk[]>;

                records: SyncHook<Compilation, Record[]>;

                additionalAssets: AsyncSeriesHook;
                optimizeChunkAssets: AsyncSeriesHook<Chunk[]>;
                afterOptimizeChunkAssets: SyncHook<Chunk[]>;
                optimizeAssets: AsyncSeriesHook<Asset[]>;
                afterOptimizeAssets: SyncHook<Asset[]>;

                needAdditionalSeal: SyncBailHook;
                afterSeal: AsyncSeriesHook;

                chunkHash: SyncHook<Chunk, ChunkHash>;
                moduleAsset: SyncHook<Module, string>;
                chunkAsset: SyncHook<Chunk, string>;

                assetPath: SyncWaterfallHook<string>;

                needAdditionalPass: SyncBailHook;
                childCompiler: SyncHook;

                normalModuleLoader: SyncHook<any, Module>;

                optimizeExtractedChunksBasic: SyncBailHook<Chunk[]>;
                optimizeExtractedChunks: SyncBailHook<Chunk[]>;
                optimizeExtractedChunksAdvanced: SyncBailHook<Chunk[]>;
                afterOptimizeExtractedChunks: SyncHook<Chunk[]>;
            }

            interface CompilationModule {
                module: any;
                issuer: boolean;
                build: boolean;
                dependencies: boolean;
            }

            class MainTemplate extends Tapable {}
            class ChunkTemplate extends Tapable {}
            class HotUpdateChunkTemplate extends Tapable {}
            class RuntimeTemplate {}

            interface ModuleTemplateHooks {
                content: SyncWaterfallHook;
                module: SyncWaterfallHook;
                render: SyncWaterfallHook;
                package: SyncWaterfallHook;
                hash: SyncHook;
            }

            class ModuleTemplate extends Tapable {
                hooks: ModuleTemplateHooks;
            }

            class Compilation extends Tapable {
                hooks: CompilationHooks;
                compiler: Compiler;

                resolverFactory: any;
                inputFileSystem: any;
                requestShortener: any;

                outputOptions: any;
                bail: any;
                profile: any;
                performance: any;

                mainTemplate: MainTemplate;
                chunkTemplate: ChunkTemplate;
                hotUpdateChunkTemplate: HotUpdateChunkTemplate;
                runtimeTemplate: RuntimeTemplate;
                moduleTemplates: {
                    javascript: ModuleTemplate;
                    webassembly: ModuleTemplate;
                };

                entries: any[];
                _preparedEntrypoints: any[];
                entrypoints: Map<any, any>;
                chunks: any[];
                chunkGroups: any[];
                namedChunkGroups: Map<any, any>;
                namedChunks: Map<any, any>;
                modules: any[];
                _modules: Map<any, any>;
                cache: any;
                records: any;
                nextFreeModuleIndex: any;
                nextFreeModuleIndex2: any;
                additionalChunkAssets: any[];
                assets: any;
                errors: any[];
                warnings: any[];
                children: any[];
                dependencyFactories: Map<typeof Dependency, Tapable>;
                dependencyTemplates: Map<typeof Dependency, Tapable>;
                childrenCounters: any;
                usedChunkIds: any;
                usedModuleIds: any;
                fileTimestamps: Map<string, number>;
                contextTimestamps: Map<string, number>;
                fileDependencies: SortableSet<string>;
                contextDependencies: SortableSet<string>;
                missingDependencies: SortableSet<string>;
                hash?: string;
                getStats(): Stats;
                addModule(module: CompilationModule, cacheGroup: any): any;
                // tslint:disable-next-line:ban-types
                addEntry(context: any, entry: any, name: any, callback: Function): void;
                getPath(filename: string, data: {hash?: any, chunk?: any, filename?: string, basename?: string, query?: any}): string;
                /**
                 * @deprecated Compilation.applyPlugins is deprecated. Use new API on `.hooks` instead
                 */
                applyPlugins(name: string, ...args: any[]): void;
            }

            interface CompilerHooks {
                shouldEmit: SyncBailHook<Compilation>;
                done: AsyncSeriesHook<Stats>;
                additionalPass: AsyncSeriesHook;
                beforeRun: AsyncSeriesHook<Compiler>;
                run: AsyncSeriesHook<Compiler>;
                emit: AsyncSeriesHook<Compilation>;
                afterEmit: AsyncSeriesHook<Compilation>;
                thisCompilation: SyncHook<Compilation, { normalModuleFactory: NormalModuleFactory }>;
                compilation: SyncHook<Compilation, { normalModuleFactory: NormalModuleFactory }>;
                normalModuleFactory: SyncHook<NormalModuleFactory>;
                contextModuleFactory: SyncHook<ContextModuleFactory>;
                beforeCompile: AsyncSeriesHook<{}>;
                compile: SyncHook<{}>;
                make: AsyncParallelHook<Compilation>;
                afterCompile: AsyncSeriesHook<Compilation>;
                watchRun: AsyncSeriesHook<Compiler>;
                failed: SyncHook<Error>;
                invalid: SyncHook<string, Date>;
                watchClose: SyncHook;
                environment: SyncHook;
                afterEnvironment: SyncHook;
                afterPlugins: SyncHook<Compiler>;
                afterResolvers: SyncHook<Compiler>;
                entryOption: SyncBailHook;
            }
        }
        // tslint:disable-next-line:interface-name
        interface ICompiler {
            run(handler: ICompiler.Handler): void;
            watch(watchOptions: ICompiler.WatchOptions, handler: ICompiler.Handler): Watching;
        }

        namespace ICompiler {
            type Handler = (err: Error, stats: Stats) => void;

            interface WatchOptions {
                /**
                 * Add a delay before rebuilding once the first file changed. This allows webpack to aggregate any other
                 * changes made during this time period into one rebuild.
                 * Pass a value in milliseconds. Default: 300.
                 */
                aggregateTimeout?: number;
                /**
                 * For some systems, watching many file systems can result in a lot of CPU or memory usage.
                 * It is possible to exclude a huge folder like node_modules.
                 * It is also possible to use anymatch patterns.
                 */
                ignored?: anymatch.Matcher;
                /** Turn on polling by passing true, or specifying a poll interval in milliseconds. */
                poll?: boolean | number;
            }
        }

        interface Watching {
            close(callback: () => void): void;
            invalidate(): void;
        }

        interface InputFileSystem {
            purge?(): void;
            readFile(path: string, callback: (err: Error | undefined | null, contents: Buffer) => void): void;
            readFileSync(path: string): Buffer;
            readlink(path: string, callback: (err: Error | undefined | null, linkString: string) => void): void;
            readlinkSync(path: string): string;
            stat(path: string, callback: (err: Error | undefined | null, stats: any) => void): void;
            statSync(path: string): any;
        }

        interface OutputFileSystem {
            join(...paths: string[]): string;
            mkdir(path: string, callback: (err: Error | undefined | null) => void): void;
            mkdirp(path: string, callback: (err: Error | undefined | null) => void): void;
            rmdir(path: string, callback: (err: Error | undefined | null) => void): void;
            unlink(path: string, callback: (err: Error | undefined | null) => void): void;
            writeFile(path: string, data: any, callback: (err: Error | undefined | null) => void): void;
        }

        interface SortableSet<T> extends Set<T> {
            sortWith(sortFn: (a: T, b: T) => number): void;
            sort(): void;
            getFromCache(fn: (set: SortableSet<T>) => T[]): T[];
            getFromUnorderedCache(fn: (set: SortableSet<T>) => string|number|T[]): any;
        }

        class Compiler extends Tapable implements ICompiler {
            constructor();

            hooks: compilation.CompilerHooks;
            _pluginCompat: SyncBailHook<compilation.Compilation>;

            name: string;
            options: Configuration;
            inputFileSystem: InputFileSystem;
            outputFileSystem: OutputFileSystem;
            fileTimestamps: Map<string, number>;
            contextTimestamps: Map<string, number>;
            run(handler: Compiler.Handler): void;
            watch(watchOptions: Compiler.WatchOptions, handler: Compiler.Handler): Compiler.Watching;
        }

        namespace Compiler {
            type Handler = ICompiler.Handler;
            type WatchOptions = ICompiler.WatchOptions;

            class Watching implements Watching {
                constructor(compiler: Compiler, watchOptions: Watching.WatchOptions, handler: Watching.Handler);

                close(callback: () => void): void;
                invalidate(): void;
            }

            namespace Watching {
                type WatchOptions = ICompiler.WatchOptions;
                type Handler = ICompiler.Handler;
            }
        }

        abstract class MultiCompiler extends Tapable implements ICompiler {
            compilers: Compiler[];
            run(handler: MultiCompiler.Handler): void;
            watch(watchOptions: MultiCompiler.WatchOptions, handler: MultiCompiler.Handler): MultiWatching;
        }

        namespace MultiCompiler {
            type Handler = ICompiler.Handler;
            type WatchOptions = ICompiler.WatchOptions;
        }

        abstract class MultiWatching implements Watching {
            close(callback: () => void): void;
            invalidate(): void;
        }

        abstract class Plugin implements Tapable.Plugin {
            apply(compiler: Compiler): void;
        }

        abstract class ResolvePlugin implements Tapable.Plugin {
            apply(resolver: any /* EnhancedResolve.Resolver */): void;
        }

        abstract class Stats {
            compilation: compilation.Compilation;
            hash?: string;
            startTime?: Date;
            endTime?: Date;
            /** Returns true if there were errors while compiling. */
            hasErrors(): boolean;
            /** Returns true if there were warnings while compiling. */
            hasWarnings(): boolean;
            /** Returns compilation information as a JSON object. */
            toJson(options?: Stats.ToJsonOptions): any;
            /** Returns a formatted string of the compilation information (similar to CLI output). */
            toString(options?: Stats.ToStringOptions): string;
        }

        namespace Stats {
            type Preset
                = boolean
                | 'errors-only'
                | 'minimal'
                | 'none'
                | 'normal'
                | 'verbose';

            interface ToJsonOptionsObject {
                /** fallback value for stats options when an option is not defined (has precedence over local webpack defaults) */
                all?: boolean;
                /** Add asset Information */
                assets?: boolean;
                /** Sort assets by a field */
                assetsSort?: string;
                /** Add built at time information */
                builtAt?: boolean;
                /** Add information about cached (not built) modules */
                cached?: boolean;
                /** Show cached assets (setting this to `false` only shows emitted files) */
                cachedAssets?: boolean;
                /** Add children information */
                children?: boolean;
                /** Add built modules information to chunk information */
                chunkModules?: boolean;
                /** Add the origins of chunks and chunk merging info */
                chunkOrigins?: boolean;
                /** Add chunk information (setting this to `false` allows for a less verbose output) */
                chunks?: boolean;
                /** Sort the chunks by a field */
                chunksSort?: string;
                /** Context directory for request shortening */
                context?: string;
                /** Display the distance from the entry point for each module */
                depth?: boolean;
                /** Display the entry points with the corresponding bundles */
                entrypoints?: boolean;
                /** Add --env information */
                env?: boolean;
                /** Add errors */
                errors?: boolean;
                /** Add details to errors (like resolving log) */
                errorDetails?: boolean;
                /** Exclude assets from being displayed in stats */
                excludeAssets?: StatsExcludeFilter;
                /** Exclude modules from being displayed in stats */
                excludeModules?: StatsExcludeFilter;
                /** See excludeModules */
                exclude?: StatsExcludeFilter;
                /** Add the hash of the compilation */
                hash?: boolean;
                /** Set the maximum number of modules to be shown */
                maxModules?: number;
                /** Add built modules information */
                modules?: boolean;
                /** Sort the modules by a field */
                modulesSort?: string;
                /** Show dependencies and origin of warnings/errors */
                moduleTrace?: boolean;
                /** Add public path information */
                publicPath?: boolean;
                /** Add information about the reasons why modules are included */
                reasons?: boolean;
                /** Add the source code of modules */
                source?: boolean;
                /** Add timing information */
                timings?: boolean;
                /** Add webpack version information */
                version?: boolean;
                /** Add warnings */
                warnings?: boolean;
                /** Show which exports of a module are used */
                usedExports?: boolean;
                /** Filter warnings to be shown */
                warningsFilter?: string | RegExp | Array<string | RegExp> | ((warning: string) => boolean);
                /** Show performance hint when file size exceeds `performance.maxAssetSize` */
                performance?: boolean;
                /** Show the exports of the modules */
                providedExports?: boolean;
            }

            type ToJsonOptions = Preset | ToJsonOptionsObject;

            type StatsExcludeFilter = string | string[] | RegExp | RegExp[] | ((assetName: string) => boolean) | Array<(assetName: string) => boolean>;

            interface ToStringOptionsObject extends ToJsonOptionsObject {
                /** `webpack --colors` equivalent */
                colors?: boolean | string;
            }

            type ToStringOptions = Preset | ToStringOptionsObject;
        }

        /**
         * Plugins
         */

        class BannerPlugin extends Plugin {
            constructor(options: string | BannerPlugin.Options);
        }

        namespace BannerPlugin {
            type Filter = string | RegExp;

            interface Options {
                banner: string;
                entryOnly?: boolean;
                exclude?: Filter | Filter[];
                include?: Filter | Filter[];
                raw?: boolean;
                test?: Filter | Filter[];
            }
        }

        class ContextReplacementPlugin extends Plugin {
            constructor(resourceRegExp: any, newContentResource?: any, newContentRecursive?: any, newContentRegExp?: any);
        }

        class DefinePlugin extends Plugin {
            constructor(definitions: { [key: string]: any });
        }

        class DllPlugin extends Plugin {
            constructor(options: DllPlugin.Options | DllPlugin.Options[]);
        }

        namespace DllPlugin {
            interface Options {
                /**
                 * The context of requests in the manifest file.
                 *
                 * Defaults to the webpack context.
                 */
                context?: string;

                /**
                 * The name of the exposed DLL function (keep consistent with `output.library`).
                 */
                name: string;

                /**
                 * The absolute path to the manifest json file (output).
                 */
                path: string;
            }
        }

        class DllReferencePlugin extends Plugin {
            constructor(options: DllReferencePlugin.Options);
        }

        namespace DllReferencePlugin {
            interface Options {
                /**
                 * The mappings from the request to module ID.
                 *
                 * Defaults to `manifest.content`.
                 */
                content?: any;

                /**
                 * The context of requests in the manifest (or content property).
                 *
                 * This is an <b>absolute path</b>.
                 */
                context: string;

                /**
                 * An object containing `content` and `name`.
                 */
                manifest: { content: string, name: string } | string;

                /**
                 * The name where the DLL is exposed.
                 *
                 * Defaults to `manifest.name`.
                 *
                 * See also `externals`.
                 */
                name?: string;

                /**
                 * The prefix which is used for accessing the content of the DLL.
                 */
                scope?: string;

                /**
                 * The type how the DLL is exposed.
                 *
                 * Defaults to `"var"`.
                 *
                 * See also `externals`.
                 */
                sourceType?: string;
            }
        }

        class EvalSourceMapDevToolPlugin extends Plugin {
            constructor(options?: false | string | EvalSourceMapDevToolPlugin.Options);
        }

        namespace EvalSourceMapDevToolPlugin {
            interface Options {
                append?: false | string;
                columns?: boolean;
                lineToLine?: boolean | {
                    exclude?: Condition | Condition[];
                    include?: Condition | Condition[];
                    test?: Condition | Condition[];
                };
                module?: boolean;
                moduleFilenameTemplate?: string;
                sourceRoot?: string;
            }
        }

        class ExtendedAPIPlugin extends Plugin {
            constructor();
        }

        class HashedModuleIdsPlugin extends Plugin {
            constructor(options?: {
                hashFunction?: string,
                hashDigest?: string,
                hashDigestLength?: number
            });
        }

        class HotModuleReplacementPlugin extends Plugin {
            constructor(options?: any);
        }

        class IgnorePlugin extends Plugin {
            constructor(requestRegExp: any, contextRegExp?: any);
        }

        class LoaderOptionsPlugin extends Plugin {
            constructor(options: any);
        }

        /** @deprecated use config.optimization.namedModules */
        class NamedModulesPlugin extends Plugin {
            constructor();
        }

        class NamedChunksPlugin extends Plugin {
            constructor(nameResolver?: (chunk: any) => string | null);
        }

        /** @deprecated use config.optimization.noEmitOnErrors */
        class NoEmitOnErrorsPlugin extends Plugin {
            constructor();
        }

        class NormalModuleReplacementPlugin extends Plugin {
            constructor(resourceRegExp: any, newResource: any);
        }

        class PrefetchPlugin extends Plugin {
            // tslint:disable-next-line:unified-signatures
            constructor(context: any, request: any);
            constructor(request: any);
        }

        class ProgressPlugin extends Plugin {
            constructor(options?: (percentage: number, msg: string, moduleProgress?: string, activeModules?: string, moduleName?: string) => void);
        }

        class EnvironmentPlugin extends Plugin {
            constructor(envs: string[] | { [key: string]: any });
        }

        class ProvidePlugin extends Plugin {
            constructor(definitions: { [key: string]: any });
        }

        class SplitChunksPlugin extends Plugin {
            constructor(options?: Options.SplitChunksOptions);
        }

        class SourceMapDevToolPlugin extends Plugin {
            constructor(options?: null | false | string | SourceMapDevToolPlugin.Options);
        }

        namespace SourceMapDevToolPlugin {
            /** @todo extend EvalSourceMapDevToolPlugin.Options */
            interface Options {
                append?: false | string;
                columns?: boolean;
                exclude?: Condition | Condition[];
                fallbackModuleFilenameTemplate?: string;
                filename?: null | false | string;
                include?: Condition | Condition[];
                lineToLine?: boolean | {
                    exclude?: Condition | Condition[];
                    include?: Condition | Condition[];
                    test?: Condition | Condition[];
                };
                module?: boolean;
                moduleFilenameTemplate?: string;
                noSources?: boolean;
                sourceRoot?: null | string;
                test?: Condition | Condition[];
            }
        }

        class WatchIgnorePlugin extends Plugin {
            constructor(paths: Array<string | RegExp>);
        }

        class SingleEntryPlugin extends Plugin {
            constructor(context: string, entry: string, name: string);
        }

        namespace optimize {
            /** @deprecated use config.optimization.concatenateModules */
            class ModuleConcatenationPlugin extends Plugin { }
            class AggressiveMergingPlugin extends Plugin {
                constructor(options?: AggressiveMergingPlugin.Options);
            }

            namespace AggressiveMergingPlugin {
                interface Options {
                    /**
                     * When options.moveToParents is set, moving to an entry chunk is more expensive.
                     * Defaults to 10, which means moving to an entry chunk is ten times more expensive than moving to a
                     * normal chunk.
                     */
                    entryChunkMultiplicator?: number;
                    /**
                     * A factor which defines the minimum required size reduction for chunk merging.
                     * Defaults to 1.5 which means that the total size needs to be reduced by 50% for chunk merging.
                     */
                    minSizeReduce?: number;
                    /**
                     * When set, modules that are not in both merged chunks are moved to all parents of the chunk.
                     * Defaults to false.
                     */
                    moveToParents?: boolean;
                }
            }

            class AggressiveSplittingPlugin extends Plugin {
                constructor(options?: AggressiveSplittingPlugin.Options);
            }

            namespace AggressiveSplittingPlugin {
                interface Options {
                    /**
                     * Size in byte.
                     * Only chunks bigger than the specified minSize are stored in records.
                     * This ensures the chunks fill up as your application grows,
                     * instead of creating too many chunks for every change.
                     *
                     * Default: 30720
                     */
                    minSize: 30000;
                    /**
                     * Size in byte.
                     * maximum size prefered for each chunk.
                     *
                     * Default: 51200
                     */
                    maxSize: 50000;
                    chunkOverhead: 0;
                    entryChunkMultiplicator: 1;
                }
            }

            /** @deprecated */
            class DedupePlugin extends Plugin {
                constructor();
            }

            class LimitChunkCountPlugin extends Plugin {
                constructor(options: any);
            }

            class MinChunkSizePlugin extends Plugin {
                constructor(options: any);
            }

            class OccurrenceOrderPlugin extends Plugin {
                constructor(preferEntry: boolean);
            }

            class UglifyJsPlugin extends Plugin {
                constructor(options?: UglifyJsPlugin.Options);
            }

            namespace UglifyJsPlugin {
                type CommentFilter = (astNode: any, comment: any) => boolean;

                interface Options extends UglifyJS.MinifyOptions {
                    beautify?: boolean;
                    comments?: boolean | RegExp | CommentFilter;
                    exclude?: Condition | Condition[];
                    include?: Condition | Condition[];
                    /** Parallelization can speedup your build significantly and is therefore highly recommended. */
                    parallel?: boolean | { cache: boolean, workers: boolean | number };
                    sourceMap?: boolean;
                    test?: Condition | Condition[];
                }
            }
        }

        namespace dependencies {
        }

        namespace loader {
            interface Loader extends Function {
                (this: LoaderContext, source: string | Buffer, sourceMap?: RawSourceMap): string | Buffer | void | undefined;

                /**
                 * The order of chained loaders are always called from right to left.
                 * But, in some cases, loaders do not care about the results of the previous loader or the resource.
                 * They only care for metadata. The pitch method on the loaders is called from left to right before the loaders are called (from right to left).
                 * If a loader delivers a result in the pitch method the process turns around and skips the remaining loaders,
                 * continuing with the calls to the more left loaders. data can be passed between pitch and normal call.
                 */
                pitch?(remainingRequest: string, precedingRequest: string, data: any): any;

                /**
                 * By default, the resource file is treated as utf-8 string and passed as String to the loader.
                 * By setting raw to true the loader is passed the raw Buffer.
                 * Every loader is allowed to deliver its result as String or as Buffer.
                 * The compiler converts them between loaders.
                 */
                raw?: boolean;
            }

            type loaderCallback = (err: Error | undefined | null, content?: string | Buffer, sourceMap?: RawSourceMap) => void;

            interface LoaderContext {
                /**
                 * Loader API version. Currently 2.
                 * This is useful for providing backwards compatibility.
                 * Using the version you can specify custom logic or fallbacks for breaking changes.
                 */
                version: string;

                /**
                 *  The directory of the module. Can be used as context for resolving other stuff.
                 *  In the example: /abc because resource.js is in this directory
                 */
                context: string;

                /**
                 * Starting with webpack 4, the formerly `this.options.context` is provided as `this.rootContext`.
                 */
                rootContext: string;

                /**
                 * The resolved request string.
                 * In the example: "/abc/loader1.js?xyz!/abc/node_modules/loader2/index.js!/abc/resource.js?rrr"
                 */
                request: string;

                /**
                 *  A string or any object. The query of the request for the current loader.
                 */
                query: any;

                /**
                 * A data object shared between the pitch and the normal phase.
                 */
                data?: any;

                callback: loaderCallback;

                /**
                 * Make this loader async.
                 */
                async(): loaderCallback | undefined;

                /**
                 *  Make this loader result cacheable. By default it's not cacheable.
                 *  A cacheable loader must have a deterministic result, when inputs and dependencies haven't changed.
                 *  This means the loader shouldn't have other dependencies than specified with this.addDependency.
                 *  Most loaders are deterministic and cacheable.
                 */
                cacheable(flag?: boolean): void;

                /**
                 * loaders = [{request: string, path: string, query: string, module: function}]
                 * An array of all the loaders. It is writeable in the pitch phase.
                 * In the example:
                 * [
                 *   { request: "/abc/loader1.js?xyz",
                 *     path: "/abc/loader1.js",
                 *     query: "?xyz",
                 *     module: [Function]
                 *   },
                 *   { request: "/abc/node_modules/loader2/index.js",
                 *     path: "/abc/node_modules/loader2/index.js",
                 *     query: "",
                 *     module: [Function]
                 *   }
                 * ]
                 */
                loaders: any[];

                /**
                 * The index in the loaders array of the current loader.
                 * In the example: in loader1: 0, in loader2: 1
                 */
                loaderIndex: number;

                /**
                 * The resource part of the request, including query.
                 * In the example: "/abc/resource.js?rrr"
                 */
                resource: string;

                /**
                 * The resource file.
                 * In the example: "/abc/resource.js"
                 */
                resourcePath: string;

                /**
                 * The query of the resource.
                 * In the example: "?rrr"
                 */
                resourceQuery: string;

                /**
                 * Emit a warning.
                 */
                emitWarning(message: string | Error): void;

                /**
                 * Emit a error.
                 */
                emitError(message: string | Error): void;

                /**
                 * Execute some code fragment like a module.
                 *
                 * Don't use require(this.resourcePath), use this function to make loaders chainable!
                 *
                 */
                exec(code: string, filename: string): any;

                /**
                 * Resolves the given request to a module, applies all configured loaders and calls
                 * back with the generated source, the sourceMap and the module instance (usually an
                 * instance of NormalModule). Use this function if you need to know the source code
                 * of another module to generate the result.
                 */
                loadModule(request: string, callback: (err: Error | null, source: string, sourceMap: RawSourceMap, module: Module) => void): any;

                /**
                 * Resolve a request like a require expression.
                 */
                resolve(context: string, request: string, callback: (err: Error, result: string) => void): any;

                /**
                 * Resolve a request like a require expression.
                 */
                resolveSync(context: string, request: string): string;

                /**
                 * Adds a file as dependency of the loader result in order to make them watchable.
                 * For example, html-loader uses this technique as it finds src and src-set attributes.
                 * Then, it sets the url's for those attributes as dependencies of the html file that is parsed.
                 */
                addDependency(file: string): void;

                /**
                 * Adds a file as dependency of the loader result in order to make them watchable.
                 * For example, html-loader uses this technique as it finds src and src-set attributes.
                 * Then, it sets the url's for those attributes as dependencies of the html file that is parsed.
                 */
                dependency(file: string): void;

                /**
                 * Add a directory as dependency of the loader result.
                 */
                addContextDependency(directory: string): void;

                /**
                 * Remove all dependencies of the loader result. Even initial dependencies and these of other loaders. Consider using pitch.
                 */
                clearDependencies(): void;

                /**
                 * Pass values to the next loader.
                 * If you know what your result exports if executed as module, set this value here (as a only element array).
                 */
                value: any;

                /**
                 * Passed from the last loader.
                 * If you would execute the input argument as module, consider reading this variable for a shortcut (for performance).
                 */
                inputValue: any;

                /**
                 * A boolean flag. It is set when in debug mode.
                 */
                debug: boolean;

                /**
                 * Should the result be minimized.
                 */
                minimize: boolean;

                /**
                 * Should a SourceMap be generated.
                 */
                sourceMap: boolean;

                /**
                 * Target of compilation. Passed from configuration options.
                 * Example values: "web", "node"
                 */
                target: 'web' | 'webworker' | 'async-node' | 'node' | 'electron-main' | 'electron-renderer' | 'node-webkit' | string;

                /**
                 * This boolean is set to true when this is compiled by webpack.
                 *
                 * Loaders were originally designed to also work as Babel transforms.
                 * Therefore if you write a loader that works for both, you can use this property to know if
                 * there is access to additional loaderContext and webpack features.
                 */
                webpack: boolean;

                /**
                 * Emit a file. This is webpack-specific.
                 */
                emitFile(name: string, content: Buffer | string, sourceMap: any): void;

                /**
                 * Access to the compilation's inputFileSystem property.
                 */
                fs: any;

                /**
                 * Hacky access to the Compilation object of webpack.
                 */
                _compilation: any;

                /**
                 * Hacky access to the Compiler object of webpack.
                 */
                _compiler: Compiler;

                /**
                 * Hacky access to the Module object being loaded.
                 */
                _module: any;

                /** Flag if HMR is enabled */
                hot: boolean;
            }
        }

        /** @deprecated */
        namespace compiler {
            /** @deprecated use webpack.Compiler */
            // tslint:disable-next-line:no-unnecessary-qualifier
            type Compiler = webpack.Compiler;

            /** @deprecated use webpack.Compiler.Watching */
            type Watching = Compiler.Watching;

            /** @deprecated use webpack.Compiler.WatchOptions */

            type WatchOptions = Compiler.WatchOptions;

            /** @deprecated use webpack.Stats */
            // tslint:disable-next-line:no-unnecessary-qualifier
            type Stats = webpack.Stats;

            /** @deprecated use webpack.Stats.ToJsonOptions */
            type StatsOptions = Stats.ToJsonOptions;

            /** @deprecated use webpack.Stats.ToStringOptions */
            type StatsToStringOptions = Stats.ToStringOptions;

            /** @deprecated use webpack.Compiler.Handler */
            type CompilerCallback = Compiler.Handler;
        }

        /** @deprecated use webpack.Options.Performance */
        type PerformanceOptions = Options.Performance;
        /** @deprecated use webpack.Options.WatchOptions */
        type WatchOptions = Options.WatchOptions;
        /** @deprecated use webpack.EvalSourceMapDevToolPlugin.Options */
        type EvalSourceMapDevToolPluginOptions = EvalSourceMapDevToolPlugin.Options;
        /** @deprecated use webpack.SourceMapDevToolPlugin.Options */
        type SourceMapDevToolPluginOptions = SourceMapDevToolPlugin.Options;
        /** @deprecated use webpack.optimize.UglifyJsPlugin.CommentFilter */
        type UglifyCommentFunction = optimize.UglifyJsPlugin.CommentFilter;
        /** @deprecated use webpack.optimize.UglifyJsPlugin.Options */
        type UglifyPluginOptions = optimize.UglifyJsPlugin.Options;
    }
}
