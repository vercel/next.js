import { useEffect } from 'react'
import { logQueue } from '../forward-logs'
import type { useWebsocket } from '../../../../client/dev/hot-reloader/app/use-websocket'

export const useForwardConsoleLog = (
  socketRef: ReturnType<typeof useWebsocket>
) => {
  useEffect(() => {
    const socket = socketRef.current
    if (!socket) {
      return
    }

    const onOpen = () => {
      logQueue.onSocketReady(socket)
    }
    socket.addEventListener('open', onOpen)

    return () => {
      socket.removeEventListener('open', onOpen)
    }
  }, [socketRef])
}
