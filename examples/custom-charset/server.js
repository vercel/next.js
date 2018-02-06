const express = require('express')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

let setCharset = (req, res, next) => {
  res.set({'Content-Type': 'text/html; charset=iso-8859-2'})
  next()
}

app.prepare()
.then(() => {
  const server = express()

  server.use(setCharset)

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
