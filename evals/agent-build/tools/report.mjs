// Render a calibrate.sh jobs directory as the Results section of an eval pull
// request: one table, a row per model with a base / AGENTS.md column per task,
// the totals across tasks (Base, + AGENTS.md, Delta) and cost per run, as in
// the agent-eval result PRs, then accuracy against cost as a Mermaid chart
// GitHub renders inline.
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

// Models: every cohort row from calibrate.sh's cohort.json, so queued models
// show too, plus any model that ran without being listed.
const cohortFile = join(jobs, 'cohort.json')
const cohort = existsSync(cohortFile)
  ? read(cohortFile).map((c) => ({
      model: label(c.model),
      harness: HARNESS[c.agent] ?? c.agent,
    }))
  : []
const seen = new Set(cohort.map((c) => c.model))
for (const r of [...runs].sort((a, b) => a.started.localeCompare(b.started))) {
  if (!seen.has(r.model)) {
    cohort.push({ model: r.model, harness: r.harness })
    seen.add(r.model)
  }
}
const models = cohort.map((c, order) => {
  const mine = runs.filter((r) => r.model === c.model)
  const base = tally(mine.filter((r) => r.treatment === 'base'))
  const docs = tally(mine.filter((r) => r.treatment === 'agents-md'))
  const modelCosts = mine
    .filter(scored)
    .map((r) => r.cost)
    .filter((x) => x != null)
  return { ...c, order, base, docs, cost: mean(modelCosts) }
})
const rate = (t) => (t.scored ? t.passed / t.scored : -1)
models.sort(
  (a, b) => rate(b.base) - rate(a.base) || rate(b.docs) - rate(a.docs)
)

const cell = (t) =>
  t.scored ? `${t.passed}/${t.scored} (${pct(t.passed, t.scored)})` : 'pending'
const delta = (a, b) => {
  if (!a.scored || !b.scored) return ''
  const pp = Math.round(100 * (b.passed / b.scored - a.passed / a.scored))
  return `${pp >= 0 ? '+' : ''}${pp} pp`
}
const mark = (r) =>
  !r
    ? '·'
    : r.state === 'pass'
      ? '✅'
      : r.state === 'fail'
        ? '❌'
        : r.state === 'running'
          ? '⏳'
          : '—'

// One table: a row per model, a base / AGENTS.md column per task, then the
// totals across tasks, the AGENTS.md delta, and cost per run.
console.log(
  '| Model | Harness | ' +
    tasks.map((t) => `\`${t}\``).join(' | ') +
    ' | Base | + AGENTS.md | Delta | Cost per run |'
)
console.log(
  '| --- | --- | ' +
    tasks.map(() => ':---:').join(' | ') +
    ' | ---: | ---: | ---: | ---: |'
)
for (const m of models) {
  const perTask = tasks.map((task) => {
    const find = (t) =>
      runs.find(
        (r) => r.task === task && r.model === m.model && r.treatment === t
      )
    return `${mark(find('base'))} / ${mark(find('agents-md'))}`
  })
  console.log(
    `| ${m.model} | ${m.harness} | ${perTask.join(' | ')} | ${cell(m.base)} | ${cell(m.docs)} | ${delta(m.base, m.docs)} | ${usd(m.cost)} |`
  )
}
const all = {
  base: tally(runs.filter((r) => r.treatment === 'base')),
  docs: tally(runs.filter((r) => r.treatment === 'agents-md')),
}
const allCosts = runs
  .filter(scored)
  .map((r) => r.cost)
  .filter((c) => c != null)
const bold = (v) => (v ? `**${v}**` : '')
if (all.base.scored || all.docs.scored) {
  console.log(
    `| **All models** | | ${tasks.map(() => '').join(' | ')} | ${bold(cell(all.base))} | ${bold(cell(all.docs))} | ${bold(delta(all.base, all.docs))} | ${bold(usd(mean(allCosts)))} |`
  )
}
console.log()
console.log(
  'Each task cell is base / AGENTS.md: ✅ pass, ❌ fail, ⏳ running, · not started, — runner error, rerun.'
)

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
const log = (v) => Math.log10(Math.max(v, 0.01))
const lo = points.length ? Math.min(...points.map((p) => log(p.cost))) : 0
const hi = points.length ? Math.max(...points.map((p) => log(p.cost))) : 0
const x = (v) => (hi === lo ? 0.5 : 0.05 + (0.9 * (log(v) - lo)) / (hi - lo))
const y = (v) => Math.min(0.97, Math.max(0.03, v))
console.log('```mermaid')
console.log('quadrantChart')
console.log('    title Accuracy vs cost per run')
console.log(
  points.length
    ? `    x-axis "${usd(Math.min(...points.map((p) => p.cost)))}" --> "${usd(Math.max(...points.map((p) => p.cost)))} per run"`
    : '    x-axis "cheaper" --> "more expensive per run"'
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
