import type { ComponentType } from 'react'
import type { IncomingHttpHeaders } from 'http'
import type { OutgoingHttpHeaders } from 'http'

export interface ObservedClientReference {
  moduleId: string
  exportName: string
}

export type ServerOutputNode =
  | { kind: 'text'; value: string }
  | {
      kind: 'element'
      tag: string
      props: Readonly<Record<string, unknown>>
      children: ServerOutputNode[]
    }
  | { kind: 'fragment'; children: ServerOutputNode[] }
  | {
      kind: 'suspense'
      children: ServerOutputNode[]
      fallback: ServerOutputNode[]
    }
  | ClientBoundaryObservation

export interface ClientBoundaryObservation {
  kind: 'client-boundary'
  /** All matching manifest export aliases; not an invented wire identity. */
  references: ObservedClientReference[]
  /** Actual decoded serializable props. The client component was not rendered. */
  props: Readonly<Record<string, unknown>>
}

export interface ServerSubtreeObservation {
  tree: ServerOutputNode[]
  /** Server-produced text outside client boundaries, not browser-visible text. */
  text: string
  clientBoundaries: ClientBoundaryObservation[]
}

export interface RscRenderOptions {
  /** Persistent caches are deliberately shared by renders in this test file. */
  cacheScope: 'file'
  url: string | URL
  headers?: IncomingHttpHeaders
  rootParams?: Record<string, string | string[] | undefined>
}

/** Private feasibility output. This is decoded React data, not DOM or HTML. */
export interface RscRenderResult extends ServerSubtreeObservation {
  model: unknown
}

export interface RscRouteRenderOptions extends RscRenderOptions {
  /** Full document HTML or the normal App Router Flight response. */
  format: 'html' | 'flight'
}

export interface RscRouteRenderResult {
  body: string
  status: number
  headers: OutgoingHttpHeaders
  contentType: string | undefined
}

export interface RscRouteStreamResponse {
  readonly status: number
  readonly headers: Readonly<
    Record<string, string | number | readonly string[] | undefined>
  >
  readonly contentType: string | undefined
}

export type RscRouteStreamCompletion =
  | { readonly status: 'completed' }
  | { readonly status: 'aborted'; readonly reason: unknown }

export interface RscRouteStreamResult {
  readonly stream: ReadableStream<Uint8Array>
  /** Actual first header commit, before the body or after() work completes. */
  readonly response: Promise<RscRouteStreamResponse>
  /** Consume or cancel the body; completion also joins request/after() cleanup. */
  readonly completed: Promise<RscRouteStreamCompletion>
  dispose(reason?: unknown): Promise<void>
}

export interface RscTesting {
  renderRoute(options: RscRouteRenderOptions): Promise<RscRouteRenderResult>
  renderRouteStream(
    options: RscRouteRenderOptions
  ): Promise<RscRouteStreamResult>
  render<Props extends {}>(
    Component: ComponentType<Props>,
    props: Props,
    options: RscRenderOptions
  ): Promise<RscRenderResult>
}
