/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  name: 'Code Documentation',
  entryPoints: ['src'],
  entryPointStrategy: 'Expand',
  tsconfig: './tsconfig.json',
  out: 'docs',
  commentStyle: 'all',
  plugin: 'typedoc-plugin-markdown', // comment out this line to generate html docs
}
