import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { nextTest } from 'next-test-utils'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { spawnSync } from 'child_process'

function createTemporaryFixture(fixtureName: string) {
  const fixturePath = join(__dirname, fixtureName)
  const stat = statSync(fixturePath)
  if (!stat.isDirectory()) {
    throw new Error(`Fixture ${fixtureName} is not a directory.`)
  }

  const dir = mkdtempSync(join(tmpdir(), fixtureName))
  cpSync(fixturePath, dir, { recursive: true })
  return dir
}

describe.skip('next test', () => {
  const { next: basicExample, skipped } = nextTestSetup({
    files: new FileRef(join(__dirname, 'basic-example')),
    dependencies: {
      '@playwright/test': '1.43.1',
    },
    skipStart: true,
    // This doesn't need to be deployed as it's using `experimental-test` mode
    skipDeployment: true,
  })

  if (skipped) return

  afterAll(async () => {
    await basicExample.destroy()
  })

  describe('first time setup', () => {
    it.each([['first-time-setup-js'], ['first-time-setup-ts']])(
      'should correctly install missing dependencies and generate missing configuration file for %s',
      async (fixtureName: string) => {
        const fixture = createTemporaryFixture(fixtureName)

        try {
          const { stdout } = await nextTest(fixture, [], {
            stderr: true,
            stdout: true,
            cwd: fixture,
          })

          expect(stdout).toContain('Installing devDependencies')
          expect(stdout).toContain('@playwright/test')
          expect(stdout).toContain(
            `Successfully generated ${
              fixtureName === 'first-time-setup-js'
                ? 'playwright.config.js'
                : 'playwright.config.ts'
            }. Create your first test and then run \`next experimental-test\`.`
          )

          const pkgJSON = JSON.parse(
            readFileSync(join(fixture, 'package.json'), 'utf-8')
          )

          expect(pkgJSON.devDependencies).toHaveProperty('@playwright/test')
        } finally {
          rmSync(fixture, { recursive: true, force: true })
        }
      }
    )

    it('should fail if next.js config is missing experimental#testProxy', async () => {
      const fixture = createTemporaryFixture('first-time-setup-js')

      try {
        writeFileSync(join(fixture, 'next.config.js'), 'module.exports = {}')
        const { stderr } = await nextTest(fixture, [], {
          stderr: true,
          stdout: true,
          cwd: fixture,
        })
        expect(stderr).toContain(
          '`next experimental-test` requires the `experimental.testProxy: true` configuration option.'
        )
      } finally {
        rmSync(fixture, { recursive: true, force: true })
      }
    })
  })

  // TODO: fix the playwright download issue
  it.skip('should execute playwright tests', async () => {
    const { stdout } = spawnSync('pnpm', ['next', 'experimental-test'], {
      cwd: basicExample.testDir,
      encoding: 'utf-8',
      env: {
        ...process.env,
        JEST_WORKER_ID: undefined, // Playwright complains about being executed by Jest
      },
    })

    expect(stdout).toContain('1 passed')
  })

  describe('test runner validation', () => {
    beforeEach(() => {
      // First, test that `defaultTestRunner` takes precedence over the default playwright.
      writeFileSync(
        join(basicExample.testDir, 'next.config.js'),
        "module.exports = { experimental: { testProxy: true, defaultTestRunner: 'invalid-test-runner'}}"
      )
    })

    afterEach(() => {
      writeFileSync(
        join(basicExample.testDir, 'next.config.js'),
        'module.exports = { experimental: { testProxy: true }}'
      )
    })

    it('should validate configured/specified test runner', async () => {
      let { stderr } = spawnSync('pnpm', ['next', 'experimental-test'], {
        cwd: basicExample.testDir,
        encoding: 'utf-8',
        env: {
          ...process.env,
          JEST_WORKER_ID: undefined, // Playwright complains about being executed by Jest
        },
      })

      // Assert the assigned `defaultTestRunner` is printed in the error
      expect(stderr).toContain(
        'Test runner invalid-test-runner is not supported.'
      )

      // Second, test that the `--test-runner` arg takes precedence over `defaultTestRunner` and default playwright
      ;({ stderr } = spawnSync(
        'pnpm',
        ['next', 'experimental-test', '--test-runner=invalid-test-runner-2'],
        {
          cwd: basicExample.testDir,
          encoding: 'utf-8',
          env: {
            ...process.env,
            JEST_WORKER_ID: undefined, // Playwright complains about being executed by Jest
          },
        }
      ))

      // Assert the assigned `--test-runner` arg is printed in the error
      expect(stderr).toContain(
        'Test runner invalid-test-runner-2 is not supported.'
      )
    })
  })

  it('should pass args to test runner', async () => {
    const { stdout } = spawnSync(
      'pnpm',
      ['next', 'experimental-test', '--list'],
      {
        cwd: basicExample.testDir,
        encoding: 'utf-8',
        env: {
          ...process.env,
          JEST_WORKER_ID: undefined, // Playwright complains about being executed by Jest
        },
      }
    )

    expect(stdout).toMatchInlineSnapshot(`
      "Listing tests:
        [chromium] › app/page.spec.js:3:1 › home page
      Total: 1 test in 1 file
      "
    `)
  })
})
