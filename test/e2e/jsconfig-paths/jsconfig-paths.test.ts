import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'next/dist/compiled/strip-ansi'

describe('jsconfig paths', () => {
  const { next, isNextDeploy, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) return
  if (isNextDeploy) return

  it('should alias components', async () => {
    const $ = await next.render$('/basic-alias')
    expect($('body').text()).toMatch(/World/)
  })

  it('should resolve the first item in the array first', async () => {
    const $ = await next.render$('/resolve-order')
    expect($('body').text()).toMatch(/Hello from a/)
  })

  it('should resolve the second item as fallback', async () => {
    const $ = await next.render$('/resolve-fallback')
    expect($('body').text()).toMatch(/Hello from only b/)
  })

  it('should resolve a single matching alias', async () => {
    const $ = await next.render$('/single-alias')
    expect($('body').text()).toMatch(/Hello/)
  })

  if (isNextDev) {
    it('should have correct module not found error', async () => {
      const originalContent = await next.readFile('pages/basic-alias.js')

      try {
        await next.patchFile(
          'pages/basic-alias.js',
          originalContent.replace('@c/world', '@c/worldd')
        )

        await retry(async () => {
          await next.render('/basic-alias')
          expect(stripAnsi(next.cliOutput)).toMatch(
            /Module not found: Can't resolve '@c\/worldd'/
          )
        })
      } finally {
        await next.patchFile('pages/basic-alias.js', originalContent)
      }
    })
  }

  if (isNextStart) {
    it('should trace correctly', async () => {
      const singleAliasTrace = JSON.parse(
        await next.readFile('.next/server/pages/single-alias.js.nft.json')
      )
      const resolveOrderTrace = JSON.parse(
        await next.readFile('.next/server/pages/resolve-order.js.nft.json')
      )
      const resolveFallbackTrace = JSON.parse(
        await next.readFile('.next/server/pages/resolve-fallback.js.nft.json')
      )
      const basicAliasTrace = JSON.parse(
        await next.readFile('.next/server/pages/basic-alias.js.nft.json')
      )

      expect(
        singleAliasTrace.files.some((file: string) =>
          file.includes('components/hello.js')
        )
      ).toBe(false)
      expect(
        resolveOrderTrace.files.some((file: string) =>
          file.includes('lib/a/api.js')
        )
      ).toBe(false)
      expect(
        resolveOrderTrace.files.some((file: string) =>
          file.includes('mypackage/data.js')
        )
      ).toBe(true)
      expect(
        resolveFallbackTrace.files.some((file: string) =>
          file.includes('lib/b/b-only.js')
        )
      ).toBe(false)
      expect(
        basicAliasTrace.files.some((file: string) =>
          file.includes('components/world.js')
        )
      ).toBe(false)
    })
  }
})

describe('jsconfig paths without baseurl', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  let originalJsconfigContent: string

  beforeAll(async () => {
    // Store original jsconfig content for restoration
    originalJsconfigContent = await next.readFile('jsconfig.json')

    const jsconfig = JSON.parse(originalJsconfigContent)
    delete jsconfig.compilerOptions.baseUrl
    jsconfig.compilerOptions.paths = {
      '@c/*': ['./components/*'],
      '@lib/*': ['./lib/a/*', './lib/b/*'],
      '@mycomponent': ['./components/hello.js'],
    }
    await next.patchFile('jsconfig.json', JSON.stringify(jsconfig, null, 2))
    await next.start()
  })

  afterAll(async () => {
    // Restore original jsconfig content
    if (originalJsconfigContent) {
      await next.patchFile('jsconfig.json', originalJsconfigContent)
    }
  })

  it('should alias components', async () => {
    const $ = await next.render$('/basic-alias')
    expect($('body').text()).toMatch(/World/)
  })

  it('should resolve the first item in the array first', async () => {
    const $ = await next.render$('/resolve-order')
    expect($('body').text()).toMatch(/Hello from a/)
  })

  it('should resolve the second item as fallback', async () => {
    const $ = await next.render$('/resolve-fallback')
    expect($('body').text()).toMatch(/Hello from only b/)
  })

  it('should resolve a single matching alias', async () => {
    const $ = await next.render$('/single-alias')
    expect($('body').text()).toMatch(/Hello/)
  })

  if (isNextDev) {
    it('should have correct module not found error', async () => {
      const originalContent = await next.readFile('pages/basic-alias.js')

      try {
        await next.patchFile(
          'pages/basic-alias.js',
          originalContent.replace('@c/world', '@c/worldd')
        )

        await retry(async () => {
          await next.render('/basic-alias')
          expect(stripAnsi(next.cliOutput)).toMatch(
            /Module not found: Can't resolve '@c\/worldd'/
          )
        })
      } finally {
        await next.patchFile('pages/basic-alias.js', originalContent)
      }
    })
  }

  if (isNextStart) {
    it('should trace correctly', async () => {
      const singleAliasTrace = JSON.parse(
        await next.readFile('.next/server/pages/single-alias.js.nft.json')
      )
      const resolveOrderTrace = JSON.parse(
        await next.readFile('.next/server/pages/resolve-order.js.nft.json')
      )
      const resolveFallbackTrace = JSON.parse(
        await next.readFile('.next/server/pages/resolve-fallback.js.nft.json')
      )
      const basicAliasTrace = JSON.parse(
        await next.readFile('.next/server/pages/basic-alias.js.nft.json')
      )

      expect(
        singleAliasTrace.files.some((file: string) =>
          file.includes('components/hello.js')
        )
      ).toBe(false)
      expect(
        resolveOrderTrace.files.some((file: string) =>
          file.includes('lib/a/api.js')
        )
      ).toBe(false)
      expect(
        resolveOrderTrace.files.some((file: string) =>
          file.includes('mypackage/data.js')
        )
      ).toBe(true)
      expect(
        resolveFallbackTrace.files.some((file: string) =>
          file.includes('lib/b/b-only.js')
        )
      ).toBe(false)
      expect(
        basicAliasTrace.files.some((file: string) =>
          file.includes('components/world.js')
        )
      ).toBe(false)
    })
  }
})
