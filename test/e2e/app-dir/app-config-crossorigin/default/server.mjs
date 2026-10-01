import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'

const outputDirectory = join(process.cwd(), 'out')

const server = createServer((request, response) => {
  let pathname = new URL(request.url, 'http://localhost').pathname

  if (pathname.endsWith('/')) {
    pathname += 'index.html'
  } else if (!extname(pathname)) {
    pathname += '.html'
  }

  const stream = createReadStream(
    join(outputDirectory, pathname.replace(/^\/+/, ''))
  )
  stream.on('error', () => {
    response.writeHead(404)
    response.end('Not found')
  })
  stream.pipe(response)
})

server.listen(Number(process.env.PORT), () => {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  console.log(`- Local: http://localhost:${port}`)
})
