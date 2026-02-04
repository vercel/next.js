// Unsupported in edge
import { Writable } from 'stream'
import path from 'path'
import crypto from 'crypto'
import vm from 'vm'
import constants from 'constants'
import domain from 'domain'
import http from 'http'
import https from 'https'
import os from 'os'
// TODO: These are accidentally polyfilled in edge runtime currently.
// import punycode from 'punycode'
// import process from 'process'
// import querystring from 'querystring'
// import stringDecoder from 'string_decoder'
import sys from 'sys'
import timers from 'timers'
import tty from 'tty'
import zlib from 'zlib'
import 'setimmediate'
// Supported in edge
import { Buffer } from 'buffer'
import assert from 'assert'
import util from 'util'
import { EventEmitter } from 'events'

// Other imports
import { NextResponse } from 'next/server'

export default async function middleware(request) {
  if (request.nextUrl.pathname !== '/middleware-test') {
    return
  }
  const response = NextResponse.next()

  let emitted = false
  class MyEmitter extends EventEmitter {}
  const myEmitter = new MyEmitter()
  // Only do this once so we don't loop forever
  myEmitter.once('myEvent', (_event, _listener) => {
    emitted = true
  })
  myEmitter.emit('myEvent')

  assert.ok(emitted)
  assert.ok(!!util.promisify)
  assert.ok(true)

  const supportedResult = {
    assert: true,
    buffer: Buffer.from('hello world').toString('utf8'),
    eventEmitter: true,
    util: true,
  }

  response.headers.set('supported-result', JSON.stringify(supportedResult))

  // TODO: These are accidentally polyfilled in edge runtime currently.
  // assert.throws(() => {
  //   console.log(punycode)
  // })
  // assert.throws(() => {
  //   console.log(process.title)
  // })
  // assert.throws(() => {
  //   console.log(querystring)
  // })
  // assert.throws(() => {
  //   console.log(stringDecoder)
  // })

  assert.throws(() => {
    console.log(domain)
  })
  assert.throws(() => {
    console.log(http)
  })
  assert.throws(() => {
    console.log(https)
  })
  assert.throws(() => {
    console.log(zlib.Gzip)
  })
  assert.throws(() => {
    console.log(constants.E2BIG)
  })
  assert.throws(() => {
    console.log(crypto.createHash)
  })
  assert.throws(() => {
    console.log(os.hostname)
  })
  assert.throws(() => {
    console.log(path.join)
  })
  assert.throws(() => {
    console.log(vm)
  })
  assert.throws(() => {
    console.log(tty.isatty)
  })
  assert.throws(() => {
    console.log(timers.clearImmediate)
  })
  assert.throws(() => {
    console.log(Writable)
  })
  assert.throws(() => {
    console.log(sys)
  })

  const unsupportedResult = {
    // TODO: these are accidentally polyfilled in edge runtime currently.
    // punycode: false,
    // process: false,
    // querystring: false,
    // stringDecoder: false,

    domain: false,
    http: false,
    https: false,
    zlib: false,
    constants: false,
    crypto: false,
    os: false,
    path: false,

    vm: false,
    tty: false,
    timers: false,
    stream: false,
  }

  response.headers.set('unsupported-result', JSON.stringify(unsupportedResult))

  return response
}
