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
    it.each(['development', 'production'] as const)(
      'preserves actual unexecuted public cases across JSON and JUnit in %s',
      async (mode) => {
        const temporary = await mkdtemp(
          join(tmpdir(), 'next-public-unexecuted-')
        )
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-public-unexecuted-cases.mjs'),
              next.testDir,
              evidence,
              mode,
            ],
            { timeout: 750000, maxBuffer: 2 * 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.mode).toBe(mode)
          expect(verified.profiles).toBe(6)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
          expect(verified.editorBlobShardProjectionsQualified).toBe(false)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      800000
    )

    it.each(['development', 'production'] as const)(
      'publishes actual finalized public File modes and case outcomes in %s',
      async (mode) => {
        const temporary = await mkdtemp(
          join(tmpdir(), 'next-public-file-modes-')
        )
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-public-file-modes.mjs'),
              next.testDir,
              evidence,
              mode,
            ],
            { timeout: 500000, maxBuffer: 2 * 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.mode).toBe(mode)
          expect(verified.profiles).toBe(11)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      540000
    )

    it.each(['development', 'production'] as const)(
      'preserves actual empty public File preparation and passWithNoTests hooks in %s',
      async (mode) => {
        const temporary = await mkdtemp(join(tmpdir(), 'next-empty-file-'))
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-empty-file-preparation.mjs'),
              next.testDir,
              evidence,
              mode,
            ],
            { timeout: 300000, maxBuffer: 2 * 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.mode).toBe(mode)
          expect(verified.profiles).toBe(2)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      340000
    )

    it.each(['development', 'production'] as const)(
      'delivers actual collected module live callbacks without blocking execution in %s',
      async (mode) => {
        const temporary = await mkdtemp(
          join(tmpdir(), 'next-module-collected-')
        )
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-module-collected.mjs'),
              next.testDir,
              evidence,
              mode,
            ],
            { timeout: 1000000, maxBuffer: 2 * 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.mode).toBe(mode)
          expect(verified.profiles).toBe(11)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      1040000
    )

    it.each(['development', 'production'] as const)(
      'delivers actual queued module callbacks without blocking execution in %s',
      async (mode) => {
        const temporary = await mkdtemp(join(tmpdir(), 'next-module-queued-'))
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-module-queued.mjs'),
              next.testDir,
              evidence,
              mode,
            ],
            { timeout: 500000, maxBuffer: 2 * 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.mode).toBe(mode)
          expect(verified.profiles).toBe(7)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      540000
    )

    it.each(['development', 'production'] as const)(
      'preserves configured file parallelism and CLI precedence in %s',
      async (mode) => {
        const temporary = await mkdtemp(
          join(tmpdir(), 'next-file-parallelism-')
        )
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-file-parallelism.mjs'),
              next.testDir,
              evidence,
              mode,
            ],
            { timeout: 500000, maxBuffer: 2 * 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.mode).toBe(mode)
          expect(verified.functionalProfiles).toBe(8)
          expect(verified.negativeProfiles).toBe(1)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      540000
    )

    it('refreshes actual production RSC routes and layouts in the installed watch runner', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-production-rsc-route-watch-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-production-rsc-route-watch.mjs'),
            next.testDir,
            evidence,
          ],
          { timeout: 500000, maxBuffer: 2 * 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
        )
        expect(verified.mode).toBe('production')
        expect(verified.ordinaryReferenceRows).toBe(4)
        expect(verified.passingGenerations).toHaveLength(6)
        expect(verified.syntaxFailure).toBe(true)
        expect(verified.routeConfigFailure).toBe(true)
        expect(verified.activeCancellation).toBe(true)
        expect(verified.retainedCompleteReport).toBe(true)
        expect(verified.allOwnersJoined).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 540000)

    it('refreshes actual development RSC routes and layouts in the installed watch runner', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-development-rsc-route-watch-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-development-rsc-route-watch.mjs'),
            next.testDir,
            evidence,
          ],
          { timeout: 500000, maxBuffer: 2 * 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
        )
        expect(verified.mode).toBe('development')
        expect(verified.ordinaryReferenceRows).toBe(4)
        expect(verified.passingGenerations).toHaveLength(6)
        expect(verified.syntaxFailure).toBe(true)
        expect(verified.routeConfigFailure).toBe(true)
        expect(verified.activeCancellation).toBe(true)
        expect(verified.retainedCompleteReport).toBe(true)
        expect(verified.allOwnersJoined).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 540000)

    it.each(['settled', 'active'] as const)(
      'retains %s Node and RSC configuration transitions in the installed watch runner',
      async (flow) => {
        const temporary = await mkdtemp(
          join(tmpdir(), 'next-rsc-config-transition-')
        )
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-rsc-config-watch-transitions.mjs'),
              next.testDir,
              evidence,
              flow,
            ],
            { timeout: 500000, maxBuffer: 2 * 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.flow).toBe(flow)
          expect(verified.mode).toBe('development')
          expect(verified.passingGenerations).toHaveLength(
            flow === 'settled' ? 6 : 4
          )
          expect(verified.activeSupersessionBothDirections).toBe(
            flow === 'active'
          )
          expect(verified.providedContextFailureRecovery).toBe(true)
          expect(verified.activeCancellation).toBe(true)
          expect(verified.reportRetained).toBe(true)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      540000
    )

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
  if (isNextDev && isTurbopack) {
    it('joins native work from actual component cleanup and its error observation', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-component-cleanup-native-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-component-cleanup-native.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 1080000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(8)
        expect(verified.cases).toBe(16)
        expect(verified.authoredRows).toBe(108)
        expect(verified.fullSupportedProjectionsExact).toBe(true)
        expect(verified.actualComponentNativeLifetimeExact).toBe(true)
        expect(verified.methodAndErrorGetterNativeEffectsExact).toBe(true)
        expect(verified.startedCommandJoinsAfterCallbackReturn).toBe(true)
        expect(verified.trustedPhysicalClickSequenceExact).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 1110000)
  }
  if (isNextDev && isTurbopack) {
    it('retains independent component, keyboard and worker cleanup errors', async () => {
      const temporary = await mkdtemp(join(tmpdir(), 'next-mixed-cleanup-'))
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-mixed-cleanup.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 720000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(4)
        expect(verified.cases).toBe(8)
        expect(verified.authoredRows).toBe(66)
        expect(verified.fullSupportedProjectionsExact).toBe(true)
        expect(verified.exactIndependentCleanupOccurrences).toBe(true)
        expect(verified.immediateGetterAndMutationOrder).toBe(true)
        expect(verified.physicalWorkerClickAndModifierStateExact).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 750000)
  }
  if (isNextDev && isTurbopack) {
    it('joins native actions started by actual final default Browser cleanup', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-final-native-cleanup-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-default-cleanup-native.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 720000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(10)
        expect(verified.cases).toBe(22)
        expect(verified.fullSupportedProjectionsExact).toBe(true)
        expect(verified.actualFinalFileInvocation).toBe(true)
        expect(verified.nativeCallbackStartsAndPendingJoinsExact).toBe(true)
        expect(verified.physicalNativeEffectsAndHeldStateExact).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 750000)
  }
  if (isNextDev && isTurbopack) {
    it('delegates public default Browser cleanup and preserves real held-key effects', async () => {
      const temporary = await mkdtemp(
        join(tmpdir(), 'next-public-default-cleanup-')
      )
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-browser-public-default-cleanup.mjs'),
            next.testDir,
            evidence,
            'chromium',
          ],
          { timeout: 720000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(6)
        expect(verified.cases).toBe(14)
        expect(verified.fullSupportedProjectionsExact).toBe(true)
        expect(verified.defaultCleanupGetterReceiverAndRepeatedRealCalls).toBe(
          true
        )
        expect(verified.physicalKeyReleaseAndNextClickStateExact).toBe(true)
        expect(verified.plainPromiseWrappersOnly).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 750000)
  }
})
