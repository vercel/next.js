const path = require('path')

const {
  findModuleById,
  evalModuleCode,
  AUTO_PUBLIC_PATH,
  ABSOLUTE_PUBLIC_PATH,
  BASE_URI,
  SINGLE_DOT_PATH_SEGMENT,
  stringifyRequest,
  stringifyLocal,
} = require('./utils')
const schema = {
  title: 'Mini CSS Extract Plugin Loader options',
  type: 'object',
  additionalProperties: false,
  properties: {
    publicPath: {
      anyOf: [
        {
          type: 'string',
        },
        {
          instanceof: 'Function',
        },
      ],
      description:
        'Specifies a custom public path for the external resources like images, files, etc inside CSS.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#publicpath',
    },
    emit: {
      type: 'boolean',
      description:
        'If true, emits a file (writes a file to the filesystem). If false, the plugin will extract the CSS but will not emit the file',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#emit',
    },
    esModule: {
      type: 'boolean',
      description: 'Generates JS modules that use the ES modules syntax.',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#esmodule',
    },
    layer: {
      type: 'string',
    },
    defaultExport: {
      type: 'boolean',
      description:
        'Duplicate the named export with CSS modules locals to the default export (only when `esModules: true` for css-loader).',
      link: 'https://github.com/webpack-contrib/mini-css-extract-plugin#defaultexports',
    },
  },
}

const MiniCssExtractPlugin = require('./index')

/** @typedef {import("schema-utils/declarations/validate").Schema} Schema */
/** @typedef {import("webpack").Compiler} Compiler */
/** @typedef {import("webpack").Compilation} Compilation */
/** @typedef {import("webpack").Chunk} Chunk */
/** @typedef {import("webpack").Module} Module */
/** @typedef {import("webpack").sources.Source} Source */
/** @typedef {import("webpack").AssetInfo} AssetInfo */
/** @typedef {import("webpack").NormalModule} NormalModule */
/** @typedef {import("./index.js").LoaderOptions} LoaderOptions */
/** @typedef {{ [key: string]: string | function }} Locals */

/** @typedef {any} TODO */

/**
 * @typedef {Object} Dependency
 * @property {string} identifier
 * @property {string | null} context
 * @property {Buffer} content
 * @property {string} media
 * @property {string} [supports]
 * @property {string} [layer]
 * @property {Buffer} [sourceMap]
 */

/**
 * @param {string} content
 * @param {{ loaderContext: import("webpack").LoaderContext<LoaderOptions>, options: LoaderOptions, locals: Locals | undefined }} context
 * @returns {string}
 */
function hotLoader(content, context) {
  const localsJsonString = JSON.stringify(JSON.stringify(context.locals))
  return `${content}
    if(module.hot) {
      (function() {
        var localsJsonString = ${localsJsonString};
        // ${Date.now()}
        var cssReload = require(${stringifyRequest(
          context.loaderContext,
          path.join(__dirname, 'hmr/hotModuleReplacement.js')
        )})(module.id, ${JSON.stringify(context.options)});
        // only invalidate when locals change
        if (
          module.hot.data &&
          module.hot.data.value &&
          module.hot.data.value !== localsJsonString
        ) {
          module.hot.invalidate();
        } else {
          module.hot.accept();
        }
        module.hot.dispose(function(data) {
          data.value = localsJsonString;
          cssReload();
        });
      })();
    }
  `
}

/**
 * @this {import("webpack").LoaderContext<LoaderOptions>}
 * @param {string} request
 */
function pitch(request) {
  if (
    this._compiler &&
    this._compiler.options &&
    this._compiler.options.experiments &&
    this._compiler.options.experiments.css &&
    this._module &&
    (this._module.type === 'css' ||
      this._module.type === 'css/auto' ||
      this._module.type === 'css/global' ||
      this._module.type === 'css/module')
  ) {
    this.emitWarning(
      new Error(
        'You can\'t use `experiments.css` (`experiments.futureDefaults` enable built-in CSS support by default) and `mini-css-extract-plugin` together, please set `experiments.css` to `false` or set `{ type: "javascript/auto" }` for rules with `mini-css-extract-plugin` in your webpack config (now `mini-css-extract-plugin` does nothing).'
      )
    )

    return
  }

  // @ts-ignore
  const options = this.getOptions(/** @type {Schema} */ (schema))
  const emit = typeof options.emit !== 'undefined' ? options.emit : true
  const callback = this.async()
  const optionsFromPlugin = /** @type {TODO} */ (this)[
    MiniCssExtractPlugin.pluginSymbol
  ]

  if (!optionsFromPlugin) {
    callback(
      new Error(
        "You forgot to add 'mini-css-extract-plugin' plugin (i.e. `{ plugins: [new MiniCssExtractPlugin()] }`), please read https://github.com/webpack-contrib/mini-css-extract-plugin#getting-started"
      )
    )

    return
  }

  const { webpack } = /** @type {Compiler} */ (this._compiler)

  /**
   * @param {TODO} originalExports
   * @param {Compilation} [compilation]
   * @param {{ [name: string]: Source }} [assets]
   * @param {Map<string, AssetInfo>} [assetsInfo]
   * @returns {void}
   */
  const handleExports = (originalExports, compilation, assets, assetsInfo) => {
    /** @type {Locals | undefined} */
    let locals
    let namedExport

    const esModule =
      typeof options.esModule !== 'undefined' ? options.esModule : true

    /**
     * @param {Dependency[] | [null, object][]} dependencies
     */
    const addDependencies = (dependencies) => {
      if (!Array.isArray(dependencies) && dependencies != null) {
        throw new Error(
          `Exported value was not extracted as an array: ${JSON.stringify(
            dependencies
          )}`
        )
      }

      const identifierCountMap = new Map()
      let lastDep

      for (const dependency of dependencies) {
        if (!(/** @type {Dependency} */ (dependency).identifier) || !emit) {
          // eslint-disable-next-line no-continue
          continue
        }

        const count =
          identifierCountMap.get(
            /** @type {Dependency} */ (dependency).identifier
          ) || 0
        const CssDependency = MiniCssExtractPlugin.getCssDependency(webpack)

        /** @type {NormalModule} */
        this._module.addDependency(
          (lastDep = new CssDependency(
            /** @type {Dependency} */
            (dependency),
            /** @type {Dependency} */
            (dependency).context,
            count
          ))
        )
        identifierCountMap.set(
          /** @type {Dependency} */
          (dependency).identifier,
          count + 1
        )
      }

      if (lastDep && assets) {
        lastDep.assets = assets
        lastDep.assetsInfo = assetsInfo
      }
    }

    try {
      // eslint-disable-next-line no-underscore-dangle
      const exports = originalExports.__esModule
        ? originalExports.default
        : originalExports

      namedExport =
        // eslint-disable-next-line no-underscore-dangle
        originalExports.__esModule &&
        (!originalExports.default || !('locals' in originalExports.default))

      if (namedExport) {
        Object.keys(originalExports).forEach((key) => {
          if (key !== 'default') {
            if (!locals) {
              locals = {}
            }

            /** @type {Locals} */ locals[key] = originalExports[key]
          }
        })
      } else {
        locals = exports && exports.locals
      }

      /** @type {Dependency[] | [null, object][]} */
      let dependencies

      if (!Array.isArray(exports)) {
        dependencies = [[null, exports]]
      } else {
        dependencies = exports.map(
          ([id, content, media, sourceMap, supports, layer]) => {
            let identifier = id
            let context

            if (compilation) {
              const module =
                /** @type {Module} */
                (findModuleById(compilation, id))

              identifier = module.identifier()
              ;({ context } = module)
            } else {
              // TODO check if this context is used somewhere
              context = this.rootContext
            }

            return {
              identifier,
              context,
              content: Buffer.from(content),
              media,
              supports,
              layer,
              sourceMap: sourceMap
                ? Buffer.from(JSON.stringify(sourceMap))
                : // eslint-disable-next-line no-undefined
                  undefined,
            }
          }
        )
      }

      addDependencies(dependencies)
    } catch (e) {
      callback(/** @type {Error} */ (e))

      return
    }

    const result = (function makeResult() {
      const defaultExport =
        typeof options.defaultExport !== 'undefined'
          ? options.defaultExport
          : false

      if (locals) {
        if (namedExport) {
          const identifiers = Array.from(
            (function* generateIdentifiers() {
              let identifierId = 0

              for (const key of Object.keys(locals)) {
                identifierId += 1

                yield [`_${identifierId.toString(16)}`, key]
              }
            })()
          )

          const localsString = identifiers
            .map(
              ([id, key]) =>
                `\nvar ${id} = ${stringifyLocal(
                  /** @type {Locals} */ (locals)[key]
                )};`
            )
            .join('')
          const exportsString = `export { ${identifiers
            .map(([id, key]) => `${id} as ${JSON.stringify(key)}`)
            .join(', ')} }`

          return defaultExport
            ? `${localsString}\n${exportsString}\nexport default { ${identifiers
                .map(([id, key]) => `${JSON.stringify(key)}: ${id}`)
                .join(', ')} }\n`
            : `${localsString}\n${exportsString}\n`
        }

        return `\n${
          esModule ? 'export default' : 'module.exports = '
        } ${JSON.stringify(locals)};`
      } else if (esModule) {
        return defaultExport ? '\nexport {};export default {};' : '\nexport {};'
      }
      return ''
    })()

    let resultSource = `// extracted by ${MiniCssExtractPlugin.pluginName}`

    // only attempt hotreloading if the css is actually used for something other than hash values
    resultSource +=
      this.hot && emit
        ? hotLoader(result, { loaderContext: this, options, locals })
        : result

    callback(null, resultSource)
  }

  let { publicPath } =
    /** @type {Compilation} */
    (this._compilation).outputOptions

  if (typeof options.publicPath === 'string') {
    // eslint-disable-next-line prefer-destructuring
    publicPath = options.publicPath
  } else if (typeof options.publicPath === 'function') {
    publicPath = options.publicPath(this.resourcePath, this.rootContext)
  }

  if (publicPath === 'auto') {
    publicPath = AUTO_PUBLIC_PATH
  }

  if (
    (typeof optionsFromPlugin.experimentalUseImportModule === 'undefined' &&
      typeof this.importModule === 'function') ||
    optionsFromPlugin.experimentalUseImportModule
  ) {
    if (!this.importModule) {
      callback(
        new Error(
          "You are using 'experimentalUseImportModule' but 'this.importModule' is not available in loader context. You need to have at least webpack 5.33.2."
        )
      )
      return
    }

    let publicPathForExtract

    if (typeof publicPath === 'string') {
      const isAbsolutePublicPath = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/.test(publicPath)

      publicPathForExtract = isAbsolutePublicPath
        ? publicPath
        : `${ABSOLUTE_PUBLIC_PATH}${publicPath.replace(
            /\./g,
            SINGLE_DOT_PATH_SEGMENT
          )}`
    } else {
      publicPathForExtract = publicPath
    }

    this.importModule(
      `${this.resourcePath}.webpack[javascript/auto]!=!!!${request}`,
      {
        layer: options.layer,
        publicPath: /** @type {string} */ (publicPathForExtract),
        baseUri: `${BASE_URI}/`,
      },
      /**
       * @param {Error | null | undefined} error
       * @param {object} exports
       */
      (error, exports) => {
        if (error) {
          callback(error)

          return
        }

        handleExports(exports)
      }
    )
    return
  }

  const loaders = this.loaders.slice(this.loaderIndex + 1)

  this.addDependency(this.resourcePath)

  const childFilename = '*'

  const outputOptions = {
    filename: childFilename,
    publicPath,
  }

  const childCompiler =
    /** @type {Compilation} */
    (this._compilation).createChildCompiler(
      `${MiniCssExtractPlugin.pluginName} ${request}`,
      outputOptions
    )

  // The templates are compiled and executed by NodeJS - similar to server side rendering
  // Unfortunately this causes issues as some loaders require an absolute URL to support ES Modules
  // The following config enables relative URL support for the child compiler
  childCompiler.options.module = { ...childCompiler.options.module }
  childCompiler.options.module.parser = {
    ...childCompiler.options.module.parser,
  }
  childCompiler.options.module.parser.javascript = {
    ...childCompiler.options.module.parser.javascript,
    url: 'relative',
  }

  const { NodeTemplatePlugin } = webpack.node
  const { NodeTargetPlugin } = webpack.node

  // @ts-ignore
  new NodeTemplatePlugin(outputOptions).apply(childCompiler)
  new NodeTargetPlugin().apply(childCompiler)

  const { EntryOptionPlugin } = webpack

  const {
    library: { EnableLibraryPlugin },
  } = webpack

  new EnableLibraryPlugin('commonjs2').apply(childCompiler)

  EntryOptionPlugin.applyEntryOption(childCompiler, this.context, {
    child: {
      library: {
        type: 'commonjs2',
      },
      import: [`!!${request}`],
    },
  })
  const { LimitChunkCountPlugin } = webpack.optimize

  new LimitChunkCountPlugin({ maxChunks: 1 }).apply(childCompiler)

  const { NormalModule } = webpack

  childCompiler.hooks.thisCompilation.tap(
    `${MiniCssExtractPlugin.pluginName} loader`,
    /**
     * @param {Compilation} compilation
     */
    (compilation) => {
      const normalModuleHook =
        NormalModule.getCompilationHooks(compilation).loader

      normalModuleHook.tap(
        `${MiniCssExtractPlugin.pluginName} loader`,
        (loaderContext, module) => {
          if (module.request === request) {
            // eslint-disable-next-line no-param-reassign, no-shadow
            module.loaders = loaders.map((loader) => {
              return {
                type: null,
                loader: loader.path,
                options: loader.options,
                ident: loader.ident,
              }
            })
          }
        }
      )
    }
  )

  /** @type {string | Buffer} */
  let source

  childCompiler.hooks.compilation.tap(
    MiniCssExtractPlugin.pluginName,
    /**
     * @param {Compilation} compilation
     */
    (compilation) => {
      compilation.hooks.processAssets.tap(
        MiniCssExtractPlugin.pluginName,
        () => {
          source =
            compilation.assets[childFilename] &&
            compilation.assets[childFilename].source()

          // Remove all chunk assets
          compilation.chunks.forEach((chunk) => {
            chunk.files.forEach((file) => {
              compilation.deleteAsset(file)
            })
          })
        }
      )
    }
  )

  childCompiler.runAsChild((error, entries, compilation) => {
    if (error) {
      callback(error)

      return
    }

    if (/** @type {Compilation} */ (compilation).errors.length > 0) {
      callback(/** @type {Compilation} */ (compilation).errors[0])

      return
    }

    /** @type {{ [name: string]: Source }} */
    const assets = Object.create(null)
    /** @type {Map<string, AssetInfo>} */
    const assetsInfo = new Map()

    for (const asset of /** @type {Compilation} */ (compilation).getAssets()) {
      assets[asset.name] = asset.source
      assetsInfo.set(asset.name, asset.info)
    }

    /** @type {Compilation} */
    compilation.fileDependencies.forEach((dep) => {
      this.addDependency(dep)
    }, this)

    /** @type {Compilation} */
    compilation.contextDependencies.forEach((dep) => {
      this.addContextDependency(dep)
    }, this)

    if (!source) {
      callback(new Error("Didn't get a result from child compiler"))

      return
    }

    let originalExports
    try {
      originalExports = evalModuleCode(this, source, request)
    } catch (e) {
      callback(/** @type {Error} */ (e))

      return
    }

    handleExports(originalExports, compilation, assets, assetsInfo)
  })
}

/**
 * @this {import("webpack").LoaderContext<LoaderOptions>}
 * @param {string} content
 */
// eslint-disable-next-line consistent-return
function loader(content) {
  if (
    this._compiler &&
    this._compiler.options &&
    this._compiler.options.experiments &&
    this._compiler.options.experiments.css &&
    this._module &&
    (this._module.type === 'css' ||
      this._module.type === 'css/auto' ||
      this._module.type === 'css/global' ||
      this._module.type === 'css/module')
  ) {
    return content
  }
}

module.exports = loader
module.exports.pitch = pitch
module.exports.hotLoader = hotLoader
