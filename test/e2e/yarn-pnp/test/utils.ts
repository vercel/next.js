import fs from 'fs-extra'
import { join } from 'path'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

jest.setTimeout(2 * 60 * 1000)

export function runTests(example = '') {
  const versionParts = process.versions.node.split('.').map((i) => Number(i))

  if ((global as any).isNextDeploy) {
    it('should not run for next deploy', () => {})
    return
  }

  if (
    versionParts[0] > 16 ||
    (versionParts[0] === 16 && versionParts[1] >= 14)
  ) {
    let next: NextInstance

    beforeAll(async () => {
      const srcDir = join(__dirname, '../../../../examples', example)
      const srcFiles = await fs.readdir(srcDir)

      const packageJson = await fs.readJson(join(srcDir, 'package.json'))

      next = await createNext({
        files: srcFiles.reduce((prev, file) => {
          if (file !== 'package.json') {
            prev[file] = new FileRef(join(srcDir, file))
          }
          return prev
        }, {} as { [key: string]: FileRef }),
        dependencies: {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        },
        installCommand: ({ dependencies }) => {
          const pkgs = Object.keys(dependencies).reduce((prev, cur) => {
            prev.push(`${cur}@${dependencies[cur]}`)
            return prev
          }, [] as string[])
          return `yarn set version berry && yarn config set enableGlobalCache true && yarn config set compressionLevel 0 && yarn add ${pkgs.join(
            ' '
          )}`
        },
        buildCommand: `yarn next build --no-lint`,
        startCommand: (global as any).isNextDev
          ? `yarn next`
          : `yarn next start`,
      })
    })
    afterAll(() => next?.destroy())

    it(`should compile and serve the index page correctly ${example}`, async () => {
      const res = await fetchViaHTTP(next.url, '/')
      expect(res.status).toBe(200)
      expect(await res.text()).toContain('<html')
    })
  } else {
    it('should not run PnP test for older node versions', () => {})
  }
}
