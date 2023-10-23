'use client'

import { useEffect, useState } from 'react'
import io from 'socket.io-client'

let socket

export default function Home() {
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
    if (!socket) return
    const value = e.target.value

    setValue(value)
    socket.emit('createdMessage', value)
  }

  useEffect(() => {
    socketInitializer()
  }, [])

  return <input value={value} onChange={sendMessageHandler} />
}
