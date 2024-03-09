import { Server } from 'socket.io'

function onSocketConnection(io, socket) {
  const createdMessage = (msg) => {
    socket.broadcast.emit('newIncomingMessage', msg)
  }

  socket.on('createdMessage', createdMessage)
}

export default function handler(req, res) {
  if (res.socket.server.io) {
    res.end()
    return
  }

  const io = new Server(res.socket.server, {
    path: '/api/my_awesome_socket',
  })
  res.socket.server.io = io

  const onConnection = (socket) => {
    onSocketConnection(io, socket)
  }

  io.on('connection', onConnection)

  res.end()
}
