"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;
exports.pitch = pitch;

var _path = _interopRequireDefault(require("path"));

var _utils = require("./utils");

var _loaderOptions = _interopRequireDefault(require("./loader-options.json"));

var _index = _interopRequireWildcard(require("./index"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function hotLoader(content, context) {
  const accept = context.locals ? "" : "module.hot.accept(undefined, cssReload);";
  return `${content}
    if(module.hot) {
      // ${Date.now()}
      var cssReload = require(${(0, _utils.stringifyRequest)(context.context, _path.default.join(__dirname, "hmr/hotModuleReplacement.js"))})(module.id, ${JSON.stringify({ ...context.options,
    locals: !!context.locals
  })});
      module.hot.dispose(cssReload);
      ${accept}
    }
  `;
}

function pitch(request) {
  const options = this.getOptions(_loaderOptions.default);
  const callback = this.async();
  const optionsFromPlugin = this[_index.pluginSymbol];

  if (!optionsFromPlugin) {
    callback(new Error("You forgot to add 'mini-css-extract-plugin' plugin (i.e. `{ plugins: [new MiniCssExtractPlugin()] }`), please read https://github.com/webpack-contrib/mini-css-extract-plugin#getting-started"));
    return;
  }

  const {
    webpack
  } = this._compiler;

  const handleExports = (originalExports, compilation, assets, assetsInfo) => {
    let locals;
    let namedExport;
    const esModule = typeof options.esModule !== "undefined" ? options.esModule : true;

    const addDependencies = dependencies => {
      if (!Array.isArray(dependencies) && dependencies != null) {
        throw new Error(`Exported value was not extracted as an array: ${JSON.stringify(dependencies)}`);
      }

      const identifierCountMap = new Map();
      const emit = typeof options.emit !== "undefined" ? options.emit : true;
      let lastDep;

      for (const dependency of dependencies) {
        if (!dependency.identifier || !emit) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const count = identifierCountMap.get(dependency.identifier) || 0;

        const CssDependency = _index.default.getCssDependency(webpack);

        this._module.addDependency(lastDep = new CssDependency(dependency, dependency.context, count));

        identifierCountMap.set(dependency.identifier, count + 1);
      }

      if (lastDep && assets) {
        lastDep.assets = assets;
        lastDep.assetsInfo = assetsInfo;
      }
    };

    try {
      // eslint-disable-next-line no-underscore-dangle
      const exports = originalExports.__esModule ? originalExports.default : originalExports;
      namedExport = // eslint-disable-next-line no-underscore-dangle
      originalExports.__esModule && (!originalExports.default || !("locals" in originalExports.default));

      if (namedExport) {
        Object.keys(originalExports).forEach(key => {
          if (key !== "default") {
            if (!locals) {
              locals = {};
            }

            locals[key] = originalExports[key];
          }
        });
      } else {
        locals = exports && exports.locals;
      }

      let dependencies;

      if (!Array.isArray(exports)) {
        dependencies = [[null, exports]];
      } else {
        dependencies = exports.map(([id, content, media, sourceMap, supports, layer]) => {
          let identifier = id;
          let context;

          if (compilation) {
            const module = (0, _utils.findModuleById)(compilation, id);
            identifier = module.identifier();
            ({
              context
            } = module);
          } else {
            // TODO check if this context is used somewhere
            context = this.rootContext;
          }

          return {
            identifier,
            context,
            content: Buffer.from(content),
            media,
            supports,
            layer,
            sourceMap: sourceMap ? Buffer.from(JSON.stringify(sourceMap)) : // eslint-disable-next-line no-undefined
            undefined
          };
        });
      }

      addDependencies(dependencies);
    } catch (e) {
      return callback(e);
    }

    const result = locals ? namedExport ? Object.keys(locals).map(key => `\nexport var ${key} = ${JSON.stringify(locals[key])};`).join("") : `\n${esModule ? "export default" : "module.exports ="} ${JSON.stringify(locals)};` : esModule ? `\nexport {};` : "";
    let resultSource = `// extracted by ${_index.pluginName}`;
    resultSource += this.hot ? hotLoader(result, {
      context: this.context,
      options,
      locals
    }) : result;
    return callback(null, resultSource);
  };

  let {
    publicPath
  } = this._compilation.outputOptions;

  if (typeof options.publicPath === "string") {
    // eslint-disable-next-line prefer-destructuring
    publicPath = options.publicPath;
  } else if (typeof options.publicPath === "function") {
    publicPath = options.publicPath(this.resourcePath, this.rootContext);
  }

  if (publicPath === "auto") {
    publicPath = _utils.AUTO_PUBLIC_PATH;
  }

  if (typeof optionsFromPlugin.experimentalUseImportModule === "undefined" && typeof this.importModule === "function" || optionsFromPlugin.experimentalUseImportModule) {
    if (!this.importModule) {
      callback(new Error("You are using 'experimentalUseImportModule' but 'this.importModule' is not available in loader context. You need to have at least webpack 5.33.2."));
      return;
    }

    const isAbsolutePublicPath = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/.test(publicPath);
    const publicPathForExtract = isAbsolutePublicPath ? publicPath : `${_utils.ABSOLUTE_PUBLIC_PATH}${publicPath.replace(/\./g, _utils.SINGLE_DOT_PATH_SEGMENT)}`;
    this.importModule(`${this.resourcePath}.webpack[javascript/auto]!=!!!${request}`, {
      layer: options.layer,
      publicPath: publicPathForExtract
    }, (error, exports) => {
      if (error) {
        callback(error);
        return;
      }

      handleExports(exports);
    });
    return;
  }

  const loaders = this.loaders.slice(this.loaderIndex + 1);
  this.addDependency(this.resourcePath);
  const childFilename = "*";
  const outputOptions = {
    filename: childFilename,
    publicPath
  };

  const childCompiler = this._compilation.createChildCompiler(`${_index.pluginName} ${request}`, outputOptions); // The templates are compiled and executed by NodeJS - similar to server side rendering
  // Unfortunately this causes issues as some loaders require an absolute URL to support ES Modules
  // The following config enables relative URL support for the child compiler


  childCompiler.options.module = { ...childCompiler.options.module
  };
  childCompiler.options.module.parser = { ...childCompiler.options.module.parser
  };
  childCompiler.options.module.parser.javascript = { ...childCompiler.options.module.parser.javascript,
    url: "relative"
  };
  const {
    NodeTemplatePlugin
  } = webpack.node;
  const {
    NodeTargetPlugin
  } = webpack.node;
  new NodeTemplatePlugin(outputOptions).apply(childCompiler);
  new NodeTargetPlugin().apply(childCompiler);
  const {
    EntryOptionPlugin
  } = webpack;
  const {
    library: {
      EnableLibraryPlugin
    }
  } = webpack;
  new EnableLibraryPlugin("commonjs2").apply(childCompiler);
  EntryOptionPlugin.applyEntryOption(childCompiler, this.context, {
    child: {
      library: {
        type: "commonjs2"
      },
      import: [`!!${request}`]
    }
  });
  const {
    LimitChunkCountPlugin
  } = webpack.optimize;
  new LimitChunkCountPlugin({
    maxChunks: 1
  }).apply(childCompiler);
  const {
    NormalModule
  } = webpack;
  childCompiler.hooks.thisCompilation.tap(`${_index.pluginName} loader`, compilation => {
    const normalModuleHook = NormalModule.getCompilationHooks(compilation).loader;
    normalModuleHook.tap(`${_index.pluginName} loader`, (loaderContext, module) => {
      if (module.request === request) {
        // eslint-disable-next-line no-param-reassign
        module.loaders = loaders.map(loader => {
          return {
            loader: loader.path,
            options: loader.options,
            ident: loader.ident
          };
        });
      }
    });
  });
  let source;
  childCompiler.hooks.compilation.tap(_index.pluginName, compilation => {
    compilation.hooks.processAssets.tap(_index.pluginName, () => {
      source = compilation.assets[childFilename] && compilation.assets[childFilename].source(); // Remove all chunk assets

      compilation.chunks.forEach(chunk => {
        chunk.files.forEach(file => {
          compilation.deleteAsset(file);
        });
      });
    });
  });
  childCompiler.runAsChild((error, entries, compilation) => {
    if (error) {
      return callback(error);
    }

    if (compilation.errors.length > 0) {
      return callback(compilation.errors[0]);
    }

    const assets = Object.create(null);
    const assetsInfo = new Map();

    for (const asset of compilation.getAssets()) {
      assets[asset.name] = asset.source;
      assetsInfo.set(asset.name, asset.info);
    }

    compilation.fileDependencies.forEach(dep => {
      this.addDependency(dep);
    }, this);
    compilation.contextDependencies.forEach(dep => {
      this.addContextDependency(dep);
    }, this);

    if (!source) {
      return callback(new Error("Didn't get a result from child compiler"));
    }

    let originalExports;

    try {
      originalExports = (0, _utils.evalModuleCode)(this, source, request);
    } catch (e) {
      return callback(e);
    }

    return handleExports(originalExports, compilation, assets, assetsInfo);
  });
} // eslint-disable-next-line func-names


function _default(content) {
  console.log(content);
}