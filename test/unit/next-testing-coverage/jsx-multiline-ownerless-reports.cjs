require('./jsx-coverage-reports.cjs')({
  fixture: 'jsx-multiline-ownerless',
  coverageFile: (mode) => mode + '/prior-coverage.json',
  genuineCoverage: true,
})
