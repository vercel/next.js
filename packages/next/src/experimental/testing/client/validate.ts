import { selectedCases, type TestSuite } from '../runner/collector'
import { resolveFixtureDefinitions } from '../runner/fixtures'
import { clientDeclarations, resolveClientDeclarations } from './collection'

/** Keep numeric serial attempts separate from unsupported fixture/concurrency paths. */
export function validateSynchronousClient(
  root: TestSuite,
  options: {
    testNamePattern?: string | RegExp
    allowOnly?: boolean
    retry?: unknown
  }
) {
  const numeric = (value: unknown) =>
    value === undefined ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
  if (!numeric(options.retry))
    throw new Error(
      'Browser Mode currently supports numeric retry counts only.'
    )
  function walk(suite: TestSuite) {
    for (const task of [suite, ...suite.children]) {
      if (
        task.options.concurrent ||
        !numeric(task.options.retry) ||
        !numeric(task.options.repeats)
      )
        throw new Error(
          'Browser Mode currently requires serial numeric retries/repeats without concurrency.'
        )
      if (task !== suite && task.type === 'suite') walk(task)
    }
  }
  walk(root)
  const declarations = clientDeclarations(root)
  const selected = resolveClientDeclarations(
    declarations,
    root.id,
    options
  ).cases
  for (const [test, mode] of selectedCases(root)) {
    if (mode !== 'run' || selected.get(test.id)?.mode !== 'run') continue
    if (
      Object.keys(resolveFixtureDefinitions(test.fixtures, test.suite)).length
    )
      throw new Error(
        'Browser Mode file, worker and test fixtures are not supported yet.'
      )
  }
  return declarations
}
