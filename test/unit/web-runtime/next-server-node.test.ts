import 'next/src/server/node-polyfill-fetch'

it('should be able to require next/server outside edge', () => {
  require('next/server')
})
