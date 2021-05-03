module.exports =
/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 480:
/***/ ((module) => {

"use strict";
module.exports = JSON.parse("{\"type\":\"object\",\"additionalProperties\":false,\"properties\":{\"publicPath\":{\"anyOf\":[{\"type\":\"string\"},{\"instanceof\":\"Function\"}]},\"emit\":{\"type\":\"boolean\"},\"esModule\":{\"type\":\"boolean\"},\"layer\":{\"type\":\"string\"},\"modules\":{\"type\":\"object\",\"additionalProperties\":false,\"properties\":{\"namedExport\":{\"description\":\"Enables/disables ES modules named export for locals (https://webpack.js.org/plugins/mini-css-extract-plugin/#namedexport).\",\"type\":\"boolean\"}}}}}");

/***/ }),

/***/ 736:
/***/ ((module) => {

"use strict";


class LoadingLoaderError extends Error {
	constructor(message) {
		super(message);
		this.name = "LoaderRunnerError";
		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = LoadingLoaderError;


/***/ }),

/***/ 278:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
var fs = __nccwpck_require__(747);
var readFile = fs.readFile.bind(fs);
var loadLoader = __nccwpck_require__(384);

function utf8BufferToString(buf) {
	var str = buf.toString("utf-8");
	if(str.charCodeAt(0) === 0xFEFF) {
		return str.substr(1);
	} else {
		return str;
	}
}

function splitQuery(req) {
	var i = req.indexOf("?");
	if(i < 0) return [req, ""];
	return [req.substr(0, i), req.substr(i)];
}

function dirname(path) {
	if(path === "/") return "/";
	var i = path.lastIndexOf("/");
	var j = path.lastIndexOf("\\");
	var i2 = path.indexOf("/");
	var j2 = path.indexOf("\\");
	var idx = i > j ? i : j;
	var idx2 = i > j ? i2 : j2;
	if(idx < 0) return path;
	if(idx === idx2) return path.substr(0, idx + 1);
	return path.substr(0, idx);
}

function createLoaderObject(loader) {
	var obj = {
		path: null,
		query: null,
		options: null,
		ident: null,
		normal: null,
		pitch: null,
		raw: null,
		data: null,
		pitchExecuted: false,
		normalExecuted: false
	};
	Object.defineProperty(obj, "request", {
		enumerable: true,
		get: function() {
			return obj.path + obj.query;
		},
		set: function(value) {
			if(typeof value === "string") {
				var splittedRequest = splitQuery(value);
				obj.path = splittedRequest[0];
				obj.query = splittedRequest[1];
				obj.options = undefined;
				obj.ident = undefined;
			} else {
				if(!value.loader)
					throw new Error("request should be a string or object with loader and object (" + JSON.stringify(value) + ")");
				obj.path = value.loader;
				obj.options = value.options;
				obj.ident = value.ident;
				if(obj.options === null)
					obj.query = "";
				else if(obj.options === undefined)
					obj.query = "";
				else if(typeof obj.options === "string")
					obj.query = "?" + obj.options;
				else if(obj.ident)
					obj.query = "??" + obj.ident;
				else if(typeof obj.options === "object" && obj.options.ident)
					obj.query = "??" + obj.options.ident;
				else
					obj.query = "?" + JSON.stringify(obj.options);
			}
		}
	});
	obj.request = loader;
	if(Object.preventExtensions) {
		Object.preventExtensions(obj);
	}
	return obj;
}

function runSyncOrAsync(fn, context, args, callback) {
	var isSync = true;
	var isDone = false;
	var isError = false; // internal error
	var reportedError = false;
	context.async = function async() {
		if(isDone) {
			if(reportedError) return; // ignore
			throw new Error("async(): The callback was already called.");
		}
		isSync = false;
		return innerCallback;
	};
	var innerCallback = context.callback = function() {
		if(isDone) {
			if(reportedError) return; // ignore
			throw new Error("callback(): The callback was already called.");
		}
		isDone = true;
		isSync = false;
		try {
			callback.apply(null, arguments);
		} catch(e) {
			isError = true;
			throw e;
		}
	};
	try {
		var result = (function LOADER_EXECUTION() {
			return fn.apply(context, args);
		}());
		if(isSync) {
			isDone = true;
			if(result === undefined)
				return callback();
			if(result && typeof result === "object" && typeof result.then === "function") {
				return result.then(function(r) {
					callback(null, r);
				}, callback);
			}
			return callback(null, result);
		}
	} catch(e) {
		if(isError) throw e;
		if(isDone) {
			// loader is already "done", so we cannot use the callback function
			// for better debugging we print the error on the console
			if(typeof e === "object" && e.stack) console.error(e.stack);
			else console.error(e);
			return;
		}
		isDone = true;
		reportedError = true;
		callback(e);
	}

}

function convertArgs(args, raw) {
	if(!raw && Buffer.isBuffer(args[0]))
		args[0] = utf8BufferToString(args[0]);
	else if(raw && typeof args[0] === "string")
		args[0] = new Buffer(args[0], "utf-8"); // eslint-disable-line
}

function iteratePitchingLoaders(options, loaderContext, callback) {
	// abort after last loader
	if(loaderContext.loaderIndex >= loaderContext.loaders.length)
		return processResource(options, loaderContext, callback);

	var currentLoaderObject = loaderContext.loaders[loaderContext.loaderIndex];

	// iterate
	if(currentLoaderObject.pitchExecuted) {
		loaderContext.loaderIndex++;
		return iteratePitchingLoaders(options, loaderContext, callback);
	}

	// load loader module
	loadLoader(currentLoaderObject, function(err) {
		if(err) {
			loaderContext.cacheable(false);
			return callback(err);
		}
		var fn = currentLoaderObject.pitch;
		currentLoaderObject.pitchExecuted = true;
		if(!fn) return iteratePitchingLoaders(options, loaderContext, callback);

		runSyncOrAsync(
			fn,
			loaderContext, [loaderContext.remainingRequest, loaderContext.previousRequest, currentLoaderObject.data = {}],
			function(err) {
				if(err) return callback(err);
				var args = Array.prototype.slice.call(arguments, 1);
				if(args.length > 0) {
					loaderContext.loaderIndex--;
					iterateNormalLoaders(options, loaderContext, args, callback);
				} else {
					iteratePitchingLoaders(options, loaderContext, callback);
				}
			}
		);
	});
}

function processResource(options, loaderContext, callback) {
	// set loader index to last loader
	loaderContext.loaderIndex = loaderContext.loaders.length - 1;

	var resourcePath = loaderContext.resourcePath;
	if(resourcePath) {
		loaderContext.addDependency(resourcePath);
		options.readResource(resourcePath, function(err, buffer) {
			if(err) return callback(err);
			options.resourceBuffer = buffer;
			iterateNormalLoaders(options, loaderContext, [buffer], callback);
		});
	} else {
		iterateNormalLoaders(options, loaderContext, [null], callback);
	}
}

function iterateNormalLoaders(options, loaderContext, args, callback) {
	if(loaderContext.loaderIndex < 0)
		return callback(null, args);

	var currentLoaderObject = loaderContext.loaders[loaderContext.loaderIndex];

	// iterate
	if(currentLoaderObject.normalExecuted) {
		loaderContext.loaderIndex--;
		return iterateNormalLoaders(options, loaderContext, args, callback);
	}

	var fn = currentLoaderObject.normal;
	currentLoaderObject.normalExecuted = true;
	if(!fn) {
		return iterateNormalLoaders(options, loaderContext, args, callback);
	}

	convertArgs(args, currentLoaderObject.raw);

	runSyncOrAsync(fn, loaderContext, args, function(err) {
		if(err) return callback(err);

		var args = Array.prototype.slice.call(arguments, 1);
		iterateNormalLoaders(options, loaderContext, args, callback);
	});
}

exports.getContext = function getContext(resource) {
	var splitted = splitQuery(resource);
	return dirname(splitted[0]);
};

exports.runLoaders = function runLoaders(options, callback) {
	// read options
	var resource = options.resource || "";
	var loaders = options.loaders || [];
	var loaderContext = options.context || {};
	var readResource = options.readResource || readFile;

	//
	var splittedResource = resource && splitQuery(resource);
	var resourcePath = splittedResource ? splittedResource[0] : undefined;
	var resourceQuery = splittedResource ? splittedResource[1] : undefined;
	var contextDirectory = resourcePath ? dirname(resourcePath) : null;

	// execution state
	var requestCacheable = true;
	var fileDependencies = [];
	var contextDependencies = [];

	// prepare loader objects
	loaders = loaders.map(createLoaderObject);

	loaderContext.context = contextDirectory;
	loaderContext.loaderIndex = 0;
	loaderContext.loaders = loaders;
	loaderContext.resourcePath = resourcePath;
	loaderContext.resourceQuery = resourceQuery;
	loaderContext.async = null;
	loaderContext.callback = null;
	loaderContext.cacheable = function cacheable(flag) {
		if(flag === false) {
			requestCacheable = false;
		}
	};
	loaderContext.dependency = loaderContext.addDependency = function addDependency(file) {
		fileDependencies.push(file);
	};
	loaderContext.addContextDependency = function addContextDependency(context) {
		contextDependencies.push(context);
	};
	loaderContext.getDependencies = function getDependencies() {
		return fileDependencies.slice();
	};
	loaderContext.getContextDependencies = function getContextDependencies() {
		return contextDependencies.slice();
	};
	loaderContext.clearDependencies = function clearDependencies() {
		fileDependencies.length = 0;
		contextDependencies.length = 0;
		requestCacheable = true;
	};
	Object.defineProperty(loaderContext, "resource", {
		enumerable: true,
		get: function() {
			if(loaderContext.resourcePath === undefined)
				return undefined;
			return loaderContext.resourcePath + loaderContext.resourceQuery;
		},
		set: function(value) {
			var splittedResource = value && splitQuery(value);
			loaderContext.resourcePath = splittedResource ? splittedResource[0] : undefined;
			loaderContext.resourceQuery = splittedResource ? splittedResource[1] : undefined;
		}
	});
	Object.defineProperty(loaderContext, "request", {
		enumerable: true,
		get: function() {
			return loaderContext.loaders.map(function(o) {
				return o.request;
			}).concat(loaderContext.resource || "").join("!");
		}
	});
	Object.defineProperty(loaderContext, "remainingRequest", {
		enumerable: true,
		get: function() {
			if(loaderContext.loaderIndex >= loaderContext.loaders.length - 1 && !loaderContext.resource)
				return "";
			return loaderContext.loaders.slice(loaderContext.loaderIndex + 1).map(function(o) {
				return o.request;
			}).concat(loaderContext.resource || "").join("!");
		}
	});
	Object.defineProperty(loaderContext, "currentRequest", {
		enumerable: true,
		get: function() {
			return loaderContext.loaders.slice(loaderContext.loaderIndex).map(function(o) {
				return o.request;
			}).concat(loaderContext.resource || "").join("!");
		}
	});
	Object.defineProperty(loaderContext, "previousRequest", {
		enumerable: true,
		get: function() {
			return loaderContext.loaders.slice(0, loaderContext.loaderIndex).map(function(o) {
				return o.request;
			}).join("!");
		}
	});
	Object.defineProperty(loaderContext, "query", {
		enumerable: true,
		get: function() {
			var entry = loaderContext.loaders[loaderContext.loaderIndex];
			return entry.options && typeof entry.options === "object" ? entry.options : entry.query;
		}
	});
	Object.defineProperty(loaderContext, "data", {
		enumerable: true,
		get: function() {
			return loaderContext.loaders[loaderContext.loaderIndex].data;
		}
	});

	// finish loader context
	if(Object.preventExtensions) {
		Object.preventExtensions(loaderContext);
	}

	var processOptions = {
		resourceBuffer: null,
		readResource: readResource
	};
	iteratePitchingLoaders(processOptions, loaderContext, function(err, result) {
		if(err) {
			return callback(err, {
				cacheable: requestCacheable,
				fileDependencies: fileDependencies,
				contextDependencies: contextDependencies
			});
		}
		callback(null, {
			result: result,
			resourceBuffer: processOptions.resourceBuffer,
			cacheable: requestCacheable,
			fileDependencies: fileDependencies,
			contextDependencies: contextDependencies
		});
	});
};


/***/ }),

/***/ 384:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

var LoaderLoadingError = __nccwpck_require__(736);

module.exports = function loadLoader(loader, callback) {
	if(typeof System === "object" && typeof System.import === "function") {
		System.import(loader.path).catch(callback).then(function(module) {
			loader.normal = typeof module === "function" ? module : module.default;
			loader.pitch = module.pitch;
			loader.raw = module.raw;
			if(typeof loader.normal !== "function" && typeof loader.pitch !== "function") {
				return callback(new LoaderLoadingError(
					"Module '" + loader.path + "' is not a loader (must have normal or pitch function)"
				));
			}
			callback();
		});
	} else {
		try {
			var module = require(loader.path);
		} catch(e) {
			// it is possible for node to choke on a require if the FD descriptor
			// limit has been reached. give it a chance to recover.
			if(e instanceof Error && e.code === "EMFILE") {
				var retry = loadLoader.bind(null, loader, callback);
				if(typeof setImmediate === "function") {
					// node >= 0.9.0
					return setImmediate(retry);
				} else {
					// node < 0.9.0
					return process.nextTick(retry);
				}
			}
			return callback(e);
		}
		if(typeof module !== "function" && typeof module !== "object") {
			return callback(new LoaderLoadingError(
				"Module '" + loader.path + "' is not a loader (export function or es6 module)"
			));
		}
		loader.normal = typeof module === "function" ? module : module.default;
		loader.pitch = module.pitch;
		loader.raw = module.raw;
		if(typeof loader.normal !== "function" && typeof loader.pitch !== "function") {
			return callback(new LoaderLoadingError(
				"Module '" + loader.path + "' is not a loader (must have normal or pitch function)"
			));
		}
		callback();
	}
};


/***/ }),

/***/ 506:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.pitch = pitch;
exports.default = _default;

var _path = _interopRequireDefault(__nccwpck_require__(622));

var _loaderUtils = _interopRequireDefault(__nccwpck_require__(443));

var _schemaUtils = __nccwpck_require__(286);

var _utils = __nccwpck_require__(958);

var _loaderOptions = _interopRequireDefault(__nccwpck_require__(480));

var _index = _interopRequireWildcard(__nccwpck_require__(612));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function hotLoader(content, context) {
  const accept = context.locals ? '' : 'module.hot.accept(undefined, cssReload);';
  return `${content}
    if(module.hot) {
      // ${Date.now()}
      var cssReload = require(${_loaderUtils.default.stringifyRequest(context.context, _path.default.join(__dirname, 'hmr/hotModuleReplacement.js'))})(module.id, ${JSON.stringify({ ...context.options,
    locals: !!context.locals
  })});
      module.hot.dispose(cssReload);
      ${accept}
    }
  `;
}

function pitch(request) {
  const options = _loaderUtils.default.getOptions(this) || {};
  (0, _schemaUtils.validate)(_loaderOptions.default, options, {
    name: 'Mini CSS Extract Plugin Loader',
    baseDataPath: 'options'
  });
  const callback = this.async();
  const optionsFromPlugin = this[_index.pluginSymbol];

  if (!optionsFromPlugin) {
    callback(new Error("You forgot to add 'mini-css-extract-plugin' plugin (i.e. `{ plugins: [new MiniCssExtractPlugin()] }`), please read https://github.com/webpack-contrib/mini-css-extract-plugin#getting-started"));
    return;
  } // TODO simplify after drop  webpack v4
  // eslint-disable-next-line global-require


  const webpack = this._compiler.webpack || __nccwpck_require__(515);

  const handleExports = (originalExports, compilation, assets, assetsInfo) => {
    let locals;
    const esModule = typeof options.esModule !== 'undefined' ? options.esModule : true;
    const namedExport = esModule && options.modules && options.modules.namedExport;

    const addDependencies = dependencies => {
      if (!Array.isArray(dependencies) && dependencies != null) {
        throw new Error(`Exported value was not extracted as an array: ${JSON.stringify(dependencies)}`);
      }

      const identifierCountMap = new Map();
      const emit = typeof options.emit !== 'undefined' ? options.emit : true;
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
      exports = originalExports.__esModule ? originalExports.default : originalExports;

      if (namedExport) {
        Object.keys(originalExports).forEach(key => {
          if (key !== 'default') {
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
        dependencies = exports.map(([id, content, media, sourceMap]) => {
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
            sourceMap: sourceMap ? Buffer.from(JSON.stringify(sourceMap)) : // eslint-disable-next-line no-undefined
            undefined
          };
        });
      }

      addDependencies(dependencies);
    } catch (e) {
      return callback(e);
    }

    const result = locals ? namedExport ? Object.keys(locals).map(key => `\nexport const ${key} = ${JSON.stringify(locals[key])};`).join('') : `\n${esModule ? 'export default' : 'module.exports ='} ${JSON.stringify(locals)};` : esModule ? `\nexport {};` : '';
    let resultSource = `// extracted by ${_index.pluginName}`;
    resultSource += this.hot ? hotLoader(result, {
      context: this.context,
      options,
      locals
    }) : result;
    return callback(null, resultSource);
  };

  const publicPath = typeof options.publicPath === 'string' ? options.publicPath === 'auto' ? '' : options.publicPath === '' || options.publicPath.endsWith('/') ? options.publicPath : `${options.publicPath}/` : typeof options.publicPath === 'function' ? options.publicPath(this.resourcePath, this.rootContext) : this._compilation.outputOptions.publicPath === 'auto' ? '' : this._compilation.outputOptions.publicPath;

  if (optionsFromPlugin.experimentalUseImportModule) {
    if (!this.importModule) {
      callback(new Error("You are using experimentalUseImportModule but 'this.importModule' is not available in loader context. You need to have at least webpack 5.33.2."));
      return;
    }

    this.importModule(`${this.resourcePath}.webpack[javascript/auto]!=!${request}`, {
      layer: options.layer,
      publicPath
    }, (err, exports) => {
      if (err) {
        callback(err);
        return;
      }

      handleExports(exports);
    });
    return;
  }

  const loaders = this.loaders.slice(this.loaderIndex + 1);
  this.addDependency(this.resourcePath);
  const childFilename = '*';
  const outputOptions = {
    filename: childFilename,
    publicPath
  };

  const childCompiler = this._compilation.createChildCompiler(`${_index.pluginName} ${request}`, outputOptions);

  const {
    NodeTemplatePlugin
  } = webpack.node;
  const NodeTargetPlugin = webpack.node.NodeTargetPlugin ? webpack.node.NodeTargetPlugin : // eslint-disable-next-line global-require
  __nccwpck_require__(743);
  new NodeTemplatePlugin(outputOptions).apply(childCompiler);
  new NodeTargetPlugin().apply(childCompiler);
  const {
    EntryOptionPlugin
  } = webpack;

  if (EntryOptionPlugin) {
    const {
      library: {
        EnableLibraryPlugin
      }
    } = webpack;
    new EnableLibraryPlugin('commonjs2').apply(childCompiler);
    EntryOptionPlugin.applyEntryOption(childCompiler, this.context, {
      child: {
        library: {
          type: 'commonjs2'
        },
        import: [`!!${request}`]
      }
    });
  } else {
    const {
      LibraryTemplatePlugin,
      SingleEntryPlugin
    } = webpack;
    new LibraryTemplatePlugin(null, 'commonjs2').apply(childCompiler);
    new SingleEntryPlugin(this.context, `!!${request}`, _index.pluginName).apply(childCompiler);
  }

  const {
    LimitChunkCountPlugin
  } = webpack.optimize;
  new LimitChunkCountPlugin({
    maxChunks: 1
  }).apply(childCompiler);
  const NormalModule = webpack.NormalModule ? webpack.NormalModule : // eslint-disable-next-line global-require
  __nccwpck_require__(963);
  childCompiler.hooks.thisCompilation.tap(`${_index.pluginName} loader`, compilation => {
    const normalModuleHook = typeof NormalModule.getCompilationHooks !== 'undefined' ? NormalModule.getCompilationHooks(compilation).loader : compilation.hooks.normalModuleLoader;
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
  const isWebpack4 = childCompiler.webpack ? false : typeof childCompiler.resolvers !== 'undefined';

  if (isWebpack4) {
    childCompiler.hooks.afterCompile.tap(_index.pluginName, compilation => {
      source = compilation.assets[childFilename] && compilation.assets[childFilename].source(); // Remove all chunk assets

      compilation.chunks.forEach(chunk => {
        chunk.files.forEach(file => {
          delete compilation.assets[file]; // eslint-disable-line no-param-reassign
        });
      });
    });
  } else {
    childCompiler.hooks.compilation.tap(_index.pluginName, compilation => {
      compilation.hooks.processAssets.tap(_index.pluginName, () => {
        source = compilation.assets[childFilename] && compilation.assets[childFilename].source(); // console.log(source);
        // Remove all chunk assets

        compilation.chunks.forEach(chunk => {
          chunk.files.forEach(file => {
            compilation.deleteAsset(file);
          });
        });
      });
    });
  }

  childCompiler.runAsChild((error, entries, compilation) => {
    const assets = Object.create(null);
    const assetsInfo = new Map();

    for (const asset of compilation.getAssets()) {
      assets[asset.name] = asset.source;
      assetsInfo.set(asset.name, asset.info);
    }

    if (error) {
      return callback(error);
    }

    if (compilation.errors.length > 0) {
      return callback(compilation.errors[0]);
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


function _default() {}

/***/ }),

/***/ 958:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


Object.defineProperty(exports, "__esModule", ({
  value: true
}));
exports.findModuleById = findModuleById;
exports.evalModuleCode = evalModuleCode;
exports.compareModulesByIdentifier = compareModulesByIdentifier;
exports.MODULE_TYPE = void 0;

var _module = _interopRequireDefault(__nccwpck_require__(282));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const MODULE_TYPE = 'css/mini-extract';
exports.MODULE_TYPE = MODULE_TYPE;

function findModuleById(compilation, id) {
  const {
    modules,
    chunkGraph
  } = compilation;

  for (const module of modules) {
    const moduleId = typeof chunkGraph !== 'undefined' ? chunkGraph.getModuleId(module) : module.id;

    if (moduleId === id) {
      return module;
    }
  }

  return null;
}

function evalModuleCode(loaderContext, code, filename) {
  const module = new _module.default(filename, loaderContext);
  module.paths = _module.default._nodeModulePaths(loaderContext.context); // eslint-disable-line no-underscore-dangle

  module.filename = filename;

  module._compile(code, filename); // eslint-disable-line no-underscore-dangle


  return module.exports;
}

function compareIds(a, b) {
  if (typeof a !== typeof b) {
    return typeof a < typeof b ? -1 : 1;
  }

  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

function compareModulesByIdentifier(a, b) {
  return compareIds(a.identifier(), b.identifier());
}

/***/ }),

/***/ 104:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";


const WebpackError = __nccwpck_require__(391);
const CURRENT_METHOD_REGEXP = /at ([a-zA-Z0-9_.]*)/;

/**
 * @param {string=} method method name
 * @returns {string} message
 */
function createMessage(method) {
	return `Abstract method${method ? " " + method : ""}. Must be overridden.`;
}

/**
 * @constructor
 */
function Message() {
	this.stack = undefined;
	Error.captureStackTrace(this);
	/** @type {RegExpMatchArray} */
	const match = this.stack.split("\n")[3].match(CURRENT_METHOD_REGEXP);

	this.message = match && match[1] ? createMessage(match[1]) : createMessage();
}

/**
 * Error for abstract method
 * @example
 * class FooClass {
 *     abstractMethod() {
 *         throw new AbstractMethodError(); // error message: Abstract method FooClass.abstractMethod. Must be overriden.
 *     }
 * }
 *
 */
class AbstractMethodError extends WebpackError {
	constructor() {
		super(new Message().message);
		this.name = "AbstractMethodError";
	}
}

module.exports = AbstractMethodError;


/***/ }),

/***/ 919:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
MIT License http://www.opensource.org/licenses/mit-license.php
Author Tobias Koppers @sokra
*/


const util = __nccwpck_require__(669);
const SortableSet = __nccwpck_require__(834);
const intersect = __nccwpck_require__(262)/* .intersect */ .w;
const GraphHelpers = __nccwpck_require__(973);
const Entrypoint = __nccwpck_require__(931);
let debugId = 1000;
const ERR_CHUNK_ENTRY = "Chunk.entry was removed. Use hasRuntime()";
const ERR_CHUNK_INITIAL =
	"Chunk.initial was removed. Use canBeInitial/isOnlyInitial()";

/** @typedef {import("./Module")} Module */
/** @typedef {import("./ChunkGroup")} ChunkGroup */
/** @typedef {import("./ModuleReason")} ModuleReason */
/** @typedef {import("webpack-sources").Source} Source */
/** @typedef {import("./util/createHash").Hash} Hash */

/**
 *  @typedef {Object} WithId an object who has an id property *
 *  @property {string | number} id the id of the object
 */

/**
 * Compare two Modules based on their ids for sorting
 * @param {Module} a module
 * @param {Module} b module
 * @returns {-1|0|1} sort value
 */

// TODO use @callback
/** @typedef {(a: Module, b: Module) => -1|0|1} ModuleSortPredicate */
/** @typedef {(m: Module) => boolean} ModuleFilterPredicate */
/** @typedef {(c: Chunk) => boolean} ChunkFilterPredicate */

const sortModuleById = (a, b) => {
	if (a.id < b.id) return -1;
	if (b.id < a.id) return 1;
	return 0;
};

/**
 * Compare two ChunkGroups based on their ids for sorting
 * @param {ChunkGroup} a chunk group
 * @param {ChunkGroup} b chunk group
 * @returns {-1|0|1} sort value
 */
const sortChunkGroupById = (a, b) => {
	if (a.id < b.id) return -1;
	if (b.id < a.id) return 1;
	return 0;
};

/**
 * Compare two Identifiables , based on their ids for sorting
 * @param {Module} a first object with ident fn
 * @param {Module} b second object with ident fn
 * @returns {-1|0|1} The order number of the sort
 */
const sortByIdentifier = (a, b) => {
	if (a.identifier() > b.identifier()) return 1;
	if (a.identifier() < b.identifier()) return -1;
	return 0;
};

/**
 * @returns {string} a concatenation of module identifiers sorted
 * @param {SortableSet} set to pull module identifiers from
 */
const getModulesIdent = set => {
	set.sort();
	let str = "";
	for (const m of set) {
		str += m.identifier() + "#";
	}
	return str;
};

/**
 * @template T
 * @param {SortableSet<T>} set the sortable set to convert to array
 * @returns {Array<T>} the array returned from Array.from(set)
 */
const getArray = set => Array.from(set);

/**
 * @param {SortableSet<Module>} set the sortable Set to get the count/size of
 * @returns {number} the size of the modules
 */
const getModulesSize = set => {
	let size = 0;
	for (const module of set) {
		size += module.size();
	}
	return size;
};

/**
 * A Chunk is a unit of encapsulation for Modules.
 * Chunks are "rendered" into bundles that get emitted when the build completes.
 */
class Chunk {
	/**
	 * @param {string=} name of chunk being created, is optional (for subclasses)
	 */
	constructor(name) {
		/** @type {number | null} */
		this.id = null;
		/** @type {number[] | null} */
		this.ids = null;
		/** @type {number} */
		this.debugId = debugId++;
		/** @type {string} */
		this.name = name;
		/** @type {boolean} */
		this.preventIntegration = false;
		/** @type {Module=} */
		this.entryModule = undefined;
		/** @private @type {SortableSet<Module>} */
		this._modules = new SortableSet(undefined, sortByIdentifier);
		/** @type {string?} */
		this.filenameTemplate = undefined;
		/** @private @type {SortableSet<ChunkGroup>} */
		this._groups = new SortableSet(undefined, sortChunkGroupById);
		/** @type {string[]} */
		this.files = [];
		/** @type {boolean} */
		this.rendered = false;
		/** @type {string=} */
		this.hash = undefined;
		/** @type {Object} */
		this.contentHash = Object.create(null);
		/** @type {string=} */
		this.renderedHash = undefined;
		/** @type {string=} */
		this.chunkReason = undefined;
		/** @type {boolean} */
		this.extraAsync = false;
		this.removedModules = undefined;
	}

	/**
	 * @deprecated Chunk.entry has been deprecated. Please use .hasRuntime() instead
	 * @returns {never} Throws an error trying to access this property
	 */
	get entry() {
		throw new Error(ERR_CHUNK_ENTRY);
	}

	/**
	 * @deprecated .entry has been deprecated. Please use .hasRuntime() instead
	 * @param {never} data The data that was attempting to be set
	 * @returns {never} Throws an error trying to access this property
	 */
	set entry(data) {
		throw new Error(ERR_CHUNK_ENTRY);
	}

	/**
	 * @deprecated Chunk.initial was removed. Use canBeInitial/isOnlyInitial()
	 * @returns {never} Throws an error trying to access this property
	 */
	get initial() {
		throw new Error(ERR_CHUNK_INITIAL);
	}

	/**
	 * @deprecated Chunk.initial was removed. Use canBeInitial/isOnlyInitial()
	 * @param {never} data The data attempting to be set
	 * @returns {never} Throws an error trying to access this property
	 */
	set initial(data) {
		throw new Error(ERR_CHUNK_INITIAL);
	}

	/**
	 * @returns {boolean} whether or not the Chunk will have a runtime
	 */
	hasRuntime() {
		for (const chunkGroup of this._groups) {
			if (
				chunkGroup.isInitial() &&
				chunkGroup instanceof Entrypoint &&
				chunkGroup.getRuntimeChunk() === this
			) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @returns {boolean} whether or not this chunk can be an initial chunk
	 */
	canBeInitial() {
		for (const chunkGroup of this._groups) {
			if (chunkGroup.isInitial()) return true;
		}
		return false;
	}

	/**
	 * @returns {boolean} whether this chunk can only be an initial chunk
	 */
	isOnlyInitial() {
		if (this._groups.size <= 0) return false;
		for (const chunkGroup of this._groups) {
			if (!chunkGroup.isInitial()) return false;
		}
		return true;
	}

	/**
	 * @returns {boolean} if this chunk contains the entry module
	 */
	hasEntryModule() {
		return !!this.entryModule;
	}

	/**
	 * @param {Module} module the module that will be added to this chunk.
	 * @returns {boolean} returns true if the chunk doesn't have the module and it was added
	 */
	addModule(module) {
		if (!this._modules.has(module)) {
			this._modules.add(module);
			return true;
		}
		return false;
	}

	/**
	 * @param {Module} module the module that will be removed from this chunk
	 * @returns {boolean} returns true if chunk exists and is successfully deleted
	 */
	removeModule(module) {
		if (this._modules.delete(module)) {
			module.removeChunk(this);
			return true;
		}
		return false;
	}

	/**
	 * @param {Module[]} modules the new modules to be set
	 * @returns {void} set new modules to this chunk and return nothing
	 */
	setModules(modules) {
		this._modules = new SortableSet(modules, sortByIdentifier);
	}

	/**
	 * @returns {number} the amount of modules in chunk
	 */
	getNumberOfModules() {
		return this._modules.size;
	}

	/**
	 * @returns {SortableSet} return the modules SortableSet for this chunk
	 */
	get modulesIterable() {
		return this._modules;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup the chunk is being added
	 * @returns {boolean} returns true if chunk is not apart of chunkGroup and is added successfully
	 */
	addGroup(chunkGroup) {
		if (this._groups.has(chunkGroup)) return false;
		this._groups.add(chunkGroup);
		return true;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup the chunk is being removed from
	 * @returns {boolean} returns true if chunk does exist in chunkGroup and is removed
	 */
	removeGroup(chunkGroup) {
		if (!this._groups.has(chunkGroup)) return false;
		this._groups.delete(chunkGroup);
		return true;
	}

	/**
	 * @param {ChunkGroup} chunkGroup the chunkGroup to check
	 * @returns {boolean} returns true if chunk has chunkGroup reference and exists in chunkGroup
	 */
	isInGroup(chunkGroup) {
		return this._groups.has(chunkGroup);
	}

	/**
	 * @returns {number} the amount of groups said chunk is in
	 */
	getNumberOfGroups() {
		return this._groups.size;
	}

	/**
	 * @returns {SortableSet<ChunkGroup>} the chunkGroups that said chunk is referenced in
	 */
	get groupsIterable() {
		return this._groups;
	}

	/**
	 * @param {Chunk} otherChunk the chunk to compare itself with
	 * @returns {-1|0|1} this is a comparitor function like sort and returns -1, 0, or 1 based on sort order
	 */
	compareTo(otherChunk) {
		if (this.name && !otherChunk.name) return -1;
		if (!this.name && otherChunk.name) return 1;
		if (this.name < otherChunk.name) return -1;
		if (this.name > otherChunk.name) return 1;
		if (this._modules.size > otherChunk._modules.size) return -1;
		if (this._modules.size < otherChunk._modules.size) return 1;
		this._modules.sort();
		otherChunk._modules.sort();
		const a = this._modules[Symbol.iterator]();
		const b = otherChunk._modules[Symbol.iterator]();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const aItem = a.next();
			if (aItem.done) return 0;
			const bItem = b.next();
			const aModuleIdentifier = aItem.value.identifier();
			const bModuleIdentifier = bItem.value.identifier();
			if (aModuleIdentifier < bModuleIdentifier) return -1;
			if (aModuleIdentifier > bModuleIdentifier) return 1;
		}
	}

	/**
	 * @param {Module} module Module to check
	 * @returns {boolean} returns true if module does exist in this chunk
	 */
	containsModule(module) {
		return this._modules.has(module);
	}

	/**
	 * @returns {Module[]} an array of modules (do not modify)
	 */
	getModules() {
		return this._modules.getFromCache(getArray);
	}

	getModulesIdent() {
		return this._modules.getFromUnorderedCache(getModulesIdent);
	}

	/**
	 * @param {string=} reason reason why chunk is removed
	 * @returns {void}
	 */
	remove(reason) {
		// cleanup modules
		// Array.from is used here to create a clone, because removeChunk modifies this._modules
		for (const module of Array.from(this._modules)) {
			module.removeChunk(this);
		}
		for (const chunkGroup of this._groups) {
			chunkGroup.removeChunk(this);
		}
	}

	/**
	 *
	 * @param {Module} module module to move
	 * @param {Chunk} otherChunk other chunk to move it to
	 * @returns {void}
	 */
	moveModule(module, otherChunk) {
		GraphHelpers.disconnectChunkAndModule(this, module);
		GraphHelpers.connectChunkAndModule(otherChunk, module);
		module.rewriteChunkInReasons(this, [otherChunk]);
	}

	/**
	 *
	 * @param {Chunk} otherChunk the chunk to integrate with
	 * @param {string} reason reason why the module is being integrated
	 * @returns {boolean} returns true or false if integration succeeds or fails
	 */
	integrate(otherChunk, reason) {
		if (!this.canBeIntegrated(otherChunk)) {
			return false;
		}

		// Pick a new name for the integrated chunk
		if (this.name && otherChunk.name) {
			if (this.hasEntryModule() === otherChunk.hasEntryModule()) {
				// When both chunks have entry modules or none have one, use
				// shortest name
				if (this.name.length !== otherChunk.name.length) {
					this.name =
						this.name.length < otherChunk.name.length
							? this.name
							: otherChunk.name;
				} else {
					this.name = this.name < otherChunk.name ? this.name : otherChunk.name;
				}
			} else if (otherChunk.hasEntryModule()) {
				// Pick the name of the chunk with the entry module
				this.name = otherChunk.name;
			}
		} else if (otherChunk.name) {
			this.name = otherChunk.name;
		}

		// Array.from is used here to create a clone, because moveModule modifies otherChunk._modules
		for (const module of Array.from(otherChunk._modules)) {
			otherChunk.moveModule(module, this);
		}
		otherChunk._modules.clear();

		if (otherChunk.entryModule) {
			this.entryModule = otherChunk.entryModule;
		}

		for (const chunkGroup of otherChunk._groups) {
			chunkGroup.replaceChunk(otherChunk, this);
			this.addGroup(chunkGroup);
		}
		otherChunk._groups.clear();

		return true;
	}

	/**
	 * @param {Chunk} newChunk the new chunk that will be split out of the current chunk
	 * @returns {void}
	 */
	split(newChunk) {
		for (const chunkGroup of this._groups) {
			chunkGroup.insertChunk(newChunk, this);
			newChunk.addGroup(chunkGroup);
		}
	}

	isEmpty() {
		return this._modules.size === 0;
	}

	updateHash(hash) {
		hash.update(`${this.id} `);
		hash.update(this.ids ? this.ids.join(",") : "");
		hash.update(`${this.name || ""} `);
		for (const m of this._modules) {
			hash.update(m.hash);
		}
	}

	canBeIntegrated(otherChunk) {
		if (this.preventIntegration || otherChunk.preventIntegration) {
			return false;
		}

		/**
		 * @param {Chunk} a chunk
		 * @param {Chunk} b chunk
		 * @returns {boolean} true, if a is always available when b is reached
		 */
		const isAvailable = (a, b) => {
			const queue = new Set(b.groupsIterable);
			for (const chunkGroup of queue) {
				if (a.isInGroup(chunkGroup)) continue;
				if (chunkGroup.isInitial()) return false;
				for (const parent of chunkGroup.parentsIterable) {
					queue.add(parent);
				}
			}
			return true;
		};

		const selfHasRuntime = this.hasRuntime();
		const otherChunkHasRuntime = otherChunk.hasRuntime();

		if (selfHasRuntime !== otherChunkHasRuntime) {
			if (selfHasRuntime) {
				return isAvailable(this, otherChunk);
			} else if (otherChunkHasRuntime) {
				return isAvailable(otherChunk, this);
			} else {
				return false;
			}
		}

		if (this.hasEntryModule() || otherChunk.hasEntryModule()) {
			return false;
		}

		return true;
	}

	/**
	 *
	 * @param {number} size the size
	 * @param {Object} options the options passed in
	 * @returns {number} the multiplier returned
	 */
	addMultiplierAndOverhead(size, options) {
		const overhead =
			typeof options.chunkOverhead === "number" ? options.chunkOverhead : 10000;
		const multiplicator = this.canBeInitial()
			? options.entryChunkMultiplicator || 10
			: 1;

		return size * multiplicator + overhead;
	}

	/**
	 * @returns {number} the size of all modules
	 */
	modulesSize() {
		return this._modules.getFromUnorderedCache(getModulesSize);
	}

	/**
	 * @param {Object} options the size display options
	 * @returns {number} the chunk size
	 */
	size(options = {}) {
		return this.addMultiplierAndOverhead(this.modulesSize(), options);
	}

	/**
	 * @param {Chunk} otherChunk the other chunk
	 * @param {TODO} options the options for this function
	 * @returns {number | false} the size, or false if it can't be integrated
	 */
	integratedSize(otherChunk, options) {
		// Chunk if it's possible to integrate this chunk
		if (!this.canBeIntegrated(otherChunk)) {
			return false;
		}

		let integratedModulesSize = this.modulesSize();
		// only count modules that do not exist in this chunk!
		for (const otherModule of otherChunk._modules) {
			if (!this._modules.has(otherModule)) {
				integratedModulesSize += otherModule.size();
			}
		}

		return this.addMultiplierAndOverhead(integratedModulesSize, options);
	}

	/**
	 * @param {function(Module, Module): -1|0|1=} sortByFn a predicate function used to sort modules
	 * @returns {void}
	 */
	sortModules(sortByFn) {
		this._modules.sortWith(sortByFn || sortModuleById);
	}

	sortItems() {
		this.sortModules();
	}

	/**
	 * @returns {Set<Chunk>} a set of all the async chunks
	 */
	getAllAsyncChunks() {
		const queue = new Set();
		const chunks = new Set();

		const initialChunks = intersect(
			Array.from(this.groupsIterable, g => new Set(g.chunks))
		);

		for (const chunkGroup of this.groupsIterable) {
			for (const child of chunkGroup.childrenIterable) {
				queue.add(child);
			}
		}

		for (const chunkGroup of queue) {
			for (const chunk of chunkGroup.chunks) {
				if (!initialChunks.has(chunk)) {
					chunks.add(chunk);
				}
			}
			for (const child of chunkGroup.childrenIterable) {
				queue.add(child);
			}
		}

		return chunks;
	}

	/**
	 * @typedef {Object} ChunkMaps
	 * @property {Record<string|number, string>} hash
	 * @property {Record<string|number, Record<string, string>>} contentHash
	 * @property {Record<string|number, string>} name
	 */

	/**
	 * @param {boolean} realHash should the full hash or the rendered hash be used
	 * @returns {ChunkMaps} the chunk map information
	 */
	getChunkMaps(realHash) {
		/** @type {Record<string|number, string>} */
		const chunkHashMap = Object.create(null);
		/** @type {Record<string|number, Record<string, string>>} */
		const chunkContentHashMap = Object.create(null);
		/** @type {Record<string|number, string>} */
		const chunkNameMap = Object.create(null);

		for (const chunk of this.getAllAsyncChunks()) {
			chunkHashMap[chunk.id] = realHash ? chunk.hash : chunk.renderedHash;
			for (const key of Object.keys(chunk.contentHash)) {
				if (!chunkContentHashMap[key]) {
					chunkContentHashMap[key] = Object.create(null);
				}
				chunkContentHashMap[key][chunk.id] = chunk.contentHash[key];
			}
			if (chunk.name) {
				chunkNameMap[chunk.id] = chunk.name;
			}
		}

		return {
			hash: chunkHashMap,
			contentHash: chunkContentHashMap,
			name: chunkNameMap
		};
	}

	/**
	 * @returns {Record<string, Set<TODO>[]>} a record object of names to lists of child ids(?)
	 */
	getChildIdsByOrders() {
		const lists = new Map();
		for (const group of this.groupsIterable) {
			if (group.chunks[group.chunks.length - 1] === this) {
				for (const childGroup of group.childrenIterable) {
					// TODO webpack 5 remove this check for options
					if (typeof childGroup.options === "object") {
						for (const key of Object.keys(childGroup.options)) {
							if (key.endsWith("Order")) {
								const name = key.substr(0, key.length - "Order".length);
								let list = lists.get(name);
								if (list === undefined) lists.set(name, (list = []));
								list.push({
									order: childGroup.options[key],
									group: childGroup
								});
							}
						}
					}
				}
			}
		}
		const result = Object.create(null);
		for (const [name, list] of lists) {
			list.sort((a, b) => {
				const cmp = b.order - a.order;
				if (cmp !== 0) return cmp;
				// TODO webpack 5 remove this check of compareTo
				if (a.group.compareTo) {
					return a.group.compareTo(b.group);
				}
				return 0;
			});
			result[name] = Array.from(
				list.reduce((set, item) => {
					for (const chunk of item.group.chunks) {
						set.add(chunk.id);
					}
					return set;
				}, new Set())
			);
		}
		return result;
	}

	getChildIdsByOrdersMap(includeDirectChildren) {
		const chunkMaps = Object.create(null);

		const addChildIdsByOrdersToMap = chunk => {
			const data = chunk.getChildIdsByOrders();
			for (const key of Object.keys(data)) {
				let chunkMap = chunkMaps[key];
				if (chunkMap === undefined) {
					chunkMaps[key] = chunkMap = Object.create(null);
				}
				chunkMap[chunk.id] = data[key];
			}
		};

		if (includeDirectChildren) {
			const chunks = new Set();
			for (const chunkGroup of this.groupsIterable) {
				for (const chunk of chunkGroup.chunks) {
					chunks.add(chunk);
				}
			}
			for (const chunk of chunks) {
				addChildIdsByOrdersToMap(chunk);
			}
		}

		for (const chunk of this.getAllAsyncChunks()) {
			addChildIdsByOrdersToMap(chunk);
		}

		return chunkMaps;
	}

	/**
	 * @typedef {Object} ChunkModuleMaps
	 * @property {Record<string|number, (string|number)[]>} id
	 * @property {Record<string|number, string>} hash
	 */

	/**
	 * @param {ModuleFilterPredicate} filterFn function used to filter modules
	 * @returns {ChunkModuleMaps} module map information
	 */
	getChunkModuleMaps(filterFn) {
		/** @type {Record<string|number, (string|number)[]>} */
		const chunkModuleIdMap = Object.create(null);
		/** @type {Record<string|number, string>} */
		const chunkModuleHashMap = Object.create(null);

		for (const chunk of this.getAllAsyncChunks()) {
			/** @type {(string|number)[]} */
			let array;
			for (const module of chunk.modulesIterable) {
				if (filterFn(module)) {
					if (array === undefined) {
						array = [];
						chunkModuleIdMap[chunk.id] = array;
					}
					array.push(module.id);
					chunkModuleHashMap[module.id] = module.renderedHash;
				}
			}
			if (array !== undefined) {
				array.sort();
			}
		}

		return {
			id: chunkModuleIdMap,
			hash: chunkModuleHashMap
		};
	}

	/**
	 *
	 * @param {function(Module): boolean} filterFn predicate function used to filter modules
	 * @param {function(Chunk): boolean} filterChunkFn predicate function used to filter chunks
	 * @returns {boolean} return true if module exists in graph
	 */
	hasModuleInGraph(filterFn, filterChunkFn) {
		const queue = new Set(this.groupsIterable);
		const chunksProcessed = new Set();

		for (const chunkGroup of queue) {
			for (const chunk of chunkGroup.chunks) {
				if (!chunksProcessed.has(chunk)) {
					chunksProcessed.add(chunk);
					if (!filterChunkFn || filterChunkFn(chunk)) {
						for (const module of chunk.modulesIterable) {
							if (filterFn(module)) {
								return true;
							}
						}
					}
				}
			}
			for (const child of chunkGroup.childrenIterable) {
				queue.add(child);
			}
		}
		return false;
	}

	toString() {
		return `Chunk[${Array.from(this._modules).join()}]`;
	}
}

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "forEachModule", {
	configurable: false,
	value: util.deprecate(
		/**
		 * @deprecated
		 * @this {Chunk}
		 * @typedef {function(any, any, Set<any>): void} ForEachModuleCallback
		 * @param {ForEachModuleCallback} fn Callback function
		 * @returns {void}
		 */
		function(fn) {
			this._modules.forEach(fn);
		},
		"Chunk.forEachModule: Use for(const module of chunk.modulesIterable) instead"
	)
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "mapModules", {
	configurable: false,
	value: util.deprecate(
		/**
		 * @deprecated
		 * @this {Chunk}
		 * @typedef {function(any, number): any} MapModulesCallback
		 * @param {MapModulesCallback} fn Callback function
		 * @returns {TODO[]} result of mapped modules
		 */
		function(fn) {
			return Array.from(this._modules, fn);
		},
		"Chunk.mapModules: Use Array.from(chunk.modulesIterable, fn) instead"
	)
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "chunks", {
	configurable: false,
	get() {
		throw new Error("Chunk.chunks: Use ChunkGroup.getChildren() instead");
	},
	set() {
		throw new Error("Chunk.chunks: Use ChunkGroup.add/removeChild() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "parents", {
	configurable: false,
	get() {
		throw new Error("Chunk.parents: Use ChunkGroup.getParents() instead");
	},
	set() {
		throw new Error("Chunk.parents: Use ChunkGroup.add/removeParent() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "blocks", {
	configurable: false,
	get() {
		throw new Error("Chunk.blocks: Use ChunkGroup.getBlocks() instead");
	},
	set() {
		throw new Error("Chunk.blocks: Use ChunkGroup.add/removeBlock() instead");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Chunk.prototype, "entrypoints", {
	configurable: false,
	get() {
		throw new Error(
			"Chunk.entrypoints: Use Chunks.groupsIterable and filter by instanceof Entrypoint instead"
		);
	},
	set() {
		throw new Error("Chunk.entrypoints: Use Chunks.addGroup instead");
	}
});

module.exports = Chunk;


/***/ }),

/***/ 911:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const SortableSet = __nccwpck_require__(834);
const compareLocations = __nccwpck_require__(562);

/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./Module")} Module */
/** @typedef {import("./ModuleReason")} ModuleReason */

/** @typedef {{module: Module, loc: TODO, request: string}} OriginRecord */
/** @typedef {string|{name: string}} ChunkGroupOptions */

let debugId = 5000;

/**
 * @template T
 * @param {SortableSet<T>} set set to convert to array.
 * @returns {T[]} the array format of existing set
 */
const getArray = set => Array.from(set);

/**
 * A convenience method used to sort chunks based on their id's
 * @param {ChunkGroup} a first sorting comparator
 * @param {ChunkGroup} b second sorting comparator
 * @returns {1|0|-1} a sorting index to determine order
 */
const sortById = (a, b) => {
	if (a.id < b.id) return -1;
	if (b.id < a.id) return 1;
	return 0;
};

/**
 * @param {OriginRecord} a the first comparator in sort
 * @param {OriginRecord} b the second comparator in sort
 * @returns {1|-1|0} returns sorting order as index
 */
const sortOrigin = (a, b) => {
	const aIdent = a.module ? a.module.identifier() : "";
	const bIdent = b.module ? b.module.identifier() : "";
	if (aIdent < bIdent) return -1;
	if (aIdent > bIdent) return 1;
	return compareLocations(a.loc, b.loc);
};

class ChunkGroup {
	/**
	 * Creates an instance of ChunkGroup.
	 * @param {ChunkGroupOptions=} options chunk group options passed to chunkGroup
	 */
	constructor(options) {
		if (typeof options === "string") {
			options = { name: options };
		} else if (!options) {
			options = { name: undefined };
		}
		/** @type {number} */
		this.groupDebugId = debugId++;
		this.options = options;
		/** @type {SortableSet<ChunkGroup>} */
		this._children = new SortableSet(undefined, sortById);
		this._parents = new SortableSet(undefined, sortById);
		this._blocks = new SortableSet();
		/** @type {Chunk[]} */
		this.chunks = [];
		/** @type {OriginRecord[]} */
		this.origins = [];
		/** Indices in top-down order */
		/** @private @type {Map<Module, number>} */
		this._moduleIndices = new Map();
		/** Indices in bottom-up order */
		/** @private @type {Map<Module, number>} */
		this._moduleIndices2 = new Map();
	}

	/**
	 * when a new chunk is added to a chunkGroup, addingOptions will occur.
	 * @param {ChunkGroupOptions} options the chunkGroup options passed to addOptions
	 * @returns {void}
	 */
	addOptions(options) {
		for (const key of Object.keys(options)) {
			if (this.options[key] === undefined) {
				this.options[key] = options[key];
			} else if (this.options[key] !== options[key]) {
				if (key.endsWith("Order")) {
					this.options[key] = Math.max(this.options[key], options[key]);
				} else {
					throw new Error(
						`ChunkGroup.addOptions: No option merge strategy for ${key}`
					);
				}
			}
		}
	}

	/**
	 * returns the name of current ChunkGroup
	 * @returns {string|undefined} returns the ChunkGroup name
	 */
	get name() {
		return this.options.name;
	}

	/**
	 * sets a new name for current ChunkGroup
	 * @param {string} value the new name for ChunkGroup
	 * @returns {void}
	 */
	set name(value) {
		this.options.name = value;
	}

	/**
	 * get a uniqueId for ChunkGroup, made up of its member Chunk debugId's
	 * @returns {string} a unique concatenation of chunk debugId's
	 */
	get debugId() {
		return Array.from(this.chunks, x => x.debugId).join("+");
	}

	/**
	 * get a unique id for ChunkGroup, made up of its member Chunk id's
	 * @returns {string} a unique concatenation of chunk ids
	 */
	get id() {
		return Array.from(this.chunks, x => x.id).join("+");
	}

	/**
	 * Performs an unshift of a specific chunk
	 * @param {Chunk} chunk chunk being unshifted
	 * @returns {boolean} returns true if attempted chunk shift is accepted
	 */
	unshiftChunk(chunk) {
		const oldIdx = this.chunks.indexOf(chunk);
		if (oldIdx > 0) {
			this.chunks.splice(oldIdx, 1);
			this.chunks.unshift(chunk);
		} else if (oldIdx < 0) {
			this.chunks.unshift(chunk);
			return true;
		}
		return false;
	}

	/**
	 * inserts a chunk before another existing chunk in group
	 * @param {Chunk} chunk Chunk being inserted
	 * @param {Chunk} before Placeholder/target chunk marking new chunk insertion point
	 * @returns {boolean} return true if insertion was successful
	 */
	insertChunk(chunk, before) {
		const oldIdx = this.chunks.indexOf(chunk);
		const idx = this.chunks.indexOf(before);
		if (idx < 0) {
			throw new Error("before chunk not found");
		}
		if (oldIdx >= 0 && oldIdx > idx) {
			this.chunks.splice(oldIdx, 1);
			this.chunks.splice(idx, 0, chunk);
		} else if (oldIdx < 0) {
			this.chunks.splice(idx, 0, chunk);
			return true;
		}
		return false;
	}

	/**
	 * add a chunk into ChunkGroup. Is pushed on or prepended
	 * @param {Chunk} chunk chunk being pushed into ChunkGroupS
	 * @returns {boolean} returns true if chunk addition was successful.
	 */
	pushChunk(chunk) {
		const oldIdx = this.chunks.indexOf(chunk);
		if (oldIdx >= 0) {
			return false;
		}
		this.chunks.push(chunk);
		return true;
	}

	/**
	 * @param {Chunk} oldChunk chunk to be replaced
	 * @param {Chunk} newChunk New chunk that will be replaced with
	 * @returns {boolean} returns true if the replacement was successful
	 */
	replaceChunk(oldChunk, newChunk) {
		const oldIdx = this.chunks.indexOf(oldChunk);
		if (oldIdx < 0) return false;
		const newIdx = this.chunks.indexOf(newChunk);
		if (newIdx < 0) {
			this.chunks[oldIdx] = newChunk;
			return true;
		}
		if (newIdx < oldIdx) {
			this.chunks.splice(oldIdx, 1);
			return true;
		} else if (newIdx !== oldIdx) {
			this.chunks[oldIdx] = newChunk;
			this.chunks.splice(newIdx, 1);
			return true;
		}
	}

	removeChunk(chunk) {
		const idx = this.chunks.indexOf(chunk);
		if (idx >= 0) {
			this.chunks.splice(idx, 1);
			return true;
		}
		return false;
	}

	isInitial() {
		return false;
	}

	addChild(chunk) {
		if (this._children.has(chunk)) {
			return false;
		}
		this._children.add(chunk);
		return true;
	}

	getChildren() {
		return this._children.getFromCache(getArray);
	}

	getNumberOfChildren() {
		return this._children.size;
	}

	get childrenIterable() {
		return this._children;
	}

	removeChild(chunk) {
		if (!this._children.has(chunk)) {
			return false;
		}

		this._children.delete(chunk);
		chunk.removeParent(this);
		return true;
	}

	addParent(parentChunk) {
		if (!this._parents.has(parentChunk)) {
			this._parents.add(parentChunk);
			return true;
		}
		return false;
	}

	getParents() {
		return this._parents.getFromCache(getArray);
	}

	setParents(newParents) {
		this._parents.clear();
		for (const p of newParents) {
			this._parents.add(p);
		}
	}

	getNumberOfParents() {
		return this._parents.size;
	}

	hasParent(parent) {
		return this._parents.has(parent);
	}

	get parentsIterable() {
		return this._parents;
	}

	removeParent(chunk) {
		if (this._parents.delete(chunk)) {
			chunk.removeChunk(this);
			return true;
		}
		return false;
	}

	/**
	 * @returns {Array} - an array containing the blocks
	 */
	getBlocks() {
		return this._blocks.getFromCache(getArray);
	}

	getNumberOfBlocks() {
		return this._blocks.size;
	}

	hasBlock(block) {
		return this._blocks.has(block);
	}

	get blocksIterable() {
		return this._blocks;
	}

	addBlock(block) {
		if (!this._blocks.has(block)) {
			this._blocks.add(block);
			return true;
		}
		return false;
	}

	addOrigin(module, loc, request) {
		this.origins.push({
			module,
			loc,
			request
		});
	}

	containsModule(module) {
		for (const chunk of this.chunks) {
			if (chunk.containsModule(module)) return true;
		}
		return false;
	}

	getFiles() {
		const files = new Set();

		for (const chunk of this.chunks) {
			for (const file of chunk.files) {
				files.add(file);
			}
		}

		return Array.from(files);
	}

	/**
	 * @param {string=} reason reason for removing ChunkGroup
	 * @returns {void}
	 */
	remove(reason) {
		// cleanup parents
		for (const parentChunkGroup of this._parents) {
			// remove this chunk from its parents
			parentChunkGroup._children.delete(this);

			// cleanup "sub chunks"
			for (const chunkGroup of this._children) {
				/**
				 * remove this chunk as "intermediary" and connect
				 * it "sub chunks" and parents directly
				 */
				// add parent to each "sub chunk"
				chunkGroup.addParent(parentChunkGroup);
				// add "sub chunk" to parent
				parentChunkGroup.addChild(chunkGroup);
			}
		}

		/**
		 * we need to iterate again over the children
		 * to remove this from the child's parents.
		 * This can not be done in the above loop
		 * as it is not guaranteed that `this._parents` contains anything.
		 */
		for (const chunkGroup of this._children) {
			// remove this as parent of every "sub chunk"
			chunkGroup._parents.delete(this);
		}

		// cleanup blocks
		for (const block of this._blocks) {
			block.chunkGroup = null;
		}

		// remove chunks
		for (const chunk of this.chunks) {
			chunk.removeGroup(this);
		}
	}

	sortItems() {
		this.origins.sort(sortOrigin);
		this._parents.sort();
		this._children.sort();
	}

	/**
	 * Sorting predicate which allows current ChunkGroup to be compared against another.
	 * Sorting values are based off of number of chunks in ChunkGroup.
	 *
	 * @param {ChunkGroup} otherGroup the chunkGroup to compare this against
	 * @returns {-1|0|1} sort position for comparison
	 */
	compareTo(otherGroup) {
		if (this.chunks.length > otherGroup.chunks.length) return -1;
		if (this.chunks.length < otherGroup.chunks.length) return 1;
		const a = this.chunks[Symbol.iterator]();
		const b = otherGroup.chunks[Symbol.iterator]();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const aItem = a.next();
			const bItem = b.next();
			if (aItem.done) return 0;
			const cmp = aItem.value.compareTo(bItem.value);
			if (cmp !== 0) return cmp;
		}
	}

	getChildrenByOrders() {
		const lists = new Map();
		for (const childGroup of this._children) {
			// TODO webpack 5 remove this check for options
			if (typeof childGroup.options === "object") {
				for (const key of Object.keys(childGroup.options)) {
					if (key.endsWith("Order")) {
						const name = key.substr(0, key.length - "Order".length);
						let list = lists.get(name);
						if (list === undefined) {
							lists.set(name, (list = []));
						}
						list.push({
							order: childGroup.options[key],
							group: childGroup
						});
					}
				}
			}
		}
		const result = Object.create(null);
		for (const [name, list] of lists) {
			list.sort((a, b) => {
				const cmp = b.order - a.order;
				if (cmp !== 0) return cmp;
				// TODO webpack 5 remove this check of compareTo
				if (a.group.compareTo) {
					return a.group.compareTo(b.group);
				}
				return 0;
			});
			result[name] = list.map(i => i.group);
		}
		return result;
	}

	/**
	 * Sets the top-down index of a module in this ChunkGroup
	 * @param {Module} module module for which the index should be set
	 * @param {number} index the index of the module
	 * @returns {void}
	 */
	setModuleIndex(module, index) {
		this._moduleIndices.set(module, index);
	}

	/**
	 * Gets the top-down index of a module in this ChunkGroup
	 * @param {Module} module the module
	 * @returns {number} index
	 */
	getModuleIndex(module) {
		return this._moduleIndices.get(module);
	}

	/**
	 * Sets the bottom-up index of a module in this ChunkGroup
	 * @param {Module} module module for which the index should be set
	 * @param {number} index the index of the module
	 * @returns {void}
	 */
	setModuleIndex2(module, index) {
		this._moduleIndices2.set(module, index);
	}

	/**
	 * Gets the bottom-up index of a module in this ChunkGroup
	 * @param {Module} module the module
	 * @returns {number} index
	 */
	getModuleIndex2(module) {
		return this._moduleIndices2.get(module);
	}

	checkConstraints() {
		const chunk = this;
		for (const child of chunk._children) {
			if (!child._parents.has(chunk)) {
				throw new Error(
					`checkConstraints: child missing parent ${chunk.debugId} -> ${child.debugId}`
				);
			}
		}
		for (const parentChunk of chunk._parents) {
			if (!parentChunk._children.has(chunk)) {
				throw new Error(
					`checkConstraints: parent missing child ${parentChunk.debugId} <- ${chunk.debugId}`
				);
			}
		}
	}
}

module.exports = ChunkGroup;


/***/ }),

/***/ 71:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Tobias Koppers @sokra
 */


const DependenciesBlockVariable = __nccwpck_require__(904);

/** @typedef {import("./ChunkGroup")} ChunkGroup */
/** @typedef {import("./Dependency")} Dependency */
/** @typedef {import("./AsyncDependenciesBlock")} AsyncDependenciesBlock */
/** @typedef {import("./DependenciesBlockVariable")} DependenciesBlockVariable */
/** @typedef {(d: Dependency) => boolean} DependencyFilterFunction */
/** @typedef {import("./util/createHash").Hash} Hash */

class DependenciesBlock {
	constructor() {
		/** @type {Dependency[]} */
		this.dependencies = [];
		/** @type {AsyncDependenciesBlock[]} */
		this.blocks = [];
		/** @type {DependenciesBlockVariable[]} */
		this.variables = [];
	}

	/**
	 * Adds a DependencyBlock to DependencyBlock relationship.
	 * This is used for when a Module has a AsyncDependencyBlock tie (for code-splitting)
	 *
	 * @param {AsyncDependenciesBlock} block block being added
	 * @returns {void}
	 */
	addBlock(block) {
		this.blocks.push(block);
		block.parent = this;
	}

	/**
	 * @param {string} name name of dependency
	 * @param {string} expression expression string for variable
	 * @param {Dependency[]} dependencies dependency instances tied to variable
	 * @returns {void}
	 */
	addVariable(name, expression, dependencies) {
		for (let v of this.variables) {
			if (v.name === name && v.expression === expression) {
				return;
			}
		}
		this.variables.push(
			new DependenciesBlockVariable(name, expression, dependencies)
		);
	}

	/**
	 * @param {Dependency} dependency dependency being tied to block.
	 * This is an "edge" pointing to another "node" on module graph.
	 * @returns {void}
	 */
	addDependency(dependency) {
		this.dependencies.push(dependency);
	}

	/**
	 * @param {Dependency} dependency dependency being removed
	 * @returns {void}
	 */
	removeDependency(dependency) {
		const idx = this.dependencies.indexOf(dependency);
		if (idx >= 0) {
			this.dependencies.splice(idx, 1);
		}
	}

	/**
	 * @param {Hash} hash the hash used to track dependencies
	 * @returns {void}
	 */
	updateHash(hash) {
		for (const dep of this.dependencies) dep.updateHash(hash);
		for (const block of this.blocks) block.updateHash(hash);
		for (const variable of this.variables) variable.updateHash(hash);
	}

	disconnect() {
		for (const dep of this.dependencies) dep.disconnect();
		for (const block of this.blocks) block.disconnect();
		for (const variable of this.variables) variable.disconnect();
	}

	unseal() {
		for (const block of this.blocks) block.unseal();
	}

	/**
	 * @param {DependencyFilterFunction} filter filter function for dependencies, gets passed all dependency ties from current instance
	 * @returns {boolean} returns boolean for filter
	 */
	hasDependencies(filter) {
		if (filter) {
			for (const dep of this.dependencies) {
				if (filter(dep)) return true;
			}
		} else {
			if (this.dependencies.length > 0) {
				return true;
			}
		}

		for (const block of this.blocks) {
			if (block.hasDependencies(filter)) return true;
		}
		for (const variable of this.variables) {
			if (variable.hasDependencies(filter)) return true;
		}
		return false;
	}

	sortItems() {
		for (const block of this.blocks) block.sortItems();
	}
}

module.exports = DependenciesBlock;


/***/ }),

/***/ 904:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const { RawSource, ReplaceSource } = __nccwpck_require__(665);

/** @typedef {import("./Dependency")} Dependency */
/** @typedef {import("./Dependency").DependencyTemplate} DependencyTemplate */
/** @typedef {import("./RuntimeTemplate")} RuntimeTemplate */
/** @typedef {import("./util/createHash").Hash} Hash */
/** @typedef {(d: Dependency) => boolean} DependencyFilterFunction */
/** @typedef {Map<Function, DependencyTemplate>} DependencyTemplates */

class DependenciesBlockVariable {
	/**
	 * Creates an instance of DependenciesBlockVariable.
	 * @param {string} name name of DependenciesBlockVariable
	 * @param {string} expression expression string
	 * @param {Dependency[]=} dependencies dependencies tied to this varaiable
	 */
	constructor(name, expression, dependencies) {
		this.name = name;
		this.expression = expression;
		this.dependencies = dependencies || [];
	}

	/**
	 * @param {Hash} hash hash for instance to update
	 * @returns {void}
	 */
	updateHash(hash) {
		hash.update(this.name);
		hash.update(this.expression);
		for (const d of this.dependencies) {
			d.updateHash(hash);
		}
	}

	/**
	 * @param {DependencyTemplates} dependencyTemplates Dependency constructors and templates Map.
	 * @param {RuntimeTemplate} runtimeTemplate runtimeTemplate to generate expression souce
	 * @returns {ReplaceSource} returns constructed source for expression via templates
	 */
	expressionSource(dependencyTemplates, runtimeTemplate) {
		const source = new ReplaceSource(new RawSource(this.expression));
		for (const dep of this.dependencies) {
			const template = dependencyTemplates.get(dep.constructor);
			if (!template) {
				throw new Error(`No template for dependency: ${dep.constructor.name}`);
			}
			template.apply(dep, source, runtimeTemplate, dependencyTemplates);
		}
		return source;
	}

	disconnect() {
		for (const d of this.dependencies) {
			d.disconnect();
		}
	}

	hasDependencies(filter) {
		if (filter) {
			return this.dependencies.some(filter);
		}
		return this.dependencies.length > 0;
	}
}

module.exports = DependenciesBlockVariable;


/***/ }),

/***/ 931:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const ChunkGroup = __nccwpck_require__(911);

/** @typedef {import("./Chunk")} Chunk */

/**
 * Entrypoint serves as an encapsulation primitive for chunks that are
 * a part of a single ChunkGroup. They represent all bundles that need to be loaded for a
 * single instance of a page. Multi-page application architectures will typically yield multiple Entrypoint objects
 * inside of the compilation, whereas a Single Page App may only contain one with many lazy-loaded chunks.
 */
class Entrypoint extends ChunkGroup {
	/**
	 * Creates an instance of Entrypoint.
	 * @param {string} name the name of the entrypoint
	 */
	constructor(name) {
		super(name);
		/** @type {Chunk=} */
		this.runtimeChunk = undefined;
	}

	/**
	 * isInitial will always return true for Entrypoint ChunkGroup.
	 * @returns {true} returns true as all entrypoints are initial ChunkGroups
	 */
	isInitial() {
		return true;
	}

	/**
	 * Sets the runtimeChunk for an entrypoint.
	 * @param {Chunk} chunk the chunk being set as the runtime chunk.
	 * @returns {void}
	 */
	setRuntimeChunk(chunk) {
		this.runtimeChunk = chunk;
	}

	/**
	 * Fetches the chunk reference containing the webpack bootstrap code
	 * @returns {Chunk} returns the runtime chunk or first chunk in `this.chunks`
	 */
	getRuntimeChunk() {
		return this.runtimeChunk || this.chunks[0];
	}

	/**
	 * @param {Chunk} oldChunk chunk to be replaced
	 * @param {Chunk} newChunk New chunk that will be replaced with
	 * @returns {boolean} returns true if the replacement was successful
	 */
	replaceChunk(oldChunk, newChunk) {
		if (this.runtimeChunk === oldChunk) this.runtimeChunk = newChunk;
		return super.replaceChunk(oldChunk, newChunk);
	}
}

module.exports = Entrypoint;


/***/ }),

/***/ 140:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const loaderFlag = "LOADER_EXECUTION";

const webpackOptionsFlag = "WEBPACK_OPTIONS";

exports.cutOffByFlag = (stack, flag) => {
	stack = stack.split("\n");
	for (let i = 0; i < stack.length; i++) {
		if (stack[i].includes(flag)) {
			stack.length = i;
		}
	}
	return stack.join("\n");
};

exports.cutOffLoaderExecution = stack =>
	exports.cutOffByFlag(stack, loaderFlag);

exports.cutOffWebpackOptions = stack =>
	exports.cutOffByFlag(stack, webpackOptionsFlag);

exports.cutOffMultilineMessage = (stack, message) => {
	stack = stack.split("\n");
	message = message.split("\n");

	return stack
		.reduce(
			(acc, line, idx) =>
				line.includes(message[idx]) ? acc : acc.concat(line),
			[]
		)
		.join("\n");
};

exports.cutOffMessage = (stack, message) => {
	const nextLine = stack.indexOf("\n");
	if (nextLine === -1) {
		return stack === message ? "" : stack;
	} else {
		const firstLine = stack.substr(0, nextLine);
		return firstLine === message ? stack.substr(nextLine + 1) : stack;
	}
};

exports.cleanUp = (stack, message) => {
	stack = exports.cutOffLoaderExecution(stack);
	stack = exports.cutOffMessage(stack, message);
	return stack;
};

exports.cleanUpWebpackOptions = (stack, message) => {
	stack = exports.cutOffWebpackOptions(stack);
	stack = exports.cutOffMultilineMessage(stack, message);
	return stack;
};


/***/ }),

/***/ 204:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const { OriginalSource, RawSource } = __nccwpck_require__(665);
const Module = __nccwpck_require__(993);
const WebpackMissingModule = __nccwpck_require__(386);
const Template = __nccwpck_require__(66);

/** @typedef {import("./util/createHash").Hash} Hash */

class ExternalModule extends Module {
	constructor(request, type, userRequest) {
		super("javascript/dynamic", null);

		// Info from Factory
		this.request = request;
		this.externalType = type;
		this.userRequest = userRequest;
		this.external = true;
	}

	libIdent() {
		return this.userRequest;
	}

	chunkCondition(chunk) {
		return chunk.hasEntryModule();
	}

	identifier() {
		return "external " + JSON.stringify(this.request);
	}

	readableIdentifier() {
		return "external " + JSON.stringify(this.request);
	}

	needRebuild() {
		return false;
	}

	build(options, compilation, resolver, fs, callback) {
		this.built = true;
		this.buildMeta = {};
		this.buildInfo = {};
		callback();
	}

	getSourceForGlobalVariableExternal(variableName, type) {
		if (!Array.isArray(variableName)) {
			// make it an array as the look up works the same basically
			variableName = [variableName];
		}

		// needed for e.g. window["some"]["thing"]
		const objectLookup = variableName
			.map(r => `[${JSON.stringify(r)}]`)
			.join("");
		return `(function() { module.exports = ${type}${objectLookup}; }());`;
	}

	getSourceForCommonJsExternal(moduleAndSpecifiers) {
		if (!Array.isArray(moduleAndSpecifiers)) {
			return `module.exports = require(${JSON.stringify(
				moduleAndSpecifiers
			)});`;
		}

		const moduleName = moduleAndSpecifiers[0];
		const objectLookup = moduleAndSpecifiers
			.slice(1)
			.map(r => `[${JSON.stringify(r)}]`)
			.join("");
		return `module.exports = require(${JSON.stringify(
			moduleName
		)})${objectLookup};`;
	}

	checkExternalVariable(variableToCheck, request) {
		return `if(typeof ${variableToCheck} === 'undefined') {${WebpackMissingModule.moduleCode(
			request
		)}}\n`;
	}

	getSourceForAmdOrUmdExternal(id, optional, request) {
		const externalVariable = `__WEBPACK_EXTERNAL_MODULE_${Template.toIdentifier(
			`${id}`
		)}__`;
		const missingModuleError = optional
			? this.checkExternalVariable(externalVariable, request)
			: "";
		return `${missingModuleError}module.exports = ${externalVariable};`;
	}

	getSourceForDefaultCase(optional, request) {
		if (!Array.isArray(request)) {
			// make it an array as the look up works the same basically
			request = [request];
		}

		const variableName = request[0];
		const missingModuleError = optional
			? this.checkExternalVariable(variableName, request.join("."))
			: "";
		const objectLookup = request
			.slice(1)
			.map(r => `[${JSON.stringify(r)}]`)
			.join("");
		return `${missingModuleError}module.exports = ${variableName}${objectLookup};`;
	}

	getSourceString(runtime) {
		const request =
			typeof this.request === "object" && !Array.isArray(this.request)
				? this.request[this.externalType]
				: this.request;
		switch (this.externalType) {
			case "this":
			case "window":
			case "self":
				return this.getSourceForGlobalVariableExternal(
					request,
					this.externalType
				);
			case "global":
				return this.getSourceForGlobalVariableExternal(
					request,
					runtime.outputOptions.globalObject
				);
			case "commonjs":
			case "commonjs2":
				return this.getSourceForCommonJsExternal(request);
			case "amd":
			case "amd-require":
			case "umd":
			case "umd2":
			case "system":
				return this.getSourceForAmdOrUmdExternal(
					this.id,
					this.optional,
					request
				);
			default:
				return this.getSourceForDefaultCase(this.optional, request);
		}
	}

	getSource(sourceString) {
		if (this.useSourceMap) {
			return new OriginalSource(sourceString, this.identifier());
		}

		return new RawSource(sourceString);
	}

	source(dependencyTemplates, runtime) {
		return this.getSource(this.getSourceString(runtime));
	}

	size() {
		return 42;
	}

	/**
	 * @param {Hash} hash the hash used to track dependencies
	 * @returns {void}
	 */
	updateHash(hash) {
		hash.update(this.externalType);
		hash.update(JSON.stringify(this.request));
		hash.update(JSON.stringify(Boolean(this.optional)));
		super.updateHash(hash);
	}
}

module.exports = ExternalModule;


/***/ }),

/***/ 876:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const ExternalModule = __nccwpck_require__(204);

class ExternalModuleFactoryPlugin {
	constructor(type, externals) {
		this.type = type;
		this.externals = externals;
	}

	apply(normalModuleFactory) {
		const globalType = this.type;
		normalModuleFactory.hooks.factory.tap(
			"ExternalModuleFactoryPlugin",
			factory => (data, callback) => {
				const context = data.context;
				const dependency = data.dependencies[0];

				const handleExternal = (value, type, callback) => {
					if (typeof type === "function") {
						callback = type;
						type = undefined;
					}
					if (value === false) return factory(data, callback);
					if (value === true) value = dependency.request;
					if (type === undefined && /^[a-z0-9]+ /.test(value)) {
						const idx = value.indexOf(" ");
						type = value.substr(0, idx);
						value = value.substr(idx + 1);
					}
					callback(
						null,
						new ExternalModule(value, type || globalType, dependency.request)
					);
					return true;
				};

				const handleExternals = (externals, callback) => {
					if (typeof externals === "string") {
						if (externals === dependency.request) {
							return handleExternal(dependency.request, callback);
						}
					} else if (Array.isArray(externals)) {
						let i = 0;
						const next = () => {
							let asyncFlag;
							const handleExternalsAndCallback = (err, module) => {
								if (err) return callback(err);
								if (!module) {
									if (asyncFlag) {
										asyncFlag = false;
										return;
									}
									return next();
								}
								callback(null, module);
							};

							do {
								asyncFlag = true;
								if (i >= externals.length) return callback();
								handleExternals(externals[i++], handleExternalsAndCallback);
							} while (!asyncFlag);
							asyncFlag = false;
						};

						next();
						return;
					} else if (externals instanceof RegExp) {
						if (externals.test(dependency.request)) {
							return handleExternal(dependency.request, callback);
						}
					} else if (typeof externals === "function") {
						externals.call(
							null,
							context,
							dependency.request,
							(err, value, type) => {
								if (err) return callback(err);
								if (value !== undefined) {
									handleExternal(value, type, callback);
								} else {
									callback();
								}
							}
						);
						return;
					} else if (
						typeof externals === "object" &&
						Object.prototype.hasOwnProperty.call(externals, dependency.request)
					) {
						return handleExternal(externals[dependency.request], callback);
					}
					callback();
				};

				handleExternals(this.externals, (err, module) => {
					if (err) return callback(err);
					if (!module) return handleExternal(false, callback);
					return callback(null, module);
				});
			}
		);
	}
}
module.exports = ExternalModuleFactoryPlugin;


/***/ }),

/***/ 705:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const ExternalModuleFactoryPlugin = __nccwpck_require__(876);

class ExternalsPlugin {
	constructor(type, externals) {
		this.type = type;
		this.externals = externals;
	}
	apply(compiler) {
		compiler.hooks.compile.tap("ExternalsPlugin", ({ normalModuleFactory }) => {
			new ExternalModuleFactoryPlugin(this.type, this.externals).apply(
				normalModuleFactory
			);
		});
	}
}

module.exports = ExternalsPlugin;


/***/ }),

/***/ 973:
/***/ ((__unused_webpack_module, exports) => {

/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./ChunkGroup")} ChunkGroup */
/** @typedef {import("./Module")} Module */
/** @typedef {import("./DependenciesBlock")} DependenciesBlock */
/** @typedef {import("./AsyncDependenciesBlock")} AsyncDependenciesBlock */

/**
 * @param {ChunkGroup} chunkGroup the ChunkGroup to connect
 * @param {Chunk} chunk chunk to tie to ChunkGroup
 * @returns {void}
 */
const connectChunkGroupAndChunk = (chunkGroup, chunk) => {
	if (chunkGroup.pushChunk(chunk)) {
		chunk.addGroup(chunkGroup);
	}
};

/**
 * @param {ChunkGroup} parent parent ChunkGroup to connect
 * @param {ChunkGroup} child child ChunkGroup to connect
 * @returns {void}
 */
const connectChunkGroupParentAndChild = (parent, child) => {
	if (parent.addChild(child)) {
		child.addParent(parent);
	}
};

/**
 * @param {Chunk} chunk Chunk to connect to Module
 * @param {Module} module Module to connect to Chunk
 * @returns {void}
 */
const connectChunkAndModule = (chunk, module) => {
	if (module.addChunk(chunk)) {
		chunk.addModule(module);
	}
};

/**
 * @param {Chunk} chunk Chunk being disconnected
 * @param {Module} module Module being disconnected
 * @returns {void}
 */
const disconnectChunkAndModule = (chunk, module) => {
	chunk.removeModule(module);
	module.removeChunk(chunk);
};

/**
 * @param {AsyncDependenciesBlock} depBlock DepBlock being tied to ChunkGroup
 * @param {ChunkGroup} chunkGroup ChunkGroup being tied to DepBlock
 * @returns {void}
 */
const connectDependenciesBlockAndChunkGroup = (depBlock, chunkGroup) => {
	if (chunkGroup.addBlock(depBlock)) {
		depBlock.chunkGroup = chunkGroup;
	}
};

exports.connectChunkGroupAndChunk = connectChunkGroupAndChunk;
exports.connectChunkGroupParentAndChild = connectChunkGroupParentAndChild;
exports.connectChunkAndModule = connectChunkAndModule;
exports.disconnectChunkAndModule = disconnectChunkAndModule;
exports.connectDependenciesBlockAndChunkGroup = connectDependenciesBlockAndChunkGroup;


/***/ }),

/***/ 782:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const Chunk = __nccwpck_require__(919);

class HotUpdateChunk extends Chunk {
	constructor() {
		super();
		/** @type {(string|number)[]} */
		this.removedModules = undefined;
	}
}

module.exports = HotUpdateChunk;


/***/ }),

/***/ 993:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const util = __nccwpck_require__(669);

const DependenciesBlock = __nccwpck_require__(71);
const ModuleReason = __nccwpck_require__(576);
const SortableSet = __nccwpck_require__(834);
const Template = __nccwpck_require__(66);

/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./RequestShortener")} RequestShortener */
/** @typedef {import("./WebpackError")} WebpackError */
/** @typedef {import("./util/createHash").Hash} Hash */

const EMPTY_RESOLVE_OPTIONS = {};

let debugId = 1000;

const sortById = (a, b) => {
	return a.id - b.id;
};

const sortByDebugId = (a, b) => {
	return a.debugId - b.debugId;
};

/** @typedef {(requestShortener: RequestShortener) => string} OptimizationBailoutFunction */

class Module extends DependenciesBlock {
	constructor(type, context = null) {
		super();
		/** @type {string} */
		this.type = type;
		/** @type {string} */
		this.context = context;

		// Unique Id
		/** @type {number} */
		this.debugId = debugId++;

		// Hash
		/** @type {string} */
		this.hash = undefined;
		/** @type {string} */
		this.renderedHash = undefined;

		// Info from Factory
		/** @type {TODO} */
		this.resolveOptions = EMPTY_RESOLVE_OPTIONS;
		/** @type {object} */
		this.factoryMeta = {};

		// Info from Build
		/** @type {WebpackError[]} */
		this.warnings = [];
		/** @type {WebpackError[]} */
		this.errors = [];
		/** @type {object} */
		this.buildMeta = undefined;
		/** @type {object} */
		this.buildInfo = undefined;

		// Graph (per Compilation)
		/** @type {ModuleReason[]} */
		this.reasons = [];
		/** @type {SortableSet<Chunk>} */
		this._chunks = new SortableSet(undefined, sortById);

		// Info from Compilation (per Compilation)
		/** @type {number|string} */
		this.id = null;
		/** @type {number} */
		this.index = null;
		/** @type {number} */
		this.index2 = null;
		/** @type {number} */
		this.depth = null;
		/** @type {Module} */
		this.issuer = null;
		/** @type {undefined | object} */
		this.profile = undefined;
		/** @type {boolean} */
		this.prefetched = false;
		/** @type {boolean} */
		this.built = false;

		// Info from Optimization (per Compilation)
		/** @type {null | boolean} */
		this.used = null;
		/** @type {false | true | string[]} */
		this.usedExports = null;
		/** @type {(string | OptimizationBailoutFunction)[]} */
		this.optimizationBailout = [];

		// delayed operations
		/** @type {undefined | {oldChunk: Chunk, newChunks: Chunk[]}[] } */
		this._rewriteChunkInReasons = undefined;

		/** @type {boolean} */
		this.useSourceMap = false;

		// info from build
		this._source = null;
	}

	get exportsArgument() {
		return (this.buildInfo && this.buildInfo.exportsArgument) || "exports";
	}

	get moduleArgument() {
		return (this.buildInfo && this.buildInfo.moduleArgument) || "module";
	}

	disconnect() {
		this.hash = undefined;
		this.renderedHash = undefined;

		this.reasons.length = 0;
		this._rewriteChunkInReasons = undefined;
		this._chunks.clear();

		this.id = null;
		this.index = null;
		this.index2 = null;
		this.depth = null;
		this.issuer = null;
		this.profile = undefined;
		this.prefetched = false;
		this.built = false;

		this.used = null;
		this.usedExports = null;
		this.optimizationBailout.length = 0;
		super.disconnect();
	}

	unseal() {
		this.id = null;
		this.index = null;
		this.index2 = null;
		this.depth = null;
		this._chunks.clear();
		super.unseal();
	}

	setChunks(chunks) {
		this._chunks = new SortableSet(chunks, sortById);
	}

	addChunk(chunk) {
		if (this._chunks.has(chunk)) return false;
		this._chunks.add(chunk);
		return true;
	}

	removeChunk(chunk) {
		if (this._chunks.delete(chunk)) {
			chunk.removeModule(this);
			return true;
		}
		return false;
	}

	isInChunk(chunk) {
		return this._chunks.has(chunk);
	}

	isEntryModule() {
		for (const chunk of this._chunks) {
			if (chunk.entryModule === this) return true;
		}
		return false;
	}

	get optional() {
		return (
			this.reasons.length > 0 &&
			this.reasons.every(r => r.dependency && r.dependency.optional)
		);
	}

	/**
	 * @returns {Chunk[]} all chunks which contain the module
	 */
	getChunks() {
		return Array.from(this._chunks);
	}

	getNumberOfChunks() {
		return this._chunks.size;
	}

	get chunksIterable() {
		return this._chunks;
	}

	hasEqualsChunks(otherModule) {
		if (this._chunks.size !== otherModule._chunks.size) return false;
		this._chunks.sortWith(sortByDebugId);
		otherModule._chunks.sortWith(sortByDebugId);
		const a = this._chunks[Symbol.iterator]();
		const b = otherModule._chunks[Symbol.iterator]();
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const aItem = a.next();
			const bItem = b.next();
			if (aItem.done) return true;
			if (aItem.value !== bItem.value) return false;
		}
	}

	addReason(module, dependency, explanation) {
		this.reasons.push(new ModuleReason(module, dependency, explanation));
	}

	removeReason(module, dependency) {
		for (let i = 0; i < this.reasons.length; i++) {
			let r = this.reasons[i];
			if (r.module === module && r.dependency === dependency) {
				this.reasons.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	hasReasonForChunk(chunk) {
		if (this._rewriteChunkInReasons) {
			for (const operation of this._rewriteChunkInReasons) {
				this._doRewriteChunkInReasons(operation.oldChunk, operation.newChunks);
			}
			this._rewriteChunkInReasons = undefined;
		}
		for (let i = 0; i < this.reasons.length; i++) {
			if (this.reasons[i].hasChunk(chunk)) return true;
		}
		return false;
	}

	hasReasons() {
		return this.reasons.length > 0;
	}

	rewriteChunkInReasons(oldChunk, newChunks) {
		// This is expensive. Delay operation until we really need the data
		if (this._rewriteChunkInReasons === undefined) {
			this._rewriteChunkInReasons = [];
		}
		this._rewriteChunkInReasons.push({
			oldChunk,
			newChunks
		});
	}

	_doRewriteChunkInReasons(oldChunk, newChunks) {
		for (let i = 0; i < this.reasons.length; i++) {
			this.reasons[i].rewriteChunks(oldChunk, newChunks);
		}
	}

	/**
	 * @param {string=} exportName the name of the export
	 * @returns {boolean|string} false if the export isn't used, true if no exportName is provided and the module is used, or the name to access it if the export is used
	 */
	isUsed(exportName) {
		if (!exportName) return this.used !== false;
		if (this.used === null || this.usedExports === null) return exportName;
		if (!this.used) return false;
		if (!this.usedExports) return false;
		if (this.usedExports === true) return exportName;
		let idx = this.usedExports.indexOf(exportName);
		if (idx < 0) return false;

		// Mangle export name if possible
		if (this.isProvided(exportName)) {
			if (this.buildMeta.exportsType === "namespace") {
				return Template.numberToIdentifer(idx);
			}
			if (
				this.buildMeta.exportsType === "named" &&
				!this.usedExports.includes("default")
			) {
				return Template.numberToIdentifer(idx);
			}
		}
		return exportName;
	}

	isProvided(exportName) {
		if (!Array.isArray(this.buildMeta.providedExports)) return null;
		return this.buildMeta.providedExports.includes(exportName);
	}

	toString() {
		return `Module[${this.id || this.debugId}]`;
	}

	needRebuild(fileTimestamps, contextTimestamps) {
		return true;
	}

	/**
	 * @param {Hash} hash the hash used to track dependencies
	 * @returns {void}
	 */
	updateHash(hash) {
		hash.update(`${this.id}`);
		hash.update(JSON.stringify(this.usedExports));
		super.updateHash(hash);
	}

	sortItems(sortChunks) {
		super.sortItems();
		if (sortChunks) this._chunks.sort();
		this.reasons.sort((a, b) => {
			if (a.module === b.module) return 0;
			if (!a.module) return -1;
			if (!b.module) return 1;
			return sortById(a.module, b.module);
		});
		if (Array.isArray(this.usedExports)) {
			this.usedExports.sort();
		}
	}

	unbuild() {
		this.dependencies.length = 0;
		this.blocks.length = 0;
		this.variables.length = 0;
		this.buildMeta = undefined;
		this.buildInfo = undefined;
		this.disconnect();
	}

	get arguments() {
		throw new Error("Module.arguments was removed, there is no replacement.");
	}

	set arguments(value) {
		throw new Error("Module.arguments was removed, there is no replacement.");
	}
}

// TODO remove in webpack 5
Object.defineProperty(Module.prototype, "forEachChunk", {
	configurable: false,
	value: util.deprecate(
		/**
		 * @deprecated
		 * @param {function(any, any, Set<any>): void} fn callback function
		 * @returns {void}
		 * @this {Module}
		 */
		function(fn) {
			this._chunks.forEach(fn);
		},
		"Module.forEachChunk: Use for(const chunk of module.chunksIterable) instead"
	)
});

// TODO remove in webpack 5
Object.defineProperty(Module.prototype, "mapChunks", {
	configurable: false,
	value: util.deprecate(
		/**
		 * @deprecated
		 * @param {function(any, any): void} fn Mapper function
		 * @returns {Array<TODO>} Array of chunks mapped
		 * @this {Module}
		 */
		function(fn) {
			return Array.from(this._chunks, fn);
		},
		"Module.mapChunks: Use Array.from(module.chunksIterable, fn) instead"
	)
});

// TODO remove in webpack 5
Object.defineProperty(Module.prototype, "entry", {
	configurable: false,
	get() {
		throw new Error("Module.entry was removed. Use Chunk.entryModule");
	},
	set() {
		throw new Error("Module.entry was removed. Use Chunk.entryModule");
	}
});

// TODO remove in webpack 5
Object.defineProperty(Module.prototype, "meta", {
	configurable: false,
	get: util.deprecate(
		/**
		 * @deprecated
		 * @returns {void}
		 * @this {Module}
		 */
		function() {
			return this.buildMeta;
		},
		"Module.meta was renamed to Module.buildMeta"
	),
	set: util.deprecate(
		/**
		 * @deprecated
		 * @param {TODO} value Value
		 * @returns {void}
		 * @this {Module}
		 */
		function(value) {
			this.buildMeta = value;
		},
		"Module.meta was renamed to Module.buildMeta"
	)
});

/** @type {function(): string} */
Module.prototype.identifier = null;

/** @type {function(RequestShortener): string} */
Module.prototype.readableIdentifier = null;

Module.prototype.build = null;
Module.prototype.source = null;
Module.prototype.size = null;
Module.prototype.nameForCondition = null;
/** @type {null | function(Chunk): boolean} */
Module.prototype.chunkCondition = null;
Module.prototype.updateCacheModule = null;

module.exports = Module;


/***/ }),

/***/ 72:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __nccwpck_require__(391);
const { cutOffLoaderExecution } = __nccwpck_require__(140);

class ModuleBuildError extends WebpackError {
	constructor(module, err, { from = null } = {}) {
		let message = "Module build failed";
		let details = undefined;
		if (from) {
			message += ` (from ${from}):\n`;
		} else {
			message += ": ";
		}
		if (err !== null && typeof err === "object") {
			if (typeof err.stack === "string" && err.stack) {
				const stack = cutOffLoaderExecution(err.stack);
				if (!err.hideStack) {
					message += stack;
				} else {
					details = stack;
					if (typeof err.message === "string" && err.message) {
						message += err.message;
					} else {
						message += err;
					}
				}
			} else if (typeof err.message === "string" && err.message) {
				message += err.message;
			} else {
				message += err;
			}
		} else {
			message = err;
		}

		super(message);

		this.name = "ModuleBuildError";
		this.details = details;
		this.module = module;
		this.error = err;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = ModuleBuildError;


/***/ }),

/***/ 528:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __nccwpck_require__(391);
const { cleanUp } = __nccwpck_require__(140);

class ModuleError extends WebpackError {
	constructor(module, err, { from = null } = {}) {
		let message = "Module Error";
		if (from) {
			message += ` (from ${from}):\n`;
		} else {
			message += ": ";
		}
		if (err && typeof err === "object" && err.message) {
			message += err.message;
		} else if (err) {
			message += err;
		}
		super(message);
		this.name = "ModuleError";
		this.module = module;
		this.error = err;
		this.details =
			err && typeof err === "object" && err.stack
				? cleanUp(err.stack, this.message)
				: undefined;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = ModuleError;


/***/ }),

/***/ 500:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __nccwpck_require__(391);

/** @typedef {import("./Module")} Module */

class ModuleParseError extends WebpackError {
	/**
	 * @param {Module} module the errored module
	 * @param {string} source source code
	 * @param {Error&any} err the parse error
	 * @param {string[]} loaders the loaders used
	 */
	constructor(module, source, err, loaders) {
		let message = "Module parse failed: " + err.message;
		let loc = undefined;
		if (loaders.length >= 1) {
			message += `\nFile was processed with these loaders:${loaders
				.map(loader => `\n * ${loader}`)
				.join("")}`;
			message +=
				"\nYou may need an additional loader to handle the result of these loaders.";
		} else {
			message +=
				"\nYou may need an appropriate loader to handle this file type, currently no loaders are configured to process this file. See https://webpack.js.org/concepts#loaders";
		}
		if (
			err.loc &&
			typeof err.loc === "object" &&
			typeof err.loc.line === "number"
		) {
			var lineNumber = err.loc.line;
			if (/[\0\u0001\u0002\u0003\u0004\u0005\u0006\u0007]/.test(source)) {
				// binary file
				message += "\n(Source code omitted for this binary file)";
			} else {
				const sourceLines = source.split(/\r?\n/);
				const start = Math.max(0, lineNumber - 3);
				const linesBefore = sourceLines.slice(start, lineNumber - 1);
				const theLine = sourceLines[lineNumber - 1];
				const linesAfter = sourceLines.slice(lineNumber, lineNumber + 2);
				message +=
					linesBefore.map(l => `\n| ${l}`).join("") +
					`\n> ${theLine}` +
					linesAfter.map(l => `\n| ${l}`).join("");
			}
			loc = err.loc;
		} else {
			message += "\n" + err.stack;
		}

		super(message);

		this.name = "ModuleParseError";
		this.module = module;
		this.loc = loc;
		this.error = err;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = ModuleParseError;


/***/ }),

/***/ 576:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


/** @typedef {import("./Module")} Module */
/** @typedef {import("./Dependency")} Dependency */

class ModuleReason {
	/**
	 * @param {Module} module the referencing module
	 * @param {Dependency} dependency the referencing dependency
	 * @param {string=} explanation some extra detail
	 */
	constructor(module, dependency, explanation) {
		this.module = module;
		this.dependency = dependency;
		this.explanation = explanation;
		this._chunks = null;
	}

	hasChunk(chunk) {
		if (this._chunks) {
			if (this._chunks.has(chunk)) return true;
		} else if (this.module && this.module._chunks.has(chunk)) return true;
		return false;
	}

	rewriteChunks(oldChunk, newChunks) {
		if (!this._chunks) {
			if (this.module) {
				if (!this.module._chunks.has(oldChunk)) return;
				this._chunks = new Set(this.module._chunks);
			} else {
				this._chunks = new Set();
			}
		}
		if (this._chunks.has(oldChunk)) {
			this._chunks.delete(oldChunk);
			for (let i = 0; i < newChunks.length; i++) {
				this._chunks.add(newChunks[i]);
			}
		}
	}
}

module.exports = ModuleReason;


/***/ }),

/***/ 372:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const WebpackError = __nccwpck_require__(391);
const { cleanUp } = __nccwpck_require__(140);

class ModuleWarning extends WebpackError {
	constructor(module, warning, { from = null } = {}) {
		let message = "Module Warning";
		if (from) {
			message += ` (from ${from}):\n`;
		} else {
			message += ": ";
		}
		if (warning && typeof warning === "object" && warning.message) {
			message += warning.message;
		} else if (warning) {
			message += warning;
		}
		super(message);
		this.name = "ModuleWarning";
		this.module = module;
		this.warning = warning;
		this.details =
			warning && typeof warning === "object" && warning.stack
				? cleanUp(warning.stack, this.message)
				: undefined;

		Error.captureStackTrace(this, this.constructor);
	}
}

module.exports = ModuleWarning;


/***/ }),

/***/ 963:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const NativeModule = __nccwpck_require__(282);

const {
	CachedSource,
	LineToLineMappedSource,
	OriginalSource,
	RawSource,
	SourceMapSource
} = __nccwpck_require__(665);
const { getContext, runLoaders } = __nccwpck_require__(278);

const WebpackError = __nccwpck_require__(391);
const Module = __nccwpck_require__(993);
const ModuleParseError = __nccwpck_require__(500);
const ModuleBuildError = __nccwpck_require__(72);
const ModuleError = __nccwpck_require__(528);
const ModuleWarning = __nccwpck_require__(372);
const createHash = __nccwpck_require__(660);
const contextify = __nccwpck_require__(658)/* .contextify */ .tR;

/** @typedef {import("./util/createHash").Hash} Hash */

const asString = buf => {
	if (Buffer.isBuffer(buf)) {
		return buf.toString("utf-8");
	}
	return buf;
};

const asBuffer = str => {
	if (!Buffer.isBuffer(str)) {
		return Buffer.from(str, "utf-8");
	}
	return str;
};

class NonErrorEmittedError extends WebpackError {
	constructor(error) {
		super();

		this.name = "NonErrorEmittedError";
		this.message = "(Emitted value instead of an instance of Error) " + error;

		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * @typedef {Object} CachedSourceEntry
 * @property {TODO} source the generated source
 * @property {string} hash the hash value
 */

class NormalModule extends Module {
	constructor({
		type,
		request,
		userRequest,
		rawRequest,
		loaders,
		resource,
		matchResource,
		parser,
		generator,
		resolveOptions
	}) {
		super(type, getContext(resource));

		// Info from Factory
		this.request = request;
		this.userRequest = userRequest;
		this.rawRequest = rawRequest;
		this.binary = type.startsWith("webassembly");
		this.parser = parser;
		this.generator = generator;
		this.resource = resource;
		this.matchResource = matchResource;
		this.loaders = loaders;
		if (resolveOptions !== undefined) this.resolveOptions = resolveOptions;

		// Info from Build
		this.error = null;
		this._source = null;
		this._sourceSize = null;
		this._buildHash = "";
		this.buildTimestamp = undefined;
		/** @private @type {Map<string, CachedSourceEntry>} */
		this._cachedSources = new Map();

		// Options for the NormalModule set by plugins
		// TODO refactor this -> options object filled from Factory
		this.useSourceMap = false;
		this.lineToLine = false;

		// Cache
		this._lastSuccessfulBuildMeta = {};
	}

	identifier() {
		return this.request;
	}

	readableIdentifier(requestShortener) {
		return requestShortener.shorten(this.userRequest);
	}

	libIdent(options) {
		return contextify(options.context, this.userRequest);
	}

	nameForCondition() {
		const resource = this.matchResource || this.resource;
		const idx = resource.indexOf("?");
		if (idx >= 0) return resource.substr(0, idx);
		return resource;
	}

	updateCacheModule(module) {
		this.type = module.type;
		this.request = module.request;
		this.userRequest = module.userRequest;
		this.rawRequest = module.rawRequest;
		this.parser = module.parser;
		this.generator = module.generator;
		this.resource = module.resource;
		this.matchResource = module.matchResource;
		this.loaders = module.loaders;
		this.resolveOptions = module.resolveOptions;
	}

	createSourceForAsset(name, content, sourceMap) {
		if (!sourceMap) {
			return new RawSource(content);
		}

		if (typeof sourceMap === "string") {
			return new OriginalSource(content, sourceMap);
		}

		return new SourceMapSource(content, name, sourceMap);
	}

	createLoaderContext(resolver, options, compilation, fs) {
		const requestShortener = compilation.runtimeTemplate.requestShortener;
		const getCurrentLoaderName = () => {
			const currentLoader = this.getCurrentLoader(loaderContext);
			if (!currentLoader) return "(not in loader scope)";
			return requestShortener.shorten(currentLoader.loader);
		};
		const loaderContext = {
			version: 2,
			emitWarning: warning => {
				if (!(warning instanceof Error)) {
					warning = new NonErrorEmittedError(warning);
				}
				this.warnings.push(
					new ModuleWarning(this, warning, {
						from: getCurrentLoaderName()
					})
				);
			},
			emitError: error => {
				if (!(error instanceof Error)) {
					error = new NonErrorEmittedError(error);
				}
				this.errors.push(
					new ModuleError(this, error, {
						from: getCurrentLoaderName()
					})
				);
			},
			getLogger: name => {
				const currentLoader = this.getCurrentLoader(loaderContext);
				return compilation.getLogger(() =>
					[currentLoader && currentLoader.loader, name, this.identifier()]
						.filter(Boolean)
						.join("|")
				);
			},
			// TODO remove in webpack 5
			exec: (code, filename) => {
				// @ts-ignore Argument of type 'this' is not assignable to parameter of type 'Module'.
				const module = new NativeModule(filename, this);
				// @ts-ignore _nodeModulePaths is deprecated and undocumented Node.js API
				module.paths = NativeModule._nodeModulePaths(this.context);
				module.filename = filename;
				module._compile(code, filename);
				return module.exports;
			},
			resolve(context, request, callback) {
				resolver.resolve({}, context, request, {}, callback);
			},
			getResolve(options) {
				const child = options ? resolver.withOptions(options) : resolver;
				return (context, request, callback) => {
					if (callback) {
						child.resolve({}, context, request, {}, callback);
					} else {
						return new Promise((resolve, reject) => {
							child.resolve({}, context, request, {}, (err, result) => {
								if (err) reject(err);
								else resolve(result);
							});
						});
					}
				};
			},
			emitFile: (name, content, sourceMap, assetInfo) => {
				if (!this.buildInfo.assets) {
					this.buildInfo.assets = Object.create(null);
					this.buildInfo.assetsInfo = new Map();
				}
				this.buildInfo.assets[name] = this.createSourceForAsset(
					name,
					content,
					sourceMap
				);
				this.buildInfo.assetsInfo.set(name, assetInfo);
			},
			rootContext: options.context,
			webpack: true,
			sourceMap: !!this.useSourceMap,
			mode: options.mode || "production",
			_module: this,
			_compilation: compilation,
			_compiler: compilation.compiler,
			fs: fs
		};

		compilation.hooks.normalModuleLoader.call(loaderContext, this);
		if (options.loader) {
			Object.assign(loaderContext, options.loader);
		}

		return loaderContext;
	}

	getCurrentLoader(loaderContext, index = loaderContext.loaderIndex) {
		if (
			this.loaders &&
			this.loaders.length &&
			index < this.loaders.length &&
			index >= 0 &&
			this.loaders[index]
		) {
			return this.loaders[index];
		}
		return null;
	}

	createSource(source, resourceBuffer, sourceMap) {
		// if there is no identifier return raw source
		if (!this.identifier) {
			return new RawSource(source);
		}

		// from here on we assume we have an identifier
		const identifier = this.identifier();

		if (this.lineToLine && resourceBuffer) {
			return new LineToLineMappedSource(
				source,
				identifier,
				asString(resourceBuffer)
			);
		}

		if (this.useSourceMap && sourceMap) {
			return new SourceMapSource(source, identifier, sourceMap);
		}

		if (Buffer.isBuffer(source)) {
			// @ts-ignore
			// TODO We need to fix @types/webpack-sources to allow RawSource to take a Buffer | string
			return new RawSource(source);
		}

		return new OriginalSource(source, identifier);
	}

	doBuild(options, compilation, resolver, fs, callback) {
		const loaderContext = this.createLoaderContext(
			resolver,
			options,
			compilation,
			fs
		);

		runLoaders(
			{
				resource: this.resource,
				loaders: this.loaders,
				context: loaderContext,
				readResource: fs.readFile.bind(fs)
			},
			(err, result) => {
				if (result) {
					this.buildInfo.cacheable = result.cacheable;
					this.buildInfo.fileDependencies = new Set(result.fileDependencies);
					this.buildInfo.contextDependencies = new Set(
						result.contextDependencies
					);
				}

				if (err) {
					if (!(err instanceof Error)) {
						err = new NonErrorEmittedError(err);
					}
					const currentLoader = this.getCurrentLoader(loaderContext);
					const error = new ModuleBuildError(this, err, {
						from:
							currentLoader &&
							compilation.runtimeTemplate.requestShortener.shorten(
								currentLoader.loader
							)
					});
					return callback(error);
				}

				const resourceBuffer = result.resourceBuffer;
				const source = result.result[0];
				const sourceMap = result.result.length >= 1 ? result.result[1] : null;
				const extraInfo = result.result.length >= 2 ? result.result[2] : null;

				if (!Buffer.isBuffer(source) && typeof source !== "string") {
					const currentLoader = this.getCurrentLoader(loaderContext, 0);
					const err = new Error(
						`Final loader (${
							currentLoader
								? compilation.runtimeTemplate.requestShortener.shorten(
										currentLoader.loader
								  )
								: "unknown"
						}) didn't return a Buffer or String`
					);
					const error = new ModuleBuildError(this, err);
					return callback(error);
				}

				this._source = this.createSource(
					this.binary ? asBuffer(source) : asString(source),
					resourceBuffer,
					sourceMap
				);
				this._sourceSize = null;
				this._ast =
					typeof extraInfo === "object" &&
					extraInfo !== null &&
					extraInfo.webpackAST !== undefined
						? extraInfo.webpackAST
						: null;
				return callback();
			}
		);
	}

	markModuleAsErrored(error) {
		// Restore build meta from successful build to keep importing state
		this.buildMeta = Object.assign({}, this._lastSuccessfulBuildMeta);
		this.error = error;
		this.errors.push(this.error);
		this._source = new RawSource(
			"throw new Error(" + JSON.stringify(this.error.message) + ");"
		);
		this._sourceSize = null;
		this._ast = null;
	}

	applyNoParseRule(rule, content) {
		// must start with "rule" if rule is a string
		if (typeof rule === "string") {
			return content.indexOf(rule) === 0;
		}

		if (typeof rule === "function") {
			return rule(content);
		}
		// we assume rule is a regexp
		return rule.test(content);
	}

	// check if module should not be parsed
	// returns "true" if the module should !not! be parsed
	// returns "false" if the module !must! be parsed
	shouldPreventParsing(noParseRule, request) {
		// if no noParseRule exists, return false
		// the module !must! be parsed.
		if (!noParseRule) {
			return false;
		}

		// we only have one rule to check
		if (!Array.isArray(noParseRule)) {
			// returns "true" if the module is !not! to be parsed
			return this.applyNoParseRule(noParseRule, request);
		}

		for (let i = 0; i < noParseRule.length; i++) {
			const rule = noParseRule[i];
			// early exit on first truthy match
			// this module is !not! to be parsed
			if (this.applyNoParseRule(rule, request)) {
				return true;
			}
		}
		// no match found, so this module !should! be parsed
		return false;
	}

	_initBuildHash(compilation) {
		const hash = createHash(compilation.outputOptions.hashFunction);
		if (this._source) {
			hash.update("source");
			this._source.updateHash(hash);
		}
		hash.update("meta");
		hash.update(JSON.stringify(this.buildMeta));
		this._buildHash = /** @type {string} */ (hash.digest("hex"));
	}

	build(options, compilation, resolver, fs, callback) {
		this.buildTimestamp = Date.now();
		this.built = true;
		this._source = null;
		this._sourceSize = null;
		this._ast = null;
		this._buildHash = "";
		this.error = null;
		this.errors.length = 0;
		this.warnings.length = 0;
		this.buildMeta = {};
		this.buildInfo = {
			cacheable: false,
			fileDependencies: new Set(),
			contextDependencies: new Set(),
			assets: undefined,
			assetsInfo: undefined
		};

		return this.doBuild(options, compilation, resolver, fs, err => {
			this._cachedSources.clear();

			// if we have an error mark module as failed and exit
			if (err) {
				this.markModuleAsErrored(err);
				this._initBuildHash(compilation);
				return callback();
			}

			// check if this module should !not! be parsed.
			// if so, exit here;
			const noParseRule = options.module && options.module.noParse;
			if (this.shouldPreventParsing(noParseRule, this.request)) {
				this._initBuildHash(compilation);
				return callback();
			}

			const handleParseError = e => {
				const source = this._source.source();
				const loaders = this.loaders.map(item =>
					contextify(options.context, item.loader)
				);
				const error = new ModuleParseError(this, source, e, loaders);
				this.markModuleAsErrored(error);
				this._initBuildHash(compilation);
				return callback();
			};

			const handleParseResult = result => {
				this._lastSuccessfulBuildMeta = this.buildMeta;
				this._initBuildHash(compilation);
				return callback();
			};

			try {
				const result = this.parser.parse(
					this._ast || this._source.source(),
					{
						current: this,
						module: this,
						compilation: compilation,
						options: options
					},
					(err, result) => {
						if (err) {
							handleParseError(err);
						} else {
							handleParseResult(result);
						}
					}
				);
				if (result !== undefined) {
					// parse is sync
					handleParseResult(result);
				}
			} catch (e) {
				handleParseError(e);
			}
		});
	}

	getHashDigest(dependencyTemplates) {
		// TODO webpack 5 refactor
		let dtHash = dependencyTemplates.get("hash");
		return `${this.hash}-${dtHash}`;
	}

	source(dependencyTemplates, runtimeTemplate, type = "javascript") {
		const hashDigest = this.getHashDigest(dependencyTemplates);
		const cacheEntry = this._cachedSources.get(type);
		if (cacheEntry !== undefined && cacheEntry.hash === hashDigest) {
			// We can reuse the cached source
			return cacheEntry.source;
		}

		const source = this.generator.generate(
			this,
			dependencyTemplates,
			runtimeTemplate,
			type
		);

		const cachedSource = new CachedSource(source);
		this._cachedSources.set(type, {
			source: cachedSource,
			hash: hashDigest
		});
		return cachedSource;
	}

	originalSource() {
		return this._source;
	}

	needRebuild(fileTimestamps, contextTimestamps) {
		// always try to rebuild in case of an error
		if (this.error) return true;

		// always rebuild when module is not cacheable
		if (!this.buildInfo.cacheable) return true;

		// Check timestamps of all dependencies
		// Missing timestamp -> need rebuild
		// Timestamp bigger than buildTimestamp -> need rebuild
		for (const file of this.buildInfo.fileDependencies) {
			const timestamp = fileTimestamps.get(file);
			if (!timestamp) return true;
			if (timestamp >= this.buildTimestamp) return true;
		}
		for (const file of this.buildInfo.contextDependencies) {
			const timestamp = contextTimestamps.get(file);
			if (!timestamp) return true;
			if (timestamp >= this.buildTimestamp) return true;
		}
		// elsewise -> no rebuild needed
		return false;
	}

	size() {
		if (this._sourceSize === null) {
			this._sourceSize = this._source ? this._source.size() : -1;
		}
		return this._sourceSize;
	}

	/**
	 * @param {Hash} hash the hash used to track dependencies
	 * @returns {void}
	 */
	updateHash(hash) {
		hash.update(this._buildHash);
		super.updateHash(hash);
	}
}

module.exports = NormalModule;


/***/ }),

/***/ 66:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/** @typedef {import("./Module")} Module */
/** @typedef {import("./Chunk")} Chunk */
/** @typedef {import("./ModuleTemplate")} ModuleTemplate */
/** @typedef {import("webpack-sources").ConcatSource} ConcatSource */

const { ConcatSource } = __nccwpck_require__(665);
const HotUpdateChunk = __nccwpck_require__(782);

const START_LOWERCASE_ALPHABET_CODE = "a".charCodeAt(0);
const START_UPPERCASE_ALPHABET_CODE = "A".charCodeAt(0);
const DELTA_A_TO_Z = "z".charCodeAt(0) - START_LOWERCASE_ALPHABET_CODE + 1;
const FUNCTION_CONTENT_REGEX = /^function\s?\(\)\s?\{\r?\n?|\r?\n?\}$/g;
const INDENT_MULTILINE_REGEX = /^\t/gm;
const LINE_SEPARATOR_REGEX = /\r?\n/g;
const IDENTIFIER_NAME_REPLACE_REGEX = /^([^a-zA-Z$_])/;
const IDENTIFIER_ALPHA_NUMERIC_NAME_REPLACE_REGEX = /[^a-zA-Z0-9$]+/g;
const COMMENT_END_REGEX = /\*\//g;
const PATH_NAME_NORMALIZE_REPLACE_REGEX = /[^a-zA-Z0-9_!§$()=\-^°]+/g;
const MATCH_PADDED_HYPHENS_REPLACE_REGEX = /^-|-$/g;

/** @typedef {import("webpack-sources").Source} Source */

/**
 * @typedef {Object} HasId
 * @property {number | string} id
 */

/**
 * @typedef {function(Module, number): boolean} ModuleFilterPredicate
 */

/**
 * @param {HasId} a first id object to be sorted
 * @param {HasId} b second id object to be sorted against
 * @returns {-1|0|1} the sort value
 */
const stringifyIdSortPredicate = (a, b) => {
	const aId = a.id + "";
	const bId = b.id + "";
	if (aId < bId) return -1;
	if (aId > bId) return 1;
	return 0;
};

class Template {
	/**
	 *
	 * @param {Function} fn a runtime function (.runtime.js) "template"
	 * @returns {string} the updated and normalized function string
	 */
	static getFunctionContent(fn) {
		return fn
			.toString()
			.replace(FUNCTION_CONTENT_REGEX, "")
			.replace(INDENT_MULTILINE_REGEX, "")
			.replace(LINE_SEPARATOR_REGEX, "\n");
	}

	/**
	 * @param {string} str the string converted to identifier
	 * @returns {string} created identifier
	 */
	static toIdentifier(str) {
		if (typeof str !== "string") return "";
		return str
			.replace(IDENTIFIER_NAME_REPLACE_REGEX, "_$1")
			.replace(IDENTIFIER_ALPHA_NUMERIC_NAME_REPLACE_REGEX, "_");
	}
	/**
	 *
	 * @param {string} str string to be converted to commented in bundle code
	 * @returns {string} returns a commented version of string
	 */
	static toComment(str) {
		if (!str) return "";
		return `/*! ${str.replace(COMMENT_END_REGEX, "* /")} */`;
	}

	/**
	 *
	 * @param {string} str string to be converted to "normal comment"
	 * @returns {string} returns a commented version of string
	 */
	static toNormalComment(str) {
		if (!str) return "";
		return `/* ${str.replace(COMMENT_END_REGEX, "* /")} */`;
	}

	/**
	 * @param {string} str string path to be normalized
	 * @returns {string} normalized bundle-safe path
	 */
	static toPath(str) {
		if (typeof str !== "string") return "";
		return str
			.replace(PATH_NAME_NORMALIZE_REPLACE_REGEX, "-")
			.replace(MATCH_PADDED_HYPHENS_REPLACE_REGEX, "");
	}

	// map number to a single character a-z, A-Z or <_ + number> if number is too big
	/**
	 *
	 * @param {number} n number to convert to ident
	 * @returns {string} returns single character ident
	 */
	static numberToIdentifer(n) {
		// lower case
		if (n < DELTA_A_TO_Z) {
			return String.fromCharCode(START_LOWERCASE_ALPHABET_CODE + n);
		}

		// upper case
		if (n < DELTA_A_TO_Z * 2) {
			return String.fromCharCode(
				START_UPPERCASE_ALPHABET_CODE + n - DELTA_A_TO_Z
			);
		}

		// use multiple letters
		return (
			Template.numberToIdentifer(n % (2 * DELTA_A_TO_Z)) +
			Template.numberToIdentifer(Math.floor(n / (2 * DELTA_A_TO_Z)))
		);
	}

	/**
	 *
	 * @param {string | string[]} s string to convert to identity
	 * @returns {string} converted identity
	 */
	static indent(s) {
		if (Array.isArray(s)) {
			return s.map(Template.indent).join("\n");
		} else {
			const str = s.trimRight();
			if (!str) return "";
			const ind = str[0] === "\n" ? "" : "\t";
			return ind + str.replace(/\n([^\n])/g, "\n\t$1");
		}
	}

	/**
	 *
	 * @param {string|string[]} s string to create prefix for
	 * @param {string} prefix prefix to compose
	 * @returns {string} returns new prefix string
	 */
	static prefix(s, prefix) {
		const str = Template.asString(s).trim();
		if (!str) return "";
		const ind = str[0] === "\n" ? "" : prefix;
		return ind + str.replace(/\n([^\n])/g, "\n" + prefix + "$1");
	}

	/**
	 *
	 * @param {string|string[]} str string or string collection
	 * @returns {string} returns a single string from array
	 */
	static asString(str) {
		if (Array.isArray(str)) {
			return str.join("\n");
		}
		return str;
	}

	/**
	 * @typedef {Object} WithId
	 * @property {string|number} id
	 */

	/**
	 * @param {WithId[]} modules a collection of modules to get array bounds for
	 * @returns {[number, number] | false} returns the upper and lower array bounds
	 * or false if not every module has a number based id
	 */
	static getModulesArrayBounds(modules) {
		let maxId = -Infinity;
		let minId = Infinity;
		for (const module of modules) {
			if (typeof module.id !== "number") return false;
			if (maxId < module.id) maxId = /** @type {number} */ (module.id);
			if (minId > module.id) minId = /** @type {number} */ (module.id);
		}
		if (minId < 16 + ("" + minId).length) {
			// add minId x ',' instead of 'Array(minId).concat(…)'
			minId = 0;
		}
		const objectOverhead = modules
			.map(module => (module.id + "").length + 2)
			.reduce((a, b) => a + b, -1);
		const arrayOverhead =
			minId === 0 ? maxId : 16 + ("" + minId).length + maxId;
		return arrayOverhead < objectOverhead ? [minId, maxId] : false;
	}

	/**
	 * @param {Chunk} chunk chunk whose modules will be rendered
	 * @param {ModuleFilterPredicate} filterFn function used to filter modules from chunk to render
	 * @param {ModuleTemplate} moduleTemplate ModuleTemplate instance used to render modules
	 * @param {TODO | TODO[]} dependencyTemplates templates needed for each module to render dependencies
	 * @param {string=} prefix applying prefix strings
	 * @returns {ConcatSource} rendered chunk modules in a Source object
	 */
	static renderChunkModules(
		chunk,
		filterFn,
		moduleTemplate,
		dependencyTemplates,
		prefix = ""
	) {
		const source = new ConcatSource();
		const modules = chunk.getModules().filter(filterFn);
		let removedModules;
		if (chunk instanceof HotUpdateChunk) {
			removedModules = chunk.removedModules;
		}
		if (
			modules.length === 0 &&
			(!removedModules || removedModules.length === 0)
		) {
			source.add("[]");
			return source;
		}
		/** @type {{id: string|number, source: Source|string}[]} */
		const allModules = modules.map(module => {
			return {
				id: module.id,
				source: moduleTemplate.render(module, dependencyTemplates, {
					chunk
				})
			};
		});
		if (removedModules && removedModules.length > 0) {
			for (const id of removedModules) {
				allModules.push({
					id,
					source: "false"
				});
			}
		}
		const bounds = Template.getModulesArrayBounds(allModules);
		if (bounds) {
			// Render a spare array
			const minId = bounds[0];
			const maxId = bounds[1];
			if (minId !== 0) {
				source.add(`Array(${minId}).concat(`);
			}
			source.add("[\n");
			/** @type {Map<string|number, {id: string|number, source: Source|string}>} */
			const modules = new Map();
			for (const module of allModules) {
				modules.set(module.id, module);
			}
			for (let idx = minId; idx <= maxId; idx++) {
				const module = modules.get(idx);
				if (idx !== minId) {
					source.add(",\n");
				}
				source.add(`/* ${idx} */`);
				if (module) {
					source.add("\n");
					source.add(module.source);
				}
			}
			source.add("\n" + prefix + "]");
			if (minId !== 0) {
				source.add(")");
			}
		} else {
			// Render an object
			source.add("{\n");
			allModules.sort(stringifyIdSortPredicate).forEach((module, idx) => {
				if (idx !== 0) {
					source.add(",\n");
				}
				source.add(`\n/***/ ${JSON.stringify(module.id)}:\n`);
				source.add(module.source);
			});
			source.add(`\n\n${prefix}}`);
		}
		return source;
	}
}

module.exports = Template;


/***/ }),

/***/ 391:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Jarid Margolin @jaridmargolin
*/


const inspect = __nccwpck_require__(669).inspect.custom;

class WebpackError extends Error {
	/**
	 * Creates an instance of WebpackError.
	 * @param {string=} message error message
	 */
	constructor(message) {
		super(message);

		this.details = undefined;
		this.missing = undefined;
		this.origin = undefined;
		this.dependencies = undefined;
		this.module = undefined;

		Error.captureStackTrace(this, this.constructor);
	}

	[inspect]() {
		return this.stack + (this.details ? `\n${this.details}` : "");
	}
}

module.exports = WebpackError;


/***/ }),

/***/ 562:
/***/ ((module) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


/** @typedef {import("./Dependency").DependencyLocation} DependencyLocation */

// TODO webpack 5 remove string type from a and b
/**
 * Compare two locations
 * @param {string|DependencyLocation} a A location node
 * @param {string|DependencyLocation} b A location node
 * @returns {-1|0|1} sorting comparator value
 */
module.exports = (a, b) => {
	if (typeof a === "string") {
		if (typeof b === "string") {
			if (a < b) return -1;
			if (a > b) return 1;
			return 0;
		} else if (typeof b === "object") {
			return 1;
		} else {
			return 0;
		}
	} else if (typeof a === "object") {
		if (typeof b === "string") {
			return -1;
		} else if (typeof b === "object") {
			if ("start" in a && "start" in b) {
				const ap = a.start;
				const bp = b.start;
				if (ap.line < bp.line) return -1;
				if (ap.line > bp.line) return 1;
				if (ap.column < bp.column) return -1;
				if (ap.column > bp.column) return 1;
			}
			if ("name" in a && "name" in b) {
				if (a.name < b.name) return -1;
				if (a.name > b.name) return 1;
			}
			if ("index" in a && "index" in b) {
				if (a.index < b.index) return -1;
				if (a.index > b.index) return 1;
			}
			return 0;
		} else {
			return 0;
		}
	}
};


/***/ }),

/***/ 386:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

const toErrorCode = err =>
	`var e = new Error(${JSON.stringify(err)}); e.code = 'MODULE_NOT_FOUND';`;

exports.module = request =>
	`!(function webpackMissingModule() { ${exports.moduleCode(request)} }())`;

exports.promise = request => {
	const errorCode = toErrorCode(`Cannot find module '${request}'`);
	return `Promise.reject(function webpackMissingModule() { ${errorCode} return e; }())`;
};

exports.moduleCode = request => {
	const errorCode = toErrorCode(`Cannot find module '${request}'`);
	return `${errorCode} throw e;`;
};


/***/ }),

/***/ 743:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const ExternalsPlugin = __nccwpck_require__(705);

const builtins =
	// eslint-disable-next-line node/no-unsupported-features/node-builtins,node/no-deprecated-api
	__nccwpck_require__(282).builtinModules || Object.keys(process.binding("natives"));

class NodeTargetPlugin {
	apply(compiler) {
		new ExternalsPlugin("commonjs", builtins).apply(compiler);
	}
}

module.exports = NodeTargetPlugin;


/***/ }),

/***/ 262:
/***/ ((__unused_webpack_module, exports) => {

"use strict";
var __webpack_unused_export__;


/**
 * intersect creates Set containing the intersection of elements between all sets
 * @param {Set[]} sets an array of sets being checked for shared elements
 * @returns {Set<TODO>} returns a new Set containing the intersecting items
 */
const intersect = sets => {
	if (sets.length === 0) return new Set();
	if (sets.length === 1) return new Set(sets[0]);
	let minSize = Infinity;
	let minIndex = -1;
	for (let i = 0; i < sets.length; i++) {
		const size = sets[i].size;
		if (size < minSize) {
			minIndex = i;
			minSize = size;
		}
	}
	const current = new Set(sets[minIndex]);
	for (let i = 0; i < sets.length; i++) {
		if (i === minIndex) continue;
		const set = sets[i];
		for (const item of current) {
			if (!set.has(item)) {
				current.delete(item);
			}
		}
	}
	return current;
};

/**
 * Checks if a set is the subset of another set
 * @param {Set<TODO>} bigSet a Set which contains the original elements to compare against
 * @param {Set<TODO>} smallSet the set whos elements might be contained inside of bigSet
 * @returns {boolean} returns true if smallSet contains all elements inside of the bigSet
 */
const isSubset = (bigSet, smallSet) => {
	if (bigSet.size < smallSet.size) return false;
	for (const item of smallSet) {
		if (!bigSet.has(item)) return false;
	}
	return true;
};

exports.w = intersect;
__webpack_unused_export__ = isSubset;


/***/ }),

/***/ 834:
/***/ ((module) => {

"use strict";


/**
 * A subset of Set that offers sorting functionality
 * @template T item type in set
 * @extends {Set<T>}
 */
class SortableSet extends Set {
	/**
	 * Create a new sortable set
	 * @param {Iterable<T>=} initialIterable The initial iterable value
	 * @typedef {function(T, T): number} SortFunction
	 * @param {SortFunction=} defaultSort Default sorting function
	 */
	constructor(initialIterable, defaultSort) {
		super(initialIterable);
		/** @private @type {function(T, T): number}} */
		this._sortFn = defaultSort;
		/** @private @type {function(T, T): number} | null} */
		this._lastActiveSortFn = null;
		/** @private @type {Map<Function, T[]> | undefined} */
		this._cache = undefined;
		/** @private @type {Map<Function, T[]|string|number> | undefined} */
		this._cacheOrderIndependent = undefined;
	}

	/**
	 * @param {T} value value to add to set
	 * @returns {this} returns itself
	 */
	add(value) {
		this._lastActiveSortFn = null;
		this._invalidateCache();
		this._invalidateOrderedCache();
		super.add(value);
		return this;
	}

	/**
	 * @param {T} value value to delete
	 * @returns {boolean} true if value existed in set, false otherwise
	 */
	delete(value) {
		this._invalidateCache();
		this._invalidateOrderedCache();
		return super.delete(value);
	}

	/**
	 * @returns {void}
	 */
	clear() {
		this._invalidateCache();
		this._invalidateOrderedCache();
		return super.clear();
	}

	/**
	 * Sort with a comparer function
	 * @param {SortFunction} sortFn Sorting comparer function
	 * @returns {void}
	 */
	sortWith(sortFn) {
		if (this.size <= 1 || sortFn === this._lastActiveSortFn) {
			// already sorted - nothing to do
			return;
		}

		const sortedArray = Array.from(this).sort(sortFn);
		super.clear();
		for (let i = 0; i < sortedArray.length; i += 1) {
			super.add(sortedArray[i]);
		}
		this._lastActiveSortFn = sortFn;
		this._invalidateCache();
	}

	sort() {
		this.sortWith(this._sortFn);
	}

	/**
	 * Get data from cache
	 * @param {function(SortableSet<T>): T[]} fn function to calculate value
	 * @returns {T[]} returns result of fn(this), cached until set changes
	 */
	getFromCache(fn) {
		if (this._cache === undefined) {
			this._cache = new Map();
		} else {
			const data = this._cache.get(fn);
			if (data !== undefined) {
				return data;
			}
		}
		const newData = fn(this);
		this._cache.set(fn, newData);
		return newData;
	}

	/**
	 * @param {function(SortableSet<T>): string|number|T[]} fn function to calculate value
	 * @returns {any} returns result of fn(this), cached until set changes
	 */
	getFromUnorderedCache(fn) {
		if (this._cacheOrderIndependent === undefined) {
			this._cacheOrderIndependent = new Map();
		} else {
			const data = this._cacheOrderIndependent.get(fn);
			if (data !== undefined) {
				return data;
			}
		}
		const newData = fn(this);
		this._cacheOrderIndependent.set(fn, newData);
		return newData;
	}

	/**
	 * @private
	 * @returns {void}
	 */
	_invalidateCache() {
		if (this._cache !== undefined) {
			this._cache.clear();
		}
	}

	/**
	 * @private
	 * @returns {void}
	 */
	_invalidateOrderedCache() {
		if (this._cacheOrderIndependent !== undefined) {
			this._cacheOrderIndependent.clear();
		}
	}
}

module.exports = SortableSet;


/***/ }),

/***/ 660:
/***/ ((module, exports, __nccwpck_require__) => {

"use strict";
/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/


const AbstractMethodError = __nccwpck_require__(104);

const BULK_SIZE = 1000;

class Hash {
	/**
	 * Update hash {@link https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding}
	 * @param {string|Buffer} data data
	 * @param {string=} inputEncoding data encoding
	 * @returns {this} updated hash
	 */
	update(data, inputEncoding) {
		throw new AbstractMethodError();
	}

	/**
	 * Calculates the digest {@link https://nodejs.org/api/crypto.html#crypto_hash_digest_encoding}
	 * @param {string=} encoding encoding of the return value
	 * @returns {string|Buffer} digest
	 */
	digest(encoding) {
		throw new AbstractMethodError();
	}
}

exports.Hash = Hash;
/** @typedef {typeof Hash} HashConstructor */

class BulkUpdateDecorator extends Hash {
	/**
	 * @param {Hash} hash hash
	 */
	constructor(hash) {
		super();
		this.hash = hash;
		this.buffer = "";
	}

	/**
	 * Update hash {@link https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding}
	 * @param {string|Buffer} data data
	 * @param {string=} inputEncoding data encoding
	 * @returns {this} updated hash
	 */
	update(data, inputEncoding) {
		if (
			inputEncoding !== undefined ||
			typeof data !== "string" ||
			data.length > BULK_SIZE
		) {
			if (this.buffer.length > 0) {
				this.hash.update(this.buffer);
				this.buffer = "";
			}
			this.hash.update(data, inputEncoding);
		} else {
			this.buffer += data;
			if (this.buffer.length > BULK_SIZE) {
				this.hash.update(this.buffer);
				this.buffer = "";
			}
		}
		return this;
	}

	/**
	 * Calculates the digest {@link https://nodejs.org/api/crypto.html#crypto_hash_digest_encoding}
	 * @param {string=} encoding encoding of the return value
	 * @returns {string|Buffer} digest
	 */
	digest(encoding) {
		if (this.buffer.length > 0) {
			this.hash.update(this.buffer);
		}
		var digestResult = this.hash.digest(encoding);
		return typeof digestResult === "string"
			? digestResult
			: digestResult.toString();
	}
}

/**
 * istanbul ignore next
 */
class DebugHash extends Hash {
	constructor() {
		super();
		this.string = "";
	}

	/**
	 * Update hash {@link https://nodejs.org/api/crypto.html#crypto_hash_update_data_inputencoding}
	 * @param {string|Buffer} data data
	 * @param {string=} inputEncoding data encoding
	 * @returns {this} updated hash
	 */
	update(data, inputEncoding) {
		if (typeof data !== "string") data = data.toString("utf-8");
		this.string += data;
		return this;
	}

	/**
	 * Calculates the digest {@link https://nodejs.org/api/crypto.html#crypto_hash_digest_encoding}
	 * @param {string=} encoding encoding of the return value
	 * @returns {string|Buffer} digest
	 */
	digest(encoding) {
		return this.string.replace(/[^a-z0-9]+/gi, m =>
			Buffer.from(m).toString("hex")
		);
	}
}

/**
 * Creates a hash by name or function
 * @param {string | HashConstructor} algorithm the algorithm name or a constructor creating a hash
 * @returns {Hash} the hash
 */
module.exports = algorithm => {
	if (typeof algorithm === "function") {
		return new BulkUpdateDecorator(new algorithm());
	}
	switch (algorithm) {
		// TODO add non-cryptographic algorithm here
		case "debug":
			return new DebugHash();
		default:
			return new BulkUpdateDecorator(__nccwpck_require__(417).createHash(algorithm));
	}
};


/***/ }),

/***/ 658:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";
var __webpack_unused_export__;

const path = __nccwpck_require__(622);

/**
 * @param {string} context context for relative path
 * @param {string} relativePath path
 * @returns {string} absolute path
 */
const requestToAbsolute = (context, relativePath) => {
	if (relativePath.startsWith("./") || relativePath.startsWith("../"))
		return path.join(context, relativePath);
	return relativePath;
};

/**
 * @typedef {Object} MakeRelativePathsCache
 * @property {Map<string, Map<string, string>>=} relativePaths
 */

/**
 *
 * @param {string} maybeAbsolutePath path to check
 * @returns {boolean} returns true if path is "Absolute Path"-like
 */
const looksLikeAbsolutePath = maybeAbsolutePath => {
	if (/^\/.*\/$/.test(maybeAbsolutePath)) {
		// this 'path' is actually a regexp generated by dynamic requires.
		// Don't treat it as an absolute path.
		return false;
	}
	return /^(?:[a-z]:\\|\/)/i.test(maybeAbsolutePath);
};

/**
 *
 * @param {string} p path to normalize
 * @returns {string} normalized version of path
 */
const normalizePathSeparator = p => p.replace(/\\/g, "/");

/**
 *
 * @param {string} context context for relative path
 * @param {string} identifier identifier for path
 * @returns {string} a converted relative path
 */
const _makePathsRelative = (context, identifier) => {
	return identifier
		.split(/([|! ])/)
		.map(str =>
			looksLikeAbsolutePath(str)
				? normalizePathSeparator(path.relative(context, str))
				: str
		)
		.join("");
};

/**
 *
 * @param {string} context context used to create relative path
 * @param {string} identifier identifier used to create relative path
 * @param {MakeRelativePathsCache=} cache the cache object being set
 * @returns {string} the returned relative path
 */
__webpack_unused_export__ = (context, identifier, cache) => {
	if (!cache) return _makePathsRelative(context, identifier);

	const relativePaths =
		cache.relativePaths || (cache.relativePaths = new Map());

	let cachedResult;
	let contextCache = relativePaths.get(context);
	if (contextCache === undefined) {
		relativePaths.set(context, (contextCache = new Map()));
	} else {
		cachedResult = contextCache.get(identifier);
	}

	if (cachedResult !== undefined) {
		return cachedResult;
	} else {
		const relativePath = _makePathsRelative(context, identifier);
		contextCache.set(identifier, relativePath);
		return relativePath;
	}
};

/**
 * @param {string} context absolute context path
 * @param {string} request any request string may containing absolute paths, query string, etc.
 * @returns {string} a new request string avoiding absolute paths when possible
 */
exports.tR = (context, request) => {
	return request
		.split("!")
		.map(r => {
			const splitPath = r.split("?", 2);
			if (/^[a-zA-Z]:\\/.test(splitPath[0])) {
				splitPath[0] = path.win32.relative(context, splitPath[0]);
				if (!/^[a-zA-Z]:\\/.test(splitPath[0])) {
					splitPath[0] = splitPath[0].replace(/\\/g, "/");
				}
			}
			if (/^\//.test(splitPath[0])) {
				splitPath[0] = path.posix.relative(context, splitPath[0]);
			}
			if (!/^(\.\.\/|\/|[a-zA-Z]:\\)/.test(splitPath[0])) {
				splitPath[0] = "./" + splitPath[0];
			}
			return splitPath.join("?");
		})
		.join("!");
};

/**
 * @param {string} context absolute context path
 * @param {string} request any request string
 * @returns {string} a new request string using absolute paths when possible
 */
const _absolutify = (context, request) => {
	return request
		.split("!")
		.map(r => requestToAbsolute(context, r))
		.join("!");
};

__webpack_unused_export__ = _absolutify;


/***/ }),

/***/ 612:
/***/ ((module) => {

"use strict";
module.exports = require("./index.js");;

/***/ }),

/***/ 417:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");;

/***/ }),

/***/ 747:
/***/ ((module) => {

"use strict";
module.exports = require("fs");;

/***/ }),

/***/ 282:
/***/ ((module) => {

"use strict";
module.exports = require("module");;

/***/ }),

/***/ 443:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/loader-utils");;

/***/ }),

/***/ 286:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/schema-utils3");;

/***/ }),

/***/ 665:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/webpack-sources");;

/***/ }),

/***/ 515:
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/webpack/webpack");;

/***/ }),

/***/ 622:
/***/ ((module) => {

"use strict";
module.exports = require("path");;

/***/ }),

/***/ 669:
/***/ ((module) => {

"use strict";
module.exports = require("util");;

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		if(__webpack_module_cache__[moduleId]) {
/******/ 			return __webpack_module_cache__[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	__nccwpck_require__.ab = __dirname + "/";/************************************************************************/
/******/ 	// module exports must be returned from runtime so entry inlining is disabled
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	return __nccwpck_require__(506);
/******/ })()
;