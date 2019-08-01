import { encode, decode } from 'querystring'

const BASE_URL = window.location.href

module.exports = {
  parse (url) {
    let res = new URL(url, BASE_URL)
    // URLSearchParams is not supported in Edge 16
    // res.query = res.searchParams;
    res.query = decode(res.search.substr(1))
    return res
  },

  format (urlObj) {
    let {
      auth,
      host,
      hostname,
      protocol = '',
      pathname = '',
      hash = '',
      query = ''
    } = urlObj

    auth = auth ? encodeURIComponent(auth).replace(/%3A/i, ':') + '@' : ''

    if (host) {
      host = auth + host
    } else if (hostname) {
      host = auth + (~hostname.indexOf(':') ? `[${hostname}]` : hostname)
      if (urlObj.port) {
        host += ':' + urlObj.port
      }
    } else {
      host = ''
    }

    if (query && typeof query === 'object') {
      // query = '' + new URLSearchParams(query);
      query = encode(query)
    }

    let search = urlObj.search || (query && `?${query}`)

    if (protocol && protocol.substr(-1) !== ':') protocol += ':'

    if (
      urlObj.slashes ||
      ((!protocol || /https?|ftp|gopher|file/.test(protocol)) && host)
    ) {
      host = `//${host}`
      if (pathname && pathname[0] !== '/') pathname = '/' + pathname
    }

    if (hash && hash[0] !== '#') hash = '#' + hash
    if (search && search[0] !== '?') search = '?' + search

    pathname = pathname.replace(/[?#]/g, encodeURIComponent)
    search = search.replace('#', '%23')

    return `${protocol}${host}${pathname}${search}${hash}`
  },

  resolve (fromUrl, toUrl) {
    const normalizedFromUrl = new URL(fromUrl, BASE_URL)
    return '' + new URL(toUrl, normalizedFromUrl)
  }
}
