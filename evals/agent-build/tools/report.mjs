// Render a calibrate.sh jobs directory as the Results section of an eval pull
// request, in the same shape as the agent-eval result PRs: totals per
// treatment, a model table aggregated across tasks (Base, + AGENTS.md,
// Delta, cost), a per-task table, and accuracy against cost as a Mermaid
// chart GitHub renders inline.
//
// Scores are pass@1 over scored runs. An agent that runs out of time is a
// failure, as in Harbor's own metrics; any other runner error is discarded
// and the run repeated. A `calibrate.sh --regrade` result replaces the
// reward; cost and duration stay the original run's.
//
//   node evals/agent-build/tools/report.mjs <jobs-dir> [task ...]
//
// Pass the task names to keep a row for a task with no runs yet.
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
const HARNESS = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  opencode: 'OpenCode',
}

const runnerError = (evaluation) =>
  Object.keys(evaluation.exception_stats ?? {}).some(
    (name) => name !== 'AgentTimeoutError'
  )

const runs = []
for (const name of readdirSync(jobs)) {
  if (name.startsWith('_')) continue // runs set aside by hand, regrades
  const dir = join(jobs, name)
  if (!existsSync(join(dir, 'result.json'))) continue
  if (!existsSync(join(dir, 'config.json'))) continue
  const result = read(join(dir, 'result.json'))
  const agent = read(join(dir, 'config.json')).agents?.[0] ?? {}
  const evaluation = Object.values(result.stats?.evals ?? {})[0] ?? {}
  const regradeFile = join(jobs, '_regraded', name, 'result.json')
  const regrade = existsSync(regradeFile) ? read(regradeFile) : null
  const regradeEval = Object.values(regrade?.stats?.evals ?? {})[0]
  const reward =
    regrade?.finished_at && regradeEval
      ? regradeEval.metrics?.[0]?.mean
      : evaluation.metrics?.[0]?.mean
  runs.push({
    task: name.split('__')[0],
    model: label(agent.model_name ?? name.split('__')[2]),
    harness: HARNESS[agent.name] ?? agent.name,
    treatment: name.split('__')[3] === 'agents-md' ? 'agents-md' : 'base',
    started: result.started_at,
    state: !result.finished_at
      ? 'running'
      : runnerError(evaluation)
        ? 'discarded'
        : reward >= 1
          ? 'pass'
          : 'fail',
    cost: result.stats?.cost_usd ?? null,
    minutes: result.finished_at
      ? (new Date(result.finished_at) - new Date(result.started_at)) / 60000
      : null,
  })
}

const tasks = taskArgs.length
  ? taskArgs.map((t) => t.replace(/\/$/, '').split('/').pop())
  : [...new Set(runs.map((r) => r.task))].sort()
const scored = (r) => r.state === 'pass' || r.state === 'fail'
const pct = (p, n) => (n ? `${Math.round((100 * p) / n)}%` : '')
const usd = (v) => (v == null ? '' : `$${v.toFixed(2)}`)
const mean = (xs) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
const tally = (rs) => {
  const s = rs.filter(scored)
  return {
    passed: s.filter((r) => r.state === 'pass').length,
    scored: s.length,
  }
}

// Totals per treatment.
const done = runs.filter(scored)
for (const [treatment, title] of [
  ['base', 'Base'],
  ['agents-md', 'With AGENTS.md'],
]) {
  const t = tally(runs.filter((r) => r.treatment === treatment))
  if (t.scored) {
    console.log(
      `- ${title}: **${t.passed}/${t.scored} (${pct(t.passed, t.scored)})**`
    )
  }
}
const minutes = mean(done.map((r) => r.minutes).filter((m) => m != null))
const costs = done.map((r) => r.cost).filter((c) => c != null)
if (minutes != null)
  console.log(`- Average duration: **${minutes.toFixed(1)} min per run**`)
if (costs.length) {
  console.log(`- Average cost: **${usd(mean(costs))} per run**`)
  console.log(
    `- Total cost so far: **${usd(costs.reduce((a, b) => a + b, 0))}**`
  )
}
const pending = runs.length - done.length
if (pending) console.log(`- Still running or discarded: ${pending}`)

// Models aggregated across tasks, sorted by base pass rate.
const models = [
  ...new Map(
    [...runs]
      .sort((a, b) => a.started.localeCompare(b.started))
      .map((r) => [r.model, r])
  ).values(),
].map((first) => {
  const mine = runs.filter((r) => r.model === first.model)
  const base = tally(mine.filter((r) => r.treatment === 'base'))
  const docs = tally(mine.filter((r) => r.treatment === 'agents-md'))
  const modelCosts = mine
    .filter(scored)
    .map((r) => r.cost)
    .filter((c) => c != null)
  return {
    model: first.model,
    harness: first.harness,
    base,
    docs,
    cost: mean(modelCosts),
  }
})
const rate = (t) => (t.scored ? t.passed / t.scored : -1)
models.sort(
  (a, b) => rate(b.base) - rate(a.base) || rate(b.docs) - rate(a.docs)
)

const cell = (t) =>
  t.scored ? `${t.passed}/${t.scored} (${pct(t.passed, t.scored)})` : 'running'
const delta = (a, b) =>
  a.scored && b.scored
    ? `${Math.round(100 * (b.passed / b.scored - a.passed / a.scored)) >= 0 ? '+' : ''}${Math.round(100 * (b.passed / b.scored - a.passed / a.scored))} pp`
    : ''
console.log()
console.log('| Model | Harness | Base | + AGENTS.md | Delta | Cost per run |')
console.log('| --- | --- | ---: | ---: | ---: | ---: |')
for (const m of models) {
  console.log(
    `| ${m.model} | ${m.harness} | ${cell(m.base)} | ${cell(m.docs)} | ${delta(m.base, m.docs)} | ${usd(m.cost)} |`
  )
}

// Per task: one row per task and model.
const mark = (r) => {
  if (!r) return 'queued'
  if (r.state === 'running') return 'running'
  if (r.state === 'discarded') return 'discarded'
  const time = r.minutes == null ? '' : `, ${Math.round(r.minutes)}m`
  return `${r.state === 'pass' ? '✅' : '❌'} ${usd(r.cost)}${time}`
}
console.log()
console.log('| Task | Model | Base | + AGENTS.md |')
console.log('| --- | --- | :---: | :---: |')
for (const task of tasks) {
  for (const m of models) {
    const find = (t) =>
      runs.find(
        (r) => r.task === task && r.model === m.model && r.treatment === t
      )
    console.log(
      `| \`${task}\` | ${m.model} | ${mark(find('base'))} | ${mark(find('agents-md'))} |`
    )
  }
}

// Accuracy against cost per run, one point per model and treatment, cost on a
// log scale across the observed range.
const points = models
  .flatMap((m) => [
    { name: m.model, t: m.base, treatment: 'base' },
    { name: `${m.model} AGENTS.md`, t: m.docs, treatment: 'agents-md' },
  ])
  .filter((p) => p.t.scored)
  .map((p) => {
    const c = runs
      .filter(
        (r) =>
          scored(r) && r.treatment === p.treatment && p.name.startsWith(r.model)
      )
      .map((r) => r.cost)
      .filter((x) => x != null)
    return { name: p.name, accuracy: p.t.passed / p.t.scored, cost: mean(c) }
  })
  .filter((p) => p.cost != null)

console.log()
if (points.length === 0) {
  console.log(
    '_The accuracy against cost chart appears after the first scored run._'
  )
} else {
  const log = (v) => Math.log10(Math.max(v, 0.01))
  const lo = Math.min(...points.map((p) => log(p.cost)))
  const hi = Math.max(...points.map((p) => log(p.cost)))
  const x = (v) => (hi === lo ? 0.5 : 0.05 + (0.9 * (log(v) - lo)) / (hi - lo))
  const y = (v) => Math.min(0.97, Math.max(0.03, v))
  console.log('```mermaid')
  console.log('quadrantChart')
  console.log('    title Accuracy vs cost per run')
  console.log(
    `    x-axis "${usd(Math.min(...points.map((p) => p.cost)))}" --> "${usd(Math.max(...points.map((p) => p.cost)))} per run"`
  )
  console.log('    y-axis "0% pass@1" --> "100% pass@1"')
  console.log('    quadrant-1 Accurate and expensive')
  console.log('    quadrant-2 Accurate and cheap')
  console.log('    quadrant-3 Inaccurate and cheap')
  console.log('    quadrant-4 Inaccurate and expensive')
  for (const p of points) {
    console.log(
      `    ${p.name}: [${x(p.cost).toFixed(2)}, ${y(p.accuracy).toFixed(2)}]`
    )
  }
  console.log('```')
}
