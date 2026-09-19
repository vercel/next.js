import { promises as fs } from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { listClientChunks } from 'next-test-utils'

const SYNTHETIC_VERSIONS = ['16.4.0-canary.10', '16.4.0-canary.11'] as const

async function moveInstalledNextToVersion(
  nextLink: string,
  version: string
): Promise<string> {
  const currentNextDir = await fs.realpath(nextLink)
  const virtualStorePackageDir = path.dirname(path.dirname(currentNextDir))
  const virtualStoreDir = path.dirname(virtualStorePackageDir)

  expect(path.basename(virtualStoreDir)).toBe('.pnpm')

  const versionedPackageDir = path.join(virtualStoreDir, `next@${version}`)
  const versionedNextDir = path.join(
    versionedPackageDir,
    'node_modules',
    'next'
  )

  await fs.rename(virtualStorePackageDir, versionedPackageDir)
  await fs.rm(nextLink)
  await fs.symlink(versionedNextDir, nextLink, 'junction')

  expect(await fs.realpath(nextLink)).toBe(versionedNextDir)
  expect(versionedNextDir).toContain(`${path.sep}next@${version}${path.sep}`)

  return versionedNextDir
}

async function setCompiledNextVersion(
  nextDir: string,
  previousVersion: string,
  version: string
) {
  const implPath = path.join(
    nextDir,
    'dist',
    'build',
    'turbopack-build',
    'impl.js'
  )
  const source = await fs.readFile(implPath, 'utf8')
  const occurrences = source.split(previousVersion).length - 1

  expect(occurrences).toBe(1)
  await fs.writeFile(implPath, source.replace(previousVersion, version))
}

async function getClientChunks(testDir: string, distDir: string) {
  const chunkNames = (await listClientChunks(path.join(testDir, distDir)))
    .filter((name) => name.includes('/chunks/') && name.endsWith('.js'))
    .sort()

  return new Map(
    await Promise.all(
      chunkNames.map(
        async (name) =>
          [
            name,
            await fs.readFile(path.join(testDir, distDir, name), 'utf8'),
          ] as const
      )
    )
  )
}

function normalizeKnownProcessBasePath(
  content: string,
  version: string
): string | null {
  const versionedSegment = `/next@${version}/node_modules/next/dist/compiled/process/`
  const segmentIndex = content.indexOf(versionedSegment)
  if (segmentIndex === -1) return null

  expect(content.indexOf(versionedSegment, segmentIndex + 1)).toBe(-1)

  const assignmentIndex = content.lastIndexOf('.ab="', segmentIndex)
  expect(assignmentIndex).toBeGreaterThanOrEqual(0)
  expect(content.slice(assignmentIndex + 5, segmentIndex)).not.toContain('"')

  return content.replace(
    versionedSegment,
    '/next@__NEXT_VERSION__/node_modules/next/dist/compiled/process/'
  )
}

// The test mutates an isolated pnpm installation, which is unavailable in deploy mode.
// @force-gate turbopack && start && !deploy
describe('Turbopack Next.js version chunk stability', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it(
    'keeps client chunk names stable when the Next.js version changes',
    async () => {
      const nextLink = path.join(next.testDir, 'node_modules', 'next')
      const actualVersion = require('next/package.json').version as string

      let installedNextDir = await moveInstalledNextToVersion(
        nextLink,
        SYNTHETIC_VERSIONS[0]
      )
      await setCompiledNextVersion(
        installedNextDir,
        actualVersion,
        SYNTHETIC_VERSIONS[0]
      )

      const firstBuild = await next.build()
      expect(firstBuild.exitCode).toBe(0)
      const firstChunks = await getClientChunks(next.testDir, next.distDir)
      expect(firstChunks.size).toBeGreaterThan(0)

      await next.clean()

      installedNextDir = await moveInstalledNextToVersion(
        nextLink,
        SYNTHETIC_VERSIONS[1]
      )
      await setCompiledNextVersion(
        installedNextDir,
        SYNTHETIC_VERSIONS[0],
        SYNTHETIC_VERSIONS[1]
      )

      const secondBuild = await next.build()
      expect(secondBuild.exitCode).toBe(0)
      const secondChunks = await getClientChunks(next.testDir, next.distDir)

      const stableChunkNames = [...firstChunks.keys()].filter((name) =>
        secondChunks.has(name)
      )
      expect(stableChunkNames.length).toBeGreaterThan(0)

      const removedChunks = [...firstChunks].filter(
        ([name]) => !secondChunks.has(name)
      )
      const addedChunks = [...secondChunks].filter(
        ([name]) => !firstChunks.has(name)
      )

      // The vendored process polyfill assigns `__dirname` to its webpack runtime base path,
      // so its emitted code still contains the physical pnpm directory. Keep this exception
      // exact so it cannot hide a regression in version-normalized module IDs.
      expect(removedChunks).toHaveLength(1)
      expect(addedChunks).toHaveLength(1)
      const normalizedFirstChunk = normalizeKnownProcessBasePath(
        removedChunks[0][1],
        SYNTHETIC_VERSIONS[0]
      )
      const normalizedSecondChunk = normalizeKnownProcessBasePath(
        addedChunks[0][1],
        SYNTHETIC_VERSIONS[1]
      )
      expect(normalizedFirstChunk).not.toBeNull()
      expect(normalizedSecondChunk).toBe(normalizedFirstChunk)
    },
    2 * 60 * 1000
  )
})
