import { Writable } from 'stream'
import path from 'path'
import crypto from 'crypto'
import { Buffer } from 'buffer'
import vm from 'vm'
import assert from 'assert'
import constants from 'constants'
import { useEffect, useState } from 'react'
import domain from 'domain'
import http from 'http'
import https from 'https'
import os from 'os'
import punycode from 'punycode'
import process from 'process'
import querystring from 'querystring'
import stringDecoder from 'string_decoder'
import sys from 'sys'
import timers from 'timers'
import tty from 'tty'
import util from 'util'
import zlib from 'zlib'
import 'setimmediate'

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

    assert.ok(true)

    assert.ok(!!domain)
    assert.ok(!!http)
    assert.ok(!!https)
    assert.ok(!!punycode)
    assert.ok(!!stringDecoder)
    assert.ok(!!sys.debuglog)
    assert.ok(!!timers.setInterval)
    assert.ok(!!tty.ReadStream)
    assert.ok(!!util.inspect)
    assert.ok(!!zlib.Gzip)

    setImmediate(() => {
      setState({
        assert: true,
        buffer: Buffer.from('hello world').toString('utf8'),
        constants: constants.E2BIG,
        hash: crypto.createHash('sha256').update('hello world').digest('hex'),
        domain: true,
        os: os.EOL,
        path: path.join('/hello/world', 'test.txt'),
        process: process.title,
        querystring: querystring.stringify({ a: 'b' }),
        stream: closedStream,
        stringDecoder: true,
        sys: true,
        timers: true,
        tty: true,
        util: true,
        http: true,
        https: true,
        vm: vm.runInNewContext('a + 5', { a: 100 }),
        zlib: true,
      })
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
