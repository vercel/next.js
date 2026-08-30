import fs from 'fs-extra'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { execSync } from 'child_process'

const appDir = join(__dirname, 'app')

describe.each([
  // sharp 0.34.5 bundles libheif 1.20.2, which is affected by the AVIF
  // decoding vulnerabilities fixed in libheif 1.23.2.
  {
    sharp: '0.34.5',
    decodesAvif: false,
  },
  // sharp 0.35.4 is the first release bundling the patched libheif 1.23.2.
  {
    sharp: '0.35.4',
    decodesAvif: true,
  },
])('with sharp $sharp', ({ sharp, decodesAvif }) => {
  const patchedSharpDeps = {
    sharp,
    [`@img/sharp-${process.platform}-${process.arch}`]: sharp,
  }
  const { isNextDeploy, next } = nextTestSetup({
    files: appDir,
    dependencies: patchedSharpDeps,
    packageJson: {
      // npm uses overrides
      overrides: patchedSharpDeps,
      pnpm: {
        overrides: patchedSharpDeps,
      },
    },
  })

  it('only optimizes avif input when the bundled libheif is patched', async () => {
    const query = new URLSearchParams({
      url: '/test.avif',
      w: '256',
      q: '75',
    })
    require('console').log(
      'node',
      execSync('node --version', {
        cwd: next.testDir,
        stdio: 'pipe',
        encoding: 'utf-8',
      })
    )
    require('console').log(await (await next.fetch('/versions')).json())
    const res = await next.fetch(`/_next/image?${query}`, {
      headers: { accept: 'image/webp' },
    })

    expect(res.status).toBe(200)
    if (
      decodesAvif ||
      // Vercel's Image Optimization pipeline uses a patched libheif i.e. doesn't use Next.js' pipeline.
      isNextDeploy
    ) {
      expect(res.headers.get('content-type')).toBe('image/webp')
    } else {
      expect(res.headers.get('content-type')).toBe('image/avif')
      const source = await fs.readFile(join(appDir, 'public/test.avif'))
      expect(Buffer.from(await res.arrayBuffer()).equals(source)).toBe(true)
    }
  })

  it('still optimizes other formats', async () => {
    const query = new URLSearchParams({
      url: '/test.png',
      w: '256',
      q: '75',
    })
    const res = await next.fetch(`/_next/image?${query}`, {
      headers: { accept: 'image/webp' },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
  })
})
