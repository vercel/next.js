import micro from 'micro'
import UrlPattern from 'url-pattern'
import fetch from 'node-fetch'
import { resolve } from 'url'

export default (rules) => {
  const patterns = rules.map(({ pathname, dest, method }) => {
    const methods = method ? method.reduce((final, c) => {
      final[c.toLowerCase()] = true
      return final
    }, {}) : null

    return {
      pathname: new UrlPattern(pathname || '/**'),
      dest,
      methods
    }
  })

  return micro(async (req, res) => {
    // Find a matching zone for the request and proxy it
    for (const { pathname, dest, methods } of patterns) {
      if (pathname.match(req.url) && (!methods || methods[req.method.toLowerCase()])) {
        await proxyRequest(req, res, dest)
        return
      }
    }

    res.writeHead(404)
    res.end('404 - Not Found')
  })
}

async function proxyRequest (req, res, dest) {
  const newUrl = resolve(dest, req.url)
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
