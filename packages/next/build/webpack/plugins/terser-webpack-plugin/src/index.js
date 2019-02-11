/* eslint-disable
  no-param-reassign
*/
import crypto from 'crypto';
import path from 'path';

import { SourceMapConsumer } from 'source-map';
import { SourceMapSource, RawSource, ConcatSource } from 'webpack-sources';
import RequestShortener from 'webpack/lib/RequestShortener';
import ModuleFilenameHelpers from 'webpack/lib/ModuleFilenameHelpers';
// import validateOptions from 'schema-utils';
import serialize from 'serialize-javascript';
import terserPackageJson from 'terser/package.json';

import schema from './options.json';
import TaskRunner from './TaskRunner';

const warningRegex = /\[.+:([0-9]+),([0-9]+)\]/;

class TerserPlugin {
  constructor(options = {}) {
    // validateOptions(schema, options, 'Terser Plugin');

    const {
      minify,
      terserOptions = {},
      test = /\.m?js(\?.*)?$/i,
      chunkFilter = () => true,
      warningsFilter = () => true,
      extractComments = false,
      sourceMap = false,
      cache = false,
      cacheKeys = (defaultCacheKeys) => defaultCacheKeys,
      parallel = false,
      include,
      exclude,
    } = options;

    this.options = {
      test,
      chunkFilter,
      warningsFilter,
      extractComments,
      sourceMap,
      cache,
      cacheKeys,
      parallel,
      include,
      exclude,
      minify,
      terserOptions: {
        output: {
          comments: extractComments
            ? false
            : /^\**!|@preserve|@license|@cc_on/i,
        },
        ...terserOptions,
      },
    };
  }

  static isSourceMap(input) {
    // All required options for `new SourceMapConsumer(...options)`
    // https://github.com/mozilla/source-map#new-sourcemapconsumerrawsourcemap
    return Boolean(
      input &&
        input.version &&
        input.sources &&
        Array.isArray(input.sources) &&
        typeof input.mappings === 'string'
    );
  }

  static buildSourceMap(inputSourceMap) {
    if (!inputSourceMap || !TerserPlugin.isSourceMap(inputSourceMap)) {
      return null;
    }

    return new SourceMapConsumer(inputSourceMap);
  }

  static buildError(err, file, sourceMap, requestShortener) {
    // Handling error which should have line, col, filename and message
    if (err.line) {
      const original =
        sourceMap &&
        sourceMap.originalPositionFor({
          line: err.line,
          column: err.col,
        });

      if (original && original.source && requestShortener) {
        return new Error(
          `${file} from Terser\n${err.message} [${requestShortener.shorten(
            original.source
          )}:${original.line},${original.column}][${file}:${err.line},${
            err.col
          }]`
        );
      }

      return new Error(
        `${file} from Terser\n${err.message} [${file}:${err.line},${err.col}]`
      );
    } else if (err.stack) {
      return new Error(`${file} from Terser\n${err.stack}`);
    }

    return new Error(`${file} from Terser\n${err.message}`);
  }

  static buildWarning(
    warning,
    file,
    sourceMap,
    requestShortener,
    warningsFilter
  ) {
    let warningMessage = warning;
    let locationMessage = '';
    let source = null;

    if (sourceMap) {
      const match = warningRegex.exec(warning);

      if (match) {
        const line = +match[1];
        const column = +match[2];
        const original = sourceMap.originalPositionFor({
          line,
          column,
        });

        if (
          original &&
          original.source &&
          original.source !== file &&
          requestShortener
        ) {
          ({ source } = original);
          warningMessage = `${warningMessage.replace(warningRegex, '')}`;

          locationMessage = `[${requestShortener.shorten(original.source)}:${
            original.line
          },${original.column}]`;
        }
      }
    }

    if (warningsFilter && !warningsFilter(warning, source)) {
      return null;
    }

    return `Terser Plugin: ${warningMessage}${locationMessage}`;
  }

  apply(compiler) {
    const buildModuleFn = (moduleArg) => {
      // to get detailed location info about errors
      moduleArg.useSourceMap = true;
    };

    const optimizeFn = (compilation, chunks, callback) => {
      const taskRunner = new TaskRunner({
        cache: this.options.cache,
        parallel: this.options.parallel,
      });

      const processedAssets = new WeakSet();
      const tasks = [];

      const { chunkFilter } = this.options;

      Array.from(chunks)
        .filter((chunk) => chunkFilter && chunkFilter(chunk))
        .reduce((acc, chunk) => acc.concat(chunk.files || []), [])
        .concat(compilation.additionalChunkAssets || [])
        .filter(ModuleFilenameHelpers.matchObject.bind(null, this.options))
        .forEach((file) => {
          let inputSourceMap;

          const asset = compilation.assets[file];

          if (processedAssets.has(asset)) {
            return;
          }

          try {
            let input;

            if (this.options.sourceMap && asset.sourceAndMap) {
              const { source, map } = asset.sourceAndMap();

              input = source;

              if (TerserPlugin.isSourceMap(map)) {
                inputSourceMap = map;
              } else {
                inputSourceMap = map;

                compilation.warnings.push(
                  new Error(`${file} contains invalid source map`)
                );
              }
            } else {
              input = asset.source();
              inputSourceMap = null;
            }

            // Handling comment extraction
            let commentsFile = false;

            if (this.options.extractComments) {
              commentsFile =
                this.options.extractComments.filename || `${file}.LICENSE`;

              if (typeof commentsFile === 'function') {
                commentsFile = commentsFile(file);
              }
            }

            const task = {
              file,
              input,
              inputSourceMap,
              commentsFile,
              extractComments: this.options.extractComments,
              terserOptions: this.options.terserOptions,
              minify: this.options.minify,
            };

            if (this.options.cache) {
              const defaultCacheKeys = {
                terser: terserPackageJson.version,
                // eslint-disable-next-line global-require
                'terser-webpack-plugin': '1.2.2',
                'terser-webpack-plugin-options': this.options,
                hash: crypto
                  .createHash('md4')
                  .update(input)
                  .digest('hex'),
              };

              task.cacheKeys = this.options.cacheKeys(defaultCacheKeys, file);
            }

            tasks.push(task);
          } catch (error) {
            compilation.errors.push(
              TerserPlugin.buildError(
                error,
                file,
                TerserPlugin.buildSourceMap(inputSourceMap),
                new RequestShortener(compiler.context)
              )
            );
          }
        });

      taskRunner.run(tasks, (tasksError, results) => {
        if (tasksError) {
          compilation.errors.push(tasksError);

          return;
        }

        results.forEach((data, index) => {
          const { file, input, inputSourceMap, commentsFile } = tasks[index];
          const { error, map, code, warnings } = data;
          let { extractedComments } = data;

          let sourceMap = null;

          if (error || (warnings && warnings.length > 0)) {
            sourceMap = TerserPlugin.buildSourceMap(inputSourceMap);
          }

          // Handling results
          // Error case: add errors, and go to next file
          if (error) {
            compilation.errors.push(
              TerserPlugin.buildError(
                error,
                file,
                sourceMap,
                new RequestShortener(compiler.context)
              )
            );

            return;
          }

          let outputSource;

          if (map) {
            outputSource = new SourceMapSource(
              code,
              file,
              JSON.parse(map),
              input,
              inputSourceMap
            );
          } else {
            outputSource = new RawSource(code);
          }

          // Write extracted comments to commentsFile
          if (
            commentsFile &&
            extractedComments &&
            extractedComments.length > 0
          ) {
            if (commentsFile in compilation.assets) {
              const commentsFileSource = compilation.assets[
                commentsFile
              ].source();

              extractedComments = extractedComments.filter(
                (comment) => !commentsFileSource.includes(comment)
              );
            }

            if (extractedComments.length > 0) {
              // Add a banner to the original file
              if (this.options.extractComments.banner !== false) {
                let banner =
                  this.options.extractComments.banner ||
                  `For license information please see ${path.posix.basename(
                    commentsFile
                  )}`;

                if (typeof banner === 'function') {
                  banner = banner(commentsFile);
                }

                if (banner) {
                  outputSource = new ConcatSource(
                    `/*! ${banner} */\n`,
                    outputSource
                  );
                }
              }

              const commentsSource = new RawSource(
                `${extractedComments.join('\n\n')}\n`
              );

              if (commentsFile in compilation.assets) {
                // commentsFile already exists, append new comments...
                if (compilation.assets[commentsFile] instanceof ConcatSource) {
                  compilation.assets[commentsFile].add('\n');
                  compilation.assets[commentsFile].add(commentsSource);
                } else {
                  compilation.assets[commentsFile] = new ConcatSource(
                    compilation.assets[commentsFile],
                    '\n',
                    commentsSource
                  );
                }
              } else {
                compilation.assets[commentsFile] = commentsSource;
              }
            }
          }

          // Updating assets
          processedAssets.add((compilation.assets[file] = outputSource));

          // Handling warnings
          if (warnings && warnings.length > 0) {
            warnings.forEach((warning) => {
              const builtWarning = TerserPlugin.buildWarning(
                warning,
                file,
                sourceMap,
                new RequestShortener(compiler.context),
                this.options.warningsFilter
              );

              if (builtWarning) {
                compilation.warnings.push(builtWarning);
              }
            });
          }
        });

        taskRunner.exit();

        callback();
      });
    };

    const plugin = { name: this.constructor.name };

    compiler.hooks.compilation.tap(plugin, (compilation) => {
      if (this.options.sourceMap) {
        compilation.hooks.buildModule.tap(plugin, buildModuleFn);
      }

      const { mainTemplate, chunkTemplate } = compilation;

      // Regenerate `contenthash` for minified assets
      for (const template of [mainTemplate, chunkTemplate]) {
        template.hooks.hashForChunk.tap(plugin, (hash) => {
          const data = serialize({
            terser: terserPackageJson.version,
            terserOptions: this.options.terserOptions,
          });

          hash.update('TerserPlugin');
          hash.update(data);
        });
      }

      compilation.hooks.optimizeChunkAssets.tapAsync(
        plugin,
        optimizeFn.bind(this, compilation)
      );
    });
  }
}

export default TerserPlugin;
