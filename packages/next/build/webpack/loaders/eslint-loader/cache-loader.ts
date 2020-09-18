import cache from './cache';
// eslint-disable-next-line import/no-extraneous-dependencies
import { RawSourceMap } from 'source-map';
import { Linter, NextLintResult } from './linter';
import { ESLint } from 'eslint'

const { version } = require('next/package.json');

export default function cacheLoader(linter:Linter, content:String, map?: RawSourceMap) {
  const stringContent = content.toString();
  const { loaderContext, options } = linter;
  const callback = loaderContext.async();
  const cacheIdentifier = JSON.stringify({
    'eslint-loader': version,
    eslint: ESLint.version
  });
  cache({
    cacheDirectory: options.cache,
    cacheIdentifier,
    cacheCompression: true,
    options,
    source: content,
    transform() {
      return linter.lint(stringContent);
    },
  })
    .then(({report: res, ast}: NextLintResult) => {
      try {
        res && linter.printOutput(res);
      } catch (error) {
        if (callback) {
          // @ts-ignore
          return callback(error, stringContent, map, { sharedBabelAST: ast });
        }
      }
      if (callback) {
        return callback(null, stringContent, map);
      }
    })
    .catch((err: any) => {
      // istanbul ignore next
      if (callback) {
        return callback(err);
      }
    });
}
