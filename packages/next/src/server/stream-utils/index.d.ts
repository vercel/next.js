import type { Readable } from 'node:stream'
import type { ReactReadableStream } from './stream-utils.edge'
import type { ReactElement } from 'react'
import type { ServerRendererOptions } from '../app-render/static/renderers'

export * from './stream-utils.edge'

export interface RenderToInitialFizzStreamOptions {
  element: ReactElement
  streamOptions?: ServerRendererOptions
}
export function renderToInitialFizzStream(
  options: RenderToInitialFizzStreamOptions
): Promise<ReactReadableStream | Readable>

export function renderToString(element: React.ReactElement): Promise<string>

export function streamToString(
  stream: Readable | ReadableStream<Uint8Array>
): Promise<string>

export function streamFromString(
  string: string
): Readable | ReadableStream<Uint8Array>

export function chainStreams(
  ...streams: ReadableStream<Uint8Array>[]
): ReadableStream<Uint8Array>
export function chainStreams(...streams: Readable[]): Readable

export function convertReadable(
  stream: Readable | ReadableStream<Uint8Array>
): ReadableStream<Uint8Array>

export function continueFizzStream(
  stream: Readable,
  options: {
    inlinedDataStream?: Readable
    isStaticGeneration: boolean
    getServerInsertedHTML?: () => Promise<string>
    serverInsertedHTMLToHead: boolean
    validateRootLayout?: boolean
    suffix?: string
  }
): Promise<Readable>
export function continueFizzStream(
  stream: ReadableStream<Uint8Array>,
  options: {
    inlinedDataStream?: ReadableStream<Uint8Array>
    isStaticGeneration: boolean
    getServerInsertedHTML?: () => Promise<string>
    serverInsertedHTMLToHead: boolean
    validateRootLayout?: boolean
    suffix?: string
  }
): Promise<ReadableStream<Uint8Array>>
export function continueFizzStream(
  stream: Readable | ReadableStream<Uint8Array>,
  options: {
    inlinedDataStream?: Readable | ReadableStream<Uint8Array>
    isStaticGeneration: boolean
    getServerInsertedHTML?: () => Promise<string>
    serverInsertedHTMLToHead: boolean
    validateRootLayout?: boolean
    suffix?: string
  }
): Promise<Readable | ReadableStream<Uint8Array>>
