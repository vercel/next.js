import { useState, useEffect } from 'react'
import useClient from './useClient'

const useStomp = topic => {
  const [message, setMessage] = useState({})
  const client = useClient()

  // subscribe to a channel, then listen to the messages.
  const subscribe = () => {
    client.subscribe(topic, msg => {
      const change = JSON.parse(msg.body)
      setMessage(change)
    })
  }

  // unsubscribe on unmount
  const unSubscribe = () => {
    client.unsubscribe()
  }

  useEffect(() => {
    subscribe()
    return unSubscribe
  }, [])

  return message
}

export default useStomp
