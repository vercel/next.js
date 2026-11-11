require('./reporter-import-driver.cjs')({
  fixture: 'reporter-graphs',
  kinds: ['directory', 'js-remap', 'dynamic-directory', 'mixed-js-ts'],
  extension: () => 'ts',
  hashAllInputs: true,
  prefix: 'typed',
  label: 'Reporter dependency graph',
  evidence: 'NEXT_TESTING_REPORTER_GRAPH_EVIDENCE',
  fact: 'typedDirectoryOutputDynamicAndMixedImports',
})
