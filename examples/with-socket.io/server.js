const app = require('express')()
const server = require('http').Server(app)
const io = require('socket.io')(server)
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const nextApp = next({ dev })
const nextHandler = nextApp.getRequestHandler()

// fake DB
const messages = {
  chat1: [],
  chat2: []
}

// socket.io server
io.on('connection', socket => {
  socket.on('message.chat1', (data) => {
    messages['chat1'].push(data)
    socket.broadcast.emit('message.chat1', data)
  })
  socket.on('message.chat2', (data) => {
    messages['chat2'].push(data)
    socket.broadcast.emit('message.chat2', data)
  })
})

nextApp.prepare().then(() => {
  app.get('/messages/:chat', (req, res) => {
    res.json(messages[req.params.chat])
  })

  app.get('*', (req, res) => {
    return nextHandler(req, res)
  })

  server.listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
