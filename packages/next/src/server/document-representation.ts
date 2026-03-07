import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import RenderResult from './render-result'

type NegotiatedDocumentContentType = Exclude<
  NonNullable<ConstructorParameters<typeof RenderResult>[1]>['contentType'],
  null
>

export type NegotiatedDocumentRepresentation = {
  id: string
  contentType: NegotiatedDocumentContentType
  outputSuffix: string
  accepts: (accept: string | string[] | undefined) => boolean
  appendVary: (vary: string | string[] | number | undefined) => string
}

export function supportsNegotiatedDocumentRepresentation({
  experimentalEnabled,
  routeEnabled,
  runtime,
  method,
}: {
  experimentalEnabled: boolean
  routeEnabled: boolean
  runtime: string | undefined
  method: string | undefined
}): boolean {
  return (
    experimentalEnabled &&
    runtime !== 'edge' &&
    (method === 'GET' || method === 'HEAD') &&
    routeEnabled
  )
}

export function wantsNegotiatedDocumentRepresentation(
  representation: NegotiatedDocumentRepresentation,
  supported: boolean,
  accept: string | string[] | undefined
): boolean {
  return supported && representation.accepts(accept)
}

export function applyNegotiatedDocumentVary(
  representation: NegotiatedDocumentRepresentation,
  headers: Record<string, string | string[] | number | undefined>,
  currentVary?: string | string[] | number | undefined
): void {
  headers.vary = representation.appendVary(currentVary ?? headers.vary)
}

export function createNegotiatedDocumentRenderResult(
  representation: NegotiatedDocumentRepresentation,
  metadata: {
    headers?: Record<string, string | string[] | number | undefined>
  },
  body: string
): RenderResult {
  metadata.headers ??= {}
  metadata.headers['Content-Type'] = representation.contentType as string
  applyNegotiatedDocumentVary(representation, metadata.headers)

  return new RenderResult(body, {
    metadata,
    contentType: representation.contentType,
  })
}

export function getNegotiatedDocumentPathname(
  representation: NegotiatedDocumentRepresentation,
  pathname: string
): string {
  return `${normalizePagePath(pathname)}${representation.outputSuffix}`
}
