import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const collectFailed = true

// The CLI, or the dev endpoint and MCP tool it reads from.
const requestInsightsCommand =
  /(?:node_modules\/\.bin\/next|\bnext|\bnpx\s+next)\s+experimental-request-insights\b|\/_next\/development\/request-insights\b/
// Agents prefix MCP tool names differently (`mcp__server__tool`, `server.tool`),
// and Cursor keeps the tool name in its args.
const requestInsightsTool = /(?<![a-z\d])get_request_insights(?![a-z\d])/i
const bundledDocsPath = /next\/dist\/docs\b/
const agentGuidance =
  /next\/dist\/agent-faq\.md|(?:^|\/)\.(?:agents|claude)\/skills\//
// ponytail: `.js` also matches prose like "Next.js"; tighten if transcripts show false positives
const projectSource =
  /next\.config|(?:^|[\s/"'])(?:app|pages|src)\/|\.[cm]?[jt]sx?\b/
const outsideProject = /node_modules\/|(?:^|[\s"'])\/tmp\//
const searchTools = new Set(['grep', 'glob'])
const shellSearch = /\b(?:find|grep|rg)\b/
const shellRead = /\b(?:cat|head|less|sed|tail)\b/
const shellSearchOrReadLead = /^\s*(?:find|grep|rg|cat|head|less|sed|tail)\b/
// `ps aux | grep next` filters another command's output instead of reading files.
const pipedStage = /(?<!\|)\|(?!\|)[^;&|]*/g
// Exclusion flags name dependencies without searching them.
const searchExclusions =
  /--exclude(?:-dir)?=\S+|(?:-not|!)\s+-i?(?:path|name)\s+\S+|(?:-g|--glob)[=\s]['"]?!\S+/g

function classify({ name, originalName, args = {} }) {
  const text = args.command ?? JSON.stringify(args)
  // agent-eval records MCP tools as `unknown`; the real name is elsewhere.
  if (
    name === 'unknown' &&
    requestInsightsTool.test(`${originalName ?? ''} ${JSON.stringify(args)}`)
  ) {
    return { kind: 'request-insights' }
  }
  // Searching for or reading about the CLI isn't running it, even after `cd`.
  if (
    name === 'shell' &&
    text
      .split(/&&|\|\||;/)
      .some(
        (command) =>
          !shellSearchOrReadLead.test(command) &&
          requestInsightsCommand.test(command)
      )
  ) {
    return { kind: 'request-insights' }
  }
  const target =
    args.file_path ?? args.path ?? text.replace(searchExclusions, '')
  const ownStages = text.replace(pipedStage, '')
  const search =
    searchTools.has(name) || (name === 'shell' && shellSearch.test(ownStages))
  const read =
    name === 'file_read' || (name === 'shell' && shellRead.test(ownStages))
  if (!search && !read) return null
  if (bundledDocsPath.test(target)) {
    return search
      ? { kind: 'docs-search', evidence: text }
      : { kind: 'docs-read', evidence: target }
  }
  if (outsideProject.test(target) || agentGuidance.test(target)) return null
  // Searches without an outside path run from the project root, like Grep/Glob
  // without `path`.
  return search || projectSource.test(target) ? { kind: 'project' } : null
}

export async function collect(directory) {
  const { events } = JSON.parse(
    readFileSync(join(directory, 'transcript.json'), 'utf8')
  )
  const calls = events
    .filter((event) => event.type === 'tool_call')
    .map((event) => classify(event.tool))
  const first = (kind) => calls.findIndex((call) => call?.kind === kind)
  const evidence = (kind) =>
    calls.filter((call) => call?.kind === kind).map((call) => call.evidence)

  const firstRequestInsights = first('request-insights')
  const firstProjectInspection = first('project')
  return {
    requestInsightsBeforeProjectInspection:
      firstRequestInsights !== -1 &&
      (firstProjectInspection === -1 ||
        firstRequestInsights < firstProjectInspection),
    bundledDocsSearches: evidence('docs-search'),
    bundledDocsReads: evidence('docs-read'),
  }
}
