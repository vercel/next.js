require('./jsx-coverage-reports.cjs')({
  fixture: 'jsx-owners-public',
  shapes: [['fragment', 'tsx']],
  testFile: 'contract.test.mjs',
  expectedTests: 2,
  coverageFile: (mode) => 'pristine-coverage-' + mode + '.json',
  filesOnly: false,
})
