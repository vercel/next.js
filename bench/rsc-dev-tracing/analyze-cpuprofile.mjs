import { readFile } from 'node:fs/promises'

const profilePath = process.argv[2]
if (!profilePath) {
  console.error(
    'Usage: node bench/rsc-dev-tracing/analyze-cpuprofile.mjs <profile.cpuprofile>'
  )
  process.exit(1)
}

const profile = JSON.parse(await readFile(profilePath, 'utf8'))
const nodesById = new Map(profile.nodes.map((node) => [node.id, node]))
const selfSamples = new Map()
const totalSamples = new Map()

for (const id of profile.samples || []) {
  selfSamples.set(id, (selfSamples.get(id) || 0) + 1)
  let node = nodesById.get(id)
  while (node) {
    totalSamples.set(node.id, (totalSamples.get(node.id) || 0) + 1)
    node = nodesById.get(node.parent)
  }
}

function label(node) {
  const frame = node.callFrame
  const url = frame.url ? frame.url.replace(process.cwd(), '') : ''
  const line =
    frame.lineNumber >= 0
      ? `:${frame.lineNumber + 1}:${frame.columnNumber + 1}`
      : ''
  return `${frame.functionName || '(anonymous)'} ${url}${line}`.trim()
}

function topEntries(map, filter = () => true, limit = 30) {
  const total = (profile.samples || []).length || 1
  return [...map.entries()]
    .map(([id, count]) => ({ node: nodesById.get(id), count }))
    .filter((entry) => entry.node && filter(entry.node))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ node, count }) => ({
      samples: count,
      pct: Number(((count / total) * 100).toFixed(2)),
      frame: label(node),
    }))
}

function aggregateByLabel(map, filter = () => true, limit = 30) {
  const total = (profile.samples || []).length || 1
  const labels = new Map()
  for (const [id, count] of map.entries()) {
    const node = nodesById.get(id)
    if (!node || !filter(node)) continue
    const key = label(node)
    labels.set(key, (labels.get(key) || 0) + count)
  }
  return [...labels.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([frame, count]) => ({
      samples: count,
      pct: Number(((count / total) * 100).toFixed(2)),
      frame,
    }))
}

const interestingPattern =
  /async_hooks|AsyncLocalStorage|executionAsyncId|createHook|react-server-dom-webpack|react-server-dom-turbopack|react-dom-server|requestStorage|componentStorage|parseStackTrace|Error\b/

const summary = {
  sampleCount: (profile.samples || []).length,
  topSelf: topEntries(selfSamples),
  topSelfAggregated: aggregateByLabel(selfSamples),
  topTotalReactAsync: topEntries(totalSamples, (node) =>
    interestingPattern.test(label(node))
  ),
  topSelfReactAsync: topEntries(selfSamples, (node) =>
    interestingPattern.test(label(node))
  ),
  topSelfReactAsyncAggregated: aggregateByLabel(selfSamples, (node) =>
    interestingPattern.test(label(node))
  ),
}

console.log(JSON.stringify(summary, null, 2))
