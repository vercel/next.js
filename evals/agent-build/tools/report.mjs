// Render a calibrate.sh jobs directory as the Results section of an eval pull
// request: one dense table with a row per model and treatment, a cell per
// task, the runs passed, the AGENTS.md delta, then price per million tokens,
// tokens, cost, and time per run, as in the agent-eval result PRs,
// then pass@1 against cost per run as a Mermaid chart GitHub renders inline.
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
  // Use the regrade only when it produced a valid score; a regrade that hit a
  // sandbox or verifier error keeps the original reward.
  const regradeScored =
    regrade?.finished_at &&
    regradeEval &&
    !runnerError(regradeEval) &&
    Number.isFinite(regradeEval.metrics?.[0]?.mean)
  const reward = regradeScored
    ? regradeEval.metrics[0].mean
    : evaluation.metrics?.[0]?.mean
  // Confirmation reruns of a valid failure (calibrate.sh --confirm).
  const confirms = [1, 2]
    .map((n) => join(jobs, '_confirm', `${name}__confirm-${n}`, 'result.json'))
    .filter((file) => existsSync(file))
    .map((file) => read(file))
    .filter((r) => r.finished_at)
    .map((r) => Object.values(r.stats?.evals ?? {})[0] ?? {})
    .filter((ev) => !runnerError(ev))
  runs.push({
    confirmed: confirms.length,
    repeated: confirms.filter((ev) => !(ev.metrics?.[0]?.mean >= 1)).length,
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
    tokensIn: result.stats?.n_input_tokens ?? null,
    tokensOut: result.stats?.n_output_tokens ?? null,
    minutes: result.finished_at
      ? (new Date(result.finished_at) - new Date(result.started_at)) / 60000
      : null,
  })
}

const tasks = taskArgs.length
  ? taskArgs.map((t) => t.replace(/\/$/, '').split('/').pop())
  : [...new Set(runs.map((r) => r.task))].sort()
const scored = (r) => r.state === 'pass' || r.state === 'fail'
const count = (v) =>
  v == null
    ? ''
    : v >= 1e6
      ? `${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `${Math.round(v / 1e3)}k`
        : String(Math.round(v))
const duration = (m) => (m == null ? '' : `${Math.round(m)} min`)
// Effective price per million tokens: what the runs cost divided by the
// tokens they used, so cached input is already reflected in the rate.
const perMillion = (cost, i, o) =>
  cost == null || i == null || i + (o ?? 0) === 0
    ? ''
    : `$${((1e6 * cost) / (i + (o ?? 0))).toFixed(2)}`
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
  const scoredRuns = mine.filter(scored)
  const avg = (key) =>
    mean(scoredRuns.map((r) => r[key]).filter((x) => x != null))
  return {
    ...c,
    order,
    base,
    docs,
    cost: mean(modelCosts),
    tokensIn: avg('tokensIn'),
    tokensOut: avg('tokensOut'),
    minutes: avg('minutes'),
  }
})
const rate = (t) => (t.scored ? t.passed / t.scored : -1)
models.sort(
  (a, b) => rate(b.base) - rate(a.base) || rate(b.docs) - rate(a.docs)
)

const cell = (t) => (t.scored ? `${t.passed}/${t.scored}` : 'pending')
const delta = (a, b) => {
  if (!a.scored || !b.scored) return ''
  const pp = Math.round(100 * (b.passed / b.scored - a.passed / a.scored))
  return `${pp >= 0 ? '+' : ''}${pp} pp`
}

// One dense table: a row per model and treatment, a short numbered column per
// task (named in a key above the table), runs passed, the AGENTS.md delta, and
// what a run costs.
const taskCell = (r) =>
  !r
    ? 'queued'
    : r.state === 'pass'
      ? 'pass'
      : r.state === 'fail'
        ? r.confirmed
          ? `fail (${r.repeated}/${r.confirmed} reruns)`
          : 'fail'
        : r.state === 'running'
          ? 'running'
          : 'rerun'
const costs = (rs) => {
  const s = rs.filter(scored)
  const avg = (key) => mean(s.map((r) => r[key]).filter((x) => x != null))
  const cost = avg('cost')
  const tin = avg('tokensIn')
  const tout = avg('tokensOut')
  return `${usd(cost)} | ${duration(avg('minutes'))} | ${perMillion(cost, tin, tout)} | ${tin == null ? '' : `${count(tin)} / ${count(tout)}`}`
}
console.log(
  `Tasks: ${tasks.map((t, i) => `**${i + 1}** \`${t}\``).join(', ')}.`
)
console.log()
console.log(
  `| Model | Treatment | ${tasks.map((_, i) => i + 1).join(' | ')} | Passed | Delta | Cost per run | Time per run | Price per 1M tokens | Tokens in / out |`
)
console.log(
  `| --- | --- | ${tasks.map(() => ':---:').join(' | ')} | ---: | ---: | ---: | ---: | ---: | ---: |`
)
const treatments = [
  ['base', 'Base'],
  ['agents-md', 'AGENTS.md'],
]
for (const m of models) {
  for (const [t, name] of treatments) {
    const mine = runs.filter((r) => r.model === m.model && r.treatment === t)
    const cells = tasks.map((task) =>
      taskCell(mine.find((r) => r.task === task))
    )
    const passed = t === 'base' ? m.base : m.docs
    console.log(
      `| ${t === 'base' ? m.model : ''} | ${name} | ${cells.join(' | ')} | ${cell(passed)} | ${t === 'base' ? '' : delta(m.base, m.docs)} | ${costs(mine)} |`
    )
  }
}
const all = {
  base: tally(runs.filter((r) => r.treatment === 'base')),
  docs: tally(runs.filter((r) => r.treatment === 'agents-md')),
}
if (all.base.scored || all.docs.scored) {
  for (const [t, name] of treatments) {
    const mine = runs.filter((r) => r.treatment === t)
    console.log(
      `| ${t === 'base' ? '**All models**' : ''} | ${name} | ${tasks.map((task) => cell(tally(mine.filter((r) => r.task === task)))).join(' | ')} | ${cell(t === 'base' ? all.base : all.docs)} | ${t === 'base' ? '' : delta(all.base, all.docs)} | ${costs(mine)} |`
    )
  }
}

const expected = tasks.length * models.length * 2
const unscored = expected - runs.filter(scored).length
if (unscored > 0) {
  console.log()
  console.log(
    `${unscored} of ${expected} runs are not scored yet. Counts are passed out of scored runs.`
  )
}

// Pass@1 against cost per run, one point per model across all scored runs, as
// SelfBench charts its results. Cost uses a log scale so cheap models spread
// out, and points that would overlap are nudged apart so every label stays
// readable.
const charted = models
  .map((m) => {
    const scoredRuns = runs.filter((r) => r.model === m.model && scored(r))
    const costs = scoredRuns.map((r) => r.cost).filter((x) => x != null)
    return {
      name: m.model.replace(/^Claude /, ''),
      accuracy: scoredRuns.length
        ? (100 * scoredRuns.filter((r) => r.state === 'pass').length) /
          scoredRuns.length
        : null,
      cost: mean(costs),
    }
  })
  .filter((m) => m.accuracy != null && m.cost != null && m.cost > 0)

console.log()
if (charted.length === 0) {
  console.log('_The chart appears after the first scored run._')
} else {
  const costs = charted.map((m) => m.cost)
  const lo = Math.log(Math.min(...costs) / 2)
  const hi = Math.log(Math.max(...costs) * 2)
  const points = charted.map((m) => ({
    ...m,
    x: 0.06 + (0.88 * (Math.log(m.cost) - lo)) / (hi - lo),
    y: 0.06 + (0.88 * m.accuracy) / 100,
  }))
  // Move a point that sits on one already placed to the nearest free spot,
  // trying below and then above, so the loop always ends inside the chart.
  const placed = []
  const clashes = (p, y) =>
    placed.some((q) => Math.abs(q.x - p.x) < 0.3 && Math.abs(q.y - y) < 0.06)
  for (const p of [...points].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const candidates = [0, 1, 2, 3, 4, 5].flatMap((i) => [
      p.y - 0.06 * i,
      p.y + 0.06 * i,
    ])
    p.y =
      candidates.find((y) => y >= 0.02 && y <= 0.98 && !clashes(p, y)) ?? p.y
    placed.push(p)
  }
  console.log('```mermaid')
  console.log('---')
  console.log('config:')
  console.log('  quadrantChart:')
  console.log('    chartWidth: 640')
  console.log('    chartHeight: 420')
  console.log('    pointLabelFontSize: 14')
  console.log('    quadrantPadding: 2')
  console.log('---')
  console.log('quadrantChart')
  console.log('    title Pass@1 against cost per run, all runs')
  console.log('    x-axis "Cheaper per run" --> "More expensive per run"')
  console.log('    y-axis "Lower pass@1" --> "Higher pass@1"')
  for (const p of points) {
    console.log(
      `    ${p.name}, ${Math.round(p.accuracy)}%, ${usd(p.cost)}: [${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`
    )
  }
  console.log('```')
}
