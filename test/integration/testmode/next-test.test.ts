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

describe('next test', () => {
  describe('first time setup', () => {
    it.each([['first-time-setup-js'], ['first-time-setup-ts']])(
      'should correctly install missing dependencies and generate missing configuration file for %s',
      async (fixtureName: string) => {
        const fixture = createTemporaryFixture(fixtureName)

        try {
          const { stdout, stderr } = await nextTest(fixture, [], {
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

          expect(stderr).toBe('')

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
        const { stdout, stderr } = await nextTest(fixture, [], {
          stderr: true,
          stdout: true,
          cwd: fixture,
        })

        expect(stdout).toBe('')
        expect(stderr).toContain(
          '`next experimental-test` requires the `experimental.testProxy: true` configuration option.'
        )
      } finally {
        rmSync(fixture, { recursive: true, force: true })
      }
    })
  })

  it('should execute playwright tests', async () => {
    const fixture = createTemporaryFixture('basic-example')

    try {
      const { stdout, stderr } = await nextTest(fixture, [], {
        stderr: true,
        stdout: true,
        cwd: fixture,
      })

      expect(stdout).toContain('1 passed')
      expect(stderr).toBe('')
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  describe('test runner validation', () => {
    it('should validate configured/specified test runner', async () => {
      const fixture = createTemporaryFixture('basic-example')

      try {
        // First, test that `defaultTestRunner` takes precedence over the default playwright.
        writeFileSync(
          join(fixture, 'next.config.js'),
          "module.exports = { experimental: { testProxy: true, defaultTestRunner: 'invalid-test-runner'}}"
        )

        let { stdout, stderr } = await nextTest(fixture, [], {
          stderr: true,
          stdout: true,
          cwd: fixture,
        })

        expect(stdout).toBe('')
        // Assert the assigned `defaultTestRunner` is printed in the error
        expect(stderr).toContain(
          'Test runner invalid-test-runner is not supported.'
        )

        // Second, test that the `--test-runner` arg takes precedence over `defaultTestRunner` and default playwright
        ;({ stdout, stderr } = await nextTest(
          fixture,
          ['--test-runner=invalid-test-runner-2'],
          {
            stderr: true,
            stdout: true,
            cwd: fixture,
          }
        ))

        expect(stdout).toBe('')
        // Assert the assigned `--test-runner` arg is printed in the error
        expect(stderr).toContain(
          'Test runner invalid-test-runner-2 is not supported.'
        )
      } finally {
        rmSync(fixture, { recursive: true, force: true })
      }
    })
  })

  it('should pass args to test runner', async () => {
    const fixture = createTemporaryFixture('basic-example')

    try {
      const { stdout, stderr } = await nextTest(
        fixture,
        ['--test-runner-args=--version'],
        {
          stderr: true,
          stdout: true,
          cwd: fixture,
        }
      )

      expect(stdout).toContain('Version 1')
      expect(stderr).toBe('')
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })
})
