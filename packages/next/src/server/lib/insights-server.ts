/**
 * Insights Server
 *
 * A lightweight HTTP server that:
 * - Serves the insights report HTML at the root
 * - Provides SSE endpoint for real-time updates
 * - Reads accumulated insights from all NDJSON files
 */

import http from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { readAllInsights } from './insights-storage'
import { aggregateInsights } from './insights-report'
import { generateHtmlReport } from './insights-report-template'
import type { Insight } from './insights-types'

// Store SSE clients for broadcasting
const sseClients = new Set<ServerResponse>()

// Default port for insights server
const DEFAULT_INSIGHTS_PORT = 3838

/**
 * Broadcast a new insight to all connected SSE clients
 */
export function broadcastInsight(insight: Insight): void {
  const data = JSON.stringify(insight)
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`)
  }
}

/**
 * Start the insights server
 */
export async function startInsightsServer(
  distDir: string,
  port: number = DEFAULT_INSIGHTS_PORT
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || '/', `http://localhost:${port}`)

      // SSE endpoint for real-time updates
      if (url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        })

        // Send initial ping
        res.write('data: {"type":"connected"}\n\n')

        // Add to clients
        sseClients.add(res)

        // Remove on close
        req.on('close', () => {
          sseClients.delete(res)
        })

        return
      }

      // JSON API endpoint
      if (url.pathname === '/api/insights') {
        try {
          const insights = await readAllInsights(distDir, { latestOnly: false })
          const reportData = aggregateInsights(insights)
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(JSON.stringify(reportData))
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Failed to read insights' }))
        }
        return
      }

      // Main HTML page
      if (url.pathname === '/' || url.pathname === '/index.html') {
        try {
          const insights = await readAllInsights(distDir, { latestOnly: false })
          const reportData = aggregateInsights(insights)
          const html = generateHtmlReport(reportData, port)
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(html)
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'text/plain' })
          res.end('Failed to generate report')
        }
        return
      }

      // 404 for other paths
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    }
  )

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        server.close()
        startInsightsServer(distDir, port + 1)
          .then(resolve)
          .catch(reject)
      } else {
        reject(err)
      }
    })

    server.listen(port, () => {
      resolve({ server, port })
    })
  })
}
