import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import type ws from 'next/dist/compiled/ws'
import z from 'next/dist/compiled/zod'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type InspectNavigationMessage,
} from '../../dev/hot-reloader-types'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'
import { createBrowserRequest } from './utils/browser-communication'

export type GetAppRouterClients = () => ReadonlyMap<string, ws>

function callPage(client: ws, action: InspectNavigationMessage['action']) {
  return createBrowserRequest<string>(1, (requestId) => {
    const message: InspectNavigationMessage = {
      type: HMR_MESSAGE_SENT_TO_BROWSER.INSPECT_NAVIGATION,
      action,
      requestId,
    }
    client.send(JSON.stringify(message))
  }).then(([{ url, data: state }]) => ({ url, state }))
}

export function registerInspectNavigationTool(
  server: McpServer,
  getClients: GetAppRouterClients
) {
  server.registerTool(
    'inspect_navigation',
    {
      description:
        'Inspect what an App Router page shows before dynamic data arrives. Call status to list open pages. Arm a page, click a link or reload in the browser, inspect the visible UI, then release in a finally block. A full reload changes the pageId: call status again. Use a separate browser context because the navigation lock is shared by tabs on the same hostname.',
      inputSchema: {
        action: z.enum(['status', 'arm', 'release']),
        pageId: z
          .string()
          .optional()
          .describe(
            'Document ID returned by status. Required for arm and release.'
          ),
      },
    },
    async ({ action, pageId }) => {
      mcpTelemetryTracker.recordToolCall('mcp/inspect_navigation')
      const clients = getClients()
      try {
        if (pageId === undefined) {
          if (action !== 'status')
            throw new Error('Call status and choose a pageId first.')
          const pages = await Promise.all(
            Array.from(clients, async ([id, client]) => {
              try {
                return { pageId: id, ...(await callPage(client, 'status')) }
              } catch {
                return { pageId: id, state: 'unavailable' }
              }
            })
          )
          return {
            content: [{ type: 'text', text: JSON.stringify({ pages }) }],
          }
        }

        const client = clients.get(pageId)
        if (!client)
          throw new Error(
            'Page is no longer connected. Call status to find the current pageId.'
          )
        const result = await callPage(client, action)
        if (result.state === 'unsupported')
          throw new Error(
            'This browser needs Cookie Store support on a secure origin or localhost.'
          )
        if (
          (action === 'arm' && result.state === 'idle') ||
          (action === 'release' && result.state !== 'idle')
        ) {
          throw new Error(
            'The browser did not apply the navigation lock change. Check that cookies are enabled.'
          )
        }
        return {
          content: [
            { type: 'text', text: JSON.stringify({ pageId, ...result }) },
          ],
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: error instanceof Error ? error.message : String(error),
            },
          ],
        }
      }
    }
  )
}
