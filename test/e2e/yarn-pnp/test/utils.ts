import fs from 'fs-extra'
import { join } from 'path'
import { fetchViaHTTP } from 'next-test-utils'
import { FileRef, nextTestSetup } from 'e2e-utils'

jest.setTimeout(2 * 60 * 1000)

export function runTests(
  example = '',
  testPath = '/',
  expectedContent = ['index page']
) {
  const versionParts = process.versions.node.split('.').map((i) => Number(i))

  if ((global as any).isNextDeploy) {
    it('should not run for next deploy', () => {})
    return
  }

  if (
    versionParts[0] > 16 ||
    (versionParts[0] === 16 && versionParts[1] >= 14)
  ) {
    const srcDir = join(__dirname, '../../../../examples', example)
    const srcFiles = fs.readdirSync(srcDir)

    const packageJson = fs.readJsonSync(join(srcDir, 'package.json'))
    // Use the default versions that are usually used in tests.
    // Since we replace `next` in the install, we also need to fulfill the peerDependencies.
    // However, the example specified latest next which may have different peerDependencies that the next that we test here i.e. the next on this commit.
    delete packageJson.dependencies['react']
    delete packageJson.dependencies['react-dom']

    const { next } = nextTestSetup({
      files: srcFiles.reduce(
        (prev, file) => {
          if (file !== 'package.json') {
            prev[file] = new FileRef(join(srcDir, file))
          }
          return prev
        },
        {} as { [key: string]: FileRef }
      ),
      packageJson: {
        // Bootstrap with classic yarn; the install command below runs
        // `yarn set version berry` which rewrites this to the berry version.
        packageManager: 'yarn@1.22.22',
      },
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
      buildCommand: `yarn next build`,
      startCommand: (global as any).isNextDev ? `yarn next` : `yarn next start`,
    })

    it(`should compile and serve the index page correctly ${example}`, async () => {
      const res = await fetchViaHTTP(next.url, testPath)
      expect(res.status).toBe(200)

      const text = await res.text()

      for (const content of expectedContent) {
        expect(text).toContain(content)
      }
    })
  } else {
    it('should not run PnP test for older node versions', () => {})
  }
}
