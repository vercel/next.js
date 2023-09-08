// @ts-ignore
import * as matchers from 'jest-extended'
import '@testing-library/jest-dom'
expect.extend(matchers)

// A default max-timeout of 90 seconds is allowed
// per test we should aim to bring this down though
jest.setTimeout((process.platform === 'win32' ? 180 : 120) * 1000)

// TODO: Remove when Node.js 16 is not supported anymore
globalThis.ReadableStream ??= require('stream/web').ReadableStream

// TODO: Remove when Node.js 16 is not supported anymore
if (!globalThis.fetch) {
  const undici = require('next/src/compiled/undici')
  globalThis.fetch = undici.fetch
  globalThis.Request = undici.Request
  globalThis.Response = undici.Response
  globalThis.Headers = undici.Headers
}
