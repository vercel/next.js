import next from 'next'
import http from 'http'

const dir = __dirname
const port = process.env.PORT || 3000
const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev, dir })
const handleNextRequests = app.getRequestHandler()

app.prepare().then(() => {
  const server = new http.Server((req, res) => {
    handleNextRequests(req, res)
  })

  server.listen(port)
})
