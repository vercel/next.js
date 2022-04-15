// Use CJS format for represent next/dist/compiled/node-polyfill-web-streams.js

const {
  WritableStreamDefaultWriter,
  ReadableStream,
  TransformStream,
} = require('next/dist/compiled/web-streams-polyfill')

const OriginWritableStreamWrite = WritableStreamDefaultWriter.prototype.write

// Override writable stream write method to validate chunk type.
// Currently CF workers only allow to write the encoded chunk in Uint8Array format.
WritableStreamDefaultWriter.prototype.write = (chunk) => {
  if (!(chunk instanceof Uint8Array)) {
    throw new Error('Writing non Uint8Array chunk in streaming is not allowed')
  }
  OriginWritableStreamWrite(chunk)
}

global.ReadableStream = ReadableStream
global.TransformStream = TransformStream
