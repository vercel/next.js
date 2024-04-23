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
  stream: Readable | ReadableStream
): Promise<string>

export function chainStreams<T>(
  ...streams: ReadableStream<T>[]
): ReadableStream<T>
export function chainStreams(...streams: Readable[]): Readable
