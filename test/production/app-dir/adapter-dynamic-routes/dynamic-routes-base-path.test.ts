import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { type AdapterRouting } from './dynamic-routes-snapshot'

const basePath = '/base'

// This suite builds the Cache Components fixture a second time under a base
// path.
//
// A base path belongs to the request, not to the route. The build writes
// artifacts under the route's own path. The adapter prefixes the entries that
// match incoming requests.
//
// A collapse rewrites the source regex and the destination of an entry, and
// both carry the prefix. A collapse can therefore drop the prefix or add it
// twice. This suite asserts the prefix as a property of every entry. It does
// not snapshot the table a second time.
describe(`adapter dynamic routes (cache components, base path ${basePath})`, () => {
  const { next } = nextTestSetup({
    files: path.join(__dirname, 'cache-components'),
    env: { BASE_PATH: basePath },
    // The fixture sets `generateBuildId`, and this option lets that value
    // take effect. The harness otherwise assigns a new build ID for each run.
    // A build ID that reaches an entry then changes the assertions on every
    // run.
    disableAutoSkewProtection: true,
  })

  it('prefixes every entry with the base path', async () => {
    const routing: AdapterRouting = await next.readJSON('build-complete.json')

    // A base path prefixes the entries. It does not add or remove any.
    expect(routing.dynamicRoutes).toHaveLength(7)

    for (const route of routing.dynamicRoutes) {
      expect(route.sourceRegex.startsWith(`^${basePath}`)).toBe(true)
      expect(route.destination.startsWith(`${basePath}/`)).toBe(true)

      // The prefix appears exactly once. An entry that carries the prefix
      // twice still starts with it, so a check on the start alone accepts
      // that entry. The two occurrences also do not have to be adjacent.
      expect(route.sourceRegex).toIncludeRepeated(basePath, 1)
      expect(route.destination).toIncludeRepeated(basePath, 1)
    }
  })
})
