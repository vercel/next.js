#!/usr/bin/env node
// The content API the fixture's build fetches from: `lib/content.mjs` as
// JSON over HTTP. Deterministic: the same path always gets the same bytes,
// and the response carries no `Date` header.
//
//   node data-server.mjs
//
//   BENCH_DATA_PORT        port on 127.0.0.1 (default 4010)
//   BENCH_DATA_LATENCY_MS  fixed delay before every response (default 0)
//
// The content knobs of next.config.js (BENCH_NAV_LINKS, BENCH_ARTICLE_KB,
// ...) are read here, where the content is produced.
import http from 'node:http'
import { handle } from './lib/content.mjs'

const port = Number(process.env.BENCH_DATA_PORT) || 4010
const latency = Number(process.env.BENCH_DATA_LATENCY_MS) || 0
let requests = 0

const server = http.createServer((req, res) => {
  res.sendDate = false
  if (req.url === '/__stats') {
    res.end(JSON.stringify({ requests }))
    return
  }
  requests++
  let status = 200
  let body
  try {
    body = JSON.stringify(handle(req.url))
  } catch (e) {
    status = 404
    body = JSON.stringify({ error: String(e.message) })
  }
  const send = () => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  }
  if (latency > 0) setTimeout(send, latency)
  else send()
})
server.keepAliveTimeout = 60_000
server.listen(port, '127.0.0.1', () => {
  console.log(`data server on http://127.0.0.1:${port} (latency ${latency} ms)`)
})
