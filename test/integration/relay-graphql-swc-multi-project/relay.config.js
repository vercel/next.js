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
      output: 'project-a/__generated__',
    },
    'project-b': {
      schema: 'schema.graphql',
      language: 'typescript',
      output: 'project-b/__generated__',
    },
  },
}
