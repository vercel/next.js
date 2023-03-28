// TODO: Remove use of `any` type. Fix no-use-before-define violations.
/* eslint-disable @typescript-eslint/no-use-before-define */
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
  (f: any, g: any) =>
  (...args: any[]) =>
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
  _: any,
  uri: any,
  base: any,
  i: any,
  next: any
) {
  const absolute = simpleJoin(base, uri)
  return fs.existsSync(absolute) ? absolute : next(i === 0 ? absolute : null)
},
'defaultJoin')

function* createIterator(arr: any) {
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
 */
function createJoinForPredicate(
  /** predicate A function that tests values */
  predicate: any,
  /** Optional name for the resulting join function */
  name: string
) {
  /**
   * A factory for a join function with logging.
   */
  function join(
    /** The current file being processed */
    filename: string,
    /** An options hash */
    options: { debug?: any | boolean; root: string }
  ) {
    const log = createDebugLogger(options.debug)

    /**
     * Join function proper.
     *
     * For absolute uri only `uri` will be provided. In this case we substitute any `root` given in options.
     *
     * Returns Just the uri where base is empty or the uri appended to the base
     */
    return function joinProper(
      /** A uri path, relative or absolute */
      uri: string,
      /** Optional absolute base path or iterator thereof */
      baseOrIteratorOrAbsent: any
    ) {
      const iterator =
        (typeof baseOrIteratorOrAbsent === 'undefined' &&
          createIterator([options.root])) ||
        (typeof baseOrIteratorOrAbsent === 'string' &&
          createIterator([baseOrIteratorOrAbsent])) ||
        baseOrIteratorOrAbsent

      const result = runIterator([])
      log(createJoinMsg, [filename, uri, result, result.isFound])

      return typeof result.absolute === 'string' ? result.absolute : uri

      function runIterator(accumulator: any) {
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

        function next(fallback: any) {
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
 * Return Formatted message
 */
function createJoinMsg(
  /** The file being processed by webpack */
  file: string,
  /**  A uri path, relative or absolute */
  uri: string,
  /** Absolute base paths up to and including the found one */
  bases: string[],
  /** Indicates the last base was correct */
  isFound: boolean
): string {
  return [
    'resolve-url-loader: ' + pathToString(file) + ': ' + uri,
    //
    ...bases.map(pathToString).filter(Boolean),
    ...(isFound ? ['FOUND'] : ['NOT FOUND']),
  ].join('\n  ')

  /**
   * If given path is within `process.cwd()` then show relative posix path, otherwise show absolute posix path.
   *
   * Returns A relative or absolute path
   */
  function pathToString(
    /** An absolute path */
    absolute: string
  ): string | null {
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
 * Returns A logging function possibly degenerate
 */
function createDebugLogger(
  /** A boolean or debug function */
  debug: any | boolean
): any {
  const log = !!debug && (typeof debug === 'function' ? debug : console.log)
  const cache: any = {}
  return log ? actuallyLog : noop

  function noop() {}

  function actuallyLog(msgFn: any, params: any) {
    const key = JSON.stringify(params)
    if (!cache[key]) {
      cache[key] = true
      log(msgFn.apply(null, params))
    }
  }
}

exports.createDebugLogger = createDebugLogger
