// Use CJS format for represent next/dist/compiled/node-polyfill-web-streams.js

const {
  WritableStreamDefaultWriter,
  ReadableStream,
  TransformStream,
} = require('next/dist/compiled/web-streams-polyfill')

const OriginWritableStreamWrite = WritableStreamDefaultWriter.prototype.write

// Override writable stream write method to validate chunk type.
// Currently CF workers only allow to write the encoded chunk in Uint8Array format.
WritableStreamDefaultWriter.prototype.write = function (chunk) {
  if (!(chunk instanceof Uint8Array)) {
    throw new Error('Writing non-Uint8Array chunks in a stream is not allowed.')
  }
  return OriginWritableStreamWrite.call(this, chunk)
}

global.ReadableStream = ReadableStream
global.TransformStream = TransformStream
