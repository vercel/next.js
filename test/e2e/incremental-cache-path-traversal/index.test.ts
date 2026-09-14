import { nextTestSetup } from 'e2e-utils'
import path from 'path'

const enableCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'
const isAdapterTest = process.env.NEXT_ENABLE_ADAPTER === '1'

const describeSkipCacheComponents = enableCacheComponents
  ? describe.skip
  : describe

describeSkipCacheComponents('incremental-cache path traversal', () => {
  const { isNextDeploy, next } = nextTestSetup({ files: __dirname })

  it('serves arbitrary json files', async () => {
    const sep = path.sep
    const trav = `..${encodeURIComponent(sep)}..${encodeURIComponent(sep)}server-reference-manifest`

    await next.fetch(`/app-cache/${trav}`)

    const res = await next.fetch(
      `/_next/data/${encodeURIComponent(next.buildId)}/pages-cache/${trav}.json`
    )
    const text = await res.text()
    let json: { encryptionKey?: unknown } | undefined
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }

    expect({ status: res.status, json: json }).toEqual({
      status: 200,
      json: {
        pageProps: {
          rest: isNextDeploy
            ? isAdapterTest
              ? ['..', '..', 'server-reference-manifest']
              : ['../../server-reference-manifest']
            : [`..${sep}..${sep}server-reference-manifest`],
        },
        __N_SSG: true,
      },
    })
  })
})
