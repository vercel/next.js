/**
 * Newline-delimited JSON framing for the message pipe between the pool and a
 * worker spawned by the fork server. It has the same serialization semantics
 * as Node's default (`'json'`) IPC channel used for `child_process.fork()`
 * workers: `JSON.stringify` per message, one message per line. JSON escapes
 * newlines inside strings, so a raw newline always ends a message.
 */
import type { Socket } from 'net'

export function writeJsonLine(socket: Socket, message: unknown): void {
  socket.write(JSON.stringify(message) + '\n')
}

/**
 * Calls `onMessage` for every complete message read from `socket`. Chunks can
 * split messages (and multi-byte characters) anywhere, so partial data is
 * buffered until its newline arrives.
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
      onMessage(JSON.parse(line))
      start = end + 1
      end = chunk.indexOf('\n', start)
      if (end === -1) break
      line = chunk.slice(start, end)
    }
    buffered = chunk.slice(start)
  })
}
