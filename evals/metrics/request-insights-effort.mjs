import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const collectFailed = true

const requestInsightsCommand =
  /(?:node_modules\/\.bin\/next|\bnext|\bnpx\s+next)\s+experimental-request-insights\b/
const bundledDocsPath = /(?:node_modules\/next\/dist|next\/dist)\/docs\b/

function toolText(tool) {
  return tool?.args?.command ?? JSON.stringify(tool?.args ?? {})
}

const projectSource =
  /(?:next\.config|(?:^|[\s/"'])(?:app|pages|src)\/|\.[cm]?[jt]sx?\b)/
const outsideProject = /node_modules\/|(?:^|[\s"'])\/tmp\//
const searchTools = new Set(['grep', 'glob'])

function isProjectInspection(tool) {
  const text = toolText(tool)
  if (
    bundledDocsPath.test(text) ||
    /(?:node_modules\/next\/dist|next\/dist)\/agent-faq\.md/.test(text) ||
    /(?:^|\/)(?:\.agents|\.claude)\/skills\//.test(text)
  ) {
    return false
  }
  if (tool?.name === 'file_read') {
    const filePath = tool.args?.file_path ?? tool.args?.path ?? ''
    return !outsideProject.test(filePath) && projectSource.test(filePath)
  }
  // Grep/Glob default to the project root when no path is given.
  if (searchTools.has(tool?.name)) return !outsideProject.test(text)
  return (
    tool?.name === 'shell' &&
    /(?:\b(?:cat|sed|rg|grep|find|head|tail)\b[^\n]*(?:next\.config|(?:^|[ /])(?:app|pages|src)\/|\.[cm]?[jt]sx?\b))/.test(
      text
    )
  )
}

export async function collect(directory) {
  const { events } = JSON.parse(
    readFileSync(join(directory, 'transcript.json'), 'utf8')
  )
  const tools = events
    .filter((event) => event.type === 'tool_call')
    .map((event) => event.tool)
  const firstRequestInsights = tools.findIndex((tool) =>
    requestInsightsCommand.test(toolText(tool))
  )
  const firstProjectInspection = tools.findIndex(isProjectInspection)
  const bundledDocsSearches = tools
    .filter(
      (tool) =>
        bundledDocsPath.test(toolText(tool)) &&
        (searchTools.has(tool?.name) ||
          /\b(?:find|grep|rg)\b/.test(toolText(tool)))
    )
    .map(toolText)
  const bundledDocsReads = tools
    .filter(
      (tool) =>
        bundledDocsPath.test(toolText(tool)) &&
        (tool?.name === 'file_read' ||
          (tool?.name === 'shell' &&
            /\b(?:cat|head|less|sed|tail)\b/.test(toolText(tool))))
    )
    .map((tool) => tool.args.file_path ?? toolText(tool))

  return {
    requestInsightsBeforeProjectInspection:
      firstRequestInsights !== -1 &&
      (firstProjectInspection === -1 ||
        firstRequestInsights < firstProjectInspection),
    bundledDocsSearches,
    bundledDocsReads,
  }
}
