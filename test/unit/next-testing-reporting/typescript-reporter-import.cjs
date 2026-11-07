require('./reporter-import-driver.cjs')({
  fixture: 'reporter-typescript',
  kinds: ['ts', 'mts'],
  sourceFiles: (extension) => [
    ['reporter.ts.txt', 'reporter.' + extension],
    ['reporter-dependency.ts.txt', 'reporter-dependency.ts'],
  ],
  prefix: 'typed',
  label: 'TypeScript reporter',
  evidence: 'NEXT_TESTING_TYPESCRIPT_REPORTER_EVIDENCE',
  fact: 'typedLocalDependencyAndOriginalErrors',
})
