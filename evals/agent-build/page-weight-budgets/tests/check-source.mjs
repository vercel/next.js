// Source checks for nextjs/page-weight-budgets.
//
// Only the constraint the instruction states and behavior cannot show: no new
// dependencies. How the pages get within budget is left to the agent; the
// budgets, the product added before the build, and the behavior checks decide.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.env.EVAL_APP_ROOT ?? '/app'
const baseGit = process.env.EVAL_BASE_GIT ?? '/opt/eval/base.git'
const before = JSON.parse(
  execFileSync('git', ['--git-dir', baseGit, 'show', 'HEAD:package.json'], {
    encoding: 'utf8',
  })
)
const after = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
for (const field of ['dependencies', 'devDependencies']) {
  if (
    JSON.stringify(before[field] ?? {}) !== JSON.stringify(after[field] ?? {})
  ) {
    throw new Error(
      `package.json ${field} changed; the instruction rules out new dependencies.`
    )
  }
}
console.log('source checks passed')
