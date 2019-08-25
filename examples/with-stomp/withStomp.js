import React, { useEffect, useState } from 'react'
import { Stomp } from '@stomp/stompjs'

const withStomp = topic => WrappedComponent => {
  return props => {
    const [message, setMessage] = useState({})
    const { stompClient } = props;
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

    const newProps = {
      ...props,
      message
    }

    return <WrappedComponent {...newProps} />
  }
}

export default withStomp
