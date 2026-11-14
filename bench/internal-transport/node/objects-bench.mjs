// What it costs Node to build the request/response objects Next.js needs,
// without parsing HTTP: an IncomingMessage filled from already-split headers,
// and a ServerResponse writing to a socket that discards its bytes.
import http from 'node:http'
import { Duplex } from 'node:stream'
import {
  requestHeaders,
  requestTarget,
  responseHeaders,
  body,
} from './shape.mjs'
const payload = body(13)
const rh = Object.fromEntries(responseHeaders)
rh['content-length'] = '13'
const raw = requestHeaders.flat()
const sink = new Duplex({
  write(c, e, cb) {
    cb()
  },
  read() {},
})
const N = 300000
function once() {
  const req = new http.IncomingMessage(sink)
  req.method = 'GET'
  req.url = requestTarget
  req.httpVersionMajor = 1
  req.httpVersionMinor = 1
  req.httpVersion = '1.1'
  req.rawHeaders = raw
  const h = {}
  for (let i = 0; i < raw.length; i += 2) h[raw[i]] = raw[i + 1]
  req.headers = h
  req.push(null)
  const res = new http.ServerResponse(req)
  res.assignSocket(sink)
  res.writeHead(200, rh)
  res.end(payload)
  res.detachSocket(sink)
}
for (let i = 0; i < 50000; i++) once()
const c0 = process.cpuUsage()
const t0 = performance.now()
for (let i = 0; i < N; i++) once()
const c = process.cpuUsage(c0)
console.log(
  JSON.stringify({
    us_per_req_cpu: (c.user + c.system) / N,
    us_per_req_wall: ((performance.now() - t0) * 1000) / N,
  })
)
