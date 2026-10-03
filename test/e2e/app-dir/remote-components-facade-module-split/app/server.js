/* Combined server: starts the host and remote apps as separate Next.js
 * processes (remote-components resolves build manifests through process-global
 * symbols, so the apps must not share a process) and proxies public requests
 * by path prefix, mirroring how vercel.com routes remote-component paths to a
 * separate zone. */
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const net = require('net')

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function waitForServer(port, timeoutMs = 120000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`server on ${port} not ready`))
        } else {
          setTimeout(check, 500)
        }
      })
    }
    check()
  })
}

function startApp(appName, port, dev) {
  const appDir = path.join(__dirname, 'apps', appName)
  // The remote-components config plugin generates its shared-module manifests
  // relative to the process cwd.
  const child = spawn(
    process.execPath,
    [
      require.resolve('next/dist/bin/next'),
      dev ? 'dev' : 'start',
      appDir,
      '-p',
      String(port),
    ],
    { cwd: appDir, stdio: ['ignore', 'inherit', 'inherit'] }
  )
  child.on('exit', (code) => {
    console.error(`${appName} app exited with code ${code}`)
    process.exit(code ?? 1)
  })
  return child
}

function proxy(req, res, port) {
  const upstream = http.request(
    {
      host: '127.0.0.1',
      port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: req.headers.host },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers)
      upstreamRes.pipe(res)
    }
  )
  upstream.on('error', (err) => {
    console.error(`proxy to ${port} failed:`, err.message)
    res.statusCode = 502
    res.end('bad gateway')
  })
  req.pipe(upstream)
}

function routeTarget(url) {
  if (url.startsWith('/rc-component') || url.startsWith('/rc-assets')) {
    return 'remote-pkg'
  }
  return 'host-pkg'
}

;(async () => {
  const dev = process.env.NODE_ENV !== 'production'
  const parsedPort = Number(process.env.PORT)
  const publicPort = !isNaN(parsedPort) ? parsedPort : 3000

  const ports = {}
  for (const appName of ['host-pkg', 'remote-pkg']) {
    ports[appName] = await getFreePort()
    startApp(appName, ports[appName], dev)
  }
  await Promise.all(Object.values(ports).map((port) => waitForServer(port)))

  const server = http.createServer((req, res) => {
    proxy(req, res, ports[routeTarget(req.url)])
  })

  // Forward WebSocket upgrades (HMR) to the owning app; the plain HTTP proxy
  // cannot tunnel these.
  server.on('upgrade', (req, socket, head) => {
    const port = ports[routeTarget(req.url)]
    const upstream = net.connect(port, '127.0.0.1', () => {
      upstream.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n` +
          Object.entries(req.headers)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n'
      )
      if (head && head.length) upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })

  server.listen(publicPort, () => {
    const actualPort = server.address().port
    console.log(` ▲ Next.js`)
    console.log(` - Local: http://localhost:${actualPort}`)
    console.log(`- Next mode: ${dev ? 'development' : process.env.NODE_ENV}`)
  })
})()
