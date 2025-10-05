import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { spawn } from 'child_process'
import { createServer } from 'node:http'
import httpProxy from 'http-proxy'
import process from 'node:process'
import { createGunzip } from 'zlib'

const dir = dirname(fileURLToPath(import.meta.url))

// Redirects that happen in the proxy layer, rather than in Next.js itself. This
// is used to test that the client is still able to fully prefetch the
// target page.
const proxyRedirects = {
  '/redirect-to-target-page': '/target-page',
}

async function spawnNext(port) {
  const child = spawn('pnpm', ['next', 'start', '-p', port, dir], {
    env: process.env,
    stdio: ['inherit', 'pipe', 'inherit'],
  })

  child.stdout.pipe(process.stdout)

  // Wait until the server is listening.
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (data) => {
      if (data.toString().includes('Ready')) {
        resolve(child)
      }
    })
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(child)
      } else {
        reject(new Error(`Next.js server exited with code ${code}`))
      }
    })
  })
}

function isCacheableRequest(req) {
  return (
    req.method === 'GET' && !req.headers['cache-control']?.includes('no-store')
  )
}

function isCacheableResponse(res) {
  return !res.headers['cache-control']?.includes('no-store')
}

async function createFakeCDN(destPort) {
  const fakeCDNCache = new Map()

  const proxy = httpProxy.createProxyServer()
  const cdnServer = createServer(async (req, res) => {
    const pathname = new URL(req.url, `http://localhost`).pathname
    const redirectUrl = proxyRedirects[pathname]
    if (redirectUrl) {
      console.log('Redirecting to:', redirectUrl)
      res.writeHead(307, {
        Location: redirectUrl,
      })
      res.end()
      return
    }

    if (isCacheableRequest(req)) {
      // Serve from our fake CDN if there's a matching entry.
      const entry = await fakeCDNCache.get(req.url)
      if (entry) {
        console.log('Serving from fake CDN:', req.url)
        res.writeHead(entry.statusCode, entry.statusMessage, entry.headers)
        res.end(entry.data)
        return
      } else {
        // No existing entry. Proxy to the Next.js server and then store
        // the response in the cache.
        proxy.web(req, res, {
          target: `http://localhost:${destPort}`,
          selfHandleResponse: true,
        })
      }
    } else {
      // This request isn't cacheable.
      proxy.web(req, res, { target: `http://localhost:${destPort}` })
    }
  })

  proxy.on('proxyRes', function (proxyRes, req, res) {
    // If the response is cacheable, store it in a map to simulate a CDN.
    //
    // Note that we only key the entry on the URL, not any of the headers. i.e.
    // we don't respect the Vary header. This is true of certain real CDNs, so
    // Next.js must not rely on Vary.
    //
    // For the purposes of this test we don't respect max-age et al. Every
    // entry is cached indefinitely.
    if (isCacheableRequest(req) && isCacheableResponse(proxyRes)) {
      let resolveCDNEntry
      fakeCDNCache.set(req.url, new Promise((res) => (resolveCDNEntry = res)))

      // Decompress the original response stream, if needed
      let source
      if (proxyRes.headers['content-encoding'] === 'gzip') {
        source = proxyRes.pipe(createGunzip())
        // Just store the uncompressed body and serve that from cache.
        // Good enough for the purposes of this test app.
        delete proxyRes.headers['content-encoding']
      } else {
        source = proxyRes
      }

      const chunks = []
      source.on('data', (chunk) => {
        chunks.push(chunk)
      })
      source.on('end', () => {
        const data = Buffer.concat(chunks)
        // Send response after we've collected all chunks
        res.writeHead(
          proxyRes.statusCode || 200,
          proxyRes.statusMessage,
          proxyRes.headers
        )
        res.end(data)

        // Store the raw data for later use
        const entry = {
          data,
          statusCode: proxyRes.statusCode,
          statusMessage: proxyRes.statusMessage,
          headers: proxyRes.headers,
        }
        resolveCDNEntry(entry)
      })
      return
    }
    // If the response isn't cacheable, pipe it through to the client.
    proxyRes.pipe(res)
    return
  })

  return cdnServer
}

export async function start(cdnPort = 3000, nextPort = cdnPort + 1) {
  const next = await spawnNext(nextPort)
  const cdnServer = await createFakeCDN(nextPort)

  const onTerminate = () => {
    cdnServer.close()
    next.kill()
    process.exit(0)
  }
  process.on('SIGINT', onTerminate)
  process.on('SIGTERM', onTerminate)

  const cleanup = async () => {
    next.kill()
    await new Promise((resolve) => cdnServer.close(resolve))
  }

  return new Promise((resolve, reject) => {
    cdnServer.on('error', reject)
    cdnServer.listen(cdnPort, () => {
      console.log('Server is listening', cdnPort)
      resolve(cleanup)
    })
  })
}
