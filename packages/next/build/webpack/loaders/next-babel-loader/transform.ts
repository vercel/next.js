import LoaderError from './Error'
import * as babel from '@babel/core'

export default async function transform(source: string, options: any) {
  let result;
  try {
    result = await babel.transformAsync(source, options);
  } catch (err) {
    throw err.message && err.codeFrame ? new LoaderError(err) : err;
  }

  if (!result) return null;

  // We don't return the full result here because some entries are not
  // really serializable. For a full list of properties see here:
  // https://github.com/babel/babel/blob/master/packages/babel-core/src/transformation/index.js
  // For discussion on this topic see here:
  // https://github.com/babel/babel-loader/pull/629
  const { ast, code, map, metadata } = result;

  if (map && (!map.sourcesContent || !map.sourcesContent.length)) {
    map.sourcesContent = [source];
  }

  return { ast, code, map, metadata };
};

export const version = babel.version;
