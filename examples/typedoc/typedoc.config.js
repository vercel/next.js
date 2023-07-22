/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  name: 'Code Documentation',
  entryPoints: ['src'],
  entryPointStrategy: 'Expand',
  tsconfig: './tsconfig.json',
  out: 'docs',
  commentStyle: 'all',
}
