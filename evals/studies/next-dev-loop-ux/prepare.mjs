import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  downloadSource,
  patchSortHelper,
  source as pinnedSource,
} from '../../evals/agent-062-pokedex-dev-loop/eval-setup.mjs'

export { patchSortHelper }
export const study = dirname(fileURLToPath(import.meta.url))
export const fixtureRoot = resolve(
  study,
  '../../evals/agent-062-pokedex-dev-loop'
)
export const task = {
  ...JSON.parse(readFileSync(join(study, 'task.json'), 'utf8')),
  ...pinnedSource,
}

// Reuse the normal eval's prompt and starting app for the metrics comparison.
export async function prepare(destination) {
  mkdirSync(destination)
  const source = join(destination, 'source')
  await downloadSource(source)
  const fixture = join(destination, 'fixture')
  cpSync(join(source, 'template'), fixture, { recursive: true })
  for (const name of ['app', 'AGENTS.md', 'PROMPT.md']) {
    cpSync(join(fixtureRoot, name), join(fixture, name), { recursive: true })
  }
  const helper = join(fixture, 'tests/specs/helpers.mjs')
  writeFileSync(helper, patchSortHelper(readFileSync(helper, 'utf8')))
  const packagePath = join(fixture, 'package.json')
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
  pkg.scripts.test = `APP_PORT=3101 ${pkg.scripts.test}`
  writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
  return { source, fixture }
}
