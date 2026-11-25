import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const collectFailed = true

const requestInsightsCommand =
  /(?:node_modules\/\.bin\/next|\bnext|\bnpx\s+next)\s+experimental-request-insights\b/
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

function classify({ name, args = {} }) {
  const text = args.command ?? JSON.stringify(args)
  if (requestInsightsCommand.test(text)) return { kind: 'request-insights' }
  const target = args.file_path ?? args.path ?? text
  const search =
    searchTools.has(name) || (name === 'shell' && shellSearch.test(text))
  const read =
    name === 'file_read' || (name === 'shell' && shellRead.test(text))
  if (!search && !read) return null
  if (bundledDocsPath.test(target)) {
    return search
      ? { kind: 'docs-search', evidence: text }
      : { kind: 'docs-read', evidence: target }
  }
  if (outsideProject.test(target) || agentGuidance.test(target)) return null
  // Grep/Glob default to the project root when no path is given.
  return searchTools.has(name) || projectSource.test(target)
    ? { kind: 'project' }
    : null
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
