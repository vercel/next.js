import { nextTestSetup } from 'e2e-utils'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'

describe('next-testing-package', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: { playwright: require('playwright/package.json').version },
  })

  it('ships the public authoring entry points in the isolated package', async () => {
    const requireFromConsumer = createRequire(
      join(next.testDir, 'package.json')
    )
    for (const entry of ['vitest', 'rsc', 'browser']) {
      const entryPath = requireFromConsumer.resolve(
        `next/experimental/testing/${entry}`
      )
      expect(entryPath).toContain('experimental/testing/')
      const declaration = await readFile(
        entryPath.replace(/\.js$/, '.d.ts'),
        'utf8'
      )
      expect(declaration).toContain('dist/experimental/testing/')
    }
  })

  if (isNextDev && isTurbopack) {
    it('matches genuine WebKit public queues in the installed package', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-webkit-public-queues-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-public-task-queues.mjs'),
            next.testDir,
            evidence,
            'webkit',
          ],
          { timeout: 1140000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(40)
        expect(verified.allAuthoredRowsMatch).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 1200000)

    it('matches genuine Browser public queues and WebKit runtime behavior in the installed package', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-browser-public-queues-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-public-task-queues.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 540000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(40)
        expect(verified.allAuthoredRowsMatch).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
        const webkitEvidence = join(temporary, 'webkit-evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(
              __dirname,
              '../../../unit/next-testing-browser-resources/verify-webkit-runtime.mjs'
            ),
            next.testDir,
            webkitEvidence,
          ],
          { timeout: 240000, maxBuffer: 1024 * 1024 }
        )
        const webkit = JSON.parse(
          await readFile(join(webkitEvidence, 'verified.json'), 'utf8')
        )
        expect(webkit.profiles).toBe(2)
        expect(webkit.cases).toBe(6)
        expect(webkit.fullAuthoredRowsAndCaseProjectionsMatch).toBe(true)
        expect(webkit.allOwnersClosed).toBe(true)

        const zeroEvidence = join(temporary, 'zero-evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-zero-forwarding.mjs'),
            next.testDir,
            zeroEvidence,
            'chromium',
          ],
          { timeout: 240000, maxBuffer: 1024 * 1024 }
        )
        const zero = JSON.parse(
          await readFile(join(zeroEvidence, 'verified.json'), 'utf8')
        )
        expect(zero.profiles).toBe(4)
        expect(zero.cases).toBe(8)
        expect(zero.fullAuthoredRowsAndCaseProjectionsMatch).toBe(true)
        expect(zero.allOwnersClosed).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 600000)
  }
  if (isNextDev && isTurbopack) {
    it('matches genuine Browser hook sequences and releases cancelled and timed-out hooks in the installed package', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-browser-hook-order-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-hook-order.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 540000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(40)
        expect(verified.orderingProfiles).toBe(24)
        expect(verified.resourceProfiles).toBe(16)
        expect(verified.fullAuthoredRowsAndCaseProjectionsMatch).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 600000)
  }

  if (isNextDev && isTurbopack) {
    it('matches genuine lazy Browser action shapes, await guards and consumption in the installed package', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-browser-lazy-actions-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-lazy-actions.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 240000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(8)
        expect(verified.cases).toBe(10)
        expect(verified.allAuthoredRowsAndCaseStatesMatch).toBe(true)
        expect(verified.actualGuardErrorNamesMessagesMatch).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 300000)
  }

  if (isNextDev && isTurbopack) {
    it('matches genuine cooperating native Browser Promise calls and retained ownership in the installed package', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-browser-native-promise-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-native-promise-calls.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 240000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(8)
        expect(verified.cases).toBe(10)
        expect(verified.authoredRows).toBe(22)
        expect(verified.fullAuthoredProjectionsExact).toBe(true)
        expect(verified.ordinarySerialCLI).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 300000)
  }
  if (isNextDev && isTurbopack) {
    it('matches genuine public Browser concurrency, native ownership and limits in the installed package', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-browser-concurrency-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-public-concurrency.mjs'),
            next.testDir,
            evidence,
            'chromium',
            'representative',
          ],
          { timeout: 480000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(8)
        expect(verified.cases).toBe(16)
        expect(verified.authoredRows).toBe(45)
        expect(verified.fullAuthoredProjectionsExact).toBe(true)
        expect(verified.publicBrowserConcurrencyCLI).toBe(true)
        expect(verified.wholeCustomErrorOrReadyEqualityClaim).toBe(false)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 540000)
  }
  if (isNextDev && isTurbopack) {
    it('matches genuine plain Browser fixture lifetimes and concurrent resource identity in the installed package', async () => {
      const temporary = await mkdtemp(join(tmpdir(), 'next-browser-fixtures-'))
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-plain-fixtures.mjs'),
            next.testDir,
            evidence,
            'chromium',
            'representative',
          ],
          { timeout: 480000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(8)
        expect(verified.cases).toBe(20)
        expect(verified.authoredRows).toBe(56)
        expect(verified.fullAuthoredProjectionsExact).toBe(true)
        expect(verified.plainBrowserFixturesCLI).toBe(true)
        expect(verified.wholeCustomErrorOrReadyEqualityClaim).toBe(false)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 540000)
  }
  if (isNextDev && isTurbopack) {
    it('matches genuine native Browser fixture setup and teardown through the installed CLI', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-browser-native-fixtures-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-native-fixtures.mjs'),
            next.testDir,
            evidence,
            'chromium',
            'representative',
          ],
          { timeout: 480000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(8)
        expect(verified.cases).toBe(16)
        expect(verified.authoredRows).toBe(54)
        expect(verified.fullAuthoredProjectionsExact).toBe(true)
        expect(verified.nativeBrowserFixturesCLI).toBe(true)
        expect(verified.wholeCustomErrorOrReadyEqualityClaim).toBe(false)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 540000)
  }
})
