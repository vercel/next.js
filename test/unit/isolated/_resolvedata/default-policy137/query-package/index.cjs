require('node:fs').writeFileSync(
  require('node:path').join(__dirname, 'query-evaluated'),
  'evaluated\n'
)
module.exports = ['chrome 100']
