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
    for (const path of [
      '/',
      '/blog/123',
      '/dynamic-client/first/second',
      '/dashboard',
      '/dashboard/deployments/123',
    ]) {
      require('console').error('checking', path)
      const res = await next.fetch(path)
      expect(res.status).toBe(200)

      const browser = await next.browser(path)
      // TODO: check for hydration success properly
      await retry(async () => {
        expect(await browser.eval('!!window.next.router')).toBe(true)
      })
      const browserLogs = await browser.log()
      expect(
        browserLogs.some(({ message }) => message.includes('error'))
      ).toBeFalse()
    }
    // TODO: check we hard navigate boundaries properly
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
      await next.patchFile(
        pagePath,
        originalContent.replace(
          'hello from pages/index',
          'hello from pages/index!!'
        )
      )
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
      await next.patchFile(
        pagePath,
        originalPageContent.replace(
          'hello from pages/index',
          'hello from pages/index!!'
        )
      )
      await next.patchFile(dataPath, JSON.stringify({ hello: 'again' }))
      await next.start()

      await checkAppPagesNavigation()
    } finally {
      await next.patchFile(pagePath, originalPageContent)
      await next.patchFile(dataPath, originalDataContent)
    }
  })
})
