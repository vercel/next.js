import getOptions from './getOptions';
import cacheLoader from './cacheLoader';
import { loader } from 'webpack'
// eslint-disable-next-line import/no-extraneous-dependencies
import { RawSourceMap } from 'source-map';
import { NextLinter } from './next-linter';

const fn: loader.Loader = function (content: string | Buffer, map?: RawSourceMap) {
  console.log(`ESLint Loader: ${this.resourcePath}`)
  const options = getOptions(this);
  const linter = new NextLinter(this, options);

  this.cacheable();

  // return early if cached
  if (options.cache) {
    cacheLoader(linter, content.toString(), map);
    return;
  }
  const { report, ast} = linter.lint(content);
  console.log({ast})
  linter.printOutput(report);
  /// @ts-ignore
  this.callback(null, content, map);
}

export default fn
