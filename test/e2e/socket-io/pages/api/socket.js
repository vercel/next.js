import { Server } from 'socket.io'

function onSocketConnection(io, socket) {
  const createdMessage = (msg) => {
    socket.broadcast.emit('newIncomingMessage', msg)
  }

  socket.on('createdMessage', createdMessage)
}

export default function handler(req, res) {
  if (!res.socket.server.customUpgradeHandler) {
    const customUpgradeHandler = (request, socket) => {
      if (
        request.url === '/custom-upgrade' &&
        request.headers.upgrade === 'h2c'
      ) {
        socket.end(
          'HTTP/1.1 101 Switching Protocols\r\n' +
            'Connection: Upgrade\r\n' +
            'Upgrade: h2c\r\n' +
            '\r\n'
        )
      }
    }
    res.socket.server.customUpgradeHandler = customUpgradeHandler
    res.socket.server.on('upgrade', customUpgradeHandler)
  }

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
