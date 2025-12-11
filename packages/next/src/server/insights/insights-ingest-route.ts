import { join } from 'path'
import { NextResponse } from '../web/spec-extension/response'
import type { NextRequest } from '../web/spec-extension/request'
import { handleInsightsReport } from '../lib/insights-handler'

/**
 * Insights ingest route handler
 * This is a built-in route handler that receives performance insights data
 * from the client waterfall detector and processes it server-side.
 *
 * The handler:
 * 1. Receives raw timing data from the client
 * 2. Resolves source maps to map bundled code back to source
 * 3. Analyzes fetch patterns to detect waterfalls
 * 4. Outputs actionable recommendations
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()

    // Get project directory and dist directory
    const projectDir = process.cwd()
    const distDir = join(projectDir, '.next')

    // Process the insights report (source map resolution + waterfall analysis)
    await handleInsightsReport(body, distDir, projectDir)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Insights] Error processing report:', error)
    return NextResponse.json(
      { error: 'Failed to process insights report' },
      { status: 500 }
    )
  }
}

// Disable static generation for this route
export const dynamic = 'force-dynamic'

// Force Node.js runtime (required for fs and source-map operations)
export const runtime = 'nodejs'
