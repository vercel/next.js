module.exports = {
  root: './',
  sources: {
    'project-a/pages': ['project-a', 'should-fail'],
    'project-b/pages': 'project-b',
  },
  projects: {
    'should-fail': {
      schema: 'schema.graphql',
      language: 'typescript',
      output: '__generated__',
    },
    'project-a': {
      schema: 'schema.graphql',
      language: 'typescript',
      output: '__generated__',
    },
    'project-b': {
      schema: 'schema.graphql',
      language: 'typescript',
      output: '__generated__',
    },
  },
}
