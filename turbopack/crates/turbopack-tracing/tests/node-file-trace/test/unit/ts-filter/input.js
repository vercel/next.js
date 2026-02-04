const { join } = require('path')
require('pkg')

// asset reference to ts file in node_modules
// should not cause ts file to be compiled
fs.readFileSync(join(__dirname, 'node_modules', 'pkg', 'index.ts'))
