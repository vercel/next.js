/**
 * Filesystem Cache
 *
 * Given a file and a transform function, cache the result into files
 * or retrieve the previously cached files if the given file is already known.
 *
 * @see https://github.com/babel/babel-loader/issues/34
 * @see https://github.com/babel/babel-loader/pull/41
 */
import fs from "fs"
import os from "os"
import path from "path"
import crypto from "crypto"
import mkdirpOrig from "mkdirp"
import { promisify } from "util"
import transform from './transform'

// Lazily instantiated when needed
let defaultCacheDirectory: any = null;

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdirp = promisify(mkdirpOrig);

export const usedBabelCacheFiles: Set<String> = new Set()

/**
 * Read the contents from the compressed file.
 *
 * @async
 * @params {String} filename
 */
async function read(filename: string) {
  const data = await readFile(filename);
  const content = data;

  usedBabelCacheFiles.add(filename)
  return JSON.parse(content.toString());
};

/**
 * Write contents into a compressed file.
 */
async function write(filename: string, result: any) {
  const content = JSON.stringify(result);
  usedBabelCacheFiles.add(filename)
  return await writeFile(filename, content);
};

/**
 * Build the filename for the cached file
 */
function filename(source: string, identifier: any, options: any): string {
  const hash = crypto.createHash("md4");

  const contents = JSON.stringify({ source, options, identifier });

  hash.update(contents);

  return hash.digest("hex") + ".json";
};

/**
 * Handle the cache
 */
async function handleCache(directory: string, params: any): Promise<any> {
  const {
    source,
    options = {},
    cacheIdentifier,
    cacheDirectory,
  } = params;

  const file = path.join(directory, filename(source, cacheIdentifier, options));

  try {
    // No errors mean that the file was previously cached
    // we just need to return it
    return await read(file);
  } catch (err) {}

  const fallback =
    typeof cacheDirectory !== "string" && directory !== os.tmpdir();

  // Make sure the directory exists.
  try {
    await mkdirp(directory);
  } catch (err) {
    if (fallback) {
      return handleCache(os.tmpdir(), params);
    }

    throw err;
  }

  // Otherwise just transform the file
  // return it to the user asap and write it in cache
  const result = await transform(source, options);

  try {
    await write(file, result);
  } catch (err) {
    if (fallback) {
      // Fallback to tmpdir if node_modules folder not writable
      return handleCache(os.tmpdir(), params);
    }

    throw err;
  }

  return result;
};

/**
 * Retrieve file from cache, or create a new one for future reads
 *
 * @async
 * @param  {Object}   params
 * @param  {String}   params.directory  Directory to store cached files
 * @param  {String}   params.identifier Unique identifier to bust cache
 * @param  {String}   params.source   Original contents of the file to be cached
 * @param  {Object}   params.options  Options to be given to the transform fn
 * @param  {Function} params.transform  Function that will transform the
 *                                      original file and whose result will be
 *                                      cached
 *
 * @example
 *
 *   cache({
 *     directory: '.tmp/cache',
 *     identifier: 'babel-loader-cachefile',
 *     source: *source code from file*,
 *     options: {
 *       experimental: true,
 *       runtime: true
 *     },
 *     transform: function(source, options) {
 *       var content = *do what you need with the source*
 *       return content;
 *     }
 *   }, function(err, result) {
 *
 *   });
 */

export default async function cache(params: any) {
  let directory;

  if (typeof params.cacheDirectory === "string") {
    directory = params.cacheDirectory;
  } else {
    directory = defaultCacheDirectory;
  }

  return await handleCache(directory, params);
};
