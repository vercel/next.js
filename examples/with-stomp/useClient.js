import React from 'react'
import { Stomp } from '@stomp/stompjs'

let stompClient

const useClient = () => {
  const [client, setClient] = React.useState(stompClient)

  React.useEffect(() => {
    if (!stompClient) {
      stompClient = Stomp.client(process.env.STOMP_SERVER)
    }
    if (!client) {
      setClient(stompClient)
    }
  }, [client])

  return client
}

export default useClient
