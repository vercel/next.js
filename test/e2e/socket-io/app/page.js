'use client'

import { useEffect, useState } from 'react'
import io from 'socket.io-client'

let socket

export default function Home() {
  const [connected, setConnected] = useState(false)
  const [value, setValue] = useState('')

  const socketInitializer = async () => {
    // We call this just to make sure we turn on the websocket server
    await fetch('/api/socket')

    socket = io(undefined, {
      path: '/api/my_awesome_socket',
    })

    socket.on('connect', () => {
      console.log('Connected', socket.id)
    })

    socket.on('newIncomingMessage', (msg) => {
      setValue(msg)
    })
  }

  const sendMessageHandler = async (e) => {
    if (!socket) {
      console.error('No socket connection yet for message')
      return
    }
    const value = e.target.value

    setValue(value)
    socket.emit('createdMessage', value)
  }

  useEffect(() => {
    socketInitializer().then(() => {
      setConnected(true)
    })
  }, [])

  return (
    <>
      <span id="status">{connected ? 'Connected' : 'Disconnected'}</span>
      <input value={value} onChange={sendMessageHandler} />
    </>
  )
}
