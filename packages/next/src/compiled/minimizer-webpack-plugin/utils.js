"use strict";

/** @typedef {import("./index.js").ExtractCommentsOptions} ExtractCommentsOptions */
/** @typedef {import("./index.js").ExtractCommentsFunction} ExtractCommentsFunction */
/** @typedef {import("./index.js").ExtractCommentsCondition} ExtractCommentsCondition */
/** @typedef {import("./index.js").Input} Input */
/** @typedef {import("./index.js").MinimizedResult} MinimizedResult */
/** @typedef {import("./index.js").CustomOptions} CustomOptions */
/** @typedef {import("./index.js").RawSourceMap} RawSourceMap */
/** @typedef {import("./index.js").EXPECTED_OBJECT} EXPECTED_OBJECT */

/**
 * @typedef {string[]} ExtractedComments
 */

const JS_FILE_RE = /\.[cm]?js(\?.*)?$/i;
const JSON_FILE_RE = /\.json(\?.*)?$/i;
const HTML_FILE_RE = /\.html?(\?.*)?$/i;
const CSS_FILE_RE = /\.css(\?.*)?$/i;

/**
 * Map a webpack `output.environment` configuration to the highest
 * ECMAScript version that the target is known to support. Returns `5`
 * when no ES2015+ features are flagged.
 * @param {NonNullable<NonNullable<import("webpack").Configuration["output"]>["environment"]>} environment environment
 * @returns {number} ecma version (5, 2015, 2017 or 2020)
 */
function getEcmaVersion(environment) {
  // ES2020 (11th edition)
  if (environment.bigIntLiteral || environment.dynamicImport || environment.dynamicImportInWorker || environment.globalThis || environment.optionalChaining) {
    return 2020;
  }

  // ES2017 (8th edition)
  if (environment.asyncFunction) {
    return 2017;
  }

  // ES2015 (6th edition)
  if (environment.arrowFunction || environment.const || environment.destructuring || environment.forOf || environment.methodShorthand || environment.module || environment.templateLiteral) {
    return 2015;
  }
  return 5;
}
const notSettled = Symbol("not-settled");

/**
 * @template T
 * @typedef {() => Promise<T>} Task
 */

/**
 * Run tasks with limited concurrency.
 * @template T
 * @param {number} limit Limit of tasks that run at once.
 * @param {Task<T>[]} tasks List of tasks to run.
 * @returns {Promise<T[]>} A promise that fulfills to an array of the results
 */
function throttleAll(limit, tasks) {
  return new Promise((resolve, reject) => {
    const result = Array.from({
      length: tasks.length
    }).fill(notSettled);
    const entries = tasks.entries();
    const next = () => {
      const {
        done,
        value
      } = entries.next();
      if (done) {
        const isLast = !result.includes(notSettled);
        if (isLast) resolve(result);
        return;
      }
      const [index, task] = value;

      /**
       * @param {T} resultValue Result value
       */
      const onFulfilled = resultValue => {
        result[index] = resultValue;
        next();
      };
      task().then(onFulfilled, reject);
    };
    for (let i = 0; i < limit; i++) {
      next();
    }
  });
}

/* istanbul ignore next */
/**
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @param {ExtractCommentsOptions=} extractComments extract comments option
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function terserMinify(input, sourceMap, minimizerOptions, extractComments) {
  /**
   * @param {unknown} value value
   * @returns {value is EXPECTED_OBJECT} true when value is object or function
   */
  const isObject = value => {
    const type = typeof value;

    // eslint-disable-next-line no-eq-null, eqeqeq
    return value != null && (type === "object" || type === "function");
  };

  /**
   * @param {import("terser").MinifyOptions & { sourceMap: import("terser").SourceMapOptions | undefined } & ({ output: import("terser").FormatOptions & { beautify: boolean } } | { format: import("terser").FormatOptions & { beautify: boolean } })} terserOptions terser options
   * @param {ExtractedComments} extractedComments extracted comments
   * @returns {ExtractCommentsFunction} function to extract comments
   */
  const buildComments = (terserOptions, extractedComments) => {
    /** @type {{ [index: string]: ExtractCommentsCondition }} */
    const condition = {};
    let comments;
    if (terserOptions.format) {
      ({
        comments
      } = terserOptions.format);
    } else if (terserOptions.output) {
      ({
        comments
      } = terserOptions.output);
    }
    condition.preserve = typeof comments !== "undefined" ? comments : false;
    if (typeof extractComments === "boolean" && extractComments) {
      condition.extract = "some";
    } else if (typeof extractComments === "string" || extractComments instanceof RegExp) {
      condition.extract = extractComments;
    } else if (typeof extractComments === "function") {
      condition.extract = extractComments;
    } else if (extractComments && isObject(extractComments)) {
      condition.extract = typeof extractComments.condition === "boolean" && extractComments.condition ? "some" : typeof extractComments.condition !== "undefined" ? extractComments.condition : "some";
    } else {
      // No extract
      // Preserve using "commentsOpts" or "some"
      condition.preserve = typeof comments !== "undefined" ? comments : "some";
      condition.extract = false;
    }

    // Ensure that both conditions are functions
    for (const key of ["preserve", "extract"]) {
      /** @type {undefined | string} */
      let regexStr;
      /** @type {undefined | RegExp} */
      let regex;
      switch (typeof condition[key]) {
        case "boolean":
          condition[key] = condition[key] ? () => true : () => false;
          break;
        case "function":
          break;
        case "string":
          if (condition[key] === "all") {
            condition[key] = () => true;
            break;
          }
          if (condition[key] === "some") {
            condition[key] = /** @type {ExtractCommentsFunction} */
            (astNode, comment) => (comment.type === "comment2" || comment.type === "comment1") && /@preserve|@lic|@cc_on|^\**!/i.test(comment.value);
            break;
          }
          regexStr = /** @type {string} */condition[key];
          condition[key] = /** @type {ExtractCommentsFunction} */
          (astNode, comment) => new RegExp(/** @type {string} */regexStr).test(comment.value);
          break;
        default:
          regex = /** @type {RegExp} */condition[key];
          condition[key] = /** @type {ExtractCommentsFunction} */
          (astNode, comment) => /** @type {RegExp} */regex.test(comment.value);
      }
    }

    // Redefine the comments function to extract and preserve
    // comments according to the two conditions
    const seenComments = new Set(extractedComments);
    return (astNode, comment) => {
      if (/** @type {{ extract: ExtractCommentsFunction }} */
      condition.extract(astNode, comment)) {
        const commentText = comment.type === "comment2" ? `/*${comment.value}*/` : `//${comment.value}`;

        // Don't include duplicate comments
        if (!seenComments.has(commentText)) {
          seenComments.add(commentText);
          extractedComments.push(commentText);
        }
      }
      return /** @type {{ preserve: ExtractCommentsFunction }} */condition.preserve(astNode, comment);
    };
  };

  /**
   * @param {import("terser").MinifyOptions=} terserOptions terser options
   * @returns {import("terser").MinifyOptions & { sourceMap: import("terser").SourceMapOptions | undefined } & { compress: import("terser").CompressOptions } & ({ output: import("terser").FormatOptions & { beautify: boolean } } | { format: import("terser").FormatOptions & { beautify: boolean } })} built terser options
   */
  const buildTerserOptions = (terserOptions = {}) => (
  // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
  {
    ...terserOptions,
    compress: typeof terserOptions.compress === "boolean" ? terserOptions.compress ? {} : false : {
      ...terserOptions.compress
    },
    // ecma: terserOptions.ecma,
    // ie8: terserOptions.ie8,
    // keep_classnames: terserOptions.keep_classnames,
    // keep_fnames: terserOptions.keep_fnames,
    mangle:
    // eslint-disable-next-line no-eq-null, eqeqeq
    terserOptions.mangle == null ? true : typeof terserOptions.mangle === "boolean" ? terserOptions.mangle : {
      ...terserOptions.mangle
    },
    // module: terserOptions.module,
    // nameCache: { ...terserOptions.toplevel },
    // the `output` option is deprecated
    ...(terserOptions.format ? {
      format: {
        beautify: false,
        ...terserOptions.format
      }
    } : {
      output: {
        beautify: false,
        ...terserOptions.output
      }
    }),
    parse: {
      ...terserOptions.parse
    },
    // safari10: terserOptions.safari10,
    // Ignoring sourceMap from options
    sourceMap: undefined
    // toplevel: terserOptions.toplevel
  });
  let minify;
  try {
    ({
      minify
    } = require('next/dist/compiled/terser'));
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }

  // Copy `terser` options
  const terserOptions = buildTerserOptions(minimizerOptions);

  // Let terser generate a SourceMap. The dispatcher in `minify.js`
  // chains the previous step's map onto this one.
  if (sourceMap) {
    terserOptions.sourceMap = {
      asObject: true
    };
  }

  /** @type {ExtractedComments} */
  const extractedComments = [];
  if (terserOptions.output) {
    terserOptions.output.comments = buildComments(terserOptions, extractedComments);
  } else if (terserOptions.format) {
    terserOptions.format.comments = buildComments(terserOptions, extractedComments);
  }
  if (terserOptions.compress) {
    // More optimizations
    if (typeof terserOptions.compress.ecma === "undefined") {
      terserOptions.compress.ecma = terserOptions.ecma;
    }

    // https://github.com/webpack/webpack/issues/16135
    if (terserOptions.ecma === 5 && typeof terserOptions.compress.arrows === "undefined") {
      terserOptions.compress.arrows = false;
    }
  }
  const [[filename, code]] = Object.entries(input);
  const result = await minify({
    [filename]: code
  }, terserOptions);
  return {
    code: (/** @type {string} * */result.code),
    map: result.map ? (/** @type {RawSourceMap} * */result.map) : undefined,
    extractedComments
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
terserMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require('next/dist/compiled/terser/package.json');
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker thread is supported, false otherwise
 */
terserMinify.supportsWorkerThreads = () => true;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a JavaScript file
 */
terserMinify.filter = name => JS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @param {ExtractCommentsOptions=} extractComments extract comments option
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function uglifyJsMinify(input, sourceMap, minimizerOptions, extractComments) {
  /**
   * @param {unknown} value value
   * @returns {boolean} true when value is object or function
   */
  const isObject = value => {
    const type = typeof value;

    // eslint-disable-next-line no-eq-null, eqeqeq
    return value != null && (type === "object" || type === "function");
  };

  /**
   * @param {import("uglify-js").MinifyOptions & { sourceMap: boolean | import("uglify-js").SourceMapOptions | undefined } & { output: import("uglify-js").OutputOptions & { beautify: boolean } }} uglifyJsOptions uglify-js options
   * @param {ExtractedComments} extractedComments extracted comments
   * @returns {ExtractCommentsFunction} extract comments function
   */
  const buildComments = (uglifyJsOptions, extractedComments) => {
    /** @type {{ [index: string]: ExtractCommentsCondition }} */
    const condition = {};
    const {
      comments
    } = uglifyJsOptions.output;
    condition.preserve = typeof comments !== "undefined" ? comments : false;
    if (typeof extractComments === "boolean" && extractComments) {
      condition.extract = "some";
    } else if (typeof extractComments === "string" || extractComments instanceof RegExp) {
      condition.extract = extractComments;
    } else if (typeof extractComments === "function") {
      condition.extract = extractComments;
    } else if (extractComments && isObject(extractComments)) {
      condition.extract = typeof extractComments.condition === "boolean" && extractComments.condition ? "some" : typeof extractComments.condition !== "undefined" ? extractComments.condition : "some";
    } else {
      // No extract
      // Preserve using "commentsOpts" or "some"
      condition.preserve = typeof comments !== "undefined" ? comments : "some";
      condition.extract = false;
    }

    // Ensure that both conditions are functions
    for (const key of ["preserve", "extract"]) {
      /** @type {undefined | string} */
      let regexStr;
      /** @type {undefined | RegExp} */
      let regex;
      switch (typeof condition[key]) {
        case "boolean":
          condition[key] = condition[key] ? () => true : () => false;
          break;
        case "function":
          break;
        case "string":
          if (condition[key] === "all") {
            condition[key] = () => true;
            break;
          }
          if (condition[key] === "some") {
            condition[key] = /** @type {ExtractCommentsFunction} */
            (astNode, comment) => (comment.type === "comment2" || comment.type === "comment1") && /@preserve|@lic|@cc_on|^\**!/i.test(comment.value);
            break;
          }
          regexStr = /** @type {string} */condition[key];
          condition[key] = /** @type {ExtractCommentsFunction} */
          (astNode, comment) => new RegExp(/** @type {string} */regexStr).test(comment.value);
          break;
        default:
          regex = /** @type {RegExp} */condition[key];
          condition[key] = /** @type {ExtractCommentsFunction} */
          (astNode, comment) => /** @type {RegExp} */regex.test(comment.value);
      }
    }

    // Redefine the comments function to extract and preserve
    // comments according to the two conditions
    const seenComments = new Set(extractedComments);
    return (astNode, comment) => {
      if (/** @type {{ extract: ExtractCommentsFunction }} */
      condition.extract(astNode, comment)) {
        const commentText = comment.type === "comment2" ? `/*${comment.value}*/` : `//${comment.value}`;

        // Don't include duplicate comments
        if (!seenComments.has(commentText)) {
          seenComments.add(commentText);
          extractedComments.push(commentText);
        }
      }
      return /** @type {{ preserve: ExtractCommentsFunction }} */condition.preserve(astNode, comment);
    };
  };

  /**
   * @param {import("uglify-js").MinifyOptions & { ecma?: number | string }=} uglifyJsOptions uglify-js options
   * @returns {import("uglify-js").MinifyOptions & { sourceMap: boolean | import("uglify-js").SourceMapOptions | undefined } & { output: import("uglify-js").OutputOptions & { beautify: boolean } }} uglify-js options
   */
  const buildUglifyJsOptions = (uglifyJsOptions = {}) => {
    if (typeof uglifyJsOptions.ecma !== "undefined") {
      delete uglifyJsOptions.ecma;
    }
    if (typeof uglifyJsOptions.module !== "undefined") {
      delete uglifyJsOptions.module;
    }

    // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
    return {
      ...uglifyJsOptions,
      // warnings: uglifyJsOptions.warnings,
      parse: {
        ...uglifyJsOptions.parse
      },
      compress: typeof uglifyJsOptions.compress === "boolean" ? uglifyJsOptions.compress : {
        ...uglifyJsOptions.compress
      },
      mangle:
      // eslint-disable-next-line no-eq-null, eqeqeq
      uglifyJsOptions.mangle == null ? true : typeof uglifyJsOptions.mangle === "boolean" ? uglifyJsOptions.mangle : {
        ...uglifyJsOptions.mangle
      },
      output: {
        beautify: false,
        ...uglifyJsOptions.output
      },
      // Ignoring sourceMap from options

      sourceMap: undefined
      // toplevel: uglifyJsOptions.toplevel
      // nameCache: { ...uglifyJsOptions.toplevel },
      // ie8: uglifyJsOptions.ie8,
      // keep_fnames: uglifyJsOptions.keep_fnames,
    };
  };
  let minify;
  try {
    ({
      minify
    } = require("uglify-js"));
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }

  // Copy `uglify-js` options
  const uglifyJsOptions = buildUglifyJsOptions(minimizerOptions);

  // Let `uglify-js` generate a SourceMap. The dispatcher in `minify.js`
  // chains the previous step's map onto this one.
  if (sourceMap) {
    uglifyJsOptions.sourceMap = true;
  }

  /** @type {ExtractedComments} */
  const extractedComments = [];

  // @ts-expect-error wrong types in uglify-js
  uglifyJsOptions.output.comments = buildComments(uglifyJsOptions, extractedComments);
  const [[filename, code]] = Object.entries(input);
  const result = await minify({
    [filename]: code
  }, uglifyJsOptions);
  return {
    code: result.code,
    map: result.map ? JSON.parse(result.map) : undefined,
    errors: result.error ? [result.error] : [],
    warnings: result.warnings || [],
    extractedComments
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
uglifyJsMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("uglify-js/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker thread is supported, false otherwise
 */
uglifyJsMinify.supportsWorkerThreads = () => true;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a JavaScript file
 */
uglifyJsMinify.filter = name => JS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @param {ExtractCommentsOptions=} extractComments extract comments option
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function swcMinify(input, sourceMap, minimizerOptions, extractComments) {
  /**
   * @param {unknown} value value
   * @returns {boolean} true when value is object or function
   */
  const isObject = value => {
    const type = typeof value;

    // eslint-disable-next-line no-eq-null, eqeqeq
    return value != null && (type === "object" || type === "function");
  };

  /**
   * @param {unknown} extractCommentsOptions extract comments option
   * @returns {Error} error for unsupported extract comments option
   */
  const createExtractCommentsError = extractCommentsOptions => new Error(`The 'extractComments' option for 'swcMinify' only supports booleans, "some", "all", string patterns, RegExp values without flags, or object conditions that resolve to those forms. Received: ${extractCommentsOptions instanceof RegExp ? extractCommentsOptions.toString() : typeof extractCommentsOptions}.`);

  /**
   * @param {unknown} extractCommentsOptions extract comments option
   * @returns {{ extractComments: false | true | "some" | "all" | { regex: string }, useDefaultPreserveComments: boolean }} normalized swc extract comments options
   */
  const normalizeExtractComments = extractCommentsOptions => {
    if (typeof extractCommentsOptions === "boolean") {
      return {
        extractComments: extractCommentsOptions,
        useDefaultPreserveComments: !extractCommentsOptions
      };
    }
    if (typeof extractCommentsOptions === "string") {
      return {
        extractComments: extractCommentsOptions === "some" || extractCommentsOptions === "all" ? extractCommentsOptions : {
          regex: extractCommentsOptions
        },
        useDefaultPreserveComments: false
      };
    }
    if (extractCommentsOptions instanceof RegExp) {
      if (extractCommentsOptions.flags) {
        throw createExtractCommentsError(extractCommentsOptions);
      }
      return {
        extractComments: {
          regex: extractCommentsOptions.source
        },
        useDefaultPreserveComments: false
      };
    }
    if (typeof extractCommentsOptions === "function") {
      throw createExtractCommentsError(extractCommentsOptions);
    }
    if (extractCommentsOptions && isObject(extractCommentsOptions)) {
      const {
        condition = "some"
      } = /** @type {{ condition?: unknown }} */
      extractCommentsOptions;
      if (typeof condition === "boolean") {
        return {
          extractComments: condition ? "some" : false,
          useDefaultPreserveComments: false
        };
      }
      if (typeof condition === "string") {
        return {
          extractComments: condition === "some" || condition === "all" ? condition : {
            regex: condition
          },
          useDefaultPreserveComments: false
        };
      }
      if (condition instanceof RegExp) {
        if (condition.flags) {
          throw createExtractCommentsError(condition);
        }
        return {
          extractComments: {
            regex: condition.source
          },
          useDefaultPreserveComments: false
        };
      }
      throw createExtractCommentsError(condition);
    }
    return {
      extractComments: false,
      useDefaultPreserveComments: false
    };
  };

  /**
   * @param {import("@swc/core").JsMinifyOptions=} swcOptions swc options
   * @returns {import("@swc/core").JsMinifyOptions & { extractComments?: false | true | "some" | "all" | { regex: string } } & { sourceMap: undefined | boolean } & { compress: import("@swc/core").TerserCompressOptions }} built swc options
   */
  const buildSwcOptions = (swcOptions = {}) => (
  // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
  {
    ...swcOptions,
    compress: typeof swcOptions.compress === "boolean" ? swcOptions.compress ? {} : false : {
      ...swcOptions.compress
    },
    mangle:
    // eslint-disable-next-line no-eq-null, eqeqeq
    swcOptions.mangle == null ? true : typeof swcOptions.mangle === "boolean" ? swcOptions.mangle : {
      ...swcOptions.mangle
    },
    format: {
      ...swcOptions.format
    },
    // ecma: swcOptions.ecma,
    // keep_classnames: swcOptions.keep_classnames,
    // keep_fnames: swcOptions.keep_fnames,
    // module: swcOptions.module,
    // safari10: swcOptions.safari10,
    // toplevel: swcOptions.toplevel

    sourceMap: undefined
  });
  let swc;
  try {
    swc = require("@swc/core");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }

  // Copy `swc` options
  const swcOptions = buildSwcOptions(minimizerOptions);
  const normalizedExtractComments = normalizeExtractComments(extractComments);
  if (!swcOptions.format) {
    swcOptions.format = {};
  }

  // Let `swc` generate a SourceMap.
  if (sourceMap) {
    swcOptions.sourceMap = true;
  }
  if (normalizedExtractComments.useDefaultPreserveComments && typeof swcOptions.format.comments === "undefined") {
    swcOptions.format.comments = "some";
  }
  if (normalizedExtractComments.extractComments !== false) {
    /** @type {import("@swc/core").JsMinifyOptions & { extractComments?: false | true | "some" | "all" | { regex: string } }} */
    swcOptions.extractComments = normalizedExtractComments.extractComments;
  }
  if (swcOptions.compress) {
    // More optimizations
    if (typeof swcOptions.compress.ecma === "undefined") {
      swcOptions.compress.ecma = swcOptions.ecma;
    }

    // https://github.com/webpack/webpack/issues/16135
    if (swcOptions.ecma === 5 && typeof swcOptions.compress.arrows === "undefined") {
      swcOptions.compress.arrows = false;
    }
  }
  const [[filename, code]] = Object.entries(input);
  const result = /** @type {import("@swc/core").Output & { extractedComments?: string[] }} */
  await swc.minify(code, swcOptions);
  let map;
  if (result.map) {
    map = JSON.parse(result.map);

    // TODO workaround for swc because `filename` is not preset as in `swc` signature as for `terser`
    map.sources = [filename];
    delete map.sourcesContent;
  }
  return {
    code: result.code,
    map,
    extractedComments: result.extractedComments || []
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
swcMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("@swc/core/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker thread is supported, false otherwise
 */
swcMinify.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a JavaScript file
 */
swcMinify.filter = name => JS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function esbuildMinify(input, sourceMap, minimizerOptions) {
  /**
   * @param {import("esbuild").TransformOptions & { ecma?: string | number, module?: boolean }=} esbuildOptions esbuild options
   * @returns {import("esbuild").TransformOptions} built esbuild options
   */
  const buildEsbuildOptions = (esbuildOptions = {}) => {
    delete esbuildOptions.ecma;
    if (esbuildOptions.module) {
      esbuildOptions.format = "esm";
    }
    delete esbuildOptions.module;

    // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
    return {
      minify: true,
      legalComments: "inline",
      ...esbuildOptions,
      sourcemap: false
    };
  };
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }

  // Copy `esbuild` options
  const esbuildOptions = buildEsbuildOptions(minimizerOptions);

  // Let `esbuild` generate a SourceMap
  if (sourceMap) {
    esbuildOptions.sourcemap = true;
    esbuildOptions.sourcesContent = false;
  }
  const [[filename, code]] = Object.entries(input);
  esbuildOptions.sourcefile = filename;
  const result = await esbuild.transform(code, esbuildOptions);
  return {
    code: result.code,
    map: result.map ? JSON.parse(result.map) : undefined,
    warnings: result.warnings.length > 0 ? result.warnings.map(item => {
      const plugin = item.pluginName ? `\nPlugin Name: ${item.pluginName}` : "";
      const location = item.location ? `\n\n${item.location.file}:${item.location.line}:${item.location.column}:\n  ${item.location.line} | ${item.location.lineText}\n\nSuggestion: ${item.location.suggestion}` : "";
      const notes = item.notes.length > 0 ? `\n\nNotes:\n${item.notes.map(note => `${note.location ? `[${note.location.file}:${note.location.line}:${note.location.column}] ` : ""}${note.text}${note.location ? `\nSuggestion: ${note.location.suggestion}` : ""}${note.location ? `\nLine text:\n${note.location.lineText}\n` : ""}`).join("\n")}` : "";
      return `${item.text} [${item.id}]${plugin}${location}${item.detail ? `\nDetails:\n${item.detail}` : ""}${notes}`;
    }) : []
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
esbuildMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("esbuild/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker thread is supported, false otherwise
 */
esbuildMinify.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a JavaScript file
 */
esbuildMinify.filter = name => JS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function jsonMinify(input, sourceMap, minimizerOptions) {
  const options = /** @type {{ replacer?: Parameters<typeof JSON.stringify>[1], space?: Parameters<typeof JSON.stringify>[2] }} */
  minimizerOptions;
  const [[, code]] = Object.entries(input);
  const result = JSON.stringify(JSON.parse(code), options.replacer, options.space);
  return {
    code: result
  };
}
jsonMinify.getMinimizerVersion = () => "1.0.0";
jsonMinify.supportsWorker = () => false;
jsonMinify.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a JSON file
 */
jsonMinify.filter = name => JSON_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify HTML using `html-minifier-terser`.
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map (ignored for HTML)
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function htmlMinifierTerser(input, sourceMap, minimizerOptions) {
  let htmlMinifier;
  try {
    htmlMinifier = require("html-minifier-terser");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[, code]] = Object.entries(input);
  /** @type {import("html-minifier-terser").Options} */
  const defaultMinimizerOptions = {
    caseSensitive: true,
    // `collapseBooleanAttributes` is not always safe, since this can break CSS attribute selectors and not safe for XHTML
    collapseWhitespace: true,
    conservativeCollapse: true,
    keepClosingSlash: true,
    // We need ability to use cssnano, or setup own function without extra dependencies
    minifyCSS: true,
    minifyJS: true,
    // `minifyURLs` is unsafe, because we can't guarantee what the base URL is
    // `removeAttributeQuotes` is not safe in some rare cases, also HTML spec recommends against doing this
    removeComments: true,
    // `removeEmptyAttributes` is not safe, can affect certain style or script behavior, look at https://github.com/webpack-contrib/html-loader/issues/323
    // `removeRedundantAttributes` is not safe, can affect certain style or script behavior, look at https://github.com/webpack-contrib/html-loader/issues/323
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true
    // `useShortDoctype` is not safe for XHTML
  };
  const result = await htmlMinifier.minify(code, {
    ...defaultMinimizerOptions,
    ...(/** @type {import("html-minifier-terser").Options} */minimizerOptions)
  });
  return {
    code: result
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
htmlMinifierTerser.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("html-minifier-terser/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker threads are supported
 */
htmlMinifierTerser.supportsWorkerThreads = () => true;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like an HTML file
 */
htmlMinifierTerser.filter = name => HTML_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify HTML using `@minify-html/node`.
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map (ignored for HTML)
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function minifyHtmlNode(input, sourceMap, minimizerOptions) {
  let minifyHtmlPkg;
  try {
    minifyHtmlPkg = require("@minify-html/node");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[, code]] = Object.entries(input);
  const options = /** @type {Parameters<import("@minify-html/node").minify>[1]} */{
    ...minimizerOptions
  };
  const result = await minifyHtmlPkg.minify(Buffer.from(code), options);
  return {
    code: result.toString()
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
minifyHtmlNode.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("@minify-html/node/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} false because `@minify-html/node` is a native binding
 */
minifyHtmlNode.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like an HTML file
 */
minifyHtmlNode.filter = name => HTML_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Map an `@swc/html` diagnostic to a regular `Error`.
 * @param {EXPECTED_OBJECT} diagnostic diagnostic from `@swc/html`
 * @returns {Error} error preserving `span` and `level` from the diagnostic
 */
function swcHtmlDiagnosticToError(diagnostic) {
  const typed = /** @type {{ message: string, span?: unknown, level?: unknown }} */
  diagnostic;
  /** @type {Error & { span?: unknown, level?: unknown }} */
  const error = new Error(typed.message);
  error.span = typed.span;
  error.level = typed.level;
  return error;
}

/* istanbul ignore next */
/**
 * Minify a complete HTML document using `@swc/html`.
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map (ignored for HTML)
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function swcMinifyHtml(input, sourceMap, minimizerOptions) {
  let swcMinifier;
  try {
    swcMinifier = require("@swc/html");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[, code]] = Object.entries(input);
  const options = /** @type {import("@swc/html").Options} */{
    ...minimizerOptions
  };
  const result = await swcMinifier.minify(Buffer.from(code), options);
  return {
    code: result.code,
    errors: result.errors ? result.errors.map(swcHtmlDiagnosticToError) : undefined
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
swcMinifyHtml.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("@swc/html/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} false because `@swc/html` is a native binding
 */
swcMinifyHtml.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like an HTML file
 */
swcMinifyHtml.filter = name => HTML_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify an HTML fragment using `@swc/html`.
 *
 * Use this for partial HTML (e.g. inside `<template></template>` tags or
 * HTML strings that are inserted into another document).
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map (ignored for HTML)
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function swcMinifyHtmlFragment(input, sourceMap, minimizerOptions) {
  let swcMinifier;
  try {
    swcMinifier = require("@swc/html");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[, code]] = Object.entries(input);
  const options = /** @type {import("@swc/html").FragmentOptions} */{
    ...minimizerOptions
  };
  const result = await swcMinifier.minifyFragment(Buffer.from(code), options);
  return {
    code: result.code,
    errors: result.errors ? result.errors.map(swcHtmlDiagnosticToError) : undefined
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
swcMinifyHtmlFragment.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("@swc/html/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} false because `@swc/html` is a native binding
 */
swcMinifyHtmlFragment.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like an HTML file
 */
swcMinifyHtmlFragment.filter = name => HTML_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify CSS using `cssnano` (via `postcss`).
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function cssnanoMinify(input, sourceMap, minimizerOptions = {
  preset: "default"
}) {
  /**
   * @template T
   * @param {string} mod module to load
   * @returns {Promise<T>} loaded module
   */
  const load = async mod => {
    let exports;
    try {
      exports = require(mod);
      return exports;
    } catch (err) {
      let importESM;
      try {
        // eslint-disable-next-line no-new-func
        importESM = new Function("id", "return import(id);");
      } catch (_err) {
        importESM = null;
      }
      if (/** @type {Error & { code: string }} */
      err.code === "ERR_REQUIRE_ESM" && importESM) {
        exports = await importESM(mod);
        return exports.default;
      }
      throw err;
    }
  };
  let postcss;
  let cssnano;
  try {
    postcss = require("postcss");
    cssnano = require("cssnano");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[name, code]] = Object.entries(input);
  /** @type {import("postcss").ProcessOptions} */
  const postcssOptions = {
    from: name,
    ... /** @type {{ processorOptions?: import("postcss").ProcessOptions }} */minimizerOptions.processorOptions
  };
  if (typeof postcssOptions.parser === "string") {
    try {
      postcssOptions.parser = await load(postcssOptions.parser);
    } catch (error) {
      throw new Error(`Loading PostCSS "${postcssOptions.parser}" parser failed: ${ /** @type {Error} */error.message}\n\n(@${name})`, {
        cause: error
      });
    }
  }
  if (typeof postcssOptions.stringifier === "string") {
    try {
      postcssOptions.stringifier = await load(postcssOptions.stringifier);
    } catch (error) {
      throw new Error(`Loading PostCSS "${postcssOptions.stringifier}" stringifier failed: ${ /** @type {Error} */error.message}\n\n(@${name})`, {
        cause: error
      });
    }
  }
  if (typeof postcssOptions.syntax === "string") {
    try {
      postcssOptions.syntax = await load(postcssOptions.syntax);
    } catch (error) {
      throw new Error(`Loading PostCSS "${postcssOptions.syntax}" syntax failed: ${ /** @type {Error} */error.message}\n\n(@${name})`, {
        cause: error
      });
    }
  }
  if (sourceMap) {
    postcssOptions.map = {
      annotation: false
    };
  }
  const result = await postcss.default([cssnano(minimizerOptions)]).process(code, postcssOptions);
  return {
    code: result.css,
    map: result.map ? (/** @type {RawSourceMap} */
    /** @type {unknown} */result.map.toJSON()) : undefined,
    warnings: result.warnings().map(String)
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
cssnanoMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("cssnano/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker threads are supported
 */
cssnanoMinify.supportsWorkerThreads = () => true;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a CSS file
 */
cssnanoMinify.filter = name => CSS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify CSS using `csso`.
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function cssoMinify(input, sourceMap, minimizerOptions) {
  let csso;
  try {
    csso = require("csso");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[filename, code]] = Object.entries(input);
  const result = csso.minify(code, {
    filename,
    sourceMap: Boolean(sourceMap),
    ...minimizerOptions
  });
  return {
    code: result.css,
    map: result.map ? (/** @type {RawSourceMap} */
    /** @type {{ toJSON(): RawSourceMap }} */result.map.toJSON()) : undefined
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
cssoMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("csso/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker threads are supported
 */
cssoMinify.supportsWorkerThreads = () => true;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a CSS file
 */
cssoMinify.filter = name => CSS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify CSS using `clean-css`.
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function cleanCssMinify(input, sourceMap, minimizerOptions) {
  let CleanCSS;
  try {
    CleanCSS = require("clean-css");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[name, code]] = Object.entries(input);
  const result = await new CleanCSS({
    sourceMap: Boolean(sourceMap),
    ...minimizerOptions,
    returnPromise: true
  }).minify({
    [name]: {
      styles: code
    }
  });
  const generatedSourceMap = result.sourceMap ? (/** @type {RawSourceMap} */
  /** @type {{ toJSON(): RawSourceMap }} */(/** @type {unknown} */result.sourceMap).toJSON()) : undefined;

  // workaround for source maps on windows
  if (generatedSourceMap) {
    const isWindowsPathSep = require("path").sep === "\\";
    generatedSourceMap.sources = generatedSourceMap.sources.map(
    /**
     * @param {string | null} item path item
     * @returns {string} normalized path
     */
    item => isWindowsPathSep ? (item || "").replace(/\\/g, "/") : item || "");
  }
  return {
    code: result.styles,
    map: generatedSourceMap,
    warnings: result.warnings
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
cleanCssMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("clean-css/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} true if worker threads are supported
 */
cleanCssMinify.supportsWorkerThreads = () => true;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a CSS file
 */
cleanCssMinify.filter = name => CSS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify CSS using `esbuild` (with the CSS loader).
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function esbuildMinifyCss(input, sourceMap, minimizerOptions) {
  /**
   * @param {import("esbuild").TransformOptions & { ecma?: string | number, module?: boolean }=} esbuildOptions esbuild options
   * @returns {import("esbuild").TransformOptions} built esbuild options
   */
  const buildEsbuildOptions = (esbuildOptions = {}) => {
    // `module` and `ecma` are JavaScript-only concepts; the dispatcher
    // injects them for every minimizer, but esbuild's CSS transform
    // rejects unknown options.
    delete esbuildOptions.ecma;
    delete esbuildOptions.module;

    // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
    return {
      loader: "css",
      minify: true,
      legalComments: "inline",
      ...esbuildOptions,
      sourcemap: false
    };
  };
  let esbuild;
  try {
    esbuild = require("esbuild");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }

  // Copy `esbuild` options
  const esbuildOptions = buildEsbuildOptions(minimizerOptions);

  // Let `esbuild` generate a SourceMap
  if (sourceMap) {
    esbuildOptions.sourcemap = true;
    esbuildOptions.sourcesContent = false;
  }
  const [[filename, code]] = Object.entries(input);
  esbuildOptions.sourcefile = filename;
  const result = await esbuild.transform(code, esbuildOptions);
  return {
    code: result.code,
    map: result.map ? JSON.parse(result.map) : undefined,
    warnings: result.warnings.length > 0 ? result.warnings.map(item => {
      const plugin = item.pluginName ? `\nPlugin Name: ${item.pluginName}` : "";
      const location = item.location ? `\n\n${item.location.file}:${item.location.line}:${item.location.column}:\n  ${item.location.line} | ${item.location.lineText}\n\nSuggestion: ${item.location.suggestion}` : "";
      const notes = item.notes.length > 0 ? `\n\nNotes:\n${item.notes.map(note => `${note.location ? `[${note.location.file}:${note.location.line}:${note.location.column}] ` : ""}${note.text}${note.location ? `\nSuggestion: ${note.location.suggestion}` : ""}${note.location ? `\nLine text:\n${note.location.lineText}\n` : ""}`).join("\n")}` : "";
      return `${item.text} [${item.id}]${plugin}${location}${item.detail ? `\nDetails:\n${item.detail}` : ""}${notes}`;
    }) : []
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
esbuildMinifyCss.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("esbuild/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} false because `esbuild` is a native binding
 */
esbuildMinifyCss.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a CSS file
 */
esbuildMinifyCss.filter = name => CSS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Minify CSS using `lightningcss`.
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function lightningCssMinify(input, sourceMap, minimizerOptions) {
  let lightningCss;
  try {
    lightningCss = require("lightningcss");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[filename, code]] = Object.entries(input);
  /**
   * @param {Partial<import("lightningcss").TransformOptions<import("lightningcss").CustomAtRules>>=} lightningCssOptions lightning css options
   * @returns {import("lightningcss").TransformOptions<import("lightningcss").CustomAtRules>} built lightning css options
   */
  const buildLightningCssOptions = (lightningCssOptions = {}) => (
  // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
  {
    minify: true,
    ...lightningCssOptions,
    sourceMap: false,
    filename,
    code: new Uint8Array(Buffer.from(code))
  });

  // Copy `lightningCss` options
  const lightningCssOptions = buildLightningCssOptions(minimizerOptions);

  // Let `lightningcss` generate a SourceMap. The dispatcher in
  // `minify.js` chains the previous step's map onto this one.
  if (sourceMap) {
    lightningCssOptions.sourceMap = true;
  }
  const result = lightningCss.transform(lightningCssOptions);
  return {
    code: result.code.toString(),
    map: result.map ? JSON.parse(result.map.toString()) : undefined
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
lightningCssMinify.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("lightningcss/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} false because `lightningcss` is a native binding
 */
lightningCssMinify.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a CSS file
 */
lightningCssMinify.filter = name => CSS_FILE_RE.test(name);

/* istanbul ignore next */
/**
 * Map a `@swc/css` diagnostic to a regular `Error`.
 * @param {EXPECTED_OBJECT} diagnostic diagnostic from `@swc/css`
 * @returns {Error} error preserving `span` and `level` from the diagnostic
 */
function swcCssDiagnosticToError(diagnostic) {
  const typed = /** @type {{ message: string, span?: unknown, level?: unknown }} */
  diagnostic;
  /** @type {Error & { span?: unknown, level?: unknown }} */
  const error = new Error(typed.message);
  error.span = typed.span;
  error.level = typed.level;
  return error;
}

/* istanbul ignore next */
/**
 * Minify CSS using `@swc/css`.
 * @param {Input} input input
 * @param {RawSourceMap=} sourceMap source map
 * @param {CustomOptions=} minimizerOptions options
 * @returns {Promise<MinimizedResult>} minimized result
 */
async function swcMinifyCss(input, sourceMap, minimizerOptions) {
  let swc;
  try {
    swc = require("@swc/css");
  } catch (err) {
    return {
      errors: [(/** @type {Error} */err)]
    };
  }
  const [[filename, code]] = Object.entries(input);
  /**
   * @param {Partial<import("@swc/css").MinifyOptions>=} swcOptions swc options
   * @returns {import("@swc/css").MinifyOptions} built swc options
   */
  const buildSwcOptions = (swcOptions = {}) => (
  // Need deep copy objects to avoid https://github.com/terser/terser/issues/366
  {
    ...swcOptions,
    filename
  });

  // Copy `swc` options
  const swcOptions = buildSwcOptions(minimizerOptions);

  // Let `swc` generate a SourceMap
  if (sourceMap) {
    swcOptions.sourceMap = true;
  }
  const result = await swc.minify(Buffer.from(code), swcOptions);
  return {
    code: result.code.toString(),
    map: result.map ? JSON.parse(result.map.toString()) : undefined,
    errors: result.errors ? result.errors.map(swcCssDiagnosticToError) : undefined
  };
}

/**
 * @returns {string | undefined} the minimizer version
 */
swcMinifyCss.getMinimizerVersion = () => {
  let packageJson;
  try {
    packageJson = require("@swc/css/package.json");
  } catch (_err) {
    // Ignore
  }
  return packageJson && packageJson.version;
};

/**
 * @returns {boolean | undefined} false because `@swc/css` is a native binding
 */
swcMinifyCss.supportsWorkerThreads = () => false;

/**
 * @param {string} name asset name
 * @returns {boolean} true if `name` looks like a CSS file
 */
swcMinifyCss.filter = name => CSS_FILE_RE.test(name);

/**
 * @template T
 * @typedef {() => T} FunctionReturning
 */

/**
 * @template T
 * @param {FunctionReturning<T>} fn memorized function
 * @returns {FunctionReturning<T>} new function
 */
function memoize(fn) {
  let cache = false;
  /** @type {T} */
  let result;
  return () => {
    if (cache) {
      return result;
    }
    result = fn();
    cache = true;
    // Allow to clean up memory for fn
    // and all dependent resources
    /** @type {FunctionReturning<T> | undefined} */
    fn = undefined;
    return /** @type {T} */result;
  };
}
module.exports = {
  cleanCssMinify,
  cssnanoMinify,
  cssoMinify,
  esbuildMinify,
  esbuildMinifyCss,
  getEcmaVersion,
  htmlMinifierTerser,
  jsonMinify,
  lightningCssMinify,
  memoize,
  minifyHtmlNode,
  swcMinify,
  swcMinifyCss,
  swcMinifyHtml,
  swcMinifyHtmlFragment,
  terserMinify,
  throttleAll,
  uglifyJsMinify
};