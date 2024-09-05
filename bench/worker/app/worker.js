console.log('hello from the worker')

import('./worker-dep').then((v) => console.log('dynamic import', v.default))
