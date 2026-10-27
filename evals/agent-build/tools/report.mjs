// Render a calibrate.sh jobs directory in the same shape as SelfBench
// results: a headline, a settings table (model, harness, reasoning, accuracy,
// cost per task, frontier), a pass/fail grid per task, and accuracy against
// cost as a Mermaid chart GitHub renders inline. Accuracy and cost count only
// scored cells; runner errors are discarded, not failures.
//
//   node evals/agent-build/tools/report.mjs <jobs-dir>
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const jobsArg = process.argv[2]
if (!jobsArg) {
  console.error('usage: report.mjs <jobs-dir>')
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

const cells = []
for (const name of readdirSync(jobs)) {
  if (name.startsWith('_')) continue // runs set aside by hand
  const dir = join(jobs, name)
  if (!existsSync(join(dir, 'result.json'))) continue
  const result = read(join(dir, 'result.json'))
  const agent = read(join(dir, 'config.json')).agents?.[0] ?? {}
  const task = name.split('__')[0]
  const model = agent.model_name ?? name.split('__')[2]
  const kwargs = agent.kwargs ?? {}
  const reasoning = kwargs.reasoning_effort ?? kwargs.effort ?? 'default'
  const evaluation = Object.values(result.stats?.evals ?? {})[0] ?? {}
  const reward = evaluation.metrics?.[0]?.mean
  const minutes = result.finished_at
    ? (new Date(result.finished_at) - new Date(result.started_at)) / 60000
    : null
  cells.push({
    task,
    id: `${model}|${agent.name}|${reasoning}`,
    model,
    harness: agent.name,
    reasoning,
    state: !result.finished_at
      ? 'running'
      : (evaluation.n_errors ?? 0) > 0
        ? 'discarded'
        : reward >= 1
          ? 'pass'
          : 'fail',
    cost: result.stats?.cost_usd ?? null,
    minutes,
  })
}

if (cells.length === 0) {
  console.log(`No results under ${jobs}.`)
  process.exit(0)
}

const tasks = [...new Set(cells.map((c) => c.task))].sort()
const scored = (c) => c.state === 'pass' || c.state === 'fail'
const settings = [...new Set(cells.map((c) => c.id))].map((id) => {
  const all = cells.filter((c) => c.id === id)
  const mine = all.filter(scored)
  const passed = mine.filter((c) => c.state === 'pass').length
  const costs = mine.map((c) => c.cost).filter((c) => c != null)
  return {
    ...all[0],
    label: label(all[0].model),
    scored: mine.length,
    passed,
    accuracy: mine.length ? (100 * passed) / mine.length : null,
    costPerTask: costs.length
      ? costs.reduce((a, b) => a + b, 0) / costs.length
      : null,
  }
})
const ranked = settings
  .filter((s) => s.accuracy != null)
  .sort((a, b) => b.accuracy - a.accuracy || a.costPerTask - b.costPerTask)

// Pareto frontier: no other setting is at least as accurate and cheaper.
for (const s of ranked) {
  s.onFrontier = !ranked.some(
    (o) =>
      o !== s &&
      o.accuracy >= s.accuracy &&
      o.costPerTask <= s.costPerTask &&
      (o.accuracy > s.accuracy || o.costPerTask < s.costPerTask)
  )
}

const pct = (v) => `${v.toFixed(1)}%`
const usd = (v) => (v == null ? '' : `$${v.toFixed(2)}`)

if (ranked.length) {
  const best = ranked[0]
  const cheap = ranked
    .filter((s) => s.onFrontier && s !== best)
    .sort((a, b) => a.costPerTask - b.costPerTask)[0]
  let line = `Most accurate: ${best.label}, ${pct(best.accuracy)} at ${usd(best.costPerTask)} per task.`
  if (cheap) {
    line += ` Best for less: ${cheap.label}, ${pct(cheap.accuracy)} at ${usd(cheap.costPerTask)}.`
  }
  console.log(
    `${line} ${ranked.length} of ${settings.length} settings scored on ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} so far.`
  )
  console.log()
}

console.log(
  '| Model | Harness | Reasoning | Accuracy | Cost per task | Frontier |'
)
console.log('| --- | --- | --- | ---: | ---: | :---: |')
for (const s of [...ranked, ...settings.filter((s) => s.accuracy == null)]) {
  const acc =
    s.accuracy == null
      ? 'pending'
      : `${pct(s.accuracy)} (${s.passed}/${s.scored})`
  console.log(
    `| ${s.label} | ${s.harness} | ${s.reasoning} | ${acc} | ${usd(s.costPerTask)} | ${s.onFrontier ? '●' : ''} |`
  )
}

// Whether each setting passed each task.
const order = [...ranked, ...settings.filter((s) => s.accuracy == null)]
const mark = (c) => {
  if (!c) return ''
  if (c.state === 'running') return '⏳'
  if (c.state === 'discarded') return '— runner error'
  const time = c.minutes == null ? '' : `, ${Math.round(c.minutes)}m`
  return `${c.state === 'pass' ? '✅' : '❌'} ${usd(c.cost)}${time}`
}
console.log()
console.log('| Task | ' + order.map((s) => s.label).join(' | ') + ' |')
console.log('| --- | ' + order.map(() => ':---:').join(' | ') + ' |')
for (const task of tasks) {
  const row = order.map((s) =>
    mark(cells.find((c) => c.task === task && c.id === s.id))
  )
  console.log(`| \`${task}\` | ${row.join(' | ')} |`)
}

// Accuracy against cost per task, cost on a log scale over the observed range.
if (ranked.length >= 2) {
  const logs = ranked.map((s) => Math.log10(Math.max(s.costPerTask, 0.01)))
  const lo = Math.min(...logs)
  const hi = Math.max(...logs)
  const x = (v) =>
    hi === lo
      ? 0.5
      : 0.06 + (0.88 * (Math.log10(Math.max(v, 0.01)) - lo)) / (hi - lo)
  const y = (v) => Math.min(0.96, Math.max(0.04, v / 100))
  const costs = ranked.map((s) => s.costPerTask)
  console.log()
  console.log('```mermaid')
  console.log('quadrantChart')
  console.log('    title Accuracy vs cost per task')
  console.log(
    `    x-axis "${usd(Math.min(...costs))} per task" --> "${usd(Math.max(...costs))} per task"`
  )
  console.log('    y-axis "0% accuracy" --> "100% accuracy"')
  for (const s of ranked) {
    console.log(
      `    ${s.label}: [${x(s.costPerTask).toFixed(2)}, ${y(s.accuracy).toFixed(2)}]`
    )
  }
  console.log('```')
}
