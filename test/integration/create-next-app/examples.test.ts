import {
  EXAMPLE_PATH,
  EXAMPLE_REPO,
  FULL_EXAMPLE_PATH,
  projectFilesShouldExist,
  projectFilesShouldNotExist,
  shouldBeTemplateProject,
  run,
  useTempDir,
} from './utils'

describe('create-next-app --example', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')
  })

  it('should create on valid Next.js example name', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'valid-example'
      const res = await run(
        [
          projectName,
          '--example',
          'basic-css',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )
      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          '.gitignore',
          'package.json',
          'app/page.tsx',
          'app/layout.tsx',
          'node_modules/next',
        ],
      })
    })
  })

  it('should create with GitHub URL', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'github-url'
      const res = await run(
        [
          projectName,
          '--example',
          FULL_EXAMPLE_PATH,
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          '.gitignore',
          'package.json',
          'app/page.tsx',
          'app/layout.tsx',
          'node_modules/next',
        ],
      })
    })
  })

  it('should create with GitHub URL trailing slash', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'github-url-trailing-slash'
      const res = await run(
        [
          projectName,
          '--example',
          // since vercel/examples is not a template repo, we use the following
          // GH#39665
          'https://github.com/vercel/nextjs-portfolio-starter/',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          '.gitignore',
          'package.json',
          'pages/index.mdx',
          'node_modules/next',
        ],
      })
    })
  })

  it('should create with GitHub URL and --example-path', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'github-url-and-example-path'
      const res = await run(
        [
          projectName,
          '--js',
          '--no-tailwind',
          '--eslint',
          '--example',
          EXAMPLE_REPO,
          '--example-path',
          EXAMPLE_PATH,
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          '.gitignore',
          'package.json',
          'app/page.tsx',
          'app/layout.tsx',
          'node_modules/next',
        ],
      })
    })
  })

  it('should use --example-path over the GitHub URL', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'example-path-over-github-url'
      const res = await run(
        [
          projectName,
          '--js',
          '--no-tailwind',
          '--eslint',
          '--example',
          FULL_EXAMPLE_PATH,
          '--example-path',
          EXAMPLE_PATH,
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: [
          '.gitignore',
          'package.json',
          'app/page.tsx',
          'app/layout.tsx',
          'node_modules/next',
        ],
      })
    })
  })

  // TODO: investigate why this test stalls on yarn install when
  // stdin is piped instead of inherited on windows
  if (process.platform !== 'win32') {
    it('should fall back to default template if failed to download', async () => {
      await useTempDir(async (cwd) => {
        const projectName = 'fallback-to-default'
        const res = await run(
          [
            projectName,
            '--js',
            '--no-tailwind',
            '--eslint',
            '--app',
            '--example',
            '__internal-testing-retry',
            '--import-alias=@/*',
            ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
          ],
          nextTgzFilename,
          {
            cwd,
            input: '\n', // 'Yes' to retry
            stdio: 'pipe',
          }
        )

        expect(res.exitCode).toBe(0)
        shouldBeTemplateProject({
          cwd,
          projectName,
          template: 'app',
          mode: 'js',
        })
      })
    })
  }

  it('should create if --example value is default', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'example-default'
      const res = await run(
        [
          projectName,
          '--js',
          '--no-tailwind',
          '--eslint',
          '--example',
          'default',
          '--import-alias=@/*',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(res.exitCode).toBe(0)
      shouldBeTemplateProject({
        cwd,
        projectName,
        template: 'default',
        mode: 'js',
      })
    })
  })

  it('should not create if --example flag value is invalid', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'invalid-example'
      const res = await run(
        [
          projectName,
          '--example',
          'not a real example',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          reject: false,
        }
      )

      expect(res.exitCode).toBe(1)
      projectFilesShouldNotExist({
        cwd,
        projectName,
        files: ['package.json'],
      })
    })
  })

  it('should not create if --example flag value is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'no-example'
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--example',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          reject: false,
        }
      )

      expect(res.exitCode).toBe(1)
    })
  })
})
