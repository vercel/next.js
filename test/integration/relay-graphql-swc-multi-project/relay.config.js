module.exports = {
  root: './',
  sources: {
    'project-a/pages': 'project-a',
    'project-b/pages': 'project-b',
  },
  projects: {
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
