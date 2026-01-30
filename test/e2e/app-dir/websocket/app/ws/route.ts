import { NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const GET = async () => {
  const [socket, response] = NextResponse.upgrade()

  // Get the middleware header if present
  const headersList = await headers()
  const middlewareHeader = headersList.get('x-middleware-test')

  socket.accept()
  // Send the middleware header value if present, otherwise just WELCOME
  socket.send(middlewareHeader ? `WELCOME:${middlewareHeader}` : 'WELCOME')

  const interval = setInterval(() => {
    if (socket.readyState === socket.OPEN) {
      socket.send('KEEP ALIVE')
    }
  }, 3000)

  socket.onmessage = (event) => {
    socket.send('ECHO: ' + event.data)
  }

  socket.onclose = () => {
    clearInterval(interval)
  }

  return response
}
