import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

import { nextTestSetup, FileRef } from 'e2e-utils'
import { nextTest } from 'next-test-utils'
import { spawnSync } from 'child_process'

// next lint doesn't use nextTestSetup either. `pnpm install` in those fixtures does not work.
describe.skip('next test js', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'first-time-setup-js/app')),
    },
    nextConfig: {
      experimental: {
        testProxy: true,
      },
    },
    dependencies: {},
    skipStart: true,
  })

  it('should correctly install missing dependencies and generate missing configuration file', async () => {
    const { stdout, stderr } = await nextTest(next.testDir, [], {
      stderr: true,
      stdout: true,
      cwd: next.testDir,
    })

    expect(stdout).toContain('Installing devDependencies')
    expect(stdout).toContain('@playwright/test')
    expect(stdout).toContain(
      `Successfully generated playwright.config.js. Create your first test and then run \`next experimental-test\`.`
    )

    expect(stderr).toBe('')

    const pkgJSON = JSON.parse(
      readFileSync(join(next.testDir, 'package.json'), 'utf-8')
    )

    expect(pkgJSON.devDependencies).toHaveProperty('@playwright/test')
  })

  it('should fail if next.js config is missing experimental#testProxy', async () => {
    writeFileSync(join(next.testDir, 'next.config.js'), 'module.exports = {}')
    const { stdout, stderr } = await nextTest(next.testDir, [], {
      stderr: true,
      stdout: true,
      cwd: next.testDir,
    })

    expect(stdout).toBe('')
    expect(stderr).toContain(
      '`next experimental-test` requires the `experimental.testProxy: true` configuration option.'
    )
  })
})

describe('next test', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, 'basic-example')),
    dependencies: {
      '@playwright/test': '1.43.1',
    },
    skipStart: true,
  })

  it('should execute playwright tests', async () => {
    const { stdout, stderr } = spawnSync(
      'pnpm',
      ['next', 'experimental-test'],
      {
        cwd: next.testDir,
        encoding: 'utf-8',
        env: {
          ...process.env,
          JEST_WORKER_ID: undefined, // Playwright complains about being executed by Jest
        },
      }
    )

    expect(stdout).toContain('1 passed')
    expect(stderr).toBe('')
  })
})
