import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
} from '../../dev/hot-reloader-types'
import {
  createBrowserRequest,
  handleBrowserPageResponse,
  DEFAULT_BROWSER_REQUEST_TIMEOUT_MS,
} from './utils/browser-communication'
import type {
  PageMetadata,
  PageSegment,
  SegmentTrieData,
} from '../../../shared/lib/mcp-page-metadata-types'
import type { SegmentTrieNode } from '../../../next-devtools/dev-overlay/segment-explorer-trie'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

export function registerGetPageMetadataTool(
  server: McpServer,
  sendHmrMessage: (message: HmrMessageSentToBrowser) => void,
  getActiveConnectionCount: () => number
) {
  server.registerTool(
    'get_page_metadata',
    {
      description:
        'Get runtime metadata about what contributes to the current page render from active browser sessions.',
      inputSchema: {},
    },
    async (_request) => {
      // Track telemetry
      mcpTelemetryTracker.recordToolCall('mcp/get_page_metadata')

      try {
        const connectionCount = getActiveConnectionCount()
        if (connectionCount === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error:
                    'No browser sessions connected. Please open your application in a browser to retrieve page metadata.',
                }),
              },
            ],
          }
        }

        const responses = await createBrowserRequest<SegmentTrieData>(
          HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_PAGE_METADATA,
          sendHmrMessage,
          getActiveConnectionCount,
          DEFAULT_BROWSER_REQUEST_TIMEOUT_MS
        )

        if (responses.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  sessions: [],
                }),
              },
            ],
          }
        }

        const sessionMetadata: Array<{ url: string; metadata: PageMetadata }> =
          []
        for (const response of responses) {
          if (response.data) {
            // TODO: Add other metadata for the current page render here. Currently, we only have segment trie data.
            const pageMetadata = convertSegmentTrieToPageMetadata(response.data)
            sessionMetadata.push({ url: response.url, metadata: pageMetadata })
          }
        }

        if (sessionMetadata.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  sessions: [],
                }),
              },
            ],
          }
        }

        const output = formatPageMetadata(sessionMetadata)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(output),
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
        }
      }
    }
  )
}

export function handlePageMetadataResponse(
  requestId: string,
  segmentTrieData: SegmentTrieData | null,
  url: string | undefined
) {
  handleBrowserPageResponse<SegmentTrieData | null>(
    requestId,
    segmentTrieData,
    url || ''
  )
}

function convertSegmentTrieToPageMetadata(data: SegmentTrieData): PageMetadata {
  const segments: PageSegment[] = []

  if (data.segmentTrie) {
    // Traverse the trie and collect all segments
    function traverseTrie(node: SegmentTrieNode): void {
      if (node.value) {
        segments.push({
          type: node.value.type,
          pagePath: node.value.pagePath,
          boundaryType: node.value.boundaryType,
        })
      }

      for (const childNode of Object.values(node.children)) {
        if (childNode) {
          traverseTrie(childNode)
        }
      }
    }

    traverseTrie(data.segmentTrie)
  }

  return {
    segments,
    routerType: data.routerType,
  }
}

interface FormattedSegment {
  path: string
  type: string
  isBoundary: boolean
  isBuiltin: boolean
}

interface FormattedSession {
  url: string
  routerType: string
  segments: FormattedSegment[]
}

interface FormattedPageMetadataOutput {
  sessions: FormattedSession[]
}

function formatPageMetadata(
  sessionMetadata: Array<{ url: string; metadata: PageMetadata }>
): FormattedPageMetadataOutput {
  const sessions: FormattedSession[] = []

  for (const { url, metadata } of sessionMetadata) {
    let displayUrl = url
    try {
      const urlObj = new URL(url)
      displayUrl = urlObj.pathname + urlObj.search + urlObj.hash
    } catch {
      // If URL parsing fails, use the original URL
    }

    // Ensure consistent output to avoid flaky tests
    const sortedSegments = [...metadata.segments].sort((a, b) => {
      const typeOrder = (segment: PageSegment): number => {
        const type = segment.boundaryType || segment.type
        if (type === 'layout') return 0
        if (type.startsWith('boundary:')) return 1
        if (type === 'page') return 2
        return 3
      }
      const aOrder = typeOrder(a)
      const bOrder = typeOrder(b)
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.pagePath.localeCompare(b.pagePath)
    })

    const formattedSegments: FormattedSegment[] = []
    for (const segment of sortedSegments) {
      const path = segment.pagePath
      const isBuiltin = path.startsWith('__next_builtin__')
      const type = segment.boundaryType || segment.type
      const isBoundary = type.startsWith('boundary:')

      let displayPath = path
        .replace(/@boundary$/, '')
        .replace(/^__next_builtin__/, '')

      if (!isBuiltin && !displayPath.startsWith('app/')) {
        displayPath = `app/${displayPath}`
      }

      formattedSegments.push({
        path: displayPath,
        type,
        isBoundary,
        isBuiltin,
      })
    }

    sessions.push({
      url: displayUrl,
      routerType: metadata.routerType,
      segments: formattedSegments,
    })
  }

  return { sessions }
}
