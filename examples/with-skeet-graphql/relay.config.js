module.exports = {
  src: './src',
  language: 'typescript',
  schema: './graphql/src/schema/schema.graphql',
  artifactDirectory: 'src/__generated__',
  exclude: [
    '**/node_modules/**',
    '**/__mocks__/**',
    '**/__generated__/**',
    '**/posts/**',
    '**/test/**',
    '**/public/**',
    '**/.next/**',
    '**/out/**',
    '**/web-build/**',
    '**/functions/**',
    '**/graphql/**',
  ],
}
