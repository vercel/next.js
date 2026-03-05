import type { LoaderTree } from '../lib/app-dir-module'
import type { AgentFormat, AgentMode, AgentRoute } from './types'

import { getLayoutOrPageModule } from '../lib/app-dir-module'
import { htmlToAgentDocument } from './html-to-agent'
import { serializeAgentDocumentToJson } from './serialize-json'
import { serializeAgentDocumentToMarkdown } from './serialize-markdown'

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

const getEffectiveAgentMode = (
  pageModule: AgentPageModule
): AgentMode | null => {
  if (isAgentMode(pageModule.agent)) {
    return pageModule.agent
  }

  if (typeof pageModule.generateAgent === 'function') {
    return 'markdown'
  }

  return null
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
  basePath: string | undefined
): string | undefined {
  if (typeof initUrl !== 'string' || typeof basePath !== 'string') {
    return undefined
  }

  try {
    const parsed = new URL(initUrl)
    parsed.pathname = basePath
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return undefined
  }
}

export type AgentRequestResolution = {
  statusCode: 200 | 404 | 500
  contentType: AgentFormat | 'text'
  payload: string
}

export async function resolveAgentRequest({
  pageModule,
  format,
  params,
  searchParams,
  canonicalUrl,
  fallbackTitle,
  isDev,
  getHtml,
}: {
  pageModule: AgentPageModule | null
  format: AgentFormat | undefined
  params: Record<string, string | string[] | undefined>
  searchParams: Record<string, string | string[] | undefined>
  canonicalUrl?: string
  fallbackTitle?: string
  isDev: boolean
  getHtml: () => Promise<string>
}): Promise<AgentRequestResolution> {
  const mode = pageModule ? getEffectiveAgentMode(pageModule) : null

  if (!format || !mode || !isAgentFormatEnabled(mode, format)) {
    return {
      statusCode: 404,
      contentType: 'text',
      payload: 'Not Found',
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
