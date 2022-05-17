/* eslint-disable no-undef */
import { NextResponse } from 'next/server'

export default function middleware({ nextUrl: { pathname } }) {
  let handle
  if (pathname === '/setImmediate') {
    handle = setImmediate(() => {})
  }
  if (pathname === '/clearImmediate') {
    clearImmediate(handle)
  }
  if (pathname === '/structuredClone') {
    structuredClone({})
  }
  if (pathname === '/queueMicrotask') {
    queueMicrotask(() => {})
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
  if (pathname === '/CryptoKey') {
    new CryptoKey()
  }
  if (pathname === '/DecompressionStream') {
    new DecompressionStream()
  }
  if (pathname === '/DomException') {
    new DomException()
  }
  if (pathname === '/Event') {
    new Event()
  }
  if (pathname === '/EventTarget') {
    new EventTarget()
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
  if (pathname === '/ReadableStreamBYOBReader') {
    new ReadableStreamBYOBReader()
  }
  if (pathname === '/ReadableStreamBYOBRequest') {
    new ReadableStreamBYOBRequest()
  }
  if (pathname === '/ReadableStreamDefaultController') {
    new ReadableStreamDefaultController()
  }
  if (pathname === '/ReadableStreamDefaultReader') {
    new ReadableStreamDefaultReader()
  }
  if (pathname === '/SubtleCrypto') {
    new SubtleCrypto()
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
  if (pathname === '/WritableStreamDefaultWriter') {
    new WritableStreamDefaultWriter()
  }
  return NextResponse.next()
}
