import type { ReactElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { Writable } from 'node:stream'

export function renderToString(element: ReactElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk)
        callback()
      },
      final(callback) {
        resolve(Buffer.concat(chunks).toString('utf8'))
        callback()
      },
    })

    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(destination)
      },
      onShellError: reject,
    })
  })
}
