// node server.mjs <http|framed> <tcp|unix> <socketPath|-> <bodySize>
//
// Prints "READY <addr>", and "STATS <requests> <cpu_us>" when stdin closes.
// In unix mode the HTTP server is fed the way front-server.ts's
// listenOnPrivateSocket does it: a net.Server on the socket emits each
// connection on the HTTP server, which also listens on loopback TCP.
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import { body, responseHeaders } from './shape.mjs'
import { decodeRequestHead, encodeResponse, frameReader } from './frame.mjs'

const [proto, network, socketPath, sizeArg] = process.argv.slice(2)
const payload = body(Number(sizeArg))

let requests = 0
let cpuStart = process.cpuUsage()
const reset = () => {
  requests = 0
  cpuStart = process.cpuUsage()
}

process.stdin.on('data', () => {})
process.stdin.on('end', () => {
  const cpu = process.cpuUsage(cpuStart)
  process.stdout.write(`STATS ${requests} ${cpu.user + cpu.system}\n`)
  process.exit(0)
})

function ready(addr) {
  process.stdout.write(`READY ${addr}\n`)
}

function listenNet(server) {
  if (network === 'unix') {
    try {
      fs.rmSync(socketPath, { force: true })
    } catch {}
    server.listen(socketPath, () => ready(socketPath))
  } else {
    server.listen(0, '127.0.0.1', () =>
      ready(`127.0.0.1:${server.address().port}`)
    )
  }
}

if (proto === 'http') {
  const headers = Object.fromEntries(responseHeaders)
  headers['content-length'] = String(payload.length)
  const server = http.createServer((req, res) => {
    if (req.url === '/__reset') {
      reset()
      res.end()
      return
    }
    requests++
    req.resume()
    res.writeHead(200, headers)
    res.end(payload)
  })
  if (network === 'unix') {
    server.listen(0, '127.0.0.1', () => {
      const socketServer = net.createServer((socket) =>
        server.emit('connection', socket)
      )
      listenNet(socketServer)
    })
  } else {
    listenNet(server)
  }
} else {
  const server = net.createServer((socket) => {
    socket.setNoDelay(true)
    let target = ''
    socket.on(
      'data',
      frameReader(
        (head) => {
          target = decodeRequestHead(head).target
        },
        () => {},
        () => {
          if (target === '/__reset') reset()
          else requests++
          socket.write(encodeResponse(200, responseHeaders, payload))
        }
      )
    )
  })
  listenNet(server)
}
