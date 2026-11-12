require('./jsx-coverage-reports.cjs')({
  fixture: 'jsx-standard',
  shapes: [
    ['basic', 'jsx'],
    ['conditional', 'tsx'],
  ],
  testFile: 'contract.test.mjs',
  filesOnly: false,
})
