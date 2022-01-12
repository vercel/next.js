import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import { join } from 'path'
import fs from 'fs-extra'

describe('yarn PnP', () => {
  for (const example of [
    'progressive-web-app',
    'with-eslint',
    'with-typescript',
    'with-next-sass',
    'with-mdx',
    'with-styled-components',
  ]) {
    it(`should compile and serve the index page correctly ${example}`, async () => {
      const srcDir = join(__dirname, '../../../examples', example)
      const srcFiles = await fs.readdir(srcDir)
      let next: NextInstance

      const packageJson = await fs.readJson(join(srcDir, 'package.json'))

      try {
        next = await createNext({
          files: srcFiles.reduce((prev, file) => {
            prev[file] = new FileRef(join(srcDir, file))
            return prev
          }, {} as { [key: string]: FileRef }),
          dependencies: {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
          },
          installCommand: `yarn set version berry && yarn config set pnpFallbackMode none && yarn config set enableGlobalCache true && YARN_ENABLE_IMMUTABLE_INSTALLS=false yarn install`,
          buildCommand: `yarn build --no-lint`,
          startCommand: (global as any).isNextDev
            ? `yarn next`
            : `yarn next start`,
        })

        const res = await fetchViaHTTP(next.url, '/')
        expect(res.status).toBe(200)
        expect(await res.text()).toContain('<html')
      } finally {
        await next.destroy()
      }
    })
  }
})
