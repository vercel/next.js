const http = require('http')
const { parse } = require('url')
const next = require('next')
const getPort = require('get-port')

// Every chunk passed to `res.write` and `res.end`, per request.
const requests = []

function chunkType(chunk) {
  if (Buffer.isBuffer(chunk)) return 'buffer'
  if (chunk instanceof Uint8Array) return 'uint8array'
  return typeof chunk
}

async function main() {
  const dev = process.env.NEXT_TEST_MODE === 'dev'
  process.env.NODE_ENV = dev ? 'development' : 'production'

  const port = await getPort()

  const app = next({ dev, port })
  const handle = app.getRequestHandler()

  await app.prepare()

  const server = http.createServer(async (req, res) => {
    const parsedUrl = parse(req.url, true)
    if (parsedUrl.pathname === '/__requests') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(requests))
      return
    }

    const entry = { url: req.url, rsc: req.headers.rsc, chunks: [] }
    requests.push(entry)
    for (const method of ['write', 'end']) {
      const original = res[method]
      res[method] = function (chunk, ...rest) {
        if (chunk != null) {
          entry.chunks.push(chunkType(chunk))
        }
        return original.call(this, chunk, ...rest)
      }
    }
    res.once('finish', () => {
      entry.status = res.statusCode
    })

    try {
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error occurred handling', req.url, err)
      res.statusCode = 500
      res.end('internal server error')
    }
  })

  server.once('error', (err) => {
    console.error(err)
    process.exit(1)
  })

  server.listen(port, () => {
    console.log(`- Local: http://localhost:${port}`)
    console.log(`- Next mode: ${process.env.NODE_ENV}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
