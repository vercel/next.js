/* eslint-disable no-undef */
import { NextResponse } from 'next/server'

export default function middleware({ nextUrl: { pathname } }) {
  let handle
  if (pathname === '/Buffer') {
    Buffer.from('')
  }
  if (pathname === '/setImmediate') {
    handle = setImmediate(() => {})
  }
  if (pathname === '/clearImmediate') {
    clearImmediate(handle)
  }
  if (pathname === '/process.cwd') {
    console.log(process.cwd())
  }
  if (pathname === '/process.getuid') {
    console.log(process.getuid())
  }
  if (pathname === '/BroadcastChannel') {
    new BroadcastChannel()
  }
  if (pathname === '/ByteLengthQueuingStrategy') {
    new ByteLengthQueuingStrategy()
  }
  if (pathname === '/CompressionStream') {
    new CompressionStream()
  }
  if (pathname === '/CountQueuingStrategy') {
    new CountQueuingStrategy()
  }
  if (pathname === '/DecompressionStream') {
    new DecompressionStream()
  }
  if (pathname === '/DomException') {
    new DomException()
  }
  if (pathname === '/MessageChannel') {
    new MessageChannel()
  }
  if (pathname === '/MessageEvent') {
    new MessageEvent()
  }
  if (pathname === '/MessagePort') {
    new MessagePort()
  }
  if (pathname === '/ReadableByteStreamController') {
    new ReadableByteStreamController()
  }
  if (pathname === '/ReadableStreamBYOBRequest') {
    new ReadableStreamBYOBRequest()
  }
  if (pathname === '/ReadableStreamDefaultController') {
    new ReadableStreamDefaultController()
  }
  if (pathname === '/TextDecoderStream') {
    new TextDecoderStream()
  }
  if (pathname === '/TextEncoderStream') {
    new TextEncoderStream()
  }
  if (pathname === '/TransformStreamDefaultController') {
    new TransformStreamDefaultController()
  }
  if (pathname === '/WritableStreamDefaultController') {
    new WritableStreamDefaultController()
  }
  return NextResponse.next()
}
