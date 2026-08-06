const next = require('next')
const express = require('express')

const getPort = require('get-port')

async function main() {
  const dev = process.env.NEXT_TEST_MODE === 'dev'
  process.env.NODE_ENV = dev ? 'development' : 'production'

  const port = await getPort()
  const app = next({ dev })
  const handleNextRequest = app.getRequestHandler()

  await app.prepare()

  const server = express()

  server.all('/:path', (req, res) => {
    handleNextRequest(req, res)
  })

  server.listen(port, (err) => {
    if (err) {
      throw err
    }

    console.log(`- Local: http://localhost:${port}`)
    console.log(`- Next mode: ${dev ? 'development' : process.env.NODE_ENV}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
