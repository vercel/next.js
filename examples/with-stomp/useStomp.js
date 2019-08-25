import { useState, useEffect } from 'react'
import { Stomp } from '@stomp/stompjs'

const useStomp = (url, topic, headers = {}) => {
  const [message, setMessage] = useState({})
  // connect to a stomp server over Websocket
  const client = Stomp.client(url)

  // subscribe to a channel, then listen to the messages.
  const subscribe = () => {
    client.connect(headers, () => {
      client.subscribe(topic, msg => {
        const change = JSON.parse(msg.body)
        setMessage(change)
      })
    })
  }

  // unsubscribe on unmount
  const unSubscribe = () => {
    client.disconnect()
  }

  useEffect(() => {
    subscribe()
    return unSubscribe
  }, 0)

  return message
}

export default useStomp
