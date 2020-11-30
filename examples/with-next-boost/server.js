const CachedHandler = require('next-boost').default
const express = require('express')
const server = express()
const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const args = { dir: '.', dev }

async function main() {
  server.get('/hello', function (req, res) {
    res.send('hello world')
  })

  let handler
  if (dev) {
    const init = require('./init').default
    handler = await init(args)
  } else {
    const script = require.resolve('./init')
    const cached = await CachedHandler({ script, args })
    handler = cached.handler
  }
  server.get('*', handler)

  server.listen(port, (err) => {
    if (err) throw err
    console.log(
      `> Ready on http://localhost:${port}, dev ${dev ? 'on' : 'off'} `
    )
  })
}

main()
