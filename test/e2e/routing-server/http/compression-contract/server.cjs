const http = require('node:http')
const next = require('next')
const compression = require('compression')
const app = next({
  dev: process.env.NODE_ENV === 'development',
  hostname: 'localhost',
  port: Number(process.env.PORT),
})
const compress = compression()
app.prepare().then(() => {
  const handle = app.getRequestHandler()
  http
    .createServer((request, response) => {
      compress(request, response, () => handle(request, response))
    })
    .listen(Number(process.env.PORT), () => {
      console.log('- Local: http://localhost:' + process.env.PORT)
      console.log('Compression contract ready')
    })
})
