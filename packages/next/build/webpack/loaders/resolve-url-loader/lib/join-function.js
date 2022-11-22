/*
The MIT License (MIT)

Copyright (c) 2016 Ben Holloway

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
import path from 'path'
import fs from 'fs'

const compose =
  (f, g) =>
  (...args) =>
    f(g(...args))

const simpleJoin = compose(path.normalize, path.join)

/**
 * The default join function iterates over possible base paths until a suitable join is found.
 *
 * The first base path is used as fallback for the case where none of the base paths can locate the actual file.
 *
 * @type {function}
 */
export const defaultJoin = createJoinForPredicate(function predicate(
  _,
  uri,
  base,
  i,
  next
) {
  const absolute = simpleJoin(base, uri)
  return fs.existsSync(absolute) ? absolute : next(i === 0 ? absolute : null)
},
'defaultJoin')

function* createIterator(arr) {
  for (const i of arr) {
    yield i
  }
}

/**
 * Define a join function by a predicate that tests possible base paths from an iterator.
 *
 * The `predicate` is of the form:
 *
 * ```
 * function(filename, uri, base, i, next):string|null
 * ```
 *
 * Given the uri and base it should either return:
 * - an absolute path success
 * - a call to `next(null)` as failure
 * - a call to `next(absolute)` where absolute is placeholder and the iterator continues
 *
 * The value given to `next(...)` is only used if success does not eventually occur.
 *
 * The `file` value is typically unused but useful if you would like to differentiate behaviour.
 *
 * You can write a much simpler function than this if you have specific requirements.
 *
 * @param {function} predicate A function that tests values
 * @param {string} [name] Optional name for the resulting join function
 */
function createJoinForPredicate(predicate, name) {
  /**
   * A factory for a join function with logging.
   *
   * @param {string} filename The current file being processed
   * @param {{debug:function|boolean,root:string}} options An options hash
   */
  function join(filename, options) {
    const log = createDebugLogger(options.debug)

    /**
     * Join function proper.
     *
     * For absolute uri only `uri` will be provided. In this case we substitute any `root` given in options.
     *
     * @param {string} uri A uri path, relative or absolute
     * @param {string|Iterator.<string>} [baseOrIteratorOrAbsent] Optional absolute base path or iterator thereof
     * @return {string} Just the uri where base is empty or the uri appended to the base
     */
    return function joinProper(uri, baseOrIteratorOrAbsent) {
      const iterator =
        (typeof baseOrIteratorOrAbsent === 'undefined' &&
          createIterator([options.root])) ||
        (typeof baseOrIteratorOrAbsent === 'string' &&
          createIterator([baseOrIteratorOrAbsent])) ||
        baseOrIteratorOrAbsent

      const result = runIterator([])
      log(createJoinMsg, [filename, uri, result, result.isFound])

      return typeof result.absolute === 'string' ? result.absolute : uri

      function runIterator(accumulator) {
        const nextItem = iterator.next()
        var base = !nextItem.done && nextItem.value
        if (typeof base === 'string') {
          const element = predicate(
            filename,
            uri,
            base,
            accumulator.length,
            next
          )

          if (typeof element === 'string' && path.isAbsolute(element)) {
            return Object.assign(accumulator.concat(base), {
              isFound: true,
              absolute: element,
            })
          } else if (Array.isArray(element)) {
            return element
          } else {
            throw new Error(
              'predicate must return an absolute path or the result of calling next()'
            )
          }
        } else {
          return accumulator
        }

        function next(fallback) {
          return runIterator(
            Object.assign(
              accumulator.concat(base),
              typeof fallback === 'string' && { absolute: fallback }
            )
          )
        }
      }
    }
  }

  function toString() {
    return '[Function: ' + name + ']'
  }

  return Object.assign(
    join,
    name && {
      valueOf: toString,
      toString: toString,
    }
  )
}

/**
 * Format a debug message.
 *
 * @param {string} file The file being processed by webpack
 * @param {string} uri A uri path, relative or absolute
 * @param {Array.<string>} bases Absolute base paths up to and including the found one
 * @param {boolean} isFound Indicates the last base was correct
 * @return {string} Formatted message
 */
function createJoinMsg(file, uri, bases, isFound) {
  return ['resolve-url-loader: ' + pathToString(file) + ': ' + uri]
    .concat(bases.map(pathToString).filter(Boolean))
    .concat(isFound ? 'FOUND' : 'NOT FOUND')
    .join('\n  ')

  /**
   * If given path is within `process.cwd()` then show relative posix path, otherwise show absolute posix path.
   *
   * @param {string} absolute An absolute path
   * @return {string} A relative or absolute path
   */
  function pathToString(absolute) {
    if (!absolute) {
      return null
    } else {
      const relative = path.relative(process.cwd(), absolute).split(path.sep)

      return (
        relative[0] === '..'
          ? absolute.split(path.sep)
          : ['.'].concat(relative).filter(Boolean)
      ).join('/')
    }
  }
}

exports.createJoinMsg = createJoinMsg

/**
 * A factory for a log function predicated on the given debug parameter.
 *
 * The logging function created accepts a function that formats a message and parameters that the function utilises.
 * Presuming the message function may be expensive we only call it if logging is enabled.
 *
 * The log messages are de-duplicated based on the parameters, so it is assumed they are simple types that stringify
 * well.
 *
 * @param {function|boolean} debug A boolean or debug function
 * @return {function(function, array)} A logging function possibly degenerate
 */
function createDebugLogger(debug) {
  const log = !!debug && (typeof debug === 'function' ? debug : console.log)
  const cache = {}
  return log ? actuallyLog : noop

  function noop() {}

  function actuallyLog(msgFn, params) {
    const key = JSON.stringify(params)
    if (!cache[key]) {
      cache[key] = true
      log(msgFn.apply(null, params))
    }
  }
}

exports.createDebugLogger = createDebugLogger
