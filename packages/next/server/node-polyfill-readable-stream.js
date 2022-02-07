import { TransformStream } from 'next/dist/compiled/web-streams-polyfill'
import { ReadableStream } from './web/sandbox/readable-stream'

// Polyfill ReadableStream in the Node.js environment
if (!global.TransformStream) {
  global.TransformStream = TransformStream
}
if (!global.ReadableStream) {
  global.ReadableStream = ReadableStream
}
