/**
 * By default, this file exports the methods from streams-utils.edge since all of those are based on Node.js web streams.
 * This file will then be an incremental re-implementation of all of those methods into Node.js only versions (based on proper Node.js Streams).
 */

import { PassThrough, type Readable, Writable } from 'node:stream'
import type { Options as RenderToPipeableStreamOptions } from 'react-dom/server.node'
import { StringDecoder } from 'node:string_decoder'

export * from './stream-utils.edge'

export async function renderToInitialFizzStream({
  element,
  streamOptions,
}: {
  element: React.ReactElement
  streamOptions?: RenderToPipeableStreamOptions
}): Promise<Readable> {
  const ReactDOMServer =
    require('react-dom/server.node') as typeof import('react-dom/server.node')
  return new Promise((resolve, reject) => {
    const { pipe } = ReactDOMServer.renderToPipeableStream(element, {
      ...streamOptions,
      onShellReady() {
        const passThrough = new PassThrough()
        pipe(passThrough)
        resolve(passThrough)
      },
      onShellError(error) {
        reject(error)
      },
    })
  })
}

export async function renderToString(
  element: React.ReactElement
): Promise<string> {
  const ReactDOMServer =
    require('react-dom/server.node') as typeof import('react-dom/server.node')

  return new Promise((resolve, reject) => {
    const { pipe } = ReactDOMServer.renderToPipeableStream(element, {
      onShellReady() {
        let data = ''
        let decoder = new StringDecoder()
        pipe(
          new Writable({
            write(chunk, _, cb) {
              data += decoder.write(chunk)
              cb()
            },
            final(cb) {
              data += decoder.end()
              resolve(data)
              cb()
            },
          })
        )
      },
      onShellError(error) {
        reject(error)
      },
    })
  })
}

export async function streamToString(stream: Readable) {
  const decoder = new StringDecoder()
  let string = ''

  for await (const chunk of stream) {
    string += decoder.write(chunk)
  }

  string += decoder.end()

  return string
}
