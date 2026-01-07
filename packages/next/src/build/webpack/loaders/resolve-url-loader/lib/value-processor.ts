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

import loaderUtils from 'next/dist/compiled/loader-utils2'
import path from 'path'

function valueProcessor(filename: any, options: any) {
  const URL_STATEMENT_REGEX =
    /(url\s*\()\s*(?:(['"])((?:(?!\2).)*)(\2)|([^'"](?:(?!\)).)*[^'"]))\s*(\))/g
  const directory = path.dirname(filename)
  const join = options.join(filename, options)

  /**
   * Process the given CSS declaration value.
   *
   */
  return function transformValue(
    /** A declaration value that may or may not contain a url() statement */
    value: string,
    /** An absolute path that may be the correct base or an Iterator thereof */
    candidate: any
  ) {
    // allow multiple url() values in the declaration
    //  split by url statements and process the content
    //  additional capture groups are needed to match quotations correctly
    //  escaped quotations are not considered
    return value
      .split(URL_STATEMENT_REGEX)
      .map((token: any, i: any, arr: any) => {
        // we can get groups as undefined under certain match circumstances
        const initialised = token || ''

        // the content of the url() statement is either in group 3 or group 5
        const mod = i % 7
        if (mod === 3 || mod === 5) {
          // detect quoted url and unescape backslashes
          const before = arr[i - 1],
            after = arr[i + 1],
            isQuoted = before === after && (before === "'" || before === '"'),
            unescaped = isQuoted
              ? initialised.replace(/\\{2}/g, '\\')
              : initialised

          // split into uri and query/hash and then find the absolute path to the uri
          const split = unescaped.split(/([?#])/g),
            uri = split[0],
            absolute =
              (testIsRelative(uri) && join(uri, candidate)) ||
              (testIsAbsolute(uri) && join(uri)),
            query = options.keepQuery ? split.slice(1).join('') : ''

          // use the absolute path in absolute mode or else relative path (or default to initialised)
          // #6 - backslashes are not legal in URI
          if (!absolute) {
            return initialised
          } else if (options.absolute) {
            return absolute.replace(/\\/g, '/') + query
          } else {
            return loaderUtils.urlToRequest(
              path.relative(directory, absolute).replace(/\\/g, '/') + query
            )
          }
        }
        // everything else, including parentheses and quotation (where present) and media statements
        else {
          return initialised
        }
      })
      .join('')
  }

  /**
   * The loaderUtils.isUrlRequest() doesn't support windows absolute paths on principle. We do not subscribe to that
   * dogma so we add path.isAbsolute() check to allow them.
   *
   * We also eliminate module relative (~) paths.
   *
   * Returns true for relative uri
   */
  function testIsRelative(
    /** A uri string possibly empty or undefined */
    uri?: string
  ): boolean {
    return (
      !!uri &&
      loaderUtils.isUrlRequest(uri, false) &&
      !path.isAbsolute(uri) &&
      uri.indexOf('~') !== 0
    )
  }

  /**
   * The loaderUtils.isUrlRequest() doesn't support windows absolute paths on principle. We do not subscribe to that
   * dogma so we add path.isAbsolute() check to allow them.
   *
   * Returns true for absolute uri
   */
  function testIsAbsolute(
    /** A uri string possibly empty or undefined */
    uri?: string
  ) {
    return (
      !!uri &&
      typeof options.root === 'string' &&
      loaderUtils.isUrlRequest(uri, options.root) &&
      (/^\//.test(uri) || path.isAbsolute(uri))
    )
  }
}

export default valueProcessor
