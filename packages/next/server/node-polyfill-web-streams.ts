// @ts-nocheck

import {
  ReadableStream,
  TransformStream,
} from 'next/dist/compiled/web-streams-polyfill'

// Polyfill Web Streams for the Node.js runtime.
global.ReadableStream = ReadableStream
global.TransformStream = TransformStream

export { ReadableStream, TransformStream }
