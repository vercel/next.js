import { run, tryNextDev, useTempDir } from '../utils'

describe.each(['app', 'pages'] as const)(
  'CNA options matrix - %s',
  (pagesOrApp) => {
    let nextTgzFilename: string

    beforeAll(() => {
      if (!process.env.NEXT_TEST_PKG_PATHS) {
        throw new Error('This test needs to be run with `node run-tests.js`.')
      }

      const pkgPaths = new Map<string, string>(
        JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
      )

      nextTgzFilename = pkgPaths.get('next')!
    })

    const isApp = pagesOrApp === 'app'

    const allFlagValues = {
      app: [isApp ? '--app' : '--no-app'],
      turbo: [process.env.IS_TURBOPACK_TEST ? '--turbopack' : '--no-turbopack'],

      ts: ['--js', '--ts'],
      importAlias: [
        '--import-alias=@acme/*',
        '--import-alias=@/*',
        '--no-import-alias',
      ],
      // doesn't affect if the app builds or not
      // eslint: ['--eslint', '--no-linter'],
      eslint: ['--eslint'],

      // Trading test perf for robustness:
      // srcDir and reactCompiler don't interact so we're testing them together
      // instead of all permutations.
      srcDirAndCompiler: [
        '--src-dir --react-compiler',
        '--no-src-dir --no-react-compiler',
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
    it.each(testCases)('$name', async ({ flags }) => {
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
    })
  }
)
