import {
  collectTestCases,
  selectedCases,
  type TestSuite,
} from '../runner/collector'
import { resolveFixtureDefinitions } from '../runner/fixtures'

/** Refuse altered shared-file/hook/async semantics before evaluating any case. */
export function validateSynchronousClient(
  root: TestSuite,
  options: {
    testNamePattern?: string | RegExp
    allowOnly?: boolean
    retry?: unknown
  }
) {
  if (options.retry !== undefined && options.retry !== 0)
    throw new Error(
      'Browser Mode retries require separately qualified page lifetimes.'
    )
  function walk(suite: TestSuite) {
    if (
      Object.values(suite.hooks).some((hooks) => hooks.length) ||
      Object.values(suite.around).some((hooks) => hooks.length)
    )
      throw new Error(
        'Browser Mode hooks and fixture lifetimes are not supported yet.'
      )
    for (const task of [suite, ...suite.children]) {
      if (
        task.options.concurrent ||
        (task.options.retry !== undefined && task.options.retry !== 0) ||
        (task.options.repeats !== undefined && task.options.repeats !== 0)
      )
        throw new Error(
          'Browser Mode currently requires one synchronous attempt without retry, repeat or concurrency.'
        )
      if (task !== suite && task.type === 'suite') walk(task)
    }
  }
  walk(root)
  const selected = collectTestCases(root, options)
  if (selected.length !== 1)
    throw new Error(
      'Browser Mode currently requires exactly one selected runnable case per fresh file/page.'
    )
  for (const [test, mode] of selectedCases(root)) {
    if (mode !== 'run' || test.id !== selected[0].id) continue
    if (
      Object.keys(resolveFixtureDefinitions(test.fixtures, test.suite)).length
    )
      throw new Error(
        'Browser Mode file, worker and test fixtures are not supported yet.'
      )
    if (!test.fn || !['Function'].includes(test.fn.constructor.name))
      throw new Error(
        'Browser Mode currently requires a synchronous test callback.'
      )
  }
}
