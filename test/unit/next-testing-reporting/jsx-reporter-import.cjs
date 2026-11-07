require('./reporter-import-driver.cjs')({
  fixture: 'reporter-jsx',
  kinds: ['jsx', 'tsx'],
  sourceFiles: (extension) => [
    ['reporter.' + extension + '.txt', 'reporter.' + extension],
  ],
  prefix: 'jsx',
  label: 'JSX reporter',
  evidence: 'NEXT_TESTING_JSX_REPORTER_EVIDENCE',
  fact: 'jsxEvaluationAndOriginalErrors',
})
