import { useState, useEffect, useCallback } from 'react'
import useClient from './useClient'

const useStomp = (topic) => {
  const [message, setMessage] = useState({})
  const client = useClient()

  // subscribe to a channel, then listen to the messages.
  const subscribe = useCallback(() => {
    client.subscribe(topic, (msg) => {
      const change = JSON.parse(msg.body)
      setMessage(change)
    })
  }, [client, topic])

  // unsubscribe on unmount
  const unSubscribe = useCallback(() => {
    client.unsubscribe()
  }, [client])

  useEffect(() => {
    subscribe()
    return unSubscribe
  }, [subscribe, unSubscribe])

  return message
}

export default useStomp
