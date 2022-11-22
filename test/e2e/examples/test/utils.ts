import fs from 'fs-extra'
import { join } from 'path'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import type { NextInstance } from 'test/lib/next-modes/base'

jest.setTimeout(2 * 60 * 1000)

export let next: NextInstance | undefined

export function init(example = '') {
  if ((global as any).isNextDeploy) {
    it('should not run for next deploy', () => {})
    return
  }

  let origPackageJson

  beforeAll(async () => {
    const srcDir = join(__dirname, '../../../../examples', example)
    const srcFiles = await fs.readdir(srcDir)

    const packageJson = await fs.readJson(join(srcDir, 'package.json'))
    const { scripts, dependencies, devDependencies } = packageJson

    origPackageJson = packageJson

    next = await createNext({
      files: srcFiles.reduce((prev, file) => {
        if (file !== 'package.json') {
          prev[file] = new FileRef(join(srcDir, file))
        }
        return prev
      }, {} as { [key: string]: FileRef }),
      dependencies: {
        ...dependencies,
        ...devDependencies,
      },
      installCommand: `pnpm install`,
      buildCommand: `pnpm ${scripts.build}`,
      startCommand: (global as any).isNextDev
        ? `pnpm ${scripts.dev}`
        : `pnpm ${scripts.start}`,
    })
  })
  afterAll(() => next?.destroy())

  it(`should have \`private\` property equal to \`true\` in \`package.json\``, async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson).toEqual(expect.objectContaining({ private: true }))
  })

  it(`should not have \`resolutions\` property in \`package.json\``, async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson).not.toHaveProperty('resolutions')
  })

  it(`should not have \`license\` property in \`package.json\``, async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson).not.toHaveProperty('license')
  })

  it(`should not have \`version\` property in \`package.json\``, async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson).not.toHaveProperty('version')
  })

  it(`should not have \`name\` property in \`package.json\``, async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson).not.toHaveProperty('name')
  })

  it(`should not have \`author\` property in \`package.json\``, async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson).not.toHaveProperty('author')
  })

  it(`should not have \`description\` property in \`package.json\``, async () => {
    const packageJson = JSON.parse(await next.readFile('package.json'))
    expect(packageJson).not.toHaveProperty('description')
  })

  it(`should use the \`latest\` version of \`next\` in \`package.json\``, async () => {
    // Check the original `package.json`
    // `packageJson.dependencies.next` is a filepath
    expect(origPackageJson.dependencies).toEqual(
      expect.objectContaining({ next: 'latest' })
    )
  })

  it(`should not have custom ESLint configuration`, async () => {
    expect(await fs.pathExists(join(next.testDir, 'eslintrc.json'))).toEqual(
      false
    )
  })

  it(`should compile and serve the index page correctly`, async () => {
    expect(await next.readFile('pnpm-lock.yaml')).toBeTruthy()

    expect(next.cliOutput).toMatch(/Compiled successfully/)

    const res = await fetchViaHTTP(next.url, '/')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('<html')
  })
}
