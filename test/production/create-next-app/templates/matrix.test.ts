import { resolveNextTgzFilename, run, tryNextDev, useTempDir } from '../utils'
import { shouldUseTurbopack } from 'next-test-utils'

const isTurbopack = shouldUseTurbopack()

// Each test runs a full create-next-app, install, build, and start cycle.
// Webpack builds are slower than Turbopack and can exceed the default
// 60-second per-test timeout, so give each matrix test a generous timeout.
const PER_TEST_TIMEOUT_MS = 5 * 60 * 1000

describe.each(['app', 'pages'] as const)(
  'CNA options matrix - %s',
  (pagesOrApp) => {
    let nextTgzFilename: string

    beforeAll(() => {
      nextTgzFilename = resolveNextTgzFilename()
    })

    const isApp = pagesOrApp === 'app'

    // The `--import-alias` flag doesn't interact with the bundler, so under
    // webpack we only exercise a single variant. Running all 3 variants with
    // webpack pushes the total suite runtime past the 15-minute runner
    // timeout; Turbopack is fast enough to keep the full coverage.
    const importAliasValues = isTurbopack
      ? ['--import-alias=@acme/*', '--import-alias=@/*', '--no-import-alias']
      : ['--import-alias=@/*']

    const allFlagValues = {
      app: [isApp ? '--app' : '--no-app'],
      ts: ['--js', '--ts'],
      importAlias: importAliasValues,
      // doesn't affect if the app builds or not
      // eslint: ['--eslint', '--no-linter'],
      eslint: ['--eslint'],

      // Trading test perf for robustness:
      // srcDir and reactCompiler don't interact so we're testing them together
      // instead of all permutations.
      srcDirAndCompiler: [
        '--src-dir --react-compiler --no-agents-md',
        '--no-src-dir --no-react-compiler --no-agents-md',
      ],
      tailwind: ['--tailwind', '--no-tailwind'],

      // shouldn't affect if the app builds or not
      // packageManager: ['--use-npm', '--use-pnpm', '--use-yarn', '--use-bun'],
    }

    const getCombinations = (items: string[][]): string[][] => {
      if (!items.length) return [[]]
      const [first, ...rest] = items
      const children = getCombinations(rest)
      return first.flatMap((value) =>
        children.map((child) => [...value.split(' '), ...child])
      )
    }

    const flagCombinations = getCombinations(Object.values(allFlagValues))
    const testCases = flagCombinations.map((flags) => ({
      name: flags.join(' '),
      flags,
    }))

    let id = 0
    it.each(testCases)(
      '$name',
      async ({ flags }) => {
        await useTempDir(async (cwd) => {
          const projectName = `cna-matrix-${pagesOrApp}-${id++}`
          const { exitCode } = await run(
            [
              projectName,
              ...flags,
              ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
            ],
            nextTgzFilename,
            {
              cwd,
            }
          )
          expect(exitCode).toBe(0)

          await tryNextDev({
            cwd,
            projectName,
            isApp,
          })
        })
      },
      PER_TEST_TIMEOUT_MS
    )
  }
)
