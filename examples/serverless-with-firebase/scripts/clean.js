const del = require('del')

const patterns = [
  'dist',
  '.firebase'
]

del(patterns).then(paths => {
  console.log('Deleted folders or files:\n', paths.join('\n'))
})
