import micro from 'micro'
import UrlPattern from 'url-pattern'
import fetch from 'node-fetch'
import { resolve } from 'url'
import { isInternalUrl } from './utils'

export default (rules) => {
  const patterns = rules.map(({ pathname, zone }) => ({
    pathname: new UrlPattern(pathname),
    zone
  }))

  return micro(async (req, res) => {
    // Proxy internal urls (like /_next/**)
    if (isInternalUrl(req.url)) {
      console.error(`Trying to access an internal URL via the proxy: ${req.url}
Did you configure "assetPrefix" on all the zones?`)
      res.writeHead(404)
      res.end('404 - Not Found')
      return
    }

    // Find a matching zone for the request and proxy it
    for (const { pathname, zone } of patterns) {
      if (pathname.match(req.url)) {
        await proxyRequest(req, res, zone)
        return
      }
    }

    res.writeHead(404)
    res.end('404 - Not Found')
  })
}

async function proxyRequest (req, res, zone) {
  const newUrl = resolve(zone.url, req.url)
  const proxyRes = await fetch(newUrl, {
    method: 'GET'
  })

  // Forward headers
  const headers = proxyRes.headers.raw()
  for (const key of Object.keys(headers)) {
    res.setHeader(key, headers[key])
  }

  // Stream the proxy response
  proxyRes.body.pipe(res)
  proxyRes.body.on('error', (err) => {
    console.error(`Error on proxying url: ${newUrl}`)
    console.error(err.stack)
    res.end()
  })

  req.on('abort', () => {
    proxyRes.body.destroy()
  })
}
