import getOptions from 'eslint-loader/dist/getOptions';
import Linter from 'eslint-loader/dist/Linter';
import cacheLoader from 'eslint-loader/dist/cacheLoader';
import { loader } from 'webpack'
import { RawSourceMap } from 'source-map';

const fn: loader.Loader = function (content: string | Buffer, map?: RawSourceMap) {
  console.log(`ESLint Loader: ${this.resourcePath}`)
  const options = getOptions(this);
  console.log({options});
  const linter = new Linter(this, options);

  this.cacheable();

  // return early if cached
  if (options.cache) {
    cacheLoader(linter, content, map);
    return;
  }
  const op = linter.lint(content);

  linter.printOutput(op);
  debugger;
  this.callback(null, content, map);
}

export default fn
