import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import handler from 'serve-handler'

export function createExportServer(outDir, requests) {
  return createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost')
    requests.push(pathname)

    if (pathname === '/target' || pathname === '/target/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      createReadStream(join(outDir, 'target/index.html')).pipe(response)
      return
    }

    return handler(request, response, { public: outDir })
  })
}
