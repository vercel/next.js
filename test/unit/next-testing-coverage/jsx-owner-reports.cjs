require('./jsx-coverage-reports.cjs')({
  fixture: 'jsx-owners-public',
  shapes: [
    ['nested', 'jsx'],
    ['logical', 'tsx'],
    ['arrow', 'tsx'],
  ],
  testFile: 'contract.test.mjs',
  filesOnly: false,
})
