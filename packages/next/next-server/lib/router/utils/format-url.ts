// Format function modified from nodejs
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

import { UrlObject } from 'url'
import { ParsedUrlQuery } from 'querystring'
import * as querystring from './querystring'

const slashedProtocols = /https?|ftp|gopher|file/

function getQuery(urlObj: UrlObject): string {
  let query = urlObj.query || ''

  if (query && typeof query === 'object') {
    query = String(querystring.urlQueryToSearchParams(query as ParsedUrlQuery))
  }
  return query
}

function getProtocol(urlObj: UrlObject): string {
  let protocol = urlObj.protocol || ''

  if (protocol?.substr(-1) !== ':') {
    protocol += ':'
  }
  return protocol
}

function getSearch(urlObj: UrlObject, query: string): string {
  let search = urlObj.search || (query && `?${query}`) || ''

  if (search?.[0] !== '?') {
    search = '?' + search
  }
  return search.replace('#', '%23')
}

function getHash(urlObj: UrlObject): string {
  let hash = urlObj.hash || ''

  if (hash?.[0] !== '#') hash = '#' + hash
  return hash
}

export function formatUrl(urlObj: UrlObject): string {
  let { auth } = urlObj
  const { hostname } = urlObj
  let host: string | false = false

  auth = auth ? encodeURIComponent(auth).replace(/%3A/i, ':') + '@' : ''

  if (urlObj.host) {
    host = auth + urlObj.host
  } else if (hostname) {
    host = auth + (~hostname.indexOf(':') ? `[${hostname}]` : hostname)
    if (urlObj.port) {
      host += ':' + urlObj.port
    }
  }

  const query = getQuery(urlObj)
  const protocol = getProtocol(urlObj)

  let pathname = urlObj.pathname || ''

  if (
    urlObj.slashes ||
    ((!protocol || slashedProtocols.test(protocol)) && host !== false)
  ) {
    host = '//' + (host || '')
    if (pathname?.[0] !== '/') pathname = '/' + pathname
  } else if (!host) {
    host = ''
  }
  pathname = pathname.replace(/[?#]/g, encodeURIComponent)

  const search = getSearch(urlObj, query)
  const hash = getHash(urlObj)

  return `${protocol}${host}${pathname}${search}${hash}`
}
