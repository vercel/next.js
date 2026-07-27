import { Writable } from 'node:stream'
import path from 'node:path'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import vm from 'node:vm'
import assert from 'node:assert'
import constants from 'node:constants'
import domain from 'node:domain'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import punycode from 'node:punycode'
import process from 'node:process'
import querystring from 'node:querystring'
import stringDecoder from 'node:string_decoder'
import sys from 'node:sys'
import timers from 'node:timers'
import tty from 'node:tty'
import util from 'node:util'
import zlib from 'node:zlib'

async function getData() {
  const result = await new Promise((resolve) => {
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
      resolve({
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
  })

  return result
}

export default async function NodeModules() {
  const result = await getData()
  return (
    <>
      <pre
        id="node-browser-polyfills"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(result, null, ' ') }}
      ></pre>
    </>
  )
}
