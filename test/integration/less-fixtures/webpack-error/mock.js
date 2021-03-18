let originalLoader
const M = require('module')
originalLoader = M._load
M._load = function hookedLoader(request, parent, isMain) {
  if (request === 'less') request = 'less-begone'
  return originalLoader(request, parent, isMain)
}
