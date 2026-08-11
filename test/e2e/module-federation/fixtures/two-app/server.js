const http = require('http')
const net = require('net')
const path = require('path')
const { spawn } = require('child_process')

function findPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function startNextApp(appName, port, publicPort, dev) {
  const nextBin = require.resolve('next/dist/bin/next')
  const args = [
    nextBin,
    dev ? 'dev' : 'start',
    path.join(__dirname, 'apps', appName),
    '-p',
    String(port),
    '--hostname',
    '127.0.0.1',
  ]
  if (dev) args.push('--turbopack')

  const child = spawn(process.execPath, args, {
    env: { ...process.env, MF_PROXY_PORT: String(publicPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return new Promise((resolve, reject) => {
    let output = ''
    const handleOutput = (chunk) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(
        `[${appName}] ${text.replaceAll('- Local:', '- Child local:')}`
      )
      if (/Ready in/i.test(output)) resolve(child)
    }

    child.stdout.on('data', handleOutput)
    child.stderr.on('data', handleOutput)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      reject(
        new Error(
          `${appName} exited before becoming ready (${code ?? signal})\n${output}`
        )
      )
    })
  })
}

async function main() {
  const dev = process.env.NODE_ENV !== 'production'
  const publicPort = Number(process.env.PORT) || 3000
  const [remotePort, hostPort] = await Promise.all([findPort(), findPort()])
  const remote = await startNextApp('remote', remotePort, publicPort, dev)
  const host = await startNextApp('host', hostPort, publicPort, dev)
  const ports = { remote: remotePort, host: hostPort }

  function requestPath(request) {
    const url = new URL(request.url, 'http://localhost')
    return `${url.pathname}${url.search}`
  }

  function appForRequest(request) {
    return requestPath(request).startsWith('/remote') ? 'remote' : 'host'
  }

  const server = http.createServer((request, response) => {
    const proxy = http.request(
      {
        hostname: '127.0.0.1',
        port: ports[appForRequest(request)],
        method: request.method,
        path: requestPath(request),
        headers: request.headers,
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode, proxyResponse.headers)
        proxyResponse.pipe(response)
      }
    )
    proxy.on('error', (error) => {
      console.error(error)
      response.statusCode = 502
      response.end('bad gateway')
    })
    request.pipe(proxy)
  })

  server.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(
      ports[appForRequest(request)],
      '127.0.0.1',
      () => {
        const headers = []
        for (let index = 0; index < request.rawHeaders.length; index += 2) {
          headers.push(
            `${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`
          )
        }
        upstream.write(
          `${request.method} ${requestPath(request)} HTTP/${request.httpVersion}\r\n${headers.join('\r\n')}\r\n\r\n`
        )
        if (head.length) upstream.write(head)
        socket.pipe(upstream).pipe(socket)
      }
    )
    upstream.on('error', () => socket.destroy())
  })

  server.listen(publicPort, () => {
    console.log(`- Local: http://localhost:${publicPort}`)
    console.log(`Next mode: ${dev ? 'development' : 'production'}`)
  })

  function stopChildren() {
    remote.kill()
    host.kill()
  }
  process.once('SIGINT', stopChildren)
  process.once('SIGTERM', stopChildren)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
