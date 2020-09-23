import { Writable } from 'stream'
import path from 'path'
import crypto from 'crypto'
import { Buffer } from 'buffer'
import vm from 'vm'
import { useEffect, useState } from 'react'

export default function NodeBrowserPolyfillPage() {
  const [state, setState] = useState({})
  useEffect(() => {
    let closedStream = false

    const writable = new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    })

    writable.on('finish', () => {
      closedStream = true
    })

    writable.end()

    setState({
      path: path.join('/hello/world', 'test.txt'),
      hash: crypto.createHash('sha256').update('hello world').digest('hex'),
      buffer: Buffer.from('hello world').toString('utf8'),
      vm: vm.runInNewContext('a + 5', { a: 100 }),
      stream: closedStream,
    })
  }, [])

  useEffect(() => {
    if (state.vm) {
      window.didRender = true
    }
  }, [state])

  return (
    <>
      <div
        id="node-browser-polyfills"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(state) }}
      ></div>
    </>
  )
}
