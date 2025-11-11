'use cache'

// @ts-ignore
import { getCachedStuff, wrap } from './foo'
// @ts-ignore
export { getData } from './data'

export const getCachedData = async () => {
  // This one already worked before.
  return getCachedStuff()
}

export const aliased = getCachedStuff

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
export { Other, getCachedStuff }
