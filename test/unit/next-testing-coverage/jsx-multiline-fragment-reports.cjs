require('./jsx-coverage-reports.cjs')({
  fixture: 'jsx-multiline-fragment',
  coverageFile: (mode) => mode + '/pristine-coverage.json',
  genuineCoverage: true,
  resultFields: { retainedDevelopmentDelta: false },
})
