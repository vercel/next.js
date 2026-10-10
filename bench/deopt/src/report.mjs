import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './util.mjs'
import { parseV8DeoptLog } from './v8-log.mjs'

const IC_STATE_RANK = {
  uninitialized: 0,
  premonomorphic: 1,
  monomorphic: 2,
  recompute_handler: 3,
  polymorphic: 4,
  megamorphic: 5,
  generic: 6,
  no_feedback: 0,
}

/**
 * IC analysis is best-effort: `v8-deopt-parser` predates current V8 log
 * formats and drops entries it cannot resolve (loudly). Deopt findings never
 * depend on it — see v8-log.mjs.
 */
async function parseICs(logText) {
  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const { parseV8Log } = await import('v8-deopt-parser')
    const result = await parseV8Log(logText)
    return { ics: result.ics ?? [], error: null }
  } catch (err) {
    return { ics: [], error: err.message }
  } finally {
    console.error = originalConsoleError
  }
}

function worstIcState(entry) {
  let worst = 'uninitialized'
  for (const update of entry.updates ?? []) {
    if ((IC_STATE_RANK[update.newState] ?? 0) > (IC_STATE_RANK[worst] ?? 0)) {
      worst = update.newState
    }
  }
  return worst
}

function icKeys(entry) {
  return [...new Set((entry.updates ?? []).map((u) => u.key).filter(Boolean))]
}

export function categorize(finding) {
  if (finding.kind === 'deopt')
    return `deopt-${finding.bailoutType.replace(/^deopt-/, '')}`
  return `ic-${finding.icState}`
}

function severityOf(finding, category) {
  // OSR entry/exit is normal tiering mechanics, not a shape hazard.
  if (
    finding.kind === 'deopt' &&
    /on stack replacement/i.test(finding.reason)
  ) {
    return 'info'
  }
  // "Insufficient type feedback" eager deopts mean a function was optimized
  // before it had seen enough types — a warmup/tiering-timing artifact, not
  // a steady-state shape hazard. They are also the run-to-run unstable class
  // of findings. Reported, but not as high severity.
  if (
    finding.kind === 'deopt' &&
    /insufficient type feedback/i.test(finding.reason)
  ) {
    return 'info'
  }
  switch (category) {
    case 'deopt-eager':
    case 'ic-megamorphic':
    case 'ic-generic':
      return 'high'
    default:
      return 'info'
  }
}

/**
 * Build the unified findings list from a renderer V8 log.
 */
export async function analyzeLog({ logText, remapper }) {
  const findings = []

  for (const deopt of parseV8DeoptLog(logText)) {
    const original = remapper.remap(deopt.url, deopt.line, deopt.column)
    // In minified chunks the log's function name is a mangled identifier.
    // The code-creation event gave us the function's definition position, and
    // the sourcemap's `names` entry for that position is usually the original
    // identifier.
    let functionName = deopt.functionName
    if (deopt.functionUrl != null) {
      const originalFn = remapper.remap(
        deopt.functionUrl,
        deopt.functionLine,
        deopt.functionColumn
      )
      if (originalFn?.name) functionName = originalFn.name
    }
    findings.push({
      ...deopt,
      original,
      functionName: functionName || original?.name || null,
    })
  }

  const { ics, error: icError } = await parseICs(logText)
  for (const entry of ics) {
    const state = worstIcState(entry)
    if ((IC_STATE_RANK[state] ?? 0) < IC_STATE_RANK.polymorphic) continue
    const original = remapper.remap(entry.file, entry.line, entry.column)
    findings.push({
      kind: 'ic',
      icState: state,
      url: entry.file,
      line: entry.line,
      column: entry.column,
      functionName: entry.functionName || original?.name || null,
      keys: icKeys(entry),
      count: entry.updates?.length ?? 0,
      original,
    })
  }

  for (const finding of findings) {
    finding.category = categorize(finding)
    finding.severity = severityOf(finding, finding.category)
    finding.module = moduleOf(finding)
  }

  sortFindings(findings)
  return { findings, icError }
}

function moduleOf(finding) {
  if (finding.original?.source) return relativeToRepo(finding.original.source)
  if (finding.url == null) return '(unknown)'
  try {
    if (finding.url.startsWith('file://')) {
      return relativeToRepo(fileURLToPath(finding.url))
    }
    const url = new URL(finding.url)
    return url.pathname
  } catch {
    return finding.url
  }
}

function relativeToRepo(p) {
  if (!path.isAbsolute(p)) return p
  const rel = path.relative(repoRoot(), p)
  return rel.startsWith('..') ? p : rel
}

function sortFindings(findings) {
  const severityRank = { high: 0, info: 1 }
  findings.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.module.localeCompare(b.module) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0)
  )
}

export function matchesFilters(finding, filters) {
  if (!filters || filters.length === 0) return true
  const candidates = [finding.module, finding.url ?? ''].filter(Boolean)
  return filters.some((f) => candidates.some((c) => c.includes(f)))
}

function location(finding) {
  if (finding.original) {
    return `${finding.original.source}:${finding.original.line ?? '?'}:${finding.original.column ?? '?'}`
  }
  return `${finding.url}:${finding.line ?? '?'}:${finding.column ?? '?'}`
}

function describe(finding) {
  const fn = finding.functionName || '(anonymous)'
  if (finding.kind === 'deopt') {
    return `\`${fn}\` — ${finding.reason} (${finding.count}×)\n  at ${location(finding)}`
  }
  const keys =
    finding.keys.length > 0 ? ` on \`${finding.keys.join('`, `')}\`` : ''
  return `\`${fn}\` — ${finding.icState} access${keys}\n  at ${location(finding)}`
}

/**
 * The stable, diffable representation designed for a future checked-in
 * snapshot workflow: deduped by (severity, category, module, function,
 * detail), no positions, no counts, no timestamps.
 */
export function stableFindingLines(findings) {
  const lines = new Set()
  for (const f of findings) {
    const fn = f.functionName || '(anonymous)'
    const detail =
      f.kind === 'deopt'
        ? f.reason
        : `keys: ${f.keys.join(', ') || '(unknown)'}`
    lines.add(`${f.severity}  ${f.category}  ${f.module}  ${fn}  ${detail}`)
  }
  return [...lines].sort()
}

export function renderSummaryMd({ findings, meta, icError }) {
  const sections = new Map()
  for (const f of findings) {
    if (!sections.has(f.category)) sections.set(f.category, [])
    sections.get(f.category).push(f)
  }
  const parts = []
  parts.push(`# Deopt report: ${meta.scenario}`)
  parts.push('')
  for (const [key, value] of Object.entries(meta)) {
    parts.push(`- ${key}: ${value}`)
  }
  parts.push('')
  if (findings.length === 0) {
    parts.push('No findings matched the filters. 🎉')
  }
  const order = [
    'deopt-eager',
    'ic-megamorphic',
    'ic-generic',
    'deopt-soft',
    'deopt-lazy',
    'ic-polymorphic',
  ]
  const seen = new Set(order)
  const categories = [
    ...order.filter((c) => sections.has(c)),
    ...[...sections.keys()].filter((c) => !seen.has(c)),
  ]
  for (const category of categories) {
    const items = sections.get(category)
    parts.push(`## ${category} (${items.length})`)
    parts.push('')
    for (const item of items) {
      parts.push(`- ${describe(item)}`)
    }
    parts.push('')
  }
  if (icError) {
    parts.push(
      `> IC analysis unavailable (v8-deopt-parser failed: ${icError}).`
    )
    parts.push(
      '> Deopt findings above are unaffected. Use the Deopt Explorer VS Code'
    )
    parts.push('> extension on the raw v8.log for IC/map analysis.')
    parts.push('')
  }
  return parts.join('\n')
}

export function writeArtifacts({
  outDir,
  findings,
  allFindings,
  meta,
  icError,
}) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(
    path.join(outDir, 'summary.md'),
    renderSummaryMd({ findings, meta, icError })
  )
  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify({ meta, icError, findings: allFindings }, null, 2)
  )
  fs.writeFileSync(
    path.join(outDir, 'findings.txt'),
    stableFindingLines(findings).join('\n') + '\n'
  )
}
