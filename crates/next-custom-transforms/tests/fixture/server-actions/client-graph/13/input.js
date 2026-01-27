'use cache'

// @ts-ignore
import { getStuff, wrap } from './foo'
// @ts-ignore
export { getData } from './data'

export const getCachedData = async () => {
  // This is not using the wrapped version of getStuff, as we're only
  // runtime-wrapping what flows out of the module, not into it. Would one
  // expect this to be cached?
  return getStuff()
}

export const aliased = getStuff

const Layout = wrap(async () => <div>Layout</div>)
const Other = wrap(async () => <div>Other</div>)
export const Sync = wrap(() => <div>Sync</div>)

export const wrapped = wrap(
  async () => 'foo',
  async () => 'bar',
  async () => async () => 'baz',
  () => 'sync'
)

export default Layout
export { Other, getStuff, staticallyKnownFunction }

async function staticallyKnownFunction() {}
