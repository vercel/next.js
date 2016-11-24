const { createServer } = require('http')
const next = require('next')

const app = next('.', { dev: true })
const handle = app.getRequestHandler()

app.prepare()
.then(() => {
  createServer(handle)
  .listen(3000, (err) => {
    if (err) throw err
    console.log('> Ready on http://localhost:3000')
  })
})
