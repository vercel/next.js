import type { ComponentType } from 'react'
import type { IncomingHttpHeaders } from 'http'

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

export interface RscTesting {
  render<Props extends {}>(
    Component: ComponentType<Props>,
    props: Props,
    options: RscRenderOptions
  ): Promise<RscRenderResult>
}
