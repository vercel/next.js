import { ReadableStream } from './web/sandbox/readable-stream'

// Polyfill ReadableStream in the Node.js environment
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream
}
