/**
 * The main process's end of the message pipe to a worker spawned by the fork
 * server. The worker uses Node's regular IPC channel on that pipe, so this
 * speaks its wire format for the default (`'json'`) serialization:
 * `JSON.stringify` per message, one message per line. JSON escapes newlines
 * inside strings, so a raw newline always ends a message.
 */
import type { Socket } from 'net'

export function writeJsonLine(socket: Socket, message: unknown): void {
  socket.write(JSON.stringify(message) + '\n')
}

/**
 * Calls `onMessage` for every complete message read from `socket`. Chunks can
 * split messages (and multi-byte characters) anywhere, so partial data is
 * buffered until its newline arrives. A line that isn't valid JSON means the
 * other side is broken: the socket is destroyed instead of throwing from the
 * data handler.
 */
export function readJsonLines(
  socket: Socket,
  onMessage: (message: unknown) => void
): void {
  let buffered = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    let start = 0
    let end = chunk.indexOf('\n')
    if (end === -1) {
      buffered += chunk
      return
    }
    let line = buffered + chunk.slice(0, end)
    buffered = ''
    for (;;) {
      let message: unknown
      try {
        message = JSON.parse(line)
      } catch (error) {
        socket.destroy(error as Error)
        return
      }
      onMessage(message)
      start = end + 1
      end = chunk.indexOf('\n', start)
      if (end === -1) break
      line = chunk.slice(start, end)
    }
    buffered = chunk.slice(start)
  })
}
