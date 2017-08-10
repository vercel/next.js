// when pkg-ing the app we set NODE_ENV as production and require the `./server.js`
process.env.NODE_ENV = 'production'
require('./server.js')
