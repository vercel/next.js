/* eslint-disable
  no-param-reassign
*/
import stringHash from 'string-hash'
import { SourceMapConsumer } from 'source-map';
import { SourceMapSource, RawSource } from 'webpack-sources';
import RequestShortener from 'webpack/lib/RequestShortener';
import TaskRunner from './TaskRunner';

const warningRegex = /\[.+:([0-9]+),([0-9]+)\]/;

const JS_REGEX = /\.m?js$/

export class TerserPlugin {
  constructor(options = {}) {
    const {
      terserOptions = {},
      warningsFilter = () => true,
      sourceMap = false,
      cache = false,
      cpus,
    } = options;

    this.cpus = cpus
    this.options = {
      warningsFilter,
      sourceMap,
      cache,
      terserOptions: terserOptions,
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
    const optimizeFn = (compilation, chunks, callback) => {
      const taskRunner = new TaskRunner(this.cpus);

      const processedAssets = new WeakSet();
      const tasks = [];

      Array.from(chunks)
        .reduce((acc, chunk) => acc.concat(chunk.files || []), [])
        .concat(compilation.additionalChunkAssets || [])
        .filter((file) => JS_REGEX.test(file))
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

            const task = {
              file,
              input,
              inputSourceMap,
              terserOptions: this.options.terserOptions
            };

            if (this.options.cache) {
              // increment 'a' to invalidate previous caches from different options
              task.cacheKey = 'a' + stringHash(input)
              if (this.options.sourceMap) task.cacheKey += 's'
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
          const { file, input, inputSourceMap } = tasks[index];
          const { error, map, code, warnings } = data;

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
        compilation.hooks.buildModule.tap(plugin, (moduleArg) => {
          // to get detailed location info about errors
          moduleArg.useSourceMap = true;
        })
      }

      const { mainTemplate, chunkTemplate } = compilation;

      // Regenerate `contenthash` for minified assets
      for (const template of [mainTemplate, chunkTemplate]) {
        template.hooks.hashForChunk.tap(plugin, (hash) => {
          // Terser version
          // Has to be updated when options change too
          hash.update('3.16.1');
          return hash
        });
      }

      compilation.hooks.optimizeChunkAssets.tapAsync(
        plugin,
        optimizeFn.bind(this, compilation)
      );
    });
  }
}
