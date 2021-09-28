// import { parentPort } from 'worker_threads'
import { Writable } from 'stream'
import { pipeToNodeWritable } from 'react-server-dom-webpack/writer.node.server'

import { loadComponents } from './load-components'

export async function render(
  distDir: string,
  pathname: string,
  query: any
): Promise<string> {
  const { Component, reactFlightManifest } = await loadComponents(
    distDir,
    pathname,
    false,
    true
  )

  let res = ''
  let resolve: (s: string) => void
  const p = new Promise<string>((r) => (resolve = r))

  const writable = new Writable({
    writev(chunks, callback) {
      // TODO: post chunk.buffer as message to parent
      for (let { chunk } of chunks) {
        res += chunk.toString()
      }
      callback()
    },
    final() {
      resolve(res)
    },
  })

  pipeToNodeWritable((Component as any)(), writable, reactFlightManifest)
  return p
}
