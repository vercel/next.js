import { useEffect } from 'react'
import { isTerminalLoggingEnabled, logQueue } from '../forward-logs'
import type { useWebSocket } from '../../../../client/dev/hot-reloader/app/web-socket'

export const useForwardConsoleLog = (
  socketRef: ReturnType<typeof useWebSocket>
) => {
  useEffect(() => {
    if (!isTerminalLoggingEnabled) {
      return
    }
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
