import type { McpServer } from 'next/dist/compiled/@modelcontextprotocol/sdk/server/mcp'
import { z } from 'next/dist/compiled/zod'
import { promises as fs } from 'fs'
import { join } from 'path'
import { mcpTelemetryTracker } from '../mcp-telemetry-tracker'

const INLINE_ACTION_PREFIX = '$$RSC_SERVER_ACTION_'

interface ActionEntry {
  workers?: Record<string, any>
  layer?: Record<string, string>
  filename: string
  exportedName: string
}

interface ServerReferenceManifest {
  node: Record<string, ActionEntry>
  edge: Record<string, ActionEntry>
  encryptionKey: string
}

export function registerGetActionByIdTool(server: McpServer, distDir: string) {
  server.registerTool(
    'get_server_action_by_id',
    {
      description:
        'Locates a Server Action by its ID in the server-reference-manifest.json. Returns the filename and export name for the action.',
      inputSchema: {
        actionId: z.string(),
      },
    },
    async (request) => {
      // Track telemetry
      mcpTelemetryTracker.recordToolCall('mcp/get_server_action_by_id')

      try {
        const { actionId } = request

        if (!actionId) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: actionId parameter is required',
              },
            ],
          }
        }

        const manifestPath = join(
          distDir,
          'server',
          'server-reference-manifest.json'
        )

        let manifestContent: string
        try {
          manifestContent = await fs.readFile(manifestPath, 'utf-8')
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Could not read server-reference-manifest.json at ${manifestPath}.`,
              },
            ],
          }
        }

        const manifest: ServerReferenceManifest = JSON.parse(manifestContent)

        // Search in node entries
        if (manifest.node && manifest.node[actionId]) {
          const entry = manifest.node[actionId]
          const isInlineAction =
            entry.exportedName.startsWith(INLINE_ACTION_PREFIX)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    actionId,
                    runtime: 'node',
                    filename: entry.filename,
                    functionName: isInlineAction
                      ? 'inline server action'
                      : entry.exportedName,
                    layer: entry.layer,
                    workers: entry.workers,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        // Search in edge entries
        if (manifest.edge && manifest.edge[actionId]) {
          const entry = manifest.edge[actionId]
          const isInlineAction =
            entry.exportedName.startsWith(INLINE_ACTION_PREFIX)
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    actionId,
                    runtime: 'edge',
                    filename: entry.filename,
                    functionName: isInlineAction
                      ? 'inline server action'
                      : entry.exportedName,
                    layer: entry.layer,
                    workers: entry.workers,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error: Action ID "${actionId}" not found in server-reference-manifest.json`,
            },
          ],
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        }
      }
    }
  )
}
