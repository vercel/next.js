require('./reporter-import-driver.cjs')({
  fixture: 'reporter-jsx-graphs',
  kinds: ['jsx', 'tsx', 'resolution'],
  extension: (kind) => (kind === 'resolution' ? 'tsx' : kind),
  prefix: 'jsx',
  label: 'JSX reporter',
  evidence: 'NEXT_TESTING_JSX_GRAPH_REPORTER_EVIDENCE',
  fact: 'jsxRelativeGraphsAndResolverOrder',
})
