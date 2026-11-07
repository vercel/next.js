import { nextTestSetup } from 'e2e-utils'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'

describe('next-testing-package', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      '@next/playwright': `file:${dirname(require.resolve('@next/playwright/package.json'))}`,
      playwright: require('playwright/package.json').version,
      'vitest-browser-react': '2.3.0',
    },
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
      'runs native Browser input and locator regressions in %s',
      async (mode) => {
        const temporary = await mkdtemp(join(tmpdir(), 'next-browser-inputs-'))
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-browser-inputs.mjs'),
              next.testDir,
              evidence,
              mode,
            ],
            { timeout: 350000, maxBuffer: 2 * 1024 * 1024 }
          )
          expect(
            JSON.parse(await readFile(join(evidence, 'VERIFIED.json'), 'utf8'))
          ).toEqual({ mode, profiles: 3, cases: 96, passed: 95, failed: 1 })
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      360000
    )

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

    it('runs WebKit public queue regressions in the installed package', async () => {
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
        expect(verified.profiles).toBe(28)
        expect(verified.behaviorAssertions).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 1200000)

    it('runs Browser public queues and WebKit runtime regressions in the installed package', async () => {
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
        expect(verified.profiles).toBe(28)
        expect(verified.behaviorAssertions).toBe(true)
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
        expect(webkit.webkitRuntimeAssertionsPassed).toBe(true)
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
        expect(zero.behaviorAssertions).toBe(true)
        expect(zero.allOwnersClosed).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 600000)
  }
  if (isNextDev && isTurbopack) {
    it('preserves Browser hook ordering and releases cancelled and timed-out hooks in the installed package', async () => {
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
        expect(verified.behaviorAssertions).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 600000)
  }

  if (isNextDev && isTurbopack) {
    it.each(['development', 'production'] as const)(
      'preserves original Browser hook parameters in %s',
      async (mode) => {
        const temporary = await mkdtemp(
          join(tmpdir(), 'next-browser-hook-parameters-')
        )
        try {
          const evidence = join(temporary, mode, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-browser-hook-parameters.mjs'),
              next.testDir,
              mode,
              evidence,
            ],
            { timeout: 270000, maxBuffer: 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.profiles).toBe(2)
          expect(verified.cases).toBe(2)
          expect(verified.rows).toBe(11)
          expect(verified.behaviorAssertions).toBe(true)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allFixturesRemoved).toBe(true)
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      300000
    )
  }

  if (isNextDev && isTurbopack) {
    it.each(['development', 'production'] as const)(
      'D1 qualified Suite arguments: preserves actual Browser Suite hook arguments in %s',
      async (mode) => {
        const retained = process.env.NEXT_TESTING_D1_SUITE_ARGUMENTS_EVIDENCE
        const temporary =
          retained ??
          (await mkdtemp(join(tmpdir(), 'next-browser-suite-arguments-')))
        let complete = false
        try {
          const evidence = join(temporary, mode, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-browser-suite-arguments.mjs'),
              next.testDir,
              mode,
              evidence,
            ],
            { timeout: 150000, maxBuffer: 1024 * 1024 }
          )
          const verified = JSON.parse(
            await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
          )
          expect(verified.selectedContract).toBe('qualified-suite-arguments-v2')
          expect(verified.profiles).toBe(1)
          expect(verified.cases).toBe(1)
          expect(verified.rows).toBe(5)
          expect(verified.completeGenuineV2ModelExact).toBe(true)
          expect(verified.actualSuiteModuleParentIdentityObserved).toBe(true)
          expect(verified.unknownIDsRemainRawAndCollisionsRejected).toBe(true)
          expect(verified.frozenInputsHeld).toBe(true)
          expect(verified.graphPinsHeld).toBe(true)
          expect(verified.allOwnersJoined).toBe(true)
          expect(verified.allFixturesRemoved).toBe(true)
          complete = true
        } catch (error) {
          throw new Error(
            `D1 Suite argument evidence retained at ${temporary}`,
            {
              cause: error,
            }
          )
        } finally {
          if (complete && !retained)
            await rm(temporary, { recursive: true, force: true })
        }
      },
      180000
    )
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
    it('runs cooperating native Browser Promise calls and preserves retained ownership in the installed package', async () => {
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
        expect(verified.behaviorAssertions).toBe(true)
        expect(verified.ordinarySerialCLI).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 300000)
  }
  if (isNextDev && isTurbopack) {
    it('preserves public Browser concurrency, native ownership and limits in the installed package', async () => {
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
        expect(verified.behaviorAssertions).toBe(true)
        expect(verified.publicBrowserConcurrencyCLI).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 540000)
  }
  if (isNextDev && isTurbopack) {
    it('preserves plain Browser fixture lifetimes and concurrent resource identity in the installed package', async () => {
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
        expect(verified.behaviorAssertions).toBe(true)
        expect(verified.plainBrowserFixturesCLI).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 540000)
  }
  if (isNextDev && isTurbopack) {
    it('runs native Browser fixture setup and teardown through the installed CLI', async () => {
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
        expect(verified.behaviorAssertions).toBe(true)
        expect(verified.nativeBrowserFixturesCLI).toBe(true)
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
        expect(verified.cleanupBehaviorAssertions).toBe(true)
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
        expect(verified.cleanupBehaviorAssertions).toBe(true)
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
        expect(verified.cleanupBehaviorAssertions).toBe(true)
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
        expect(verified.cleanupBehaviorAssertions).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 750000)
  }
  if (isNextDev && isTurbopack) {
    it('preserves JSON targets after actual SIGINT during one-shot execution', async () => {
      const temporary = await mkdtemp(join(tmpdir(), 'next-sigint-json-'))
      try {
        const evidence = join(temporary, 'evidence')
        await promisify(execFile)(
          process.execPath,
          [
            join(__dirname, 'verify-interrupted-json-publication.mjs'),
            next.testDir,
            evidence,
          ],
          { timeout: 600000, maxBuffer: 1024 * 1024 }
        )
        const verified = JSON.parse(
          await readFile(join(evidence, 'verified.json'), 'utf8')
        )
        expect(verified.profiles).toBe(6)
        expect(verified.nodeProfiles).toBe(4)
        expect(verified.browserProfiles).toBe(2)
        expect(verified.actualSigintDuringOneShotExecution).toBe(true)
        expect(verified.allInterruptedJsonTargetsExact).toBe(true)
        expect(verified.actualPendingNativeClickAndNoFulfilledTail).toBe(true)
        expect(verified.noCustomFinalPublication).toBe(true)
        expect(verified.allOwnersClosed).toBe(true)
        expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    }, 630000)

    // These authored route cases used to be driven only by manual qualifiers.
    for (const mode of ['development', 'production'] as const) {
      for (const kind of [
        'auth',
        'not-found',
        'late-redirect',
        'stream-redirect',
        'stream-ownership',
        'errors',
      ] as const) {
        const profiles =
          kind === 'errors' ? (mode === 'development' ? 12 : 4) : 1
        const cases =
          kind === 'errors'
            ? profiles * 2
            : {
                auth: 8,
                'not-found': 4,
                'late-redirect': 6,
                'stream-redirect': 6,
                'stream-ownership': 8,
              }[kind]
        it(
          `preserves ${kind} route responses and ownership in ${mode}`,
          async () => {
            const temporary = await mkdtemp(
              join(tmpdir(), 'next-route-regressions-')
            )
            try {
              const evidence = join(temporary, 'evidence')
              await promisify(execFile)(
                process.execPath,
                [
                  join(__dirname, 'verify-route-regressions.mjs'),
                  next.testDir,
                  evidence,
                  kind,
                  mode,
                ],
                { timeout: profiles * 130000, maxBuffer: 2 * 1024 * 1024 }
              )
              expect(
                JSON.parse(
                  await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
                )
              ).toEqual({ kind, mode, profiles, cases })
            } finally {
              await rm(temporary, { recursive: true, force: true })
            }
          },
          profiles * 130000 + 10000
        )
      }
    }
    it.each(['node', 'component'] as const)(
      'preserves production %s watch edits and active cancellation',
      async (kind) => {
        const temporary = await mkdtemp(
          join(tmpdir(), 'next-production-watch-')
        )
        try {
          const evidence = join(temporary, 'evidence')
          await promisify(execFile)(
            process.execPath,
            [
              join(__dirname, 'verify-production-watch.mjs'),
              next.testDir,
              evidence,
              kind,
            ],
            { timeout: 630000, maxBuffer: 2 * 1024 * 1024 }
          )
          expect(
            JSON.parse(await readFile(join(evidence, 'VERIFIED.json'), 'utf8'))
          ).toEqual({
            kind,
            generations: kind === 'component' ? 3 : 5,
            activeCancellation: true,
            ...(kind === 'component'
              ? { sourceAndCSSEdits: true }
              : {
                  sourceEdit: true,
                  transitiveDependencyEdit: true,
                  configReload: true,
                  syntaxFailureCases: 0,
                  recovery: true,
                  failedHistoryPreserved: true,
                }),
          })
        } finally {
          await rm(temporary, { recursive: true, force: true })
        }
      },
      650000
    )
  }
})
