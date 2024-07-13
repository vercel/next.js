import fs from 'fs'
import path from 'path'
import { nextTestSetup, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('should output updated trace files', () => {
  if (!isNextStart) {
    it('should skip for non-next start', () => {})
    return
  }

  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      nanoid: '4.0.1',
    },
    env: {
      NEXT_PRIVATE_FLYING_SHUTTLE: 'true',
    },
  })

  it('should have file hashes in trace files', async () => {
    const deploymentsTracePath = path.join(
      next.testDir,
      '.next/server/app/dashboard/deployments/[id]/page.js.nft.json'
    )
    const deploymentsTrace = JSON.parse(
      await fs.promises.readFile(deploymentsTracePath, 'utf8')
    )
    const ssgTracePath = path.join(
      next.testDir,
      '.next/server/pages/ssg.js.nft.json'
    )
    const ssgTrace = JSON.parse(
      await fs.promises.readFile(ssgTracePath, 'utf8')
    )

    expect(deploymentsTrace.fileHashes).toBeTruthy()

    const deploymentsFileHashKeys = Object.keys(deploymentsTrace.fileHashes)
    // ensure the 3 related layouts are included, root, dashboard,
    // and deployments
    expect(
      deploymentsFileHashKeys.filter((item) => item.includes('/layout')).length
    ).toBe(3)

    expect(ssgTrace.fileHashes).toBeTruthy()

    // ensure all files have corresponding fileHashes
    for (const [traceFile, traceFilePath] of [
      [deploymentsTrace, deploymentsTracePath],
      [ssgTrace, ssgTracePath],
    ]) {
      for (const key of traceFile.files) {
        const absoluteKey = path.join(path.dirname(traceFilePath), key)
        const stats = await fs.promises.stat(absoluteKey)

        if (
          stats.isSymbolicLink() ||
          stats.isDirectory() ||
          absoluteKey.startsWith(path.join(next.testDir, '.next'))
        ) {
          continue
        }

        expect(typeof traceFile.fileHashes[key]).toBe('string')
      }
    }
  })
  
  async function checkAppPagesNavigation() {
    // make sure navigating between pages works correctly
      let browser = await next.browser('/')
      // set global that should persist if we don't hard navigate
      await browser.eval('window.beforeNav = 1')
      await browser.eval('window.next.router.push("/blog/first")')

      await retry(async () => {
        expect(await browser.eval(() => document.documentElement.innerHTML)).toContain(
          'hello from pages/blog/[slug]'
        )
      })
      expect(await browser.eval('window.beforeNav')).toBe(1)
      
      await browser.eval('window.next.router.push("/")')
      
      await retry(async () => {
        expect(await browser.eval(() => document.documentElement.innerHTML)).toContain(
          'hello from pages/index'
        )
      })
      expect(await browser.eval('window.beforeNav')).toBe(1)

      // make sure navigating app routes works correctly
      // (including newly built)
      browser = await next.browser('/catch-all/hello')
      // set global that should persist if we don't hard navigate
      await browser.eval('window.beforeNav = 1')
      await browser.eval(
        'window.next.router.push("/dashboard/deployments/first")'
      )

      await retry(async () => {
        expect(await browser.eval(() => document.documentElement.innerHTML)).toContain(
          `hello from app/dashboard/deployments/[id]`
        )
      })
      expect(await browser.eval('window.beforeNav')).toBe(1)
      
      await browser.eval(
        'window.next.router.push("/catch-all/hello")'
      )

      await retry(async () => {
        expect(await browser.eval(() => document.documentElement.innerHTML)).toContain(
          `hello from /catch-all`
        )
      })
      expect(await browser.eval('window.beforeNav')).toBe(1)
  }

  it('should only rebuild just a changed app route correctly', async () => {
    await next.stop()

    const dataPath = 'app/dashboard/deployments/[id]/data.json'
    const originalContent = await next.readFile(dataPath)

    try {
      await next.patchFile(dataPath, JSON.stringify({ hello: 'again' }))
      await next.start()
  
      await checkAppPagesNavigation()    
    } finally {
      await next.patchFile(dataPath, originalContent)
    }
  })
  
  it('should only rebuild just a changed pages route correctly', async () => {
    await next.stop()

    const pagePath = 'pages/index.js'
    const originalContent = await next.readFile(pagePath)

    try {
      await next.patchFile(pagePath, originalContent.replace('hello from pages/index', 'hello from pages/index!!'))
      await next.start()
      
      await checkAppPagesNavigation()
    } finally {
      await next.patchFile(pagePath, originalContent)
    }
  })
  
  it('should only rebuild a changed app and pages route correctly', async () => {
    await next.stop()

    const pagePath = 'pages/index.js'
    const originalPageContent = await next.readFile(pagePath)
    const dataPath = 'app/dashboard/deployments/[id]/data.json'
    const originalDataContent = await next.readFile(dataPath)

    try {
      await next.patchFile(pagePath, originalPageContent.replace('hello from pages/index', 'hello from pages/index!!'))
      await next.patchFile(dataPath, JSON.stringify({ hello: 'again' }))
      await next.start()

      await checkAppPagesNavigation()
    } finally {
      await next.patchFile(pagePath, originalPageContent)
      await next.patchFile(dataPath, originalDataContent)
    }
  })
})
