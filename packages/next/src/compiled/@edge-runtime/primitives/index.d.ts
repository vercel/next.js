export { AbortController, AbortSignal, DOMException } from './abort-controller.d.js';
export { console } from './console.d.js';
export { Crypto, CryptoKey, SubtleCrypto, crypto } from './crypto.d.js';
export { Event, EventTarget, FetchEvent, PromiseRejectionEvent } from './events.d.js';
export { File, FormData, Headers, Request, RequestInfo, RequestInit, Response, WebSocket, fetch } from './fetch.d.js';
export { URL, URLPattern, URLSearchParams } from './url.d.js';
export { setInterval, setTimeout } from './timers.d.js';

declare const BlobConstructor: typeof Blob

declare const TextEncoderConstructor: typeof TextEncoder
declare const TextDecoderConstructor: typeof TextDecoder


declare const _atob: typeof atob
declare const _btoa: typeof btoa

/**
 * The type of `ReadableStreamBYOBReader` is not included in Typescript so we
 * are declaring it inline to not have to worry about bundling.
 */
declare class ReadableStreamBYOBReader {
  constructor(stream: ReadableStream<Uint8Array>)
  get closed(): Promise<undefined>
  cancel(reason?: any): Promise<void>
  read<T extends ArrayBufferView>(
    view: T,
  ): Promise<{ done: false; value: T } | { done: true; value: T | undefined }>
  releaseLock(): void
}

declare const ReadableStreamConstructor: typeof ReadableStream
declare const ReadableStreamBYOBReaderConstructor: typeof ReadableStreamBYOBReader
declare const ReadableStreamDefaultReaderConstructor: typeof ReadableStreamDefaultReader
declare const TransformStreamConstructor: typeof TransformStream
declare const WritableStreamConstructor: typeof WritableStream
declare const WritableStreamDefaultWriterConstructor: typeof WritableStreamDefaultWriter

declare const TextDecoderStreamConstructor: typeof TextDecoderStream
declare const TextEncoderStreamConstructor: typeof TextEncoderStream

declare const structuredCloneConstructor: typeof structuredClone

declare const performanceConstructor: typeof performance

export { BlobConstructor as Blob, ReadableStreamConstructor as ReadableStream, ReadableStreamBYOBReaderConstructor as ReadableStreamBYOBReader, ReadableStreamDefaultReaderConstructor as ReadableStreamDefaultReader, TextDecoderConstructor as TextDecoder, TextDecoderStreamConstructor as TextDecoderStream, TextEncoderConstructor as TextEncoder, TextEncoderStreamConstructor as TextEncoderStream, TransformStreamConstructor as TransformStream, WritableStreamConstructor as WritableStream, WritableStreamDefaultWriterConstructor as WritableStreamDefaultWriter, _atob as atob, _btoa as btoa, performanceConstructor as performance, structuredCloneConstructor as structuredClone };
