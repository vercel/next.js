import {
  readFile,
  readdir,
  access,
  mkdtemp,
  writeFile,
  rm,
} from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import execa from 'execa'

const root = fileURLToPath(new URL('../', import.meta.url))
const suite = 'test/e2e/routing-server'
const separator = process.argv.indexOf('--')
const { values } = parseArgs({
  args: process.argv.slice(2, separator < 0 ? undefined : separator),
  options: {
    mode: { type: 'string', default: 'all' },
    bundler: { type: 'string', default: 'turbo' },
    group: { type: 'string', default: 'all' },
    core: { type: 'boolean', default: false },
    full: { type: 'boolean', default: false },
    dry: { type: 'boolean', default: false },
    concurrency: {
      type: 'string',
      default: String(Math.min(4, availableParallelism())),
    },
    list: { type: 'boolean', default: false },
  },
})
const forwarded = separator < 0 ? [] : process.argv.slice(separator + 1)
const concurrency = Number(values.concurrency)
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  throw new Error('--concurrency must be a positive integer')
}
if (values.core && values.full) {
  throw new Error('--core and --full select different profiles; choose one')
}

function validateOption(name, choices) {
  if (!choices.includes(values[name])) {
    throw new Error(`--${name} must be one of: ${choices.join(', ')}`)
  }
}

validateOption('mode', ['all', 'start', 'dev', 'deploy'])
validateOption('bundler', ['turbo', 'webpack', 'rspack'])
validateOption('group', ['all', 'http', 'router'])
if (values.mode === 'deploy' && values.bundler === 'rspack') {
  throw new Error('Rspack routing tests support local start/dev modes only')
}

const contracts = JSON.parse(
  await readFile(path.join(root, suite, 'contracts.json'), 'utf8')
)
const expectedIds = [
  ...Array.from({ length: 10 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 34 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`),
]
if (
  contracts.length !== expectedIds.length ||
  expectedIds.some((id) => contracts.filter((c) => c.id === id).length !== 1)
) {
  throw new Error(
    'The routing contract must contain H01–H10 and R01–R34 once each'
  )
}

// Validate before invoking Jest: a stale companion path must fail selection,
// rather than disappear from the regression gate.
for (const contract of contracts) {
  const group = contract.id.startsWith('H') ? 'http' : 'router'
  if (contract.group !== group) {
    throw new Error(`${contract.id} must belong to the ${group} group`)
  }
  if (!contract.tests.length || !contract.docs.length) {
    throw new Error(`${contract.id} needs documentation and test references`)
  }
  if (!Array.isArray(contract.routingTests) || !contract.routingTests.length) {
    throw new Error(`${contract.id} needs focused routing test references`)
  }
  for (const selection of contract.routingTests) {
    const file = typeof selection === 'string' ? selection : selection.file
    if (!contract.tests.includes(file)) {
      throw new Error(
        `${contract.id} routing test is missing from tests: ${file}`
      )
    }
    if (typeof selection !== 'string') {
      if (
        !selection.testNamePattern ||
        typeof selection.testNamePattern !== 'string'
      ) {
        throw new Error(`${file} needs a nonempty testNamePattern`)
      }
      new RegExp(selection.testNamePattern)
    }
  }
  if (contract.tests.some((file) => !/\.test\.[jt]sx?$/.test(file))) {
    throw new Error(`${contract.id} must reference individual e2e test files`)
  }
  for (const file of [...contract.tests, ...contract.docs]) {
    if (path.isAbsolute(file) || file.split('/').includes('..')) {
      throw new Error(`Expected a repository-relative contract path: ${file}`)
    }
    await access(path.join(root, file))
  }
}

async function findTests(directory) {
  const result = []
  for (const entry of await readdir(path.join(root, directory), {
    withFileTypes: true,
  })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue
    const file = `${directory}/${entry.name}`
    if (entry.isDirectory()) result.push(...(await findTests(file)))
    else if (/\.test\.[jt]sx?$/.test(entry.name)) result.push(file)
  }
  return result
}

const groups = values.group === 'all' ? ['http', 'router'] : [values.group]
const selected = new Map(
  (await Promise.all(groups.map((group) => findTests(`${suite}/${group}`))))
    .flat()
    .map((file) => [file, new Set()])
)
if (!values.core) {
  for (const contract of contracts) {
    if (groups.includes(contract.group)) {
      for (const selection of values.full
        ? contract.tests
        : contract.routingTests) {
        const file = typeof selection === 'string' ? selection : selection.file
        const pattern =
          typeof selection === 'string' ? undefined : selection.testNamePattern
        if (!selected.has(file))
          selected.set(file, new Set(pattern ? [pattern] : []))
        else if (!pattern) selected.get(file).clear()
        else if (selected.get(file).size > 0) selected.get(file).add(pattern)
      }
    }
  }
}
const modes = values.mode === 'all' ? ['start', 'dev'] : [values.mode]
const environment = { ...process.env }
// The selected wrapper sets these. Do not accidentally combine two bundlers
// when a developer launches this command from an existing test environment.
for (const name of [
  'IS_WEBPACK_TEST',
  'IS_TURBOPACK_TEST',
  'NEXT_RSPACK',
  'NEXT_TEST_USE_RSPACK',
]) {
  delete environment[name]
}
// Each fixture already builds in its own directory. Limit the Rust thread
// pools too, so concurrent builds do not each try to use the whole machine.
environment.TURBO_TASKS_AVAILABLE_PARALLELISM ??= String(
  Math.min(4, Math.max(1, Math.floor(availableParallelism() / concurrency)))
)
environment.NEXT_TEST_SKIP_RESULT_CACHE = '1'

let failed = false
const started = performance.now()
for (const mode of modes) {
  const selections = [...selected]
    .filter(([file]) => {
      if (file.startsWith('test/development/')) return mode === 'dev'
      if (file.startsWith('test/production/')) return mode === 'start'
      return file.startsWith('test/e2e/')
    })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, patterns]) => ({
      file,
      ...(patterns.size
        ? {
            testNamePattern: [...patterns]
              .map((pattern) => `(?:${pattern})`)
              .join('|'),
          }
        : {}),
    }))
  if (!selections.length)
    throw new Error(`No routing tests selected for ${mode}`)
  console.log(
    `Routing server: ${mode}, ${values.bundler}, ${selections.length} files, ${concurrency} workers (${values.full ? 'full' : values.core ? 'core' : 'routing'} profile)`
  )
  if (values.list) {
    for (const selection of selections) {
      console.log(
        selection.file +
          (selection.testNamePattern
            ? ` [cases: ${selection.testNamePattern}]`
            : '')
      )
    }
    continue
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'routing-tests-'))
  const selectionFile = path.join(directory, 'suites.json')
  const modeStarted = performance.now()
  try {
    await writeFile(selectionFile, JSON.stringify(selections))
    const result = await execa(
      process.execPath,
      [
        'run-tests.js',
        '--suite-list',
        selectionFile,
        '--concurrency',
        String(concurrency),
        // Retries can reset fixture source files; never do that to a local
        // work-in-progress suite. A known contract failure stays a failure.
        '--retries',
        '0',
        '--local',
        ...(values.dry ? ['--dry'] : []),
        '--jest-args',
        JSON.stringify(forwarded),
      ],
      {
        cwd: root,
        env: {
          ...environment,
          NEXT_TEST_MODE: mode,
          ...(values.bundler === 'turbo'
            ? { IS_TURBOPACK_TEST: '1' }
            : values.bundler === 'webpack'
              ? { IS_WEBPACK_TEST: '1' }
              : { NEXT_RSPACK: '1', NEXT_TEST_USE_RSPACK: '1' }),
        },
        stdio: 'inherit',
        reject: false,
      }
    )
    if (result.signal) {
      throw new Error(`Routing ${mode} run terminated by ${result.signal}`)
    }
    if (result.exitCode !== 0) failed = true
  } finally {
    await rm(directory, { recursive: true, force: true })
    console.log(
      `Routing ${mode} elapsed: ${((performance.now() - modeStarted) / 1000).toFixed(1)}s`
    )
  }
}
if (!values.list)
  console.log(
    `Routing total elapsed: ${((performance.now() - started) / 1000).toFixed(1)}s`
  )
process.exitCode = failed ? 1 : 0
