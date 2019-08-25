import { useState, useEffect } from 'react'
import { Stomp } from '@stomp/stompjs'

const useStomp = (stompClient, topic) => {
  const [message, setMessage] = useState({})

  // subscribe to a channel, then listen to the messages.
  const subscribe = () => {
    stompClient.subscribe(topic, msg => {
      const change = JSON.parse(msg.body)
      setMessage(change)
    })
  }

  // unsubscribe on unmount
  const unSubscribe = () => {
    stompClient.unsubscribe()
  }

  useEffect(() => {
    subscribe()
    return unSubscribe
  }, [])

  return message
}

export default useStomp
