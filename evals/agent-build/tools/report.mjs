// Render a calibrate.sh jobs directory as the Results section of a pull
// request: one row per model, one column per task, pass@1 in each cell, then
// accuracy against cost per task as a Mermaid chart GitHub renders inline.
// An agent that runs out of time is a scored failure, as in Harbor's own
// metrics; any other runner error is discarded and the run is repeated.
//
//   node evals/agent-build/tools/report.mjs <jobs-dir> [task ...]
//
// Pass the task names to keep a column for a task with no runs yet.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [jobsArg, ...taskArgs] = process.argv.slice(2)
if (!jobsArg) {
  console.error('usage: report.mjs <jobs-dir> [task ...]')
  process.exit(2)
}
const jobs = resolve(jobsArg)
const read = (file) => JSON.parse(readFileSync(file, 'utf8'))

// "claude-opus-5.5" -> "Claude Opus 5.5", "gpt-6.1-sol" -> "GPT-6.1 Sol"
const UPPER = new Set(['gpt', 'glm'])
const label = (model) =>
  model
    .split('/')
    .pop()
    .split('-')
    .map((w) =>
      UPPER.has(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)
    )
    .join(' ')
    .replace(/^GPT /, 'GPT-')

const runnerError = (evaluation) =>
  Object.keys(evaluation.exception_stats ?? {}).some(
    (name) => name !== 'AgentTimeoutError'
  )

const cells = []
for (const name of readdirSync(jobs)) {
  if (name.startsWith('_')) continue // runs set aside by hand
  const dir = join(jobs, name)
  if (!existsSync(join(dir, 'result.json'))) continue
  const result = read(join(dir, 'result.json'))
  const model = read(join(dir, 'config.json')).agents?.[0]?.model_name
  const evaluation = Object.values(result.stats?.evals ?? {})[0] ?? {}
  // A regrade with a fixed verifier (tools/regrade.sh) replaces Harbor's reward.
  const regrade = existsSync(join(dir, 'regrade.json'))
    ? read(join(dir, 'regrade.json'))
    : null
  const reward = regrade?.reward ?? evaluation.metrics?.[0]?.mean
  cells.push({
    task: name.split('__')[0],
    model:
      label(model ?? name.split('__')[2]) +
      (name.split('__')[3] === 'agents-md' ? ' · AGENTS.md' : ''),
    started: result.started_at,
    cost: result.stats?.cost_usd ?? null,
    cell: !result.finished_at
      ? 'running'
      : runnerError(evaluation)
        ? 'discarded'
        : reward >= 1
          ? '1/1'
          : '0/1',
  })
}

const tasks = taskArgs.length
  ? taskArgs.map((t) => t.replace(/\/$/, '').split('/').pop())
  : [...new Set(cells.map((c) => c.task))].sort()
const models = [
  ...new Set(
    [...cells]
      .sort((a, b) => a.started.localeCompare(b.started))
      .map((c) => c.model)
  ),
]

console.log('| Model | ' + tasks.map((t) => `\`${t}\``).join(' | ') + ' |')
console.log('| --- | ' + tasks.map(() => '---:').join(' | ') + ' |')
for (const model of models) {
  const row = tasks.map(
    (task) =>
      cells.find((c) => c.task === task && c.model === model)?.cell ?? 'queued'
  )
  console.log(`| ${model} | ${row.join(' | ')} |`)
}

// Accuracy against cost per task, over scored cells only. Cost is on a log
// scale across the observed range so cheap and expensive settings both show.
const points = models
  .map((model) => {
    const scored = cells.filter(
      (c) => c.model === model && (c.cell === '1/1' || c.cell === '0/1')
    )
    const costs = scored.map((c) => c.cost).filter((c) => c != null)
    if (!scored.length || !costs.length) return null
    return {
      model,
      accuracy: scored.filter((c) => c.cell === '1/1').length / scored.length,
      cost: costs.reduce((a, b) => a + b, 0) / costs.length,
    }
  })
  .filter(Boolean)

if (points.length === 0) {
  console.log()
  console.log(
    '_The accuracy against cost chart appears after the first scored run._'
  )
} else {
  const log = (v) => Math.log10(Math.max(v, 0.01))
  const lo = Math.min(...points.map((p) => log(p.cost)))
  const hi = Math.max(...points.map((p) => log(p.cost)))
  const x = (v) => (hi === lo ? 0.5 : 0.05 + (0.9 * (log(v) - lo)) / (hi - lo))
  const y = (v) => Math.min(0.97, Math.max(0.03, v))
  const usd = (v) => `$${v.toFixed(2)}`
  console.log()
  console.log('```mermaid')
  console.log('quadrantChart')
  console.log('    title Accuracy vs cost per task')
  console.log(
    `    x-axis "${usd(Math.min(...points.map((p) => p.cost)))}" --> "${usd(Math.max(...points.map((p) => p.cost)))} per task"`
  )
  console.log('    y-axis "0% pass@1" --> "100% pass@1"')
  console.log('    quadrant-1 Accurate and expensive')
  console.log('    quadrant-2 Accurate and cheap')
  console.log('    quadrant-3 Inaccurate and cheap')
  console.log('    quadrant-4 Inaccurate and expensive')
  for (const p of points) {
    console.log(
      `    ${p.model.replace(' · ', ' ')}: [${x(p.cost).toFixed(2)}, ${y(p.accuracy).toFixed(2)}]`
    )
  }
  console.log('```')
}
