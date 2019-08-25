import React, { useEffect, useState } from 'react'
import { Stomp } from '@stomp/stompjs'

const withStomp = (url, topic, headers = {}) => WrappedComponent => {
  return props => {
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
    }, [])

    const newProps = {
      ...props,
      message
    }

    return <WrappedComponent {...newProps} />
  }
}

export default withStomp
