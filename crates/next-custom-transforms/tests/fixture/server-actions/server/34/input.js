'use cache'

export { foo }

const foo = async function () {
  return 'bar'
}

// output

import { cache as $cache } from '...'

export { foo }

const foo = $cache(async function () {
  return 'bar'
})

registerServerReference('', foo)
