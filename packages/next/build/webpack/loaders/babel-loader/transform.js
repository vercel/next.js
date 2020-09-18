const babel = require("@babel/core");
const promisify = require("pify");
const LoaderError = require("./Error");

const transform = promisify(babel.transform);

module.exports = async function(source, options) {
  let result;
  try {
    result = await transform(source, options);
  } catch (err) {
    throw err.message && err.codeFrame ? new LoaderError(err) : err;
  }

  if (!result) return null;

  // We don't return the full result here because some entries are not
  // really serializable. For a full list of properties see here:
  // https://github.com/babel/babel/blob/master/packages/babel-core/src/transformation/index.js
  // For discussion on this topic see here:
  // https://github.com/babel/babel-loader/pull/629
  const { ast, code, map, metadata, sourceType } = result;

  if (map && (!map.sourcesContent || !map.sourcesContent.length)) {
    map.sourcesContent = [source];
  }

  return { ast, code, map, metadata, sourceType };
};

module.exports.version = babel.version;
