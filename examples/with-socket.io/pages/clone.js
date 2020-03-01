import { useState } from 'react'
import Link from 'next/link'
import fetch from 'isomorphic-unfetch'
import useSocket from '../hooks/useSocket'

export default function ChatOne(props) {
  const [field, setField] = useState('')
  const [newMessage, setNewMessage] = useState(0)
  const [messages, setMessages] = useState(props.messages || [])

  const socket = useSocket('message.chat2', message => {
    setMessages(messages => [...messages, message])
  })

  useSocket('message.chat1', () => {
    setNewMessage(newMessage => newMessage + 1)
  })

  const handleSubmit = event => {
    event.preventDefault()

    // create message object
    const message = {
      id: new Date().getTime(),
      value: field,
    }

    // send object to WS server
    socket.emit('message.chat2', message)
    setField('')
    setMessages(messages => [...messages, message])
  }

  return (
    <main>
      <div>
        <Link href="/">
          <a>
            {`Chat One${
              newMessage > 0 ? ` ( ${newMessage} new message )` : ''
            }`}
          </a>
        </Link>
        <br />
        <Link href="/clone">
          <a>Chat Two</a>
        </Link>
        <ul>
          {messages.map(message => (
            <li key={message.id}>{message.value}</li>
          ))}
        </ul>
        <form onSubmit={handleSubmit}>
          <input
            onChange={e => setField(e.target.value)}
            type="text"
            placeholder="Hello world!"
            value={field}
          />
          <button>Send</button>
        </form>
      </div>
    </main>
  )
}

ChatOne.getInitialProps = async () => {
  const response = await fetch('http://localhost:3000/messages/chat2')
  const messages = await response.json()

  return { messages }
}
