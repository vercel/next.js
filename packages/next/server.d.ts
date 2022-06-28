import type { Primitives } from 'next/dist/compiled/@edge-runtime/primitives'

export { NextFetchEvent } from 'next/dist/server/web/spec-extension/fetch-event'
export { NextRequest } from 'next/dist/server/web/spec-extension/request'
export { NextResponse } from 'next/dist/server/web/spec-extension/response'
export { NextMiddleware } from 'next/dist/server/web/types'
export { userAgentFromString } from 'next/dist/server/web/spec-extension/user-agent'
export { userAgent } from 'next/dist/server/web/spec-extension/user-agent'

declare global {
  const AbortController: Primitives['AbortController']
  const AbortSignal: Primitives['AbortSignal']
  const AggregateError: Primitives['AggregateError']
  const atob: Primitives['atob']
  const Blob: Primitives['Blob']
  const btoa: Primitives['btoa']
  const Cache: Primitives['Cache']
  const caches: Primitives['caches']
  const CacheStorage: Primitives['CacheStorage']
  const crypto: Primitives['crypto']
  const Crypto: Primitives['Crypto']
  const CryptoKey: Primitives['CryptoKey']
  const EdgeRuntime: Record<never, never>
  const fetch: Primitives['fetch']
  const File: Primitives['File']
  const FormData: Primitives['FormData']
  const globalThis: Primitives
  const Headers: Primitives['Headers']
  const ReadableStream: Primitives['ReadableStream']
  const ReadableStreamBYOBReader: Primitives['ReadableStreamBYOBReader']
  const ReadableStreamDefaultReader: Primitives['ReadableStreamDefaultReader']
  const Request: Primitives['Request']
  const Response: Primitives['Response']
  const self: Primitives
  const structuredClone: Primitives['structuredClone']
  const SubtleCrypto: Primitives['SubtleCrypto']
  const TransformStream: Primitives['TransformStream']
  const URLPattern: Primitives['URLPattern']
  const WritableStream: Primitives['WritableStream']
  const WritableStreamDefaultWriter: Primitives['WritableStreamDefaultWriter']
}
