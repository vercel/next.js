// These independent expectations describe declaration and result states once.
// Every callback still compares its complete tree, identity flag and ordering.
export const publicModeConfig = {
  test: {
    include: ['*.case.mjs'],
    maxWorkers: 1,
    cache: false,
    testTimeout: 10000,
    sequence: { seed: 1 },
    environment: 'node',
  },
}

export function publicModeExpectations(
  expected,
  { reporter = true, junit = false } = {}
) {
  const tree = (task, stage) => ({
    type: task.type,
    name: task.name,
    state:
      stage === 'collected' ? task.collected : (task.ended ?? task.collected),
    ...(task.type === 'module' ? {} : { mode: task.mode }),
    errors: [],
    ...(task.type === 'test'
      ? {}
      : { children: task.children.map((child) => tree(child, stage)) }),
  })
  const root = {
    type: 'module',
    name: 'modes.case.mjs',
    collected: expected.collected,
    ended: expected.ended,
    children: expected.tasks,
  }
  const cases = []
  const visit = (tasks, ancestors = []) => {
    for (const task of tasks) {
      if (task.type === 'test') cases.push({ task, ancestors })
      else visit(task.children, [...ancestors, task.name])
    }
  }
  visit(expected.tasks)
  const authoredRows = expected.authoredEvents.map((event) => ({
    actor: 'author',
    event,
  }))
  const reporterRows = reporter
    ? [
        {
          actor: 'reporter',
          event: 'queued',
          tree: { ...tree(root, 'collected'), state: 'pending', children: [] },
        },
        {
          actor: 'reporter',
          event: 'collected',
          tree: tree(root, 'collected'),
        },
        ...cases.map(({ task }) => ({
          actor: 'reporter',
          event: 'case-result',
          tree: tree(task, 'ended'),
        })),
        {
          actor: 'reporter',
          event: 'end',
          sameCollected: true,
          tree: tree(root, 'ended'),
        },
        {
          actor: 'reporter',
          event: 'run-end',
          reason: 'passed',
          errors: [],
          modules: [{ sameCollected: true, tree: tree(root, 'ended') }],
        },
      ]
    : []
  if (junit)
    return {
      reporterRows,
      authoredRows,
      junitCaseAndCountProjection: {
        suiteCounts: {
          tests: String(expected.counts.tests),
          failures: '0',
          errors: '0',
          skipped: String(expected.counts.pendingTests),
        },
        testcases: cases.map(({ task, ancestors }) => ({
          attributes: {
            classname: 'modes.case.mjs',
            name: [...ancestors, task.name].join(' &gt; '),
          },
          children: [],
        })),
      },
    }
  return {
    status: 0,
    reporterRows,
    authoredRows,
    stable: {
      counts: {
        numTotalTestSuites: expected.counts.suites,
        numPassedTestSuites: expected.counts.passedSuites,
        numFailedTestSuites: 0,
        numPendingTestSuites: expected.counts.pendingSuites,
        numTotalTests: expected.counts.tests,
        numPassedTests: expected.counts.passedTests,
        numFailedTests: 0,
        numPendingTests: expected.counts.pendingTests,
        numTodoTests: expected.counts.todoTests,
        success: true,
      },
      snapshot: {
        added: 0,
        failure: false,
        filesAdded: 0,
        filesRemoved: 0,
        filesRemovedList: [],
        filesUnmatched: 0,
        filesUpdated: 0,
        matched: 0,
        total: 0,
        unchecked: 0,
        uncheckedKeysByFile: [],
        unmatched: 0,
        updated: 0,
        didUpdate: false,
      },
      files: [
        {
          name: 'modes.case.mjs',
          status: 'passed',
          message: '',
          assertionResults: cases.map(({ task, ancestors }) => ({
            ancestorTitles: ancestors,
            fullName: [...ancestors, task.name].join(' '),
            status:
              task.mode === 'todo'
                ? 'todo'
                : task.mode === 'skip'
                  ? 'skipped'
                  : (task.ended ?? task.collected),
            title: task.name,
            failureMessages: [],
            meta: {},
            tags: [],
            benchmarks: [],
          })),
        },
      ],
    },
  }
}
