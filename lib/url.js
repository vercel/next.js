import querystring from 'querystring'

export function getURL () {
  const { href, protocol, hostname, port } = window.location
  const origin = `${protocol}//${hostname}${port ? ':' + port : ''}`
  return href.substring(origin.length)
}

export function parsePath (url) {
  const hasHost = url.indexOf('//') >= 0
  url = url.replace(/^.*\/\//, '').replace(/#.*$/, '')
  let match
  if (hasHost) {
    match = /^[^/]+(\/[^?\s]*)(?:\?([^\s]*))?/.exec(url)
  } else {
    // Just a path and potentially query info
    match = /^([^?\s]*)(?:\?([^\s]*))?/.exec(url)
  }

  return {
    pathname: match[1],
    query: match[2] ? querystring.parse(match[2]) : {}
  }
}

export function formatPath (obj) {
  const query = obj.query ? `?${querystring.stringify(obj.query)}` : ''
  const hash = obj.hash ? `#${obj.hash}` : ''
  return `${obj.pathname}${query}${hash}`
}
