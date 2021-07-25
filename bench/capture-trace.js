import { createServer } from 'http'
import { writeFileSync } from 'fs'

const PORT = 9411
const HOST = '0.0.0.0'

const traces = []

const onReady = () => console.log(`Listening on http://${HOST}:${PORT}`)
const onRequest = async (req, res) => {
  if (
    req.method !== 'POST' ||
    req.url !== '/api/v2/spans' ||
    (req.headers && req.headers['content-type']) !== 'application/json'
  ) {
    res.writeHead(200)
    return res.end()
  }

  try {
    const body = JSON.parse(await getBody(req))
    for (const traceEvent of body) {
      traces.push(traceEvent)
    }
    res.writeHead(200)
  } catch (err) {
    console.warn(err)
    res.writeHead(500)
  }

  res.end()
}

const getBody = (req) =>
  new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      if (!req.complete) {
        return reject('Connection terminated before body was received.')
      }
      resolve(data)
    })
    req.on('aborted', () => reject('Connection aborted.'))
    req.on('error', () => reject('Connection error.'))
  })

const main = () => {
  const args = process.argv.slice(2)
  const outFile = args[0] || `./trace-${Date.now()}.json`

  process.on('SIGINT', () => {
    console.log(`\nSaving to ${outFile}...`)
    writeFileSync(outFile, JSON.stringify(traces, null, 2))
    process.exit()
  })

  const server = createServer(onRequest)
  server.listen(PORT, HOST, onReady)
}

if (require.main === module) {
  main()
}
