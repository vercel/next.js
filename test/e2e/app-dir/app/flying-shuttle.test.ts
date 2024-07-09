import fs from 'fs'
import path from 'path'
import { nextTestSetup, isNextStart } from 'e2e-utils'

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
})
