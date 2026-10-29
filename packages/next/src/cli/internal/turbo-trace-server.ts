import http from 'node:http'
import z from 'next/dist/compiled/zod'
import { loadBindings } from '../../build/swc'
import type {
  TraceFlatProfileResult,
  TraceMemoryPoint,
  TraceMemoryTimeline,
  TraceSpanInfo,
} from '../../build/swc/generated-native'

const { McpServer } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/mcp')
const { StreamableHTTPServerTransport } =
  require('next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp') as typeof import('next/dist/compiled/@modelcontextprotocol/sdk/server/streamableHttp')

const DEFAULT_WS_PORT = 5747

/** 100 internal ticks = 1 µs, so 1 tick = 10 ns. */
const TICKS_PER_US = 100
const TICKS_PER_MS = TICKS_PER_US * 1000
const TICKS_PER_S = TICKS_PER_MS * 1000

/** Included in every JSON response, so the numbers can't be misread. */
const JSON_UNITS = {
  time: 'ticks: 1 tick = 10 ns (100 ticks = 1 µs). Absolute times (start, end, memory sample timestamps) count from the start of the trace, on one clock shared by spans and memory samples.',
  memory: 'bytes',
}

/** Shared by every tool description. */
const UNITS_DESCRIPTION =
  'Units: every duration and timestamp is in ticks of 10 ns (100 ticks = 1 µs). `start`, `end` and memory sample timestamps are absolute, counted from the start of the trace on one clock shared by spans and memory samples, so they line up directly. Memory is in bytes; markdown uses binary units (1 GiB = 2^30 bytes).'

/** Shared by every tool description that reports memory. */
const MEMORY_DESCRIPTION =
  "Memory series: `bytes` is the memory the allocator (mimalloc) has committed from the OS (`current_commit`), not live heap: freed memory stays committed until mimalloc purges it. `footprint` is the process RSS (0 = not reported by the platform). The series is process-wide, so concurrent spans see identical values however much each allocated; rank concurrent work by the allocation fields, never by memory. Footprint above committed bytes is memory held outside mimalloc's committed pages (stacks, mapped files, other allocators); committed bytes above footprint are committed pages that aren't resident (never touched, or swapped or compressed)."

function formatDuration(ticks: number): string {
  if (ticks < TICKS_PER_MS) {
    const us = ticks / TICKS_PER_US
    return `${us.toFixed(0)}µs`
  }
  if (ticks < TICKS_PER_S) {
    const ms = ticks / TICKS_PER_MS
    return `${ms.toFixed(2)}ms`
  }
  const s = ticks / TICKS_PER_S
  return `${s.toFixed(3)}s`
}

function formatRelative(ticks: number): string {
  // ticks may be negative if the child starts before the parent reference point
  const prefix = ticks < 0 ? '-' : ''
  return prefix + formatDuration(Math.abs(ticks))
}

/** An absolute timestamp, as seconds since the trace started. */
function formatTimestamp(ticks: number): string {
  return `${(ticks / TICKS_PER_S).toFixed(3)}s`
}

/** Binary units, labelled as such: 1 GiB = 2^30 bytes. */
function formatBytes(bytes: number): string {
  const KiB = 1024
  const MiB = KiB * 1024
  const GiB = MiB * 1024
  if (bytes >= GiB) return `${(bytes / GiB).toFixed(2)} GiB`
  if (bytes >= MiB) return `${(bytes / MiB).toFixed(2)} MiB`
  if (bytes >= KiB) return `${(bytes / KiB).toFixed(2)} KiB`
  return `${bytes} B`
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US')
}

function formatMemoryPoint(point: TraceMemoryPoint | undefined): string {
  if (!point) return 'n/a'
  // Footprint is 0 when the platform does not report it.
  return point.footprint > 0
    ? `${formatBytes(point.bytes)} committed, ${formatBytes(point.footprint)} RSS`
    : `${formatBytes(point.bytes)} committed`
}

function formatShare(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : 'n/a'
}

/** A table cell: escapes the characters that would break a markdown row. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/**
 * Does any span in this result carry allocation data?
 *
 * Only the turbopack trace format records allocations, so this is a property of
 * the whole trace. Checking per result rather than per span keeps a real zero
 * distinguishable from a trace that never tracked allocations at all.
 */
function hasAllocationData(spans: TraceSpanInfo[]): boolean {
  return spans.some(
    (span) =>
      span.allocations > 0 ||
      span.deallocations > 0 ||
      span.allocationCount > 0 ||
      hasAllocationData(span.children)
  )
}

/**
 * Render the allocation metrics for a span.
 *
 * `total*` values cover the span and all its children; `self*` values exclude
 * children. For aggregated groups both are group totals across every span in
 * the group.
 */
function renderAllocationsMarkdown(
  span: TraceSpanInfo,
  title = 'Allocations'
): string {
  let md = `\n**${title}:**\n`
  md += `- **Allocated:** ${formatBytes(span.allocations)} (self ${formatBytes(span.selfAllocations)})\n`
  md += `- **Deallocated:** ${formatBytes(span.deallocations)} (self ${formatBytes(span.selfDeallocations)})\n`
  md += `- **Persistent (ranking signal, not retained):** ${formatBytes(span.persistentAllocations)} (self ${formatBytes(span.selfPersistentAllocations)})\n`
  md += `- **Allocation Count:** ${formatCount(span.allocationCount)} (self ${formatCount(span.selfAllocationCount)})\n`
  return md
}

function summarizeMemorySamples(span: TraceSpanInfo): string | null {
  const summary = span.memorySummary
  if (!summary) return null
  const delta = summary.end - summary.start
  const deltaSign = delta >= 0 ? '+' : '-'
  const workers = span.memorySamples.map((s) => s[4])
  const workerSummary =
    workers.length > 0
      ? `, activeWorkerThreads=${Math.min(...workers)}–${Math.max(...workers)}`
      : ''
  // Footprint is 0 when the platform does not report it.
  const footprintSummary =
    summary.maxFootprint > 0
      ? `, maxFootprint=${formatBytes(summary.maxFootprint)}`
      : ''
  return (
    `samples=${summary.count}, peak=${formatBytes(summary.peak)}, min=${formatBytes(summary.min)}, ` +
    `start=${formatBytes(summary.start)}, end=${formatBytes(summary.end)}, ` +
    `Δ=${deltaSign}${formatBytes(Math.abs(delta))}, maxPressure=${summary.maxPressure}` +
    footprintSummary +
    workerSummary
  )
}

function renderArgsMarkdown(span: TraceSpanInfo): string {
  if (!span.args || span.args.length === 0) return ''
  let md = `\n**Attributes:**\n`
  for (const [k, v] of span.args) {
    md += `- \`${k}\`: ${v}\n`
  }
  return md
}

/**
 * Render a single span (or aggregated span group) as a markdown section.
 *
 * `level` deepens the heading so a `depth > 1` result reads as a tree.
 */
function renderSpanMarkdown(
  span: TraceSpanInfo,
  showAllocations: boolean,
  level = 0
): string {
  const heading = '#'.repeat(Math.min(3 + level, 6))
  let md = `${heading} \`${span.name}\` (ID: \`${span.id}\`)\n`
  if (span.groupName !== span.name) {
    md += `- **Group name:** \`${span.groupName}\`\n`
  }

  const timing = (startLabel: string, endLabel: string) =>
    `- **${startLabel}:** ${formatTimestamp(span.start)} (${formatRelative(span.startRelativeToParent)} after parent start)\n` +
    `- **${endLabel}:** ${formatTimestamp(span.end)} (${formatRelative(span.endRelativeToParent)} after parent start)\n`

  if (span.isAggregated && span.count !== undefined && span.count > 1) {
    md += `- **Count:** ${span.count} spans\n`
    if (span.totalCpuDuration !== undefined) {
      md += `- **Total CPU Duration:** ${formatDuration(span.totalCpuDuration)}\n`
    }
    if (span.avgCpuDuration !== undefined) {
      md += `- **Avg CPU Duration:** ${formatDuration(span.avgCpuDuration)}\n`
    }
    if (span.totalCorrectedDuration !== undefined) {
      md += `- **Total Corrected Duration:** ${formatDuration(span.totalCorrectedDuration)}\n`
    }
    if (span.avgCorrectedDuration !== undefined) {
      md += `- **Avg Corrected Duration:** ${formatDuration(span.avgCorrectedDuration)}\n`
    }
    md += timing('Start (earliest member)', 'End (latest member)')
    if (span.firstSpanId !== undefined) {
      md += `- **First member:** ID \`${span.firstSpanId}\`\n`
    }
    if (span.heaviestSpanId !== undefined) {
      md += `- **Heaviest member (most persistent bytes):** ID \`${span.heaviestSpanId}\`\n`
    }
    // Allocation fields are group totals, so they go with the group, above the
    // example's heading, unlike the durations, args and memory below it.
    if (showAllocations) {
      md += renderAllocationsMarkdown(
        span,
        'Allocations (group totals over all members)'
      )
    }
    const exampleId = span.exampleSpanId ?? span.id
    md += `\n#### Longest member as example (ID: \`${exampleId}\`)\n`
    md += `- **CPU Duration:** ${formatDuration(span.cpuDuration)}\n`
    md += `- **Corrected Duration:** ${formatDuration(span.correctedDuration)}\n`
    md += renderArgsMarkdown(span)
  } else {
    md += `- **CPU Duration:** ${formatDuration(span.cpuDuration)}\n`
    md += `- **Corrected Duration:** ${formatDuration(span.correctedDuration)}\n`
    md += timing('Start', 'End')
    md += renderArgsMarkdown(span)
    if (showAllocations) {
      md += renderAllocationsMarkdown(span)
    }
  }

  if (span.memoryAtStart || span.memoryAtEnd) {
    md += `\n**Memory at start → end (interpolated):** ${formatMemoryPoint(span.memoryAtStart)} → ${formatMemoryPoint(span.memoryAtEnd)}\n`
  }
  const memSummary = summarizeMemorySamples(span)
  if (memSummary) {
    md += `\n**Process samples (committed bytes, memory pressure, RSS, active Tokio workers):** ${memSummary}\n`
  }

  if (span.children.length > 0) {
    md += '\n'
    for (const child of span.children) {
      md += renderSpanMarkdown(child, showAllocations, level + 1)
    }
  } else {
    md += '\n---\n\n'
  }

  return md
}

function renderFlatProfileMarkdown(
  result: TraceFlatProfileResult,
  parent: string | undefined
): string {
  const scope = parent ? `subtree of ID \`${parent}\`` : 'whole trace'
  let md = `## Flat profile of ${scope} — Page ${result.page} of ${result.totalPages} (${result.totalCount} names, ${formatCount(result.spanCount)} spans)\n\n`
  md += `Total corrected self time: ${formatDuration(result.totalCorrectedSelfDuration)}`
  if (result.totalSelfAllocations > 0) {
    md += `, total self allocations: ${formatBytes(result.totalSelfAllocations)}`
  }
  md += '\n\n'
  if (result.entries.length === 0) {
    return md + '_No spans found._\n'
  }
  const showAllocations = result.totalSelfAllocations > 0
  md +=
    '| Name | Count | Self (corrected) | Self % | Total (corrected) | Self CPU |' +
    (showAllocations ? ' Self allocated | Self persistent |' : '') +
    ' Example span |\n'
  md +=
    '|---|---:|---:|---:|---:|---:|' +
    (showAllocations ? '---:|---:|' : '') +
    '---|\n'
  for (const entry of result.entries) {
    md +=
      `| \`${cell(entry.name)}\` | ${formatCount(entry.count)} | ${formatDuration(entry.correctedSelfDuration)} | ` +
      `${formatShare(entry.correctedSelfDuration, result.totalCorrectedSelfDuration)} | ` +
      `${formatDuration(entry.correctedTotalDuration)} | ${formatDuration(entry.selfDuration)} |` +
      (showAllocations
        ? ` ${formatBytes(entry.selfAllocations)} | ${formatBytes(entry.selfPersistentAllocations)} |`
        : '') +
      ` \`${entry.exampleSpanId}\` (${formatDuration(entry.exampleCorrectedDuration)}) |\n`
  }
  if (result.page < result.totalPages) {
    md += `\nUse \`page=${result.page + 1}\` to see more results.\n`
  }
  return md
}

function renderMemoryTimelineMarkdown(
  timeline: TraceMemoryTimeline,
  parent: string | undefined
): string {
  const scope = parent ? `span ID \`${parent}\`` : 'whole trace'
  let md = `## Memory timeline of ${scope}: ${formatTimestamp(timeline.start)} – ${formatTimestamp(timeline.end)}\n\n`
  if (timeline.rawSampleCount === 0) {
    return md + '_No memory samples in this range._\n'
  }
  const reading = (r: TraceMemoryTimeline['peakBytes']) =>
    r
      ? `at ${formatTimestamp(r.ts)}: ${formatMemoryPoint({ bytes: r.bytes, footprint: r.footprint })}`
      : 'n/a'
  md += `- **Peak committed:** ${reading(timeline.peakBytes)}\n`
  if (timeline.peakFootprint) {
    md += `- **Peak RSS:** ${reading(timeline.peakFootprint)}\n`
  }
  if (timeline.maxGap) {
    const gap = timeline.maxGap.footprint - timeline.maxGap.bytes
    md += `- **Largest RSS − committed gap:** ${gap >= 0 ? '' : '-'}${formatBytes(Math.abs(gap))} ${reading(timeline.maxGap)}\n`
  }
  md += `- **Samples:** ${timeline.samples.length} shown of ${timeline.rawSampleCount} (downsampled groups keep their max)\n`

  if (timeline.phases.length > 0) {
    md += `\n### Phases (${timeline.phases.length} with the largest corrected duration, in start order)\n\n`
    md +=
      '| Start | End | Name | Corrected | Committed at start → end | Peak committed | Peak RSS | ID |\n'
    md += '|---:|---:|---|---:|---|---:|---:|---|\n'
    for (const phase of timeline.phases) {
      md +=
        `| ${formatTimestamp(phase.start)} | ${formatTimestamp(phase.end)} | \`${cell(phase.name)}\` | ` +
        `${formatDuration(phase.correctedDuration)} | ` +
        `${phase.memoryAtStart ? formatBytes(phase.memoryAtStart.bytes) : 'n/a'} → ${phase.memoryAtEnd ? formatBytes(phase.memoryAtEnd.bytes) : 'n/a'} | ` +
        `${phase.peakBytes !== undefined ? formatBytes(phase.peakBytes) : 'n/a'} | ` +
        `${phase.peakFootprint ? formatBytes(phase.peakFootprint) : 'n/a'} | \`${phase.id}\` |\n`
    }
  }

  md += `\n### Samples\n\n`
  md += '| Time | Committed | RSS | RSS − committed | Pressure | Workers |\n'
  md += '|---:|---:|---:|---:|---:|---:|\n'
  for (const [ts, bytes, pressure, footprint, workers] of timeline.samples) {
    const gap =
      footprint > 0
        ? `${footprint >= bytes ? '' : '-'}${formatBytes(Math.abs(footprint - bytes))}`
        : 'n/a'
    md += `| ${formatTimestamp(ts)} | ${formatBytes(bytes)} | ${footprint > 0 ? formatBytes(footprint) : 'n/a'} | ${gap} | ${pressure} | ${workers} |\n`
  }
  return md
}

/** Page size cap for full responses, which carry every field of a span. */
const MAX_PAGE_SIZE = 500
/** Page size cap when `fields` trims each span down. */
const MAX_MASKED_PAGE_SIZE = 10_000

/** The fields `query_spans` can return, besides `id`, which always is. */
const SPAN_FIELDS = [
  'name',
  'groupName',
  'cpuDuration',
  'correctedDuration',
  'start',
  'end',
  'startRelativeToParent',
  'endRelativeToParent',
  'args',
  'isAggregated',
  'count',
  'totalCpuDuration',
  'avgCpuDuration',
  'totalCorrectedDuration',
  'avgCorrectedDuration',
  'exampleSpanId',
  'firstSpanId',
  'heaviestSpanId',
  'allocations',
  'deallocations',
  'persistentAllocations',
  'allocationCount',
  'selfAllocations',
  'selfDeallocations',
  'selfPersistentAllocations',
  'selfAllocationCount',
  'memorySamples',
  'memorySummary',
  'memoryAtStart',
  'memoryAtEnd',
  'children',
] as const satisfies ReadonlyArray<keyof TraceSpanInfo>

// Fails to compile when `TraceSpanInfo` gains a field `SPAN_FIELDS` lacks.
const _allSpanFieldsListed: Exclude<
  keyof TraceSpanInfo,
  (typeof SPAN_FIELDS)[number] | 'id'
> extends never
  ? true
  : never = true
void _allSpanFieldsListed

type SpanField = (typeof SPAN_FIELDS)[number]

/** `span` with only `id` and `fields`, applied to nested `children` too. */
function pickFields(
  span: TraceSpanInfo,
  fields: ReadonlyArray<SpanField>
): Record<string, unknown> {
  const picked: Record<string, unknown> = { id: span.id }
  for (const field of fields) {
    picked[field] =
      field === 'children'
        ? span.children.map((child) => pickFields(child, fields))
        : span[field]
  }
  return picked
}

function clampPageSize(
  pageSize: number | undefined,
  max: number
): number | undefined {
  return pageSize === undefined ? undefined : Math.min(pageSize, max)
}

function jsonResponse(value: object) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ units: JSON_UNITS, ...value }),
      },
    ],
  }
}

function markdownResponse(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

const outputTypeSchema = z
  .enum(['markdown', 'json'])
  .optional()
  .describe(
    'Output format. "markdown" (default) returns human-readable markdown. "json" returns structured JSON with all fields, plus a `units` object.'
  )

export async function startTurboTraceServerCli(
  file: string,
  port: number | undefined,
  mcpPort: number | undefined
) {
  process.title = `next internal trace (v${process.env.__NEXT_VERSION})`
  const wsPort = port ?? DEFAULT_WS_PORT
  const httpPort = mcpPort ?? wsPort + 1

  let bindings
  try {
    bindings = await loadBindings()
  } catch {
    console.error(
      'Error: Could not load native bindings. The trace server requires native (non-WASM) bindings.'
    )
    process.exit(1)
  }

  let handle
  try {
    // Start the WebSocket trace server on a background thread (non-blocking).
    handle = bindings.turbo.startTurbopackTraceServerHandle(file, wsPort)
  } catch (err) {
    console.error(
      `Error: Could not start trace server for "${file}": ${err instanceof Error ? err.message : err}`
    )
    process.exit(1)
  }

  console.log(
    `Turbopack trace server started. View trace at https://trace.nextjs.org?port=${wsPort}`
  )

  // Create the MCP server.
  const mcpServer = new McpServer({
    name: 'Next.js Trace Server MCP',
    version: '0.1.0',
  })

  mcpServer.registerTool(
    'query_spans',
    {
      description: [
        'Query spans from a turbopack trace file: timing, CPU, attributes, allocation counters, and process memory samples.',
        '',
        "Navigation: pass a result `id` as `parent` to drill in. An aggregated group as `parent` stands for all of its members: its children are every member's children, merged. `search` is recursive over the whole subtree and returns full path IDs, so you can find a span without knowing where it lives; `recursive: true` lists the whole subtree without a search term. `depth` > 1 returns that many levels nested inline; `pageSize` (default 20, max 500) widens a page. For time or allocations summed by name across a subtree, use `flat_profile` instead of paging through groups.",
        '',
        'Bulk export: set `fields` to the fields you need (e.g. `["name", "args"]`). It implies JSON output and raises the `pageSize` cap to 10000, and every page re-runs the search, so fewer, larger pages are much faster. Unsorted search results are in execution order, so pages are stable.',
        '',
        'Every response is paged: `totalCount` is how many matched in all, `totalPages` how many pages that is. Getting exactly `pageSize` results does not mean there are no more — check `totalCount`. `maxDepth` is unlimited by default; when one is set and cuts off part of the subtree, `depthLimited` is true. Search cost scales with subtree size, so prefer scoping `parent` over repeated root searches on a large trace.',
        '',
        UNITS_DESCRIPTION,
        '',
        "Names: a lone span's `name` can include its `name` arg (e.g. `analyze ecmascript module [project]/…`), which differs per span; `groupName` is the name without it, the key spans are aggregated by.",
        '',
        'Allocations: `allocations` / `deallocations` / `allocationCount` and `persistentAllocations`, each with a `self*` counterpart excluding children. Comparing a total to its `self` shows whether a span allocates directly or only through descendants.',
        '',
        '`persistentAllocations` ranks allocators; it is NOT retained memory. It is allocated-minus-freed per TurboMalloc counters, which never see turbo-tasks cell or cache drops, so a total far above real peak RSS is expected rather than a leak. For absolute memory use `memorySummary` (count/start/end/min/peak/maxPressure/maxFootprint, precomputed from `memorySamples`) or `memoryAtStart` / `memoryAtEnd`, which are interpolated between samples and so are present even for spans too short to contain one (outside the sampled range they are the nearest sample). For the memory curve of a whole build, use `memory_timeline`.',
        '',
        MEMORY_DESCRIPTION,
        '',
        "Frees are charged to whichever span was on the stack at free time, not the one that allocated. A child with large `selfAllocations` under a parent with large `selfDeallocations` means the parent drops the child's arena — bounded, not leaking. Large `selfPersistentAllocations` with no such counterpart above it is the shape worth suspecting.",
        '',
        'For aggregated groups every allocation field and `total*`/`avg*` duration is a group total, `start`/`end` cover all members, and `cpuDuration`, `correctedDuration`, `args` and the memory fields describe the example span: the longest member (`exampleSpanId`). `firstSpanId` is first in execution order; `heaviestSpanId` holds the most persistent bytes.',
        '',
        'Set `outputType: "json"` for full precision and the raw `memorySamples` entries `[ts, bytes, pressure, footprint, active_worker_threads]` (active_worker_threads excludes parked and blocking-pool threads); markdown is a human summary.',
      ].join('\n'),
      inputSchema: {
        parent: z
          .string()
          .optional()
          .describe(
            'Span ID to enumerate children of. Omit for root-level spans. Use the `id` field from a previous result.'
          ),
        aggregated: z
          .boolean()
          .optional()
          .describe(
            'When true (default), aggregate spans with the same name into a single entry. Set to false to see individual raw spans.'
          ),
        sort: z
          .enum(['value', 'name', 'allocations', 'persistent-allocations'])
          .optional()
          .describe(
            'Sort mode: "value" for corrected duration descending, "name" for alphabetical, "allocations" for total allocated bytes descending, "persistent-allocations" for `persistentAllocations` descending. Omit for execution order.'
          ),
        search: z
          .string()
          .optional()
          .describe(
            "Substring search over span name and category, applied to the whole subtree below `parent`. Each match's `id` is the full path from `parent`, so it can be passed straight back as `parent`. Comma-separated terms are ANDed."
          ),
        recursive: z
          .boolean()
          .optional()
          .describe(
            'When true, list every span in the subtree below `parent` (up to `maxDepth`), as if `search` matched everything. Ignored when `search` is set.'
          ),
        maxDepth: z
          .number()
          .optional()
          .describe(
            'Levels to descend below `parent` for `search` and `recursive`. Unlimited by default; `depthLimited` in the result says whether it cut anything off.'
          ),
        depth: z
          .number()
          .optional()
          .describe(
            "Levels of descendants to include inline in each span's `children`. Default 1 (no nesting), capped at 32."
          ),
        page: z.number().optional().describe('1-based page number. Default 1.'),
        pageSize: z
          .number()
          .optional()
          .describe(
            'Spans per page. Default 20, capped at 500, or at 10000 with `fields`.'
          ),
        fields: z
          .array(z.enum(SPAN_FIELDS))
          .optional()
          .describe(
            'Return only these fields of each span (plus `id`, always), applied to nested `children` too. Implies JSON output and raises the `pageSize` cap to 10000, for exporting many spans.'
          ),
        outputType: outputTypeSchema,
      },
    },
    (args) => {
      const fields = args.fields
      const result = bindings.turbo.queryTraceSpans(handle, {
        parent: args.parent,
        aggregated: args.aggregated ?? true,
        sort: args.sort,
        search: args.search,
        recursive: args.recursive,
        maxDepth: args.maxDepth,
        depth: args.depth,
        page: args.page ?? 1,
        pageSize: clampPageSize(
          args.pageSize,
          fields ? MAX_MASKED_PAGE_SIZE : MAX_PAGE_SIZE
        ),
        // The raw series is the bulk of a span; skip it unless asked for.
        includeMemorySamples: !fields || fields.includes('memorySamples'),
      })

      const { spans, page, totalPages, totalCount, depthLimited } = result

      if (fields) {
        return jsonResponse({
          spans: spans.map((span) => pickFields(span, fields)),
          page,
          totalPages,
          totalCount,
          depthLimited,
        })
      }

      if (args.outputType === 'json') {
        return jsonResponse({
          spans,
          page,
          totalPages,
          totalCount,
          depthLimited,
        })
      }

      const parentLabel = args.parent
        ? `children of ID \`${args.parent}\``
        : 'root level'
      let md = `## Spans at ${parentLabel} — Page ${page} of ${totalPages} (${totalCount} total)\n\n`
      if (depthLimited) {
        md += `> **Truncated by depth:** \`maxDepth\` ${args.maxDepth} cut off part of the subtree, so matches below it are missing. Raise or omit \`maxDepth\` to include them.\n\n`
      }

      if (spans.length === 0) {
        md += '_No spans found._\n'
      }

      const showAllocations = hasAllocationData(spans)
      for (const span of spans) {
        md += renderSpanMarkdown(span, showAllocations)
      }

      if (page < totalPages) {
        md += `Use \`page=${page + 1}\` to see more results.\n`
      }

      return markdownResponse(md)
    }
  )

  mcpServer.registerTool(
    'flat_profile',
    {
      description: [
        'A flat profile of a trace: every span below `parent` (or in the whole trace) grouped by name, wherever in the tree it sits, with summed self time, total time and self allocations. One call answers "where does the time go?" for a subtree, instead of paging through `query_spans` groups and summing them.',
        '',
        "Spans are grouped by their group name, which drops the per-span `name` arg, so e.g. every module's `analyze ecmascript module` lands in one entry. `correctedSelfDuration` adds up to the subtree's concurrency-corrected time, so rank by it (the default) and read `Self %` as a share of the whole. `correctedTotalDuration` includes children, counting only the outermost of nested same-named spans, so recursion is not counted twice; totals of different names overlap and must not be summed. `exampleSpanId` is the longest span with the name, usable as `parent` in `query_spans`.",
        '',
        UNITS_DESCRIPTION,
      ].join('\n'),
      inputSchema: {
        parent: z
          .string()
          .optional()
          .describe(
            'Span ID whose subtree to profile, from a previous result. Omit for the whole trace. For an aggregated group, every member is included.'
          ),
        search: z
          .string()
          .optional()
          .describe(
            'Keep only entries whose name contains this substring. Comma-separated terms are ANDed. Shares still use the whole subtree as the denominator.'
          ),
        sort: z
          .enum([
            'self',
            'total',
            'self-allocations',
            'self-persistent-allocations',
            'count',
          ])
          .optional()
          .describe(
            'Sort, descending: "self" (default) for corrected self time, "total" for corrected total time, "self-allocations", "self-persistent-allocations", or "count".'
          ),
        page: z.number().optional().describe('1-based page number. Default 1.'),
        pageSize: z
          .number()
          .optional()
          .describe('Entries per page. Default 20, capped at 500.'),
        outputType: outputTypeSchema,
      },
    },
    (args) => {
      const result = bindings.turbo.queryTraceFlatProfile(handle, {
        parent: args.parent,
        search: args.search,
        sort: args.sort,
        page: args.page ?? 1,
        pageSize: clampPageSize(args.pageSize, MAX_PAGE_SIZE),
      })
      if (args.outputType === 'json') {
        return jsonResponse(result)
      }
      return markdownResponse(renderFlatProfileMarkdown(result, args.parent))
    }
  )

  mcpServer.registerTool(
    'memory_timeline',
    {
      description: [
        "The process memory curve over the whole trace (or one span's time range): committed bytes and RSS side by side, with the gap between them, the peaks, and the longest spans running at the time as phase markers.",
        '',
        "Phases are the children of `parent` (top-level spans for the whole trace; for an aggregated group, every member's children): the `maxPhases` with the largest corrected duration, in start order, each with memory at its start and end (interpolated, or the nearest sample outside the sampled range) and its peak. Each phase is one span, never a group, so a phase never covers a gap between same-named spans. Their IDs work as `parent` here and in `query_spans`, so drill into a phase to see its own phases. Peaks and the largest gap are computed from every sample, before downsampling.",
        '',
        MEMORY_DESCRIPTION,
        '',
        UNITS_DESCRIPTION,
      ].join('\n'),
      inputSchema: {
        parent: z
          .string()
          .optional()
          .describe(
            'Span ID whose time range to cover and whose children are the phases. Omit for the whole trace.'
          ),
        start: z
          .number()
          .optional()
          .describe(
            "Absolute start in ticks (10 ns), overriding the parent range. Use a span's `start` to line up with it."
          ),
        end: z
          .number()
          .optional()
          .describe(
            'Absolute end in ticks (10 ns), overriding the parent range.'
          ),
        maxSamples: z
          .number()
          .optional()
          .describe(
            'Samples to downsample to. Default 100, capped at 2000. Each downsampled group keeps its max.'
          ),
        maxPhases: z
          .number()
          .optional()
          .describe(
            'Phases to list, the ones with the largest corrected duration. Default 20, capped at 200.'
          ),
        outputType: outputTypeSchema,
      },
    },
    (args) => {
      const timeline = bindings.turbo.queryTraceMemoryTimeline(handle, {
        parent: args.parent,
        start: args.start,
        end: args.end,
        maxSamples: args.maxSamples,
        maxPhases: args.maxPhases,
      })
      if (args.outputType === 'json') {
        return jsonResponse(timeline)
      }
      return markdownResponse(
        renderMemoryTimelineMarkdown(timeline, args.parent)
      )
    }
  )

  // Start the HTTP server for MCP (served at /mcp).
  const server = http.createServer(async (req, res) => {
    if (req.url !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found. MCP endpoint is at /mcp\n')
      return
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    try {
      res.on('close', () => transport.close())
      await mcpServer.connect(transport)
      let body = ''
      req.setEncoding('utf8')
      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: string) => {
          body += chunk
        })
        req.on('end', resolve)
        req.on('error', reject)
      })
      await transport.handleRequest(
        req,
        res,
        body ? JSON.parse(body) : undefined
      )
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'application/json; charset=utf-8',
        })
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Internal server error' },
            id: null,
          })
        )
      }
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Error: MCP port ${httpPort} is already in use. Use --mcp-port to specify a different port.`
      )
    } else {
      console.error(`Error starting MCP server: ${err.message}`)
    }
    process.exit(1)
  })

  server.listen(httpPort, '127.0.0.1', () => {
    console.log(
      `Query this trace from the command line: next internal query-trace --help --port ${httpPort}`
    )
    console.log(
      `Alternatively, connect an MCP client to http://127.0.0.1:${httpPort}/mcp`
    )
  })
}
