import type { IncomingMessage, ServerResponse } from 'http'
import {
  getOriginalCodeFrame,
  ignoreListAnonymousStackFramesIfSandwiched,
  type IgnorableStackFrame,
  type OriginalStackFrameResponse,
  type OriginalStackFramesRequest,
  type OriginalStackFramesResponse,
  type StackFrame,
} from '../../next-devtools/server/shared'
import { middlewareResponse } from '../../next-devtools/server/middleware-response'
import path from 'path'
import { openFileInEditor } from '../../next-devtools/server/launch-editor'
import {
  SourceMapConsumer,
  type NullableMappedPosition,
} from 'next/dist/compiled/source-map08'
import type { Project, TurbopackStackFrame } from '../../build/swc/types'
import {
  type ModernSourceMapPayload,
  devirtualizeReactServerURL,
  findApplicableSourceMapPayload,
} from '../lib/source-maps'
import { findSourceMap, type SourceMap } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { inspect } from 'node:util'

function shouldIgnorePath(modulePath: string): boolean {
  return (
    modulePath.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    modulePath.includes('next/dist') ||
    modulePath.startsWith('node:')
  )
}

const currentSourcesByFile: Map<string, Promise<string | null>> = new Map()
/**
 * @returns 1-based lines and 1-based columns
 */
async function batchedTraceSource(
  project: Project,
  frame: TurbopackStackFrame
): Promise<{ frame: IgnorableStackFrame; source: string | null } | undefined> {
  const file = frame.file
    ? // TODO(veil): Why are the frames sent encoded?
      decodeURIComponent(frame.file)
    : undefined

  if (!file) return

  // For node internals they cannot traced the actual source code with project.traceSource,
  // we need an early return to indicate it's ignored to avoid the unknown scheme error from `project.traceSource`.
  if (file.startsWith('node:')) {
    return {
      frame: {
        file,
        line1: frame.line ?? null,
        column1: frame.column ?? null,
        methodName: frame.methodName ?? '<unknown>',
        ignored: true,
        arguments: [],
      },
      source: null,
    }
  }

  const currentDirectoryFileUrl = pathToFileURL(process.cwd()).href

  const sourceFrame = await project.traceSource(frame, currentDirectoryFileUrl)
  if (!sourceFrame) {
    return {
      frame: {
        file,
        line1: frame.line ?? null,
        column1: frame.column ?? null,
        methodName: frame.methodName ?? '<unknown>',
        ignored: shouldIgnorePath(file),
        arguments: [],
      },
      source: null,
    }
  }

  let source = null
  const originalFile = sourceFrame.originalFile

  // Don't look up source for node_modules or internals. These can often be large bundled files.
  const ignored =
    shouldIgnorePath(originalFile ?? sourceFrame.file) ||
    // isInternal means resource starts with turbopack:///[turbopack]
    !!sourceFrame.isInternal
  if (originalFile && !ignored) {
    let sourcePromise = currentSourcesByFile.get(originalFile)
    if (!sourcePromise) {
      sourcePromise = project.getSourceForAsset(originalFile)
      currentSourcesByFile.set(originalFile, sourcePromise)
      setTimeout(() => {
        // Cache file reads for 100ms, as frames will often reference the same
        // files and can be large.
        currentSourcesByFile.delete(originalFile!)
      }, 100)
    }
    source = await sourcePromise
  }

  // TODO: get ignoredList from turbopack source map
  const ignorableFrame: IgnorableStackFrame = {
    file: sourceFrame.file,
    line1: sourceFrame.line ?? null,
    column1: sourceFrame.column ?? null,
    methodName:
      // We ignore the sourcemapped name since it won't be the correct name.
      // The callsite will point to the column of the variable name instead of the
      // name of the enclosing function.
      // TODO(NDX-531): Spy on prepareStackTrace to get the enclosing line number for method name mapping.
      frame.methodName ?? '<unknown>',
    ignored,
    arguments: [],
  }

  return {
    frame: ignorableFrame,
    source,
  }
}

function parseFile(fileParam: string | null): string | undefined {
  if (!fileParam) {
    return undefined
  }

  return devirtualizeReactServerURL(fileParam)
}

function createStackFrames(
  body: OriginalStackFramesRequest
): TurbopackStackFrame[] {
  const { frames, isServer } = body

  return frames
    .map((frame): TurbopackStackFrame | undefined => {
      const file = parseFile(frame.file)

      if (!file) {
        return undefined
      }

      return {
        file,
        methodName: frame.methodName ?? '<unknown>',
        line: frame.line1 ?? undefined,
        column: frame.column1 ?? undefined,
        isServer,
      }
    })
    .filter((f): f is TurbopackStackFrame => f !== undefined)
}

function createStackFrame(
  searchParams: URLSearchParams
): TurbopackStackFrame | undefined {
  const file = parseFile(searchParams.get('file'))

  if (!file) {
    return undefined
  }

  return {
    file,
    methodName: searchParams.get('methodName') ?? '<unknown>',
    line: parseInt(searchParams.get('line1') ?? '0', 10) || undefined,
    column: parseInt(searchParams.get('column1') ?? '0', 10) || undefined,
    isServer: searchParams.get('isServer') === 'true',
  }
}

/**
 * @returns 1-based lines and 1-based columns
 */
async function nativeTraceSource(
  frame: TurbopackStackFrame
): Promise<{ frame: IgnorableStackFrame; source: string | null } | undefined> {
  const sourceURL = frame.file
  let sourceMapPayload: ModernSourceMapPayload | undefined
  try {
    sourceMapPayload = findSourceMap(sourceURL)?.payload
  } catch (cause) {
    throw new Error(
      `${sourceURL}: Invalid source map. Only conformant source maps can be used to find the original code.`,
      { cause }
    )
  }

  if (sourceMapPayload !== undefined) {
    let consumer: SourceMapConsumer
    try {
      consumer = await new SourceMapConsumer(sourceMapPayload)
    } catch (cause) {
      throw new Error(
        `${sourceURL}: Invalid source map. Only conformant source maps can be used to find the original code.`,
        { cause }
      )
    }
    let traced: {
      originalPosition: NullableMappedPosition
      sourceContent: string | null
    } | null
    try {
      const originalPosition = consumer.originalPositionFor({
        line: frame.line ?? 1,
        // 0-based columns out requires 0-based columns in.
        column: (frame.column ?? 1) - 1,
      })

      if (originalPosition.source === null) {
        traced = null
      } else {
        const sourceContent: string | null =
          consumer.sourceContentFor(
            originalPosition.source,
            /* returnNullOnMissing */ true
          ) ?? null

        traced = { originalPosition, sourceContent }
      }
    } finally {
      consumer.destroy()
    }

    if (traced !== null) {
      const { originalPosition, sourceContent } = traced
      const applicableSourceMap = findApplicableSourceMapPayload(
        (frame.line ?? 1) - 1,
        (frame.column ?? 1) - 1,
        sourceMapPayload
      )

      // TODO(veil): Upstream a method to sourcemap consumer that immediately says if a frame is ignored or not.
      let ignored = false
      if (applicableSourceMap === undefined) {
        console.error(
          'No applicable source map found in sections for frame',
          frame
        )
      } else {
        // TODO: O(n^2). Consider moving `ignoreList` into a Set
        const sourceIndex = applicableSourceMap.sources.indexOf(
          originalPosition.source!
        )
        ignored =
          applicableSourceMap.ignoreList?.includes(sourceIndex) ??
          // When sourcemap is not available, fallback to checking `frame.file`.
          // e.g. In pages router, nextjs server code is not bundled into the page.
          shouldIgnorePath(frame.file)
      }

      const originalStackFrame: IgnorableStackFrame = {
        methodName:
          // We ignore the sourcemapped name since it won't be the correct name.
          // The callsite will point to the column of the variable name instead of the
          // name of the enclosing function.
          // TODO(NDX-531): Spy on prepareStackTrace to get the enclosing line number for method name mapping.
          frame.methodName
            ?.replace('__WEBPACK_DEFAULT_EXPORT__', 'default')
            ?.replace('__webpack_exports__.', '') || '<unknown>',
        file: originalPosition.source,
        line1: originalPosition.line,
        column1:
          originalPosition.column === null ? null : originalPosition.column + 1,
        // TODO: c&p from async createOriginalStackFrame but why not frame.arguments?
        arguments: [],
        ignored,
      }

      return {
        frame: originalStackFrame,
        source: sourceContent,
      }
    }
  }

  return undefined
}

async function createOriginalStackFrame(
  project: Project,
  projectPath: string,
  frame: TurbopackStackFrame
): Promise<OriginalStackFrameResponse | null> {
  const traced =
    (await nativeTraceSource(frame)) ??
    // TODO(veil): When would the bundler know more than native?
    // If it's faster, try the bundler first and fall back to native later.
    (await batchedTraceSource(project, frame))
  if (!traced) {
    return null
  }

  let normalizedStackFrameLocation = traced.frame.file
  if (
    normalizedStackFrameLocation !== null &&
    normalizedStackFrameLocation.startsWith('file://')
  ) {
    normalizedStackFrameLocation = path.relative(
      projectPath,
      fileURLToPath(normalizedStackFrameLocation)
    )
  }

  return {
    originalStackFrame: {
      arguments: traced.frame.arguments,
      file: normalizedStackFrameLocation,
      line1: traced.frame.line1,
      column1: traced.frame.column1,
      ignored: traced.frame.ignored,
      methodName: traced.frame.methodName,
    },
    originalCodeFrame: getOriginalCodeFrame(traced.frame, traced.source),
  }
}

export function getOverlayMiddleware({
  project,
  projectPath,
  isSrcDir,
}: {
  project: Project
  projectPath: string
  isSrcDir: boolean
}) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    if (pathname === '/__nextjs_original-stack-frames') {
      if (req.method !== 'POST') {
        return middlewareResponse.badRequest(res)
      }

      const body = await new Promise<string>((resolve, reject) => {
        let data = ''
        req.on('data', (chunk) => {
          data += chunk
        })
        req.on('end', () => resolve(data))
        req.on('error', reject)
      })

      const request = JSON.parse(body) as OriginalStackFramesRequest
      const result = await getOriginalStackFrames({
        project,
        projectPath,
        frames: request.frames,
        isServer: request.isServer,
        isEdgeServer: request.isEdgeServer,
        isAppDirectory: request.isAppDirectory,
      })

      ignoreListAnonymousStackFramesIfSandwiched(result)

      return middlewareResponse.json(res, result)
    } else if (pathname === '/__nextjs_launch-editor') {
      const isAppRelativePath = searchParams.get('isAppRelativePath') === '1'

      let openEditorResult
      if (isAppRelativePath) {
        const relativeFilePath = searchParams.get('file') || ''
        const appPath = path.join(
          'app',
          isSrcDir ? 'src' : '',
          relativeFilePath
        )
        openEditorResult = await openFileInEditor(appPath, 1, 1, projectPath)
      } else {
        const frame = createStackFrame(searchParams)
        if (!frame) return middlewareResponse.badRequest(res)
        openEditorResult = await openFileInEditor(
          frame.file,
          frame.line ?? 1,
          frame.column ?? 1,
          projectPath
        )
      }

      if (openEditorResult.error) {
        return middlewareResponse.internalServerError(
          res,
          openEditorResult.error
        )
      }
      if (!openEditorResult.found) {
        return middlewareResponse.notFound(res)
      }
      return middlewareResponse.noContent(res)
    }

    return next()
  }
}

export function getSourceMapMiddleware(project: Project) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    if (pathname !== '/__nextjs_source-map') {
      return next()
    }

    let filename = searchParams.get('filename')

    if (!filename) {
      return middlewareResponse.badRequest(res)
    }

    let nativeSourceMap: SourceMap | undefined
    try {
      nativeSourceMap = findSourceMap(filename)
    } catch (cause) {
      return middlewareResponse.internalServerError(
        res,
        new Error(
          `${filename}: Invalid source map. Only conformant source maps can be used to find the original code.`,
          { cause }
        )
      )
    }

    if (nativeSourceMap !== undefined) {
      const sourceMapPayload = nativeSourceMap.payload
      return middlewareResponse.json(res, sourceMapPayload)
    }

    try {
      // Turbopack chunk filenames might be URL-encoded.
      filename = decodeURI(filename)
    } catch {
      return middlewareResponse.badRequest(res)
    }

    if (path.isAbsolute(filename)) {
      filename = pathToFileURL(filename).href
    }

    try {
      const sourceMapString = await project.getSourceMap(filename)

      if (sourceMapString) {
        return middlewareResponse.jsonString(res, sourceMapString)
      }
    } catch (cause) {
      return middlewareResponse.internalServerError(
        res,
        new Error(
          `Failed to get source map for '${filename}'. This is a bug in Next.js`,
          {
            cause,
          }
        )
      )
    }

    middlewareResponse.noContent(res)
  }
}

export function getMemoryReportMiddleware(project: Project) {
  return async function (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname, searchParams } = new URL(req.url!, 'http://n')

    if (pathname !== '/__nextjs_turbopack_memory') {
      return next()
    }

    const topNParam = searchParams.get('top_n')
    const topN = topNParam != null ? parseInt(topNParam, 10) : undefined
    const format = searchParams.get('format') ?? 'json'

    try {
      const reportJson = await project.getMemoryReport(
        topN != null && !isNaN(topN) ? topN : undefined
      )

      // Augment with Node.js process-level stats
      const report = JSON.parse(reportJson)
      const mem = process.memoryUsage()
      report.process = {
        pid: process.pid,
        node_version: process.version,
        rss_bytes: mem.rss,
        heap_used_bytes: mem.heapUsed,
        heap_total_bytes: mem.heapTotal,
        external_bytes: mem.external,
      }

      if (format === 'html') {
        res.setHeader('Content-Type', 'text/html')
        res.end(renderMemoryReportHtml(report))
      } else if (format === 'markdown') {
        res.setHeader('Content-Type', 'text/markdown')
        res.end(renderMemoryReportMarkdown(report))
      } else {
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(report, null, 2))
      }
    } catch (cause) {
      return middlewareResponse.internalServerError(
        res,
        new Error('Failed to collect memory report', { cause })
      )
    }
  }
}

const formatMb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const formatCount = (n: number) => n.toLocaleString()

function renderMemoryReportMarkdown(report: any): string {
  let md = `# Turbopack Memory Report\n\n`
  md += `Generated: ${report.generated_at}  \n`
  md += `Uptime: ${(report.uptime_secs / 60).toFixed(1)} minutes  \n`
  md += `PID: ${report.process.pid}\n\n`

  md += `## Process Memory\n\n`
  md += `| Metric | Value |\n|--------|------:|\n`
  md += `| RSS | ${formatMb(report.process.rss_bytes)} |\n`
  md += `| Node Heap Used | ${formatMb(report.process.heap_used_bytes)} |\n`
  md += `| Node Heap Total | ${formatMb(report.process.heap_total_bytes)} |\n`
  md += `| Node External | ${formatMb(report.process.external_bytes)} |\n`
  md += `| Rust Allocated | ${formatMb(report.allocator.allocated_bytes)} |\n`

  md += `\n## Tasks — ${formatCount(report.tasks.total_count)} total, `
  md += `${formatMb(report.tasks.total_estimated_size_bytes)} estimated\n\n`
  md += `| Function | Count | Est. Size |\n`
  md += `|----------|------:|----------:|\n`
  for (const fn_ of report.tasks.by_function) {
    md += `| \`${fn_.function}\` | ${formatCount(fn_.count)} | ${formatMb(fn_.estimated_size_bytes)} |\n`
  }

  md += `\n## Cells — ${formatCount(report.cells.total_count)} total, `
  md += `${formatMb(report.cells.total_estimated_size_bytes)} estimated\n\n`
  md += `| Type | Count | Est. Size |\n`
  md += `|------|------:|----------:|\n`
  for (const cell of report.cells.by_type) {
    md += `| \`${cell.type}\` | ${formatCount(cell.count)} | ${formatMb(cell.estimated_size_bytes)} |\n`
  }

  return md
}

function renderMemoryReportHtml(report: any): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const processRows = [
    ['RSS', formatMb(report.process.rss_bytes)],
    ['Node Heap Used', formatMb(report.process.heap_used_bytes)],
    ['Node Heap Total', formatMb(report.process.heap_total_bytes)],
    ['Node External', formatMb(report.process.external_bytes)],
    ['Rust Allocated', formatMb(report.allocator.allocated_bytes)],
  ]

  const taskRows = report.tasks.by_function
    .map(
      (fn_: any) =>
        `<tr><td><code>${esc(fn_.function)}</code></td><td class="r">${formatCount(fn_.count)}</td><td class="r">${formatMb(fn_.estimated_size_bytes)}</td></tr>`
    )
    .join('\n')

  const cellRows = report.cells.by_type
    .map(
      (cell: any) =>
        `<tr><td><code>${esc(cell.type)}</code></td><td class="r">${formatCount(cell.count)}</td><td class="r">${formatMb(cell.estimated_size_bytes)}</td></tr>`
    )
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Turbopack Memory Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 960px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
  h1 { border-bottom: 2px solid #eee; padding-bottom: 0.5rem; }
  h2 { margin-top: 2rem; }
  .meta { color: #666; font-size: 0.9rem; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  th { background: #f5f5f5; }
  .r { text-align: right; font-variant-numeric: tabular-nums; }
  code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; font-size: 0.85em; }
  tr:hover { background: #fafafa; }
</style>
</head>
<body>
<h1>Turbopack Memory Report</h1>
<p class="meta">Generated: ${esc(report.generated_at)} &middot; Uptime: ${(report.uptime_secs / 60).toFixed(1)} min &middot; PID: ${report.process.pid}</p>

<h2>Process Memory</h2>
<table>
<tr><th>Metric</th><th class="r">Value</th></tr>
${processRows.map(([label, val]) => `<tr><td>${label}</td><td class="r">${val}</td></tr>`).join('\n')}
</table>

<h2>Tasks &mdash; ${formatCount(report.tasks.total_count)} total, ${formatMb(report.tasks.total_estimated_size_bytes)} estimated</h2>
<table>
<tr><th>Function</th><th class="r">Count</th><th class="r">Est. Size</th></tr>
${taskRows}
</table>

<h2>Cells &mdash; ${formatCount(report.cells.total_count)} total, ${formatMb(report.cells.total_estimated_size_bytes)} estimated</h2>
<table>
<tr><th>Type</th><th class="r">Count</th><th class="r">Est. Size</th></tr>
${cellRows}
</table>
</body>
</html>`
}

export async function getOriginalStackFrames({
  project,
  projectPath,
  frames,
  isServer,
  isEdgeServer,
  isAppDirectory,
}: {
  project: Project
  projectPath: string
  frames: readonly StackFrame[]
  isServer: boolean
  isEdgeServer: boolean
  isAppDirectory: boolean
}): Promise<OriginalStackFramesResponse> {
  const stackFrames = createStackFrames({
    frames,
    isServer,
    isEdgeServer,
    isAppDirectory,
  })

  return Promise.all(
    stackFrames.map(async (frame) => {
      try {
        const stackFrame = await createOriginalStackFrame(
          project,
          projectPath,
          frame
        )
        if (stackFrame === null) {
          return {
            status: 'rejected',
            reason: 'Failed to create original stack frame',
          }
        }
        return { status: 'fulfilled', value: stackFrame }
      } catch (error) {
        return {
          status: 'rejected',
          reason: inspect(error, { colors: false }),
        }
      }
    })
  )
}
