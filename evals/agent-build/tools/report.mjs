// Turn a calibrate.sh jobs directory into the Calibration section of an eval
// pull request: a pass/fail grid per task and setting with cost and duration,
// and a Mermaid chart GitHub renders inline. Transcripts stay in the jobs
// directory; link it from the Versions section.
//
//   node evals/agent-build/tools/report.mjs <jobs-dir> [--title "..."]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [jobsArg, ...rest] = process.argv.slice(2)
if (!jobsArg) {
  console.error('usage: report.mjs <jobs-dir> [--title "..."]')
  process.exit(2)
}
const jobs = resolve(jobsArg)
const titleIndex = rest.indexOf('--title')
const title = titleIndex >= 0 ? rest[titleIndex + 1] : 'Pass@1 by model'

const cells = []
for (const name of readdirSync(jobs)) {
  if (name.startsWith('_')) continue // runs set aside by hand
  const file = join(jobs, name, 'result.json')
  if (!existsSync(file)) continue
  const result = JSON.parse(readFileSync(file, 'utf8'))
  const [task, agent, model] = name.split('__')
  if (!task || !agent || !model) continue
  const evaluation = Object.values(result.stats?.evals ?? {})[0] ?? {}
  const finished = Boolean(result.finished_at)
  const errored = (evaluation.n_errors ?? 0) > 0
  const reward = evaluation.metrics?.[0]?.mean
  cells.push({
    task,
    agent,
    model: model.replace(/-/, '/'),
    state: !finished
      ? 'running'
      : errored
        ? 'discarded'
        : reward >= 1
          ? '1/1'
          : '0/1',
    cost: result.stats?.cost_usd ?? null,
    seconds: finished
      ? Math.round(
          (new Date(result.finished_at) - new Date(result.started_at)) / 1000
        )
      : null,
  })
}

if (cells.length === 0) {
  console.log(`No results under ${jobs}.`)
  process.exit(0)
}

const tasks = [...new Set(cells.map((c) => c.task))].sort()
const settings = [...new Set(cells.map((c) => `${c.agent}|${c.model}`))]

const cell = (c) => {
  if (!c) return 'not run'
  if (c.state === 'running') return 'running'
  const meta = []
  if (c.cost != null) meta.push(`$${c.cost.toFixed(2)}`)
  if (c.seconds != null) meta.push(`${Math.round(c.seconds / 60)}m`)
  return `${c.state}${meta.length ? ` (${meta.join(', ')})` : ''}`
}

console.log(
  '| Agent | Model | ' + tasks.map((t) => `\`${t}\``).join(' | ') + ' |'
)
console.log('| --- | --- | ' + tasks.map(() => '---:').join(' | ') + ' |')
for (const setting of settings) {
  const [agent, model] = setting.split('|')
  const row = tasks.map((t) =>
    cell(
      cells.find((c) => c.task === t && c.agent === agent && c.model === model)
    )
  )
  console.log(`| ${agent} | \`${model}\` | ${row.join(' | ')} |`)
}

const passRate = (predicate) => {
  const scored = cells.filter(
    (c) => predicate(c) && (c.state === '1/1' || c.state === '0/1')
  )
  if (scored.length === 0) return null
  return Math.round(
    (100 * scored.filter((c) => c.state === '1/1').length) / scored.length
  )
}

const labels = settings.map((s) => s.split('|')[1].split('/').pop())
const rates = settings.map((s) => {
  const [agent, model] = s.split('|')
  return passRate((c) => c.agent === agent && c.model === model)
})
if (rates.some((r) => r !== null)) {
  console.log()
  console.log('```mermaid')
  console.log('xychart-beta')
  console.log(`    title "${title}"`)
  console.log(`    x-axis [${labels.map((l) => `"${l}"`).join(', ')}]`)
  console.log('    y-axis "pass@1 (%)" 0 --> 100')
  console.log(`    bar [${rates.map((r) => r ?? 0).join(', ')}]`)
  console.log('```')
}

const discarded = cells.filter((c) => c.state === 'discarded')
const running = cells.filter((c) => c.state === 'running')
const notes = []
if (discarded.length)
  notes.push(
    `${discarded.length} discarded (runner or harness error, not a model result)`
  )
if (running.length) notes.push(`${running.length} still running`)
if (notes.length) console.log(`\n${notes.join('; ')}.`)
