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
  it('should create on valid Next.js example name', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'valid-example'
      const res = await run([projectName, '--example', 'basic-css'], {
        cwd,
      })
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
      const res = await run([projectName, '--example', FULL_EXAMPLE_PATH], {
        cwd,
      })

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
          'https://github.com/vercel/nextjs-portfolio-starter/',
        ],
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
        ],
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
        ],
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

  it('should create on --example as default', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'example-named-default'
      const res = await run(
        [
          projectName,
          '--js',
          '--eslint',
          '--no-tailwind',
          '--no-import-alias',
          '--example',
          'default',
        ],
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

  // TODO: investigate why this test stalls on yarn install when
  // stdin is piped instead of inherited on windows GH#11779
  if (process.platform !== 'win32') {
    it('should fall back to default template', async () => {
      await useTempDir(async (cwd) => {
        const projectName = 'fall-back-default'
        const res = await run(
          [
            projectName,
            '--js',
            '--app',
            '--eslint',
            '--no-tailwind',
            '--no-import-alias',
            '--example',
            '__internal-testing-retry',
          ],
          {
            cwd,
            input: '\n', // 'Yes' to retry with default template
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

  it('should not create if --example flag value is invalid', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'invalid-example'
      const res = await run([projectName, '--example', 'not a real example'], {
        cwd,
        reject: false,
      })

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
        ],
        {
          cwd,
          reject: false,
        }
      )

      expect(res.exitCode).toBe(1)
    })
  })
})
