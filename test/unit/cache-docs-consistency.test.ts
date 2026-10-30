import { readFileSync } from 'fs'
import { join } from 'path'

const apiReferenceDir = join(process.cwd(), 'docs/01-app/03-api-reference')

function readDoc(path: string) {
  return readFileSync(join(apiReferenceDir, path), 'utf8')
}

describe('cache API documentation', () => {
  it('keeps cross-deployment persistence guidance consistent', () => {
    const unstableCache = readDoc('04-functions/unstable_cache.mdx')
    const useCache = readDoc('01-directives/use-cache.mdx')
    const useCacheRemote = readDoc('01-directives/use-cache-remote.mdx')

    expect(unstableCache).toMatch(
      /Continue using `unstable_cache` for non-`fetch` data that must persist across deployments/
    )
    expect(useCache).toMatch(
      /persist across deploys,[^\n]+`unstable_cache`[^\n]+non-`fetch` functions/
    )
    expect(useCacheRemote).toMatch(
      /persist across deploys,[^\n]+`unstable_cache`[^\n]+non-`fetch` functions/
    )
  })
})
