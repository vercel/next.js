import type { LoaderTree } from '../lib/app-dir-module'
import type { AgentFormat, AgentMode, AgentRoute } from './types'

import { unstable_rethrow } from '../../client/components/unstable-rethrow'
import { getLayoutOrPageModule } from '../lib/app-dir-module'
import { htmlToAgentDocument } from './html-to-agent'
import { serializeAgentDocumentToJson } from './serialize-json'
import { serializeAgentDocumentToMarkdown } from './serialize-markdown'

type AgentDefaultRepresentation = 'html' | 'xml'

type AcceptedMediaType = {
  type: string
  subtype: string
  q: number
  index: number
}

const DEFAULT_MEDIA_TYPES: Record<
  AgentDefaultRepresentation,
  ReadonlyArray<[type: string, subtype: string]>
> = {
  html: [
    ['text', 'html'],
    ['application', 'xhtml+xml'],
  ],
  xml: [
    ['application', 'xml'],
    ['text', 'xml'],
  ],
}

export type AgentPageModule = {
  agent?: AgentMode
  generateAgent?: (props: {
    params?: Promise<Record<string, string | string[] | undefined>>
    searchParams?: Promise<Record<string, string | string[] | undefined>>
  }) => Promise<AgentRoute.Document> | AgentRoute.Document
}

const isAgentMode = (value: unknown): value is AgentMode => {
  return value === 'markdown' || value === 'json' || value === 'all'
}

const isAgentFormatEnabled = (mode: AgentMode, format: AgentFormat) => {
  return mode === 'all' || mode === format
}

export const resolveAgentMode = (
  pageModule: AgentPageModule | null | undefined
): AgentMode | null => {
  if (!pageModule) {
    return null
  }

  if (isAgentMode(pageModule.agent)) {
    return pageModule.agent
  }

  if (typeof pageModule.generateAgent === 'function') {
    return 'markdown'
  }

  return null
}

function parseAcceptHeader(
  acceptHeader: string | null | undefined
): AcceptedMediaType[] {
  if (!acceptHeader) {
    return []
  }

  return acceptHeader
    .split(',')
    .map((value, index) => {
      const [rawMediaType, ...rawParameters] = value
        .split(';')
        .map((part) => part.trim())

      if (!rawMediaType) {
        return null
      }

      const [rawType, rawSubtype, ...rest] = rawMediaType
        .toLowerCase()
        .split('/')
      if (!rawType || !rawSubtype || rest.length > 0) {
        return null
      }

      let q = 1

      for (const parameter of rawParameters) {
        const [rawKey, rawValue = ''] = parameter.split('=')
        if (rawKey?.trim().toLowerCase() !== 'q') {
          continue
        }

        const parsedQ = Number.parseFloat(rawValue.trim())
        if (!Number.isFinite(parsedQ)) {
          return null
        }

        q = Math.min(Math.max(parsedQ, 0), 1)
      }

      if (q <= 0) {
        return null
      }

      return {
        type: rawType,
        subtype: rawSubtype,
        q,
        index,
      }
    })
    .filter((value): value is AcceptedMediaType => value !== null)
}

function getMatchSpecificity(
  acceptedMediaType: AcceptedMediaType,
  type: string,
  subtype: string,
  allowWildcards: boolean
): number {
  if (
    acceptedMediaType.type === type &&
    acceptedMediaType.subtype === subtype
  ) {
    return 2
  }

  if (!allowWildcards) {
    return -1
  }

  if (acceptedMediaType.type === type && acceptedMediaType.subtype === '*') {
    return 1
  }

  if (acceptedMediaType.type === '*' && acceptedMediaType.subtype === '*') {
    return 0
  }

  return -1
}

function getPreferredQValue(
  acceptedMediaTypes: AcceptedMediaType[],
  mediaType: [type: string, subtype: string],
  allowWildcards: boolean
): number | null {
  const [type, subtype] = mediaType
  let bestMatch:
    | {
        q: number
        specificity: number
        index: number
      }
    | undefined

  for (const acceptedMediaType of acceptedMediaTypes) {
    const specificity = getMatchSpecificity(
      acceptedMediaType,
      type,
      subtype,
      allowWildcards
    )

    if (specificity < 0) {
      continue
    }

    if (
      !bestMatch ||
      acceptedMediaType.q > bestMatch.q ||
      (acceptedMediaType.q === bestMatch.q &&
        specificity > bestMatch.specificity) ||
      (acceptedMediaType.q === bestMatch.q &&
        specificity === bestMatch.specificity &&
        acceptedMediaType.index < bestMatch.index)
    ) {
      bestMatch = {
        q: acceptedMediaType.q,
        specificity,
        index: acceptedMediaType.index,
      }
    }
  }

  return bestMatch?.q ?? null
}

export function negotiateAgentFormat(
  acceptHeader: string | null | undefined,
  defaultRepresentation: AgentDefaultRepresentation
): AgentFormat | null {
  const acceptedMediaTypes = parseAcceptHeader(acceptHeader)

  const markdownQValue = getPreferredQValue(
    acceptedMediaTypes,
    ['text', 'markdown'],
    false
  )
  const jsonQValue = getPreferredQValue(
    acceptedMediaTypes,
    ['application', 'json'],
    false
  )
  const bestAgentQValue = Math.max(markdownQValue ?? -1, jsonQValue ?? -1)

  if (bestAgentQValue < 0) {
    return null
  }

  const defaultQValue = DEFAULT_MEDIA_TYPES[defaultRepresentation].reduce(
    (bestQValue, mediaType) => {
      const qValue = getPreferredQValue(acceptedMediaTypes, mediaType, true)
      return Math.max(bestQValue, qValue ?? -1)
    },
    -1
  )

  if (defaultQValue >= bestAgentQValue) {
    return null
  }

  if ((jsonQValue ?? -1) === bestAgentQValue) {
    return 'json'
  }

  return 'markdown'
}

export async function resolveLeafPageModule(
  loaderTree: LoaderTree
): Promise<AgentPageModule | null> {
  const { mod, modType } = await getLayoutOrPageModule(loaderTree)
  if (modType === 'page') {
    return mod as AgentPageModule
  }

  const parallelRoutes = loaderTree[1]
  const childRoute = parallelRoutes.children
  if (childRoute) {
    const pageModule = await resolveLeafPageModule(childRoute)
    if (pageModule) return pageModule
  }

  for (const [key, routeTree] of Object.entries(parallelRoutes)) {
    if (key === 'children') continue
    const pageModule = await resolveLeafPageModule(routeTree)
    if (pageModule) return pageModule
  }

  return null
}

export function resolveAgentCanonicalUrl(
  initUrl: string | undefined,
  pathnameOverride?: string
): string | undefined {
  if (typeof initUrl !== 'string') {
    return undefined
  }

  try {
    const parsed = new URL(initUrl)
    if (typeof pathnameOverride === 'string') {
      parsed.pathname = pathnameOverride
    }
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return undefined
  }
}

export type AgentRequestResolution = {
  statusCode: 200 | 406 | 500
  contentType: AgentFormat | 'text'
  payload: string
}

export async function resolveAgentRequest({
  pageModule,
  modeOverride,
  format,
  params,
  searchParams,
  canonicalUrl,
  fallbackTitle,
  isDev,
  getHtml,
}: {
  pageModule: AgentPageModule | null
  modeOverride?: AgentMode | null
  format: AgentFormat | undefined
  params: Record<string, string | string[] | undefined>
  searchParams: Record<string, string | string[] | undefined>
  canonicalUrl?: string
  fallbackTitle?: string
  isDev: boolean
  getHtml: () => Promise<string>
}): Promise<AgentRequestResolution> {
  const mode = modeOverride ?? resolveAgentMode(pageModule)

  if (!format || !mode || !isAgentFormatEnabled(mode, format)) {
    return {
      statusCode: 406,
      contentType: 'text',
      payload: 'Not Acceptable',
    }
  }

  let agentDocument: AgentRoute.Document
  if (typeof pageModule?.generateAgent === 'function') {
    try {
      agentDocument = await pageModule.generateAgent({
        params: Promise.resolve(params),
        searchParams: Promise.resolve(searchParams),
      })
    } catch (error) {
      unstable_rethrow(error)

      if (isDev) {
        throw error
      }

      return {
        statusCode: 500,
        contentType: 'text',
        payload: 'Internal Server Error',
      }
    }
  } else {
    const html = await getHtml()
    agentDocument = htmlToAgentDocument(html, {
      canonicalUrl,
      fallbackTitle,
    })
  }

  if (!agentDocument || typeof agentDocument !== 'object') {
    agentDocument = {}
  }

  if (canonicalUrl && !agentDocument.canonicalUrl) {
    agentDocument = {
      ...agentDocument,
      canonicalUrl,
    }
  }

  return {
    statusCode: 200,
    contentType: format,
    payload:
      format === 'json'
        ? serializeAgentDocumentToJson(agentDocument)
        : serializeAgentDocumentToMarkdown(agentDocument),
  }
}
