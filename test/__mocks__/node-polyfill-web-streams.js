const Primitives =
  require('next/dist/compiled/@edge-runtime/primitives').default

const OriginWritableStreamWrite =
  Primitives.WritableStreamDefaultWriter.prototype.write

// Override writable stream write method to validate chunk type.
// Currently CF workers only allow to write the encoded chunk in Uint8Array format.
Primitives.WritableStreamDefaultWriter.prototype.write = function (chunk) {
  if (!(chunk instanceof Uint8Array)) {
    throw new Error('Writing non-Uint8Array chunks in a stream is not allowed.')
  }
  return OriginWritableStreamWrite.call(this, chunk)
}

global.ReadableStream = Primitives.ReadableStream
global.TransformStream = Primitives.TransformStream
