import { execFileSync } from 'node:child_process'

// Use a fresh process so Jest's module registry and React mocks cannot hide
// eager imports in the emitted server code.
function probeImport(moduleName: string, constructDedupeFetch = false) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '-e',
        `
          const reactPath = require.resolve('react')
          const patchFetchPath = require.resolve('next/dist/server/lib/patch-fetch')
          const imported = require(process.argv[1])
          const reactLoadedOnImport = !!require.cache[reactPath]
          if (process.argv[2] === 'true') {
            imported.createDedupeFetch(globalThis.fetch)
          }
          console.log(JSON.stringify({
            reactLoadedOnImport,
            reactLoadedAfterConstruction: !!require.cache[reactPath],
            patchFetchLoaded: !!require.cache[patchFetchPath],
          }))
        `,
        require.resolve(`next/dist/server/lib/${moduleName}`),
        String(constructDedupeFetch),
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production' },
        encoding: 'utf8',
      }
    )
  )
}

describe('fetch helper React loading', () => {
  it.each(['dedupe-fetch', 'patch-fetch', 'router-server'])(
    'does not load React when importing %s',
    (moduleName) => {
      expect(probeImport(moduleName).reactLoadedOnImport).toBe(false)
    }
  )

  it('does not load the fetch patcher when importing the router server', () => {
    expect(probeImport('router-server').patchFetchLoaded).toBe(false)
  })

  it('has React available when constructing the dedupe helper', () => {
    expect(probeImport('dedupe-fetch', true).reactLoadedAfterConstruction).toBe(
      true
    )
  })
})
