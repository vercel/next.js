const { version } = require('../package.json');
const cache = require('./cache');

// eslint-disable-next-line import/no-extraneous-dependencies
import { RawSourceMap } from 'source-map';
import { NextLinter, NextLintResult } from './next-linter';

export default function cacheLoader(linter:NextLinter, content:String, map: RawSourceMap) {
  const { loaderContext, options, CLIEngine } = linter;
  const callback = loaderContext.async();
  const cacheIdentifier = JSON.stringify({
    'eslint-loader': version,
    eslint: CLIEngine.version,
  });

  cache({
    cacheDirectory: options.cache,
    cacheIdentifier,
    cacheCompression: true,
    options,
    source: content,
    transform() {
      return linter.lint(content.toString());
    },
  })
    .then(({report: res, ast}: NextLintResult) => {
      try {
        linter.printOutput({ ...res, src: content });
      } catch (error) {
        return callback(error, content, map);
      }
      return callback(null, content, map);
    })
    .catch((err) => {
      // istanbul ignore next
      return callback(err);
    });
}
