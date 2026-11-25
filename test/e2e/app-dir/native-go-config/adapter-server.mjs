import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
require('next/dist/server/node-environment')
const { routes } = JSON.parse(await readFile('go-config-output.json', 'utf8'))

createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const output = routes.find(
      (route) => route.runtime === 'nodejs' && route.pathname === pathname
    )
    if (!output) {
      res.statusCode = 404
      res.end('Not found')
      return
    }
    await require(output.filePath).handler(req, res, {})
  } catch (error) {
    console.error(error)
    res.statusCode = 500
    res.end('Adapter handler failed')
  }
}).listen(Number(process.env.PORT), '127.0.0.1')
