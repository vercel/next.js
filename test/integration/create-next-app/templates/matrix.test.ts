import {
  createNextApp,
  spawnExitPromise,
  tryNextDev,
  useTempDir,
} from '../utils'

let testVersion
beforeAll(async () => {
  if (testVersion) return
  // TODO: investigate moving this post publish or create deployed GH#57025
  // tarballs to avoid these failing while a publish is in progress
  testVersion = 'latest'
  // const span = new Span({ name: 'parent' })
  // testVersion = (
  //   await createNextInstall({ onlyPackages: true, parentSpan: span })
  // ).get('next')
})

describe.each(['app', 'pages'] as const)(
  'CNA options matrix - %s',
  (pagesOrApp) => {
    const allFlagValues = {
      app: [pagesOrApp === 'app' ? '--app' : '--no-app'],
      ts: ['--js', '--ts'],
      importAlias: [
        '--import-alias=@acme/*',
        '--import-alias=@/*',
        '--no-import-alias',
      ],
      // doesn't affect if the app builds or not
      // eslint: ['--eslint', '--no-eslint'],
      eslint: ['--eslint'],
      srcDir: ['--src-dir', '--no-src-dir'],
      tailwind: ['--tailwind', '--no-tailwind'],
      // shouldn't affect if the app builds or not
      // packageManager: ['--use-npm', '--use-pnpm', '--use-yarn', '--use-bun'],
    }

    const getPermutations = <T>(items: T[][]): T[][] => {
      if (!items.length) return [[]]
      const [first, ...rest] = items
      const children = getPermutations(rest)
      return first.flatMap((value) =>
        children.map((child) => [value, ...child])
      )
    }

    const flagPermutations = getPermutations(Object.values(allFlagValues))
    const testCases = flagPermutations.map((flags) => ({
      name: flags.join(' '),
      flags,
    }))

    let id = 0
    it.each(testCases)('$name', async ({ flags }) => {
      await useTempDir(async (cwd) => {
        const projectName = `cna-matrix-${pagesOrApp}-${id++}`
        const childProcess = createNextApp(
          [projectName, ...flags],
          {
            cwd,
          },
          testVersion
        )

        const exitCode = await spawnExitPromise(childProcess)
        expect(exitCode).toBe(0)

        await tryNextDev({
          cwd,
          projectName,
        })
      })
    })
  }
)
