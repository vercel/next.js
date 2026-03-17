/**
 * Agentic Apply Middleware
 *
 * Provides a `POST /_next/dev/apply` endpoint on the dev server that accepts
 * a patch (search/replace format) and a list of URLs. Applies the patch
 * atomically, then visits each URL via next-browser to trigger compilation,
 * capture runtime errors, and take screenshots — all in one synchronous call.
 *
 */

import type { IncomingMessage, ServerResponse } from 'http'
import { parsePatch, applyPatches, type FileDiff } from './patch-apply'

const APPLY_ENDPOINT = '/_next/dev/apply'

export interface ApplyRequest {
  /** The patch to apply (search/replace format) */
  patch: string
  /** Relative URL paths of pages to compile and verify */
  urls: string[]
}

export interface PageResult {
  url: string
  /** Directory containing loading sequence frames (PPR shell → hydration → data) */
  captureDir: string
  /** Final screenshot path (last frame of capture-goto) */
  screenshot: string
  /** Build/compile errors for this page */
  compileErrors: string[]
  /** Runtime errors captured during page load */
  runtimeErrors: string[]
}

export interface ApplyResponse {
  success: boolean
  /** Files that were modified/created/deleted */
  affectedFiles: string[]
  /** Per-file summary of what changed */
  diffs: FileDiff[]
  /** Per-page results (compile errors, runtime errors, screenshots) */
  pages: PageResult[]
  /** Time taken in milliseconds */
  durationMs: number
}

interface AgenticApplyMiddlewareOptions {
  /** Project root directory */
  projectDir: string
  /**
   * Called after the patch is applied to the filesystem.
   * Visits each URL, triggers compilation, captures errors and screenshots.
   */
  onPatchApplied: (
    affectedFiles: string[],
    urls: string[]
  ) => Promise<PageResult[]>
}

export function getAgenticApplyMiddleware(
  opts: AgenticApplyMiddlewareOptions
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ) => {
    const url = new URL(req.url || '/', 'http://n')

    if (url.pathname !== APPLY_ENDPOINT || req.method !== 'POST') {
      return next()
    }

    const startTime = Date.now()

    try {
      const bodyText = await readBody(req)
      let applyRequest: ApplyRequest

      const contentType = req.headers['content-type'] || ''
      if (contentType.includes('application/json')) {
        try {
          applyRequest = JSON.parse(bodyText) as ApplyRequest
        } catch {
          sendJson(res, 400, {
            success: false,
            affectedFiles: [],
            diffs: [],
            pages: [],
            durationMs: Date.now() - startTime,
          })
          return
        }
      } else {
        applyRequest = { patch: bodyText, urls: [] }
      }

      const { patch: patchText, urls: pageUrls } = applyRequest

      if (!patchText || !patchText.trim()) {
        sendJson(res, 400, {
          success: false,
          affectedFiles: [],
          diffs: [],
          pages: [],
          durationMs: Date.now() - startTime,
        })
        return
      }

      const operations = parsePatch(patchText)

      if (operations.length === 0) {
        sendJson(res, 400, {
          success: false,
          affectedFiles: [],
          diffs: [],
          pages: [],
          durationMs: Date.now() - startTime,
        })
        return
      }

      // Apply operations atomically
      const applyResult = applyPatches(operations, opts.projectDir)

      if (!applyResult.success) {
        sendJson(res, 422, {
          success: false,
          affectedFiles: applyResult.affectedFiles,
          diffs: applyResult.diffs,
          pages: [
            {
              url: '',
              captureDir: '',
              screenshot: '',
              compileErrors: [applyResult.error || 'Failed to apply patch'],
              runtimeErrors: [],
            },
          ],
          durationMs: Date.now() - startTime,
        })
        return
      }

      // Visit URLs, compile, capture errors + screenshots
      const pageResults = await opts.onPatchApplied(
        applyResult.affectedFiles,
        pageUrls
      )

      const hasErrors = pageResults.some(
        (p) => p.compileErrors.length > 0 || p.runtimeErrors.length > 0
      )

      sendJson(res, hasErrors ? 422 : 200, {
        success: !hasErrors,
        affectedFiles: applyResult.affectedFiles,
        diffs: applyResult.diffs,
        pages: pageResults,
        durationMs: Date.now() - startTime,
      })
    } catch (e) {
      sendJson(res, 500, {
        success: false,
        affectedFiles: [],
        diffs: [],
        pages: [
          {
            url: '',
            captureDir: '',
            screenshot: '',
            compileErrors: [
              `Internal error: ${e instanceof Error ? e.message : String(e)}`,
            ],
            runtimeErrors: [],
          },
        ],
        durationMs: Date.now() - startTime,
      })
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  body: ApplyResponse
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}
