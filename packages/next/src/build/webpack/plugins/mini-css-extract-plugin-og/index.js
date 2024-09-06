/* eslint-disable class-methods-use-this */

const path = require('path')

const { validate } = require('schema-utils')
const { SyncWaterfallHook } = require('tapable')

const schema = {
  title: 'Mini CSS Extract Plugin options',
  type: 'object',
  additionalProperties: false,
  properties: {
    filename: {
      anyOf: [
        {
          type: 'string',
          absolutePath: false,
          minLength: 1,
        },
        {
          instanceof: 'Function',
        },
      ],
      description: 'This option determines the name of each output CSS file.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#filename',
    },
    chunkFilename: {
      anyOf: [
        {
          type: 'string',
          absolutePath: false,
          minLength: 1,
        },
        {
          instanceof: 'Function',
        },
      ],
      description: 'This option determines the name of non-entry chunk files.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#chunkfilename',
    },
    experimentalUseImportModule: {
      type: 'boolean',
      description:
        'Enable the experimental importModule approach instead of using child compilers. This uses less memory and is faster.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#experimentaluseimportmodule',
    },
    ignoreOrder: {
      type: 'boolean',
      description: 'Remove Order Warnings.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#ignoreorder',
    },
    insert: {
      description:
        'Inserts the `link` tag at the given position for non-initial (async) (https://webpack.js.org/concepts/under-the-hood/#chunks) CSS chunks.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#insert',
      anyOf: [
        {
          type: 'string',
        },
        {
          instanceof: 'Function',
        },
      ],
    },
    attributes: {
      description:
        'Adds custom attributes to the `link` tag for non-initial (async) (https://webpack.js.org/concepts/under-the-hood/#chunks) CSS chunks.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#attributes',
      type: 'object',
    },
    linkType: {
      anyOf: [
        {
          enum: ['text/css'],
        },
        {
          type: 'boolean',
        },
      ],
      description:
        'This option allows loading asynchronous chunks with a custom link type',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#linktype',
    },
    runtime: {
      type: 'boolean',
      description:
        'Enabled/Disables runtime generation. CSS will be still extracted and can be used for a custom loading methods.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#noRuntime',
    },
  },
}

const {
  trueFn,
  MODULE_TYPE,
  AUTO_PUBLIC_PATH,
  ABSOLUTE_PUBLIC_PATH,
  SINGLE_DOT_PATH_SEGMENT,
  compareModulesByIdentifier,
  getUndoPath,
  BASE_URI,
  compileBooleanMatcher,
} = require('./utils')

/** @typedef {import("schema-utils/declarations/validate").Schema} Schema */
/** @typedef {import("webpack").Compiler} Compiler */
/** @typedef {import("webpack").Compilation} Compilation */
/** @typedef {import("webpack").ChunkGraph} ChunkGraph */
/** @typedef {import("webpack").Chunk} Chunk */
/** @typedef {Parameters<import("webpack").Chunk["isInGroup"]>[0]} ChunkGroup */
/** @typedef {import("webpack").Module} Module */
/** @typedef {import("webpack").Dependency} Dependency */
/** @typedef {import("webpack").sources.Source} Source */
/** @typedef {import("webpack").Configuration} Configuration */
/** @typedef {import("webpack").WebpackError} WebpackError */
/** @typedef {import("webpack").AssetInfo} AssetInfo */
/** @typedef {import("./loader.js").Dependency} LoaderDependency */

/**
 * @typedef {Object} LoaderOptions
 * @property {string | ((resourcePath: string, rootContext: string) => string)} [publicPath]
 * @property {boolean} [emit]
 * @property {boolean} [esModule]
 * @property {string} [layer]
 * @property {boolean} [defaultExport]
 */

/**
 * @typedef {Object} PluginOptions
 * @property {Required<Configuration>['output']['filename']} [filename]
 * @property {Required<Configuration>['output']['chunkFilename']} [chunkFilename]
 * @property {boolean} [ignoreOrder]
 * @property {string | ((linkTag: HTMLLinkElement) => void)} [insert]
 * @property {Record<string, string>} [attributes]
 * @property {string | false | 'text/css'} [linkType]
 * @property {boolean} [runtime]
 * @property {boolean} [experimentalUseImportModule]
 */

/**
 * @typedef {Object} NormalizedPluginOptions
 * @property {Required<Configuration>['output']['filename']} filename
 * @property {Required<Configuration>['output']['chunkFilename']} [chunkFilename]
 * @property {boolean} ignoreOrder
 * @property {string | ((linkTag: HTMLLinkElement) => void)} [insert]
 * @property {Record<string, string>} [attributes]
 * @property {string | false | 'text/css'} [linkType]
 * @property {boolean} runtime
 * @property {boolean} [experimentalUseImportModule]
 */

/**
 * @typedef {Object} RuntimeOptions
 * @property {string | ((linkTag: HTMLLinkElement) => void) | undefined} insert
 * @property {string | false | 'text/css'} linkType
 * @property {Record<string, string> | undefined} attributes
 */

/** @typedef {any} TODO */

const pluginName = 'mini-css-extract-plugin'
const pluginSymbol = Symbol(pluginName)

const DEFAULT_FILENAME = '[name].css'
/**
 * @type {Set<string>}
 */
const TYPES = new Set([MODULE_TYPE])
/**
 * @type {ReturnType<Module["codeGeneration"]>}
 */
const CODE_GENERATION_RESULT = {
  sources: new Map(),
  runtimeRequirements: new Set(),
}

/** @typedef {Module & { content: Buffer, media?: string, sourceMap?: Buffer, supports?: string, layer?: string, assets?: { [key: string]: TODO }, assetsInfo?: Map<string, AssetInfo> }} CssModule */
/** @typedef {{ context: string | null, identifier: string, identifierIndex: number, content: Buffer, sourceMap?: Buffer, media?: string, supports?: string, layer?: TODO, assetsInfo?: Map<string, AssetInfo>, assets?: { [key: string]: TODO }}} CssModuleDependency */
/** @typedef {{ new(dependency: CssModuleDependency): CssModule }} CssModuleConstructor */
/** @typedef {Dependency & CssModuleDependency} CssDependency */
/** @typedef {Omit<LoaderDependency, "context">} CssDependencyOptions */
/** @typedef {{ new(loaderDependency: CssDependencyOptions, context: string | null, identifierIndex: number): CssDependency }} CssDependencyConstructor */
/**
 * @typedef {Object} VarNames
 * @property {string} tag
 * @property {string} chunkId
 * @property {string} href
 * @property {string} resolve
 * @property {string} reject
 */
/**
 * @typedef {Object} MiniCssExtractPluginCompilationHooks
 * @property {import("tapable").SyncWaterfallHook<[string, VarNames], string>} beforeTagInsert
 * @property {SyncWaterfallHook<[string, Chunk]>} linkPreload
 * @property {SyncWaterfallHook<[string, Chunk]>} linkPrefetch
 */

/**
 *
 * @type {WeakMap<Compiler["webpack"], CssModuleConstructor>}
 */
const cssModuleCache = new WeakMap()
/**
 * @type {WeakMap<Compiler["webpack"], CssDependencyConstructor>}
 */
const cssDependencyCache = new WeakMap()
/**
 * @type {WeakSet<Compiler["webpack"]>}
 */
const registered = new WeakSet()

/** @type {WeakMap<Compilation, MiniCssExtractPluginCompilationHooks>} */
const compilationHooksMap = new WeakMap()

class MiniCssExtractPlugin {
  // TODO
  __next_css_remove = true

  /**
   * @param {Compiler["webpack"]} webpack
   * @returns {CssModuleConstructor}
   */
  static getCssModule(webpack) {
    /**
     * Prevent creation of multiple CssModule classes to allow other integrations to get the current CssModule.
     */
    if (cssModuleCache.has(webpack)) {
      return /** @type {CssModuleConstructor} */ cssModuleCache.get(webpack)
    }

    class CssModule extends webpack.Module {
      /**
       * @param {CssModuleDependency} dependency
       */
      constructor({
        context,
        identifier,
        identifierIndex,
        content,
        layer,
        supports,
        media,
        sourceMap,
        assets,
        assetsInfo,
      }) {
        // @ts-ignore
        super(MODULE_TYPE, /** @type {string | undefined} */ context)

        this.id = ''
        this._context = context
        this._identifier = identifier
        this._identifierIndex = identifierIndex
        this.content = content
        this.layer = layer
        this.supports = supports
        this.media = media
        this.sourceMap = sourceMap
        this.assets = assets
        this.assetsInfo = assetsInfo
        this._needBuild = true
      }

      // no source() so webpack 4 doesn't do add stuff to the bundle

      size() {
        return this.content.length
      }

      identifier() {
        return `css|${this._identifier}|${this._identifierIndex}|${
          this.layer || ''
        }|${this.supports || ''}|${this.media}}}`
      }

      /**
       * @param {Parameters<Module["readableIdentifier"]>[0]} requestShortener
       * @returns {ReturnType<Module["readableIdentifier"]>}
       */
      readableIdentifier(requestShortener) {
        return `css ${requestShortener.shorten(this._identifier)}${
          this._identifierIndex ? ` (${this._identifierIndex})` : ''
        }${this.layer ? ` (layer ${this.layer})` : ''}${
          this.supports ? ` (supports ${this.supports})` : ''
        }${this.media ? ` (media ${this.media})` : ''}`
      }

      // eslint-disable-next-line class-methods-use-this
      getSourceTypes() {
        return TYPES
      }

      // eslint-disable-next-line class-methods-use-this
      codeGeneration() {
        return CODE_GENERATION_RESULT
      }

      nameForCondition() {
        const resource =
          /** @type {string} */
          this._identifier.split('!').pop()
        const idx = resource.indexOf('?')

        if (idx >= 0) {
          return resource.substring(0, idx)
        }

        return resource
      }

      /**
       * @param {Module} module
       */
      updateCacheModule(module) {
        if (
          !this.content.equals(/** @type {CssModule} */ module.content) ||
          this.layer !== /** @type {CssModule} */ module.layer ||
          this.supports !== /** @type {CssModule} */ module.supports ||
          this.media !== /** @type {CssModule} */ module.media ||
          (this.sourceMap
            ? !this.sourceMap.equals(
                /** @type {Uint8Array} **/
                /** @type {CssModule} */ module.sourceMap
              )
            : false) ||
          this.assets !== /** @type {CssModule} */ module.assets ||
          this.assetsInfo !== /** @type {CssModule} */ module.assetsInfo
        ) {
          this._needBuild = true

          this.content = /** @type {CssModule} */ module.content
          this.layer = /** @type {CssModule} */ module.layer
          this.supports = /** @type {CssModule} */ module.supports
          this.media = /** @type {CssModule} */ module.media
          this.sourceMap = /** @type {CssModule} */ module.sourceMap
          this.assets = /** @type {CssModule} */ module.assets
          this.assetsInfo = /** @type {CssModule} */ module.assetsInfo
        }
      }

      // eslint-disable-next-line class-methods-use-this
      needRebuild() {
        return this._needBuild
      }

      // eslint-disable-next-line class-methods-use-this
      /**
       * @param {Parameters<Module["needBuild"]>[0]} context context info
       * @param {Parameters<Module["needBuild"]>[1]} callback callback function, returns true, if the module needs a rebuild
       */
      needBuild(context, callback) {
        // eslint-disable-next-line no-undefined
        callback(undefined, this._needBuild)
      }

      /**
       * @param {Parameters<Module["build"]>[0]} options
       * @param {Parameters<Module["build"]>[1]} compilation
       * @param {Parameters<Module["build"]>[2]} resolver
       * @param {Parameters<Module["build"]>[3]} fileSystem
       * @param {Parameters<Module["build"]>[4]} callback
       */
      build(options, compilation, resolver, fileSystem, callback) {
        this.buildInfo = {
          assets: this.assets,
          assetsInfo: this.assetsInfo,
          cacheable: true,
          hash: this._computeHash(
            /** @type {string} */ compilation.outputOptions.hashFunction
          ),
        }
        this.buildMeta = {}
        this._needBuild = false

        callback()
      }

      /**
       * @private
       * @param {string} hashFunction
       * @returns {string | Buffer}
       */
      _computeHash(hashFunction) {
        const hash = webpack.util.createHash(hashFunction)

        hash.update(this.content)

        if (this.layer) {
          hash.update(this.layer)
        }

        hash.update(this.supports || '')
        hash.update(this.media || '')
        hash.update(this.sourceMap || '')

        return hash.digest('hex')
      }

      /**
       * @param {Parameters<Module["updateHash"]>[0]} hash
       * @param {Parameters<Module["updateHash"]>[1]} context
       */
      updateHash(hash, context) {
        super.updateHash(hash, context)

        hash.update(
          /** @type {NonNullable<Module["buildInfo"]>} */ this.buildInfo.hash
        )
      }

      /**
       * @param {Parameters<Module["serialize"]>[0]} context
       */
      serialize(context) {
        const { write } = context

        write(this._context)
        write(this._identifier)
        write(this._identifierIndex)
        write(this.content)
        write(this.layer)
        write(this.supports)
        write(this.media)
        write(this.sourceMap)
        write(this.assets)
        write(this.assetsInfo)

        write(this._needBuild)

        super.serialize(context)
      }

      /**
       * @param {Parameters<Module["deserialize"]>[0]} context
       */
      deserialize(context) {
        this._needBuild = context.read()

        super.deserialize(context)
      }
    }

    cssModuleCache.set(webpack, CssModule)

    webpack.util.serialization.register(
      CssModule,
      path.resolve(__dirname, 'CssModule'),
      // @ts-ignore
      null,
      {
        serialize(instance, context) {
          instance.serialize(context)
        },
        deserialize(context) {
          const { read } = context

          const contextModule = read()
          const identifier = read()
          const identifierIndex = read()
          const content = read()
          const layer = read()
          const supports = read()
          const media = read()
          const sourceMap = read()
          const assets = read()
          const assetsInfo = read()
          const dep = new CssModule({
            context: contextModule,
            identifier,
            identifierIndex,
            content,
            layer,
            supports,
            media,
            sourceMap,
            assets,
            assetsInfo,
          })

          dep.deserialize(context)

          return dep
        },
      }
    )

    return CssModule
  }

  /**
   * @param {Compiler["webpack"]} webpack
   * @returns {CssDependencyConstructor}
   */
  static getCssDependency(webpack) {
    /**
     * Prevent creation of multiple CssDependency classes to allow other integrations to get the current CssDependency.
     */
    if (cssDependencyCache.has(webpack)) {
      return /** @type {CssDependencyConstructor} */ cssDependencyCache.get(
        webpack
      )
    }

    class CssDependency extends webpack.Dependency {
      /**
       * @param {CssDependencyOptions} loaderDependency
       * @param {string | null} context
       * @param {number} identifierIndex
       */
      constructor(
        { identifier, content, layer, supports, media, sourceMap },
        context,
        identifierIndex
      ) {
        super()

        this.identifier = identifier
        this.identifierIndex = identifierIndex
        this.content = content
        this.layer = layer
        this.supports = supports
        this.media = media
        this.sourceMap = sourceMap
        this.context = context
        /** @type {{ [key: string]: Source } | undefined}} */
        // eslint-disable-next-line no-undefined
        this.assets = undefined
        /** @type {Map<string, AssetInfo> | undefined} */
        // eslint-disable-next-line no-undefined
        this.assetsInfo = undefined
      }

      /**
       * @returns {ReturnType<Dependency["getResourceIdentifier"]>}
       */
      getResourceIdentifier() {
        return `css-module-${this.identifier}-${this.identifierIndex}`
      }

      /**
       * @returns {ReturnType<Dependency["getModuleEvaluationSideEffectsState"]>}
       */
      // eslint-disable-next-line class-methods-use-this
      getModuleEvaluationSideEffectsState() {
        return webpack.ModuleGraphConnection.TRANSITIVE_ONLY
      }

      /**
       * @param {Parameters<Dependency["serialize"]>[0]} context
       */
      serialize(context) {
        const { write } = context

        write(this.identifier)
        write(this.content)
        write(this.layer)
        write(this.supports)
        write(this.media)
        write(this.sourceMap)
        write(this.context)
        write(this.identifierIndex)
        write(this.assets)
        write(this.assetsInfo)

        super.serialize(context)
      }

      /**
       * @param {Parameters<Dependency["deserialize"]>[0]} context
       */
      deserialize(context) {
        super.deserialize(context)
      }
    }

    cssDependencyCache.set(webpack, CssDependency)

    webpack.util.serialization.register(
      CssDependency,
      path.resolve(__dirname, 'CssDependency'),
      // @ts-ignore
      null,
      {
        serialize(instance, context) {
          instance.serialize(context)
        },
        deserialize(context) {
          const { read } = context
          const dep = new CssDependency(
            {
              identifier: read(),
              content: read(),
              layer: read(),
              supports: read(),
              media: read(),
              sourceMap: read(),
            },
            read(),
            read()
          )

          const assets = read()
          const assetsInfo = read()

          dep.assets = assets
          dep.assetsInfo = assetsInfo

          dep.deserialize(context)

          return dep
        },
      }
    )

    return CssDependency
  }

  /**
   * Returns all hooks for the given compilation
   * @param {Compilation} compilation the compilation
   * @returns {MiniCssExtractPluginCompilationHooks} hooks
   */
  static getCompilationHooks(compilation) {
    let hooks = compilationHooksMap.get(compilation)

    if (!hooks) {
      hooks = {
        beforeTagInsert: new SyncWaterfallHook(
          ['source', 'varNames'],
          'string'
        ),
        linkPreload: new SyncWaterfallHook(['source', 'chunk']),
        linkPrefetch: new SyncWaterfallHook(['source', 'chunk']),
      }
      compilationHooksMap.set(compilation, hooks)
    }

    return hooks
  }

  /**
   * @param {PluginOptions} [options]
   */
  constructor(options = {}) {
    validate(/** @type {Schema} */ schema, options, {
      baseDataPath: 'options',
    })

    /**
     * @private
     * @type {WeakMap<Chunk, Set<CssModule>>}
     * @private
     */
    this._sortedModulesCache = new WeakMap()

    /**
     * @private
     * @type {NormalizedPluginOptions}
     */
    this.options = Object.assign(
      {
        filename: DEFAULT_FILENAME,
        ignoreOrder: false,
        // TODO remove in the next major release
        // eslint-disable-next-line no-undefined
        experimentalUseImportModule: undefined,
        runtime: true,
      },
      options
    )

    /**
     * @private
     * @type {RuntimeOptions}
     */
    this.runtimeOptions = {
      insert: options.insert,
      linkType:
        // Todo in next major release set default to "false"
        (typeof options.linkType === 'boolean' &&
          /** @type {boolean} */ options.linkType === true) ||
        typeof options.linkType === 'undefined'
          ? 'text/css'
          : options.linkType,
      attributes: options.attributes,
    }

    if (!this.options.chunkFilename) {
      const { filename } = this.options

      if (typeof filename !== 'function') {
        const hasName = /** @type {string} */ filename.includes('[name]')
        const hasId = /** @type {string} */ filename.includes('[id]')
        const hasChunkHash =
          /** @type {string} */
          filename.includes('[chunkhash]')
        const hasContentHash =
          /** @type {string} */
          filename.includes('[contenthash]')

        // Anything changing depending on chunk is fine
        if (hasChunkHash || hasContentHash || hasName || hasId) {
          this.options.chunkFilename = filename
        } else {
          // Otherwise prefix "[id]." in front of the basename to make it changing
          this.options.chunkFilename =
            /** @type {string} */
            filename.replace(/(^|\/)([^/]*(?:\?|$))/, '$1[id].$2')
        }
      } else {
        this.options.chunkFilename = '[id].css'
      }
    }
  }

  /**
   * @param {Compiler} compiler
   */
  apply(compiler) {
    const { webpack } = compiler

    if (this.options.experimentalUseImportModule) {
      if (
        typeof (
          /** @type {Compiler["options"]["experiments"] & { executeModule?: boolean }} */
          compiler.options.experiments.executeModule
        ) === 'undefined'
      ) {
        /** @type {Compiler["options"]["experiments"] & { executeModule?: boolean }} */
        // eslint-disable-next-line no-param-reassign
        compiler.options.experiments.executeModule = true
      }
    }

    // TODO bug in webpack, remove it after it will be fixed
    // webpack tries to `require` loader firstly when serializer doesn't found
    if (!registered.has(webpack)) {
      registered.add(webpack)

      webpack.util.serialization.registerLoader(
        /^mini-css-extract-plugin\//,
        trueFn
      )
    }

    const { splitChunks } = compiler.options.optimization

    if (splitChunks) {
      if (
        /** @type {string[]} */ splitChunks.defaultSizeTypes.includes('...')
      ) {
        /** @type {string[]} */
        splitChunks.defaultSizeTypes.push(MODULE_TYPE)
      }
    }

    const CssModule = MiniCssExtractPlugin.getCssModule(webpack)
    const CssDependency = MiniCssExtractPlugin.getCssDependency(webpack)

    const { NormalModule } = compiler.webpack

    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      const { loader: normalModuleHook } =
        NormalModule.getCompilationHooks(compilation)

      normalModuleHook.tap(
        pluginName,
        /**
         * @param {object} loaderContext
         */
        (loaderContext) => {
          /** @type {object & { [pluginSymbol]: { experimentalUseImportModule: boolean | undefined } }} */
          // eslint-disable-next-line no-param-reassign
          loaderContext[pluginSymbol] = {
            experimentalUseImportModule:
              this.options.experimentalUseImportModule,
          }
        }
      )
    })

    compiler.hooks.thisCompilation.tap(pluginName, (compilation) => {
      class CssModuleFactory {
        /**
         * @param {{ dependencies: Dependency[] }} dependencies
         * @param {(arg0?: Error, arg1?: TODO) => void} callback
         */
        // eslint-disable-next-line class-methods-use-this
        create({ dependencies: [dependency] }, callback) {
          callback(
            // eslint-disable-next-line no-undefined
            undefined,
            new CssModule(/** @type {CssDependency} */ dependency)
          )
        }
      }

      compilation.dependencyFactories.set(CssDependency, new CssModuleFactory())

      class CssDependencyTemplate {
        // eslint-disable-next-line class-methods-use-this
        apply() {}
      }

      compilation.dependencyTemplates.set(
        CssDependency,
        new CssDependencyTemplate()
      )

      compilation.hooks.renderManifest.tap(
        pluginName,
        /**
         * @param {ReturnType<Compilation["getRenderManifest"]>} result
         * @param {Parameters<Compilation["getRenderManifest"]>[0]} chunk
         * @returns {TODO}
         */
        (result, { chunk }) => {
          const { chunkGraph } = compilation
          const { HotUpdateChunk } = webpack

          // We don't need hot update chunks for css
          // We will use the real asset instead to update
          if (chunk instanceof HotUpdateChunk) {
            return
          }

          /** @type {CssModule[]} */
          const renderedModules = Array.from(
            /** @type {CssModule[]} */
            this.getChunkModules(chunk, chunkGraph)
          ).filter(
            (module) =>
              // @ts-ignore
              module.type === MODULE_TYPE
          )

          const filenameTemplate =
            /** @type {string} */
            chunk.canBeInitial()
              ? this.options.filename
              : this.options.chunkFilename

          if (renderedModules.length > 0) {
            result.push({
              render: () =>
                this.renderContentAsset(
                  compiler,
                  compilation,
                  chunk,
                  renderedModules,
                  compilation.runtimeTemplate.requestShortener,
                  filenameTemplate,
                  {
                    contentHashType: MODULE_TYPE,
                    chunk,
                  }
                ),
              filenameTemplate,
              pathOptions: {
                chunk,
                contentHashType: MODULE_TYPE,
              },
              identifier: `${pluginName}.${chunk.id}`,
              hash: chunk.contentHash[MODULE_TYPE],
            })
          }
        }
      )

      compilation.hooks.contentHash.tap(pluginName, (chunk) => {
        const { outputOptions, chunkGraph } = compilation
        const modules = this.sortModules(
          compilation,
          chunk,
          /** @type {CssModule[]} */
          chunkGraph.getChunkModulesIterableBySourceType(chunk, MODULE_TYPE),
          compilation.runtimeTemplate.requestShortener
        )

        if (modules) {
          const { hashFunction, hashDigest, hashDigestLength } = outputOptions
          const { createHash } = compiler.webpack.util
          const hash = createHash(/** @type {string} */ hashFunction)

          for (const m of modules) {
            hash.update(chunkGraph.getModuleHash(m, chunk.runtime))
          }

          // eslint-disable-next-line no-param-reassign
          chunk.contentHash[MODULE_TYPE] =
            /** @type {string} */
            hash.digest(hashDigest).substring(0, hashDigestLength)
        }
      })

      // All the code below is dedicated to the runtime and can be skipped when the `runtime` option is `false`
      if (!this.options.runtime) {
        return
      }

      const { Template, RuntimeGlobals, RuntimeModule, runtime } = webpack

      /**
       * @param {Chunk} mainChunk
       * @param {Compilation} compilation
       * @returns {Record<string, number>}
       */
      // eslint-disable-next-line no-shadow
      const getCssChunkObject = (mainChunk, compilation) => {
        /** @type {Record<string, number>} */
        const obj = {}
        const { chunkGraph } = compilation

        for (const chunk of mainChunk.getAllAsyncChunks()) {
          const modules = chunkGraph.getOrderedChunkModulesIterable(
            chunk,
            compareModulesByIdentifier
          )

          for (const module of modules) {
            // @ts-ignore
            if (module.type === MODULE_TYPE) {
              obj[/** @type {string} */ chunk.id] = 1

              break
            }
          }
        }

        return obj
      }

      /**
       * @param {Chunk} chunk chunk
       * @param {ChunkGraph} chunkGraph chunk graph
       * @returns {boolean} true, when the chunk has css
       */
      function chunkHasCss(chunk, chunkGraph) {
        // this function replace:
        // const chunkHasCss = require("webpack/lib/css/CssModulesPlugin").chunkHasCss;
        return !!chunkGraph.getChunkModulesIterableBySourceType(
          chunk,
          'css/mini-extract'
        )
      }

      class CssLoadingRuntimeModule extends RuntimeModule {
        /**
         * @param {Set<string>} runtimeRequirements
         * @param {RuntimeOptions} runtimeOptions
         */
        constructor(runtimeRequirements, runtimeOptions) {
          super('css loading', 10)

          this.runtimeRequirements = runtimeRequirements
          this.runtimeOptions = runtimeOptions
        }

        generate() {
          const { chunkGraph, chunk, runtimeRequirements } = this
          const {
            runtimeTemplate,
            outputOptions: { crossOriginLoading },
          } = /** @type {Compilation} */ this.compilation
          const chunkMap = getCssChunkObject(
            /** @type {Chunk} */ chunk,
            /** @type {Compilation} */ this.compilation
          )
          const withLoading =
            runtimeRequirements.has(RuntimeGlobals.ensureChunkHandlers) &&
            Object.keys(chunkMap).length > 0
          const withHmr = runtimeRequirements.has(
            RuntimeGlobals.hmrDownloadUpdateHandlers
          )

          if (!withLoading && !withHmr) {
            return ''
          }

          const conditionMap =
            /** @type {ChunkGraph} */ chunkGraph.getChunkConditionMap(
              /** @type {Chunk} */ chunk,
              chunkHasCss
            )
          const hasCssMatcher = compileBooleanMatcher(conditionMap)
          const withPrefetch = runtimeRequirements.has(
            RuntimeGlobals.prefetchChunkHandlers
          )
          const withPreload = runtimeRequirements.has(
            RuntimeGlobals.preloadChunkHandlers
          )
          const { linkPreload, linkPrefetch } =
            MiniCssExtractPlugin.getCompilationHooks(compilation)

          return Template.asString([
            'if (typeof document === "undefined") return;',
            `var createStylesheet = ${runtimeTemplate.basicFunction(
              'chunkId, fullhref, oldTag, resolve, reject',
              [
                'var linkTag = document.createElement("link");',
                this.runtimeOptions.attributes
                  ? Template.asString(
                      Object.entries(this.runtimeOptions.attributes).map(
                        (entry) => {
                          const [key, value] = entry

                          return `linkTag.setAttribute(${JSON.stringify(
                            key
                          )}, ${JSON.stringify(value)});`
                        }
                      )
                    )
                  : '',
                'linkTag.rel = "stylesheet";',
                this.runtimeOptions.linkType
                  ? `linkTag.type = ${JSON.stringify(
                      this.runtimeOptions.linkType
                    )};`
                  : '',
                `if (${RuntimeGlobals.scriptNonce}) {`,
                Template.indent(
                  `linkTag.nonce = ${RuntimeGlobals.scriptNonce};`
                ),
                '}',
                `var onLinkComplete = ${runtimeTemplate.basicFunction('event', [
                  '// avoid mem leaks.',
                  'linkTag.onerror = linkTag.onload = null;',
                  "if (event.type === 'load') {",
                  Template.indent(['resolve();']),
                  '} else {',
                  Template.indent([
                    'var errorType = event && event.type;',
                    'var realHref = event && event.target && event.target.href || fullhref;',
                    'var err = new Error("Loading CSS chunk " + chunkId + " failed.\\n(" + errorType + ": " + realHref + ")");',
                    'err.name = "ChunkLoadError";',
                    // TODO remove `code` in the future major release to align with webpack
                    'err.code = "CSS_CHUNK_LOAD_FAILED";',
                    'err.type = errorType;',
                    'err.request = realHref;',
                    'if (linkTag.parentNode) linkTag.parentNode.removeChild(linkTag)',
                    'reject(err);',
                  ]),
                  '}',
                ])}`,
                'linkTag.onerror = linkTag.onload = onLinkComplete;',
                'linkTag.href = fullhref;',
                crossOriginLoading
                  ? Template.asString([
                      `if (linkTag.href.indexOf(window.location.origin + '/') !== 0) {`,
                      Template.indent(
                        `linkTag.crossOrigin = ${JSON.stringify(
                          crossOriginLoading
                        )};`
                      ),
                      '}',
                    ])
                  : '',
                MiniCssExtractPlugin.getCompilationHooks(
                  compilation
                ).beforeTagInsert.call('', {
                  tag: 'linkTag',
                  chunkId: 'chunkId',
                  href: 'fullhref',
                  resolve: 'resolve',
                  reject: 'reject',
                }) || '',
                typeof this.runtimeOptions.insert !== 'undefined'
                  ? typeof this.runtimeOptions.insert === 'function'
                    ? `(${this.runtimeOptions.insert.toString()})(linkTag)`
                    : Template.asString([
                        `var target = document.querySelector("${this.runtimeOptions.insert}");`,
                        `target.parentNode.insertBefore(linkTag, target.nextSibling);`,
                      ])
                  : Template.asString([
                      'if (oldTag) {',
                      Template.indent([
                        'oldTag.parentNode.insertBefore(linkTag, oldTag.nextSibling);',
                      ]),
                      '} else {',
                      Template.indent(['document.head.appendChild(linkTag);']),
                      '}',
                    ]),
                'return linkTag;',
              ]
            )};`,
            `var findStylesheet = ${runtimeTemplate.basicFunction(
              'href, fullhref',
              [
                'var existingLinkTags = document.getElementsByTagName("link");',
                'for(var i = 0; i < existingLinkTags.length; i++) {',
                Template.indent([
                  'var tag = existingLinkTags[i];',
                  'var dataHref = tag.getAttribute("data-href") || tag.getAttribute("href");',
                  'if(tag.rel === "stylesheet" && (dataHref === href || dataHref === fullhref)) return tag;',
                ]),
                '}',
                'var existingStyleTags = document.getElementsByTagName("style");',
                'for(var i = 0; i < existingStyleTags.length; i++) {',
                Template.indent([
                  'var tag = existingStyleTags[i];',
                  'var dataHref = tag.getAttribute("data-href");',
                  'if(dataHref === href || dataHref === fullhref) return tag;',
                ]),
                '}',
              ]
            )};`,
            `var loadStylesheet = ${runtimeTemplate.basicFunction(
              'chunkId',
              `return new Promise(${runtimeTemplate.basicFunction(
                'resolve, reject',
                [
                  `var href = ${RuntimeGlobals.require}.miniCssF(chunkId);`,
                  `var fullhref = ${RuntimeGlobals.publicPath} + href;`,
                  'var styleSheet = findStylesheet(href, fullhref);',
                  // TODO(jiwon): write descriptive comment
                  'if(styleSheet && !styleSheet.hasAttribute("data-n-p")) return resolve();',
                  'createStylesheet(chunkId, fullhref, null, resolve, reject);',
                ]
              )});`
            )}`,
            withLoading
              ? Template.asString([
                  '// object to store loaded CSS chunks',
                  'var installedCssChunks = {',
                  Template.indent(
                    /** @type {string[]} */

                    // eslint-disable-next-line no-whitespace-before-property
                    chunk /** @type {Chunk} */.ids
                      .map((id) => `${JSON.stringify(id)}: 0`)
                      .join(',\n')
                  ),
                  '};',
                  '',
                  `${
                    RuntimeGlobals.ensureChunkHandlers
                  }.miniCss = ${runtimeTemplate.basicFunction(
                    'chunkId, promises',
                    [
                      `var cssChunks = ${JSON.stringify(chunkMap)};`,
                      'if(installedCssChunks[chunkId]) promises.push(installedCssChunks[chunkId]);',
                      'else if(installedCssChunks[chunkId] !== 0 && cssChunks[chunkId]) {',
                      Template.indent([
                        `promises.push(installedCssChunks[chunkId] = loadStylesheet(chunkId).then(${runtimeTemplate.basicFunction(
                          '',
                          'installedCssChunks[chunkId] = 0;'
                        )}, ${runtimeTemplate.basicFunction('e', [
                          'delete installedCssChunks[chunkId];',
                          'throw e;',
                        ])}));`,
                      ]),
                      '}',
                    ]
                  )};`,
                ])
              : '// no chunk loading',
            '',
            withHmr
              ? Template.asString([
                  'var oldTags = [];',
                  'var newTags = [];',
                  `var applyHandler = ${runtimeTemplate.basicFunction(
                    'options',
                    [
                      `return { dispose: ${runtimeTemplate.basicFunction('', [
                        'for(var i = 0; i < oldTags.length; i++) {',
                        Template.indent([
                          'var oldTag = oldTags[i];',
                          'if(oldTag.parentNode) oldTag.parentNode.removeChild(oldTag);',
                        ]),
                        '}',
                        'oldTags.length = 0;',
                      ])}, apply: ${runtimeTemplate.basicFunction('', [
                        'for(var i = 0; i < newTags.length; i++) newTags[i].rel = "stylesheet";',
                        'newTags.length = 0;',
                      ])} };`,
                    ]
                  )}`,
                  `${
                    RuntimeGlobals.hmrDownloadUpdateHandlers
                  }.miniCss = ${runtimeTemplate.basicFunction(
                    'chunkIds, removedChunks, removedModules, promises, applyHandlers, updatedModulesList',
                    [
                      'applyHandlers.push(applyHandler);',
                      `chunkIds.forEach(${runtimeTemplate.basicFunction(
                        'chunkId',
                        [
                          `var href = ${RuntimeGlobals.require}.miniCssF(chunkId);`,
                          `var fullhref = ${RuntimeGlobals.publicPath} + href;`,
                          'var oldTag = findStylesheet(href, fullhref);',
                          'if(!oldTag) return;',
                          `promises.push(new Promise(${runtimeTemplate.basicFunction(
                            'resolve, reject',
                            [
                              `var tag = createStylesheet(chunkId, fullhref, oldTag, ${runtimeTemplate.basicFunction(
                                '',
                                [
                                  'tag.as = "style";',
                                  'tag.rel = "preload";',
                                  'resolve();',
                                ]
                              )}, reject);`,
                              'oldTags.push(oldTag);',
                              'newTags.push(tag);',
                            ]
                          )}));`,
                        ]
                      )});`,
                    ]
                  )}`,
                ])
              : '// no hmr',
            '',
            withPrefetch && hasCssMatcher !== false
              ? `${
                  RuntimeGlobals.prefetchChunkHandlers
                }.miniCss = ${runtimeTemplate.basicFunction('chunkId', [
                  `if((!${
                    RuntimeGlobals.hasOwnProperty
                  }(installedCssChunks, chunkId) || installedCssChunks[chunkId] === undefined) && ${
                    hasCssMatcher === true ? 'true' : hasCssMatcher('chunkId')
                  }) {`,
                  Template.indent([
                    'installedCssChunks[chunkId] = null;',
                    linkPrefetch.call(
                      Template.asString([
                        "var link = document.createElement('link');",
                        crossOriginLoading
                          ? `link.crossOrigin = ${JSON.stringify(
                              crossOriginLoading
                            )};`
                          : '',
                        `if (${RuntimeGlobals.scriptNonce}) {`,
                        Template.indent(
                          `link.setAttribute("nonce", ${RuntimeGlobals.scriptNonce});`
                        ),
                        '}',
                        'link.rel = "prefetch";',
                        'link.as = "style";',
                        `link.href = ${RuntimeGlobals.publicPath} + ${RuntimeGlobals.require}.miniCssF(chunkId);`,
                      ]),
                      /** @type {Chunk} */ chunk
                    ),
                    'document.head.appendChild(link);',
                  ]),
                  '}',
                ])};`
              : '// no prefetching',
            '',
            withPreload && hasCssMatcher !== false
              ? `${
                  RuntimeGlobals.preloadChunkHandlers
                }.miniCss = ${runtimeTemplate.basicFunction('chunkId', [
                  `if((!${
                    RuntimeGlobals.hasOwnProperty
                  }(installedCssChunks, chunkId) || installedCssChunks[chunkId] === undefined) && ${
                    hasCssMatcher === true ? 'true' : hasCssMatcher('chunkId')
                  }) {`,
                  Template.indent([
                    'installedCssChunks[chunkId] = null;',
                    linkPreload.call(
                      Template.asString([
                        "var link = document.createElement('link');",
                        "link.charset = 'utf-8';",
                        `if (${RuntimeGlobals.scriptNonce}) {`,
                        Template.indent(
                          `link.setAttribute("nonce", ${RuntimeGlobals.scriptNonce});`
                        ),
                        '}',
                        'link.rel = "preload";',
                        'link.as = "style";',
                        `link.href = ${RuntimeGlobals.publicPath} + ${RuntimeGlobals.require}.miniCssF(chunkId);`,
                        crossOriginLoading
                          ? crossOriginLoading === 'use-credentials'
                            ? 'link.crossOrigin = "use-credentials";'
                            : Template.asString([
                                "if (link.href.indexOf(window.location.origin + '/') !== 0) {",
                                Template.indent(
                                  `link.crossOrigin = ${JSON.stringify(
                                    crossOriginLoading
                                  )};`
                                ),
                                '}',
                              ])
                          : '',
                      ]),
                      /** @type {Chunk} */ chunk
                    ),
                    'document.head.appendChild(link);',
                  ]),
                  '}',
                ])};`
              : '// no preloaded',
          ])
        }
      }

      const enabledChunks = new WeakSet()

      /**
       * @param {Chunk} chunk
       * @param {Set<string>} set
       */
      const handler = (chunk, set) => {
        if (enabledChunks.has(chunk)) {
          return
        }

        enabledChunks.add(chunk)

        if (
          typeof this.options.chunkFilename === 'string' &&
          /\[(full)?hash(:\d+)?\]/.test(this.options.chunkFilename)
        ) {
          set.add(RuntimeGlobals.getFullHash)
        }

        set.add(RuntimeGlobals.publicPath)

        compilation.addRuntimeModule(
          chunk,
          new runtime.GetChunkFilenameRuntimeModule(
            MODULE_TYPE,
            'mini-css',
            `${RuntimeGlobals.require}.miniCssF`,
            /**
             * @param {Chunk} referencedChunk
             * @returns {TODO}
             */
            (referencedChunk) => {
              if (!referencedChunk.contentHash[MODULE_TYPE]) {
                return false
              }

              return referencedChunk.canBeInitial()
                ? this.options.filename
                : this.options.chunkFilename
            },
            false
          )
        )

        compilation.addRuntimeModule(
          chunk,
          new CssLoadingRuntimeModule(set, this.runtimeOptions)
        )
      }

      compilation.hooks.runtimeRequirementInTree
        .for(RuntimeGlobals.ensureChunkHandlers)
        .tap(pluginName, handler)
      compilation.hooks.runtimeRequirementInTree
        .for(RuntimeGlobals.hmrDownloadUpdateHandlers)
        .tap(pluginName, handler)
      compilation.hooks.runtimeRequirementInTree
        .for(RuntimeGlobals.prefetchChunkHandlers)
        .tap(pluginName, handler)
      compilation.hooks.runtimeRequirementInTree
        .for(RuntimeGlobals.preloadChunkHandlers)
        .tap(pluginName, handler)
    })
  }

  /**
   * @private
   * @param {Chunk} chunk
   * @param {ChunkGraph} chunkGraph
   * @returns {Iterable<Module>}
   */
  getChunkModules(chunk, chunkGraph) {
    return typeof chunkGraph !== 'undefined'
      ? chunkGraph.getOrderedChunkModulesIterable(
          chunk,
          compareModulesByIdentifier
        )
      : chunk.modulesIterable
  }

  /**
   * @private
   * @param {Compilation} compilation
   * @param {Chunk} chunk
   * @param {CssModule[]} modules
   * @param {Compilation["requestShortener"]} requestShortener
   * @returns {Set<CssModule>}
   */
  sortModules(compilation, chunk, modules, requestShortener) {
    let usedModules = this._sortedModulesCache.get(chunk)

    if (usedModules || !modules) {
      return /** @type {Set<CssModule>} */ usedModules
    }

    /** @type {CssModule[]} */
    const modulesList = [...modules]
    // Store dependencies for modules
    /** @type {Map<CssModule, Set<CssModule>>} */
    const moduleDependencies = new Map(
      modulesList.map((m) => [
        m,
        /** @type {Set<CssModule>} */
        new Set(),
      ])
    )
    /** @type {Map<CssModule, Map<CssModule, Set<ChunkGroup>>>} */
    const moduleDependenciesReasons = new Map(
      modulesList.map((m) => [m, new Map()])
    )
    // Get ordered list of modules per chunk group
    // This loop also gathers dependencies from the ordered lists
    // Lists are in reverse order to allow to use Array.pop()
    /** @type {CssModule[][]} */
    const modulesByChunkGroup = Array.from(
      chunk.groupsIterable,
      (chunkGroup) => {
        const sortedModules = modulesList
          .map((module) => {
            return {
              module,
              index: chunkGroup.getModulePostOrderIndex(module),
            }
          })
          // eslint-disable-next-line no-undefined
          .filter((item) => item.index !== undefined)
          .sort(
            (a, b) =>
              /** @type {number} */ b.index - /** @type {number} */ a.index
          )
          .map((item) => item.module)

        for (let i = 0; i < sortedModules.length; i++) {
          const set = moduleDependencies.get(sortedModules[i])

          const reasons =
            /** @type {Map<CssModule, Set<ChunkGroup>>} */
            moduleDependenciesReasons.get(sortedModules[i])

          for (let j = i + 1; j < sortedModules.length; j++) {
            const module = sortedModules[j]

            /** @type {Set<CssModule>} */
            set.add(module)

            const reason =
              reasons.get(module) || /** @type {Set<ChunkGroup>} */ new Set()

            reason.add(chunkGroup)

            reasons.set(module, reason)
          }
        }

        return sortedModules
      }
    )

    // set with already included modules in correct order
    usedModules = new Set()

    /**
     * @param {CssModule} m
     * @returns {boolean}
     */
    const unusedModulesFilter = (m) =>
      !(/** @type {Set<CssModule>} */ usedModules.has(m))

    while (usedModules.size < modulesList.length) {
      let success = false
      let bestMatch
      let bestMatchDeps

      // get first module where dependencies are fulfilled
      for (const list of modulesByChunkGroup) {
        // skip and remove already added modules
        while (list.length > 0 && usedModules.has(list[list.length - 1])) {
          list.pop()
        }

        // skip empty lists
        if (list.length !== 0) {
          const module = list[list.length - 1]
          const deps = moduleDependencies.get(module)
          // determine dependencies that are not yet included
          const failedDeps = Array.from(
            /** @type {Set<CssModule>} */
            deps
          ).filter(unusedModulesFilter)

          // store best match for fallback behavior
          if (!bestMatchDeps || bestMatchDeps.length > failedDeps.length) {
            bestMatch = list
            bestMatchDeps = failedDeps
          }

          if (failedDeps.length === 0) {
            // use this module and remove it from list
            usedModules.add(/** @type {CssModule} */ list.pop())
            success = true
            break
          }
        }
      }

      if (!success) {
        // no module found => there is a conflict
        // use list with fewest failed deps
        // and emit a warning
        const fallbackModule = /** @type {CssModule[]} */ bestMatch.pop()

        if (!this.options.ignoreOrder) {
          const reasons = moduleDependenciesReasons.get(
            /** @type {CssModule} */ fallbackModule
          )

          compilation.warnings.push(
            /** @type {WebpackError} */
            new Error(
              [
                `chunk ${chunk.name || chunk.id} [${pluginName}]`,
                'Conflicting order. Following module has been added:',
                ` * ${
                  /** @type {CssModule} */ fallbackModule.readableIdentifier(
                    requestShortener
                  )
                }`,
                'despite it was not able to fulfill desired ordering with these modules:',
                // eslint-disable-next-line rest-spread-spacing
                .../** @type {CssModule[]} */ bestMatchDeps.map((m) => {
                  const goodReasonsMap = moduleDependenciesReasons.get(m)
                  const goodReasons =
                    goodReasonsMap &&
                    goodReasonsMap.get(/** @type {CssModule} */ fallbackModule)
                  const failedChunkGroups = Array.from(
                    /** @type {Set<ChunkGroup>} */
                    /** @type {Map<CssModule, Set<ChunkGroup>>} */
                    reasons.get(m),
                    (cg) => cg.name
                  ).join(', ')
                  const goodChunkGroups =
                    goodReasons &&
                    Array.from(goodReasons, (cg) => cg.name).join(', ')
                  return [
                    ` * ${m.readableIdentifier(requestShortener)}`,
                    `   - couldn't fulfill desired order of chunk group(s) ${failedChunkGroups}`,
                    goodChunkGroups &&
                      `   - while fulfilling desired order of chunk group(s) ${goodChunkGroups}`,
                  ]
                    .filter(Boolean)
                    .join('\n')
                }),
              ].join('\n')
            )
          )
        }

        usedModules.add(/** @type {CssModule} */ fallbackModule)
      }
    }

    this._sortedModulesCache.set(chunk, usedModules)

    return usedModules
  }

  /**
   * @private
   * @param {Compiler} compiler
   * @param {Compilation} compilation
   * @param {Chunk} chunk
   * @param {CssModule[]} modules
   * @param {Compiler["requestShortener"]} requestShortener
   * @param {string} filenameTemplate
   * @param {Parameters<Exclude<Required<Configuration>['output']['filename'], string | undefined>>[0]} pathData
   * @returns {Source}
   */
  renderContentAsset(
    compiler,
    compilation,
    chunk,
    modules,
    requestShortener,
    filenameTemplate,
    pathData
  ) {
    const usedModules = this.sortModules(
      compilation,
      chunk,
      modules,
      requestShortener
    )

    const { ConcatSource, SourceMapSource, RawSource } =
      compiler.webpack.sources
    const source = new ConcatSource()
    const externalsSource = new ConcatSource()

    for (const module of usedModules) {
      let content = module.content.toString()

      const readableIdentifier = module.readableIdentifier(requestShortener)
      const startsWithAtRuleImport = /^@import url/.test(content)

      let header

      if (compilation.outputOptions.pathinfo) {
        // From https://github.com/webpack/webpack/blob/29eff8a74ecc2f87517b627dee451c2af9ed3f3f/lib/ModuleInfoHeaderPlugin.js#L191-L194
        const reqStr = readableIdentifier.replace(/\*\//g, '*_/')
        const reqStrStar = '*'.repeat(reqStr.length)
        const headerStr = `/*!****${reqStrStar}****!*\\\n  !*** ${reqStr} ***!\n  \\****${reqStrStar}****/\n`

        header = new RawSource(headerStr)
      }

      if (startsWithAtRuleImport) {
        if (typeof header !== 'undefined') {
          externalsSource.add(header)
        }

        // HACK for IE
        // http://stackoverflow.com/a/14676665/1458162
        if (
          module.media ||
          module.supports ||
          typeof module.layer !== 'undefined'
        ) {
          let atImportExtra = ''

          const needLayer = typeof module.layer !== 'undefined'

          if (needLayer) {
            atImportExtra +=
              module.layer.length > 0 ? ` layer(${module.layer})` : ' layer'
          }

          if (module.supports) {
            atImportExtra += ` supports(${module.supports})`
          }

          if (module.media) {
            atImportExtra += ` ${module.media}`
          }

          // insert media into the @import
          // this is rar
          // TODO improve this and parse the CSS to support multiple medias
          content = content.replace(/;|\s*$/, `${atImportExtra};`)
        }

        externalsSource.add(content)
        externalsSource.add('\n')
      } else {
        if (typeof header !== 'undefined') {
          source.add(header)
        }

        if (module.supports) {
          source.add(`@supports (${module.supports}) {\n`)
        }

        if (module.media) {
          source.add(`@media ${module.media} {\n`)
        }

        const needLayer = typeof module.layer !== 'undefined'

        if (needLayer) {
          source.add(
            `@layer${module.layer.length > 0 ? ` ${module.layer}` : ''} {\n`
          )
        }

        const { path: filename } = compilation.getPathWithInfo(
          filenameTemplate,
          pathData
        )

        const undoPath = getUndoPath(filename, compiler.outputPath, false)

        // replacements
        content = content.replace(new RegExp(ABSOLUTE_PUBLIC_PATH, 'g'), '')
        content = content.replace(new RegExp(SINGLE_DOT_PATH_SEGMENT, 'g'), '.')
        content = content.replace(new RegExp(AUTO_PUBLIC_PATH, 'g'), undoPath)

        const entryOptions = chunk.getEntryOptions()
        const baseUriReplacement =
          (entryOptions && entryOptions.baseUri) || undoPath
        content = content.replace(new RegExp(BASE_URI, 'g'), baseUriReplacement)

        if (module.sourceMap) {
          source.add(
            new SourceMapSource(
              content,
              readableIdentifier,
              module.sourceMap.toString()
            )
          )
        } else {
          source.add(new RawSource(content))
        }

        source.add('\n')

        if (needLayer) {
          source.add('}\n')
        }

        if (module.media) {
          source.add('}\n')
        }

        if (module.supports) {
          source.add('}\n')
        }
      }
    }

    return new ConcatSource(externalsSource, source)
  }
}

MiniCssExtractPlugin.pluginName = pluginName
MiniCssExtractPlugin.pluginSymbol = pluginSymbol
MiniCssExtractPlugin.loader = require.resolve('./loader')

module.exports = MiniCssExtractPlugin
