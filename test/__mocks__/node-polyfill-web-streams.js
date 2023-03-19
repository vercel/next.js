const {
  ReadableStream,
  TransformStream,
  WritableStreamDefaultWriter,
} = require('next/dist/compiled/@edge-runtime/primitives/streams')

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
