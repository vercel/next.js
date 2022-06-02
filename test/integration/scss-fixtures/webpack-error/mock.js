let originalLoader
const M = require('module')
originalLoader = M._load
M._load = function hookedLoader(request, parent, isMain) {
  if (request === 'node-sass') request = 'node-sass-begone'
  return originalLoader(request, parent, isMain)
}
