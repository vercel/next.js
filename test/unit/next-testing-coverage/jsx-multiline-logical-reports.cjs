require('./jsx-coverage-reports.cjs')({
  fixture: 'jsx-multiline-logical',
  coverageFile: (mode) => mode + '/pristine-coverage.json',
})
