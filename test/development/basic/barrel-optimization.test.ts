import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { shouldRunTurboDevTest } from '../../lib/next-test-utils'

describe('optimizePackageImports', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      env: {
        NEXT_TEST_MODE: '1',
      },
      files: {
        app: new FileRef(join(__dirname, 'barrel-optimization/app')),
        pages: new FileRef(join(__dirname, 'barrel-optimization/pages')),
        components: new FileRef(
          join(__dirname, 'barrel-optimization/components')
        ),
        'next.config.js': new FileRef(
          join(__dirname, 'barrel-optimization/next.config.js')
        ),
        node_modules_bak: new FileRef(
          join(__dirname, 'barrel-optimization/node_modules_bak')
        ),
      },
      packageJson: {
        scripts: {
          setup: `cp -r ./node_modules_bak/* ./node_modules`,
          build: `yarn setup && next build`,
          dev: `yarn setup && next ${
            shouldRunTurboDevTest() ? 'dev --turbo' : 'dev'
          }`,
          start: 'next start',
        },
      },
      installCommand: 'yarn',
      startCommand: (global as any).isNextDev ? 'yarn dev' : 'yarn start',
      buildCommand: 'yarn build',
      dependencies: {
        'lucide-react': '0.264.0',
        '@headlessui/react': '1.7.17',
        '@heroicons/react': '2.0.18',
        '@visx/visx': '3.3.0',
      },
    })
  })
  afterAll(() => next.destroy())

  it('app - should render the icons correctly without creating all the modules', async () => {
    let logs = ''
    next.on('stdout', (log) => {
      logs += log
    })

    const html = await next.render('/')

    // Ensure the icons are rendered
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"')

    const modules = [
      ...logs.matchAll(
        /Compiled (\/[\w-]+)*\s*in \d+(\.\d+)?(s|ms) \((\d+) modules\)/g
      ),
    ]

    expect(modules.length).toBeGreaterThanOrEqual(1)
    for (const [, , , , moduleCount] of modules) {
      // Ensure that the number of modules is less than 1000 - otherwise we're
      // importing the entire library.
      expect(parseInt(moduleCount)).toBeLessThan(1000)
    }
  })

  it('pages - should render the icons correctly without creating all the modules', async () => {
    let logs = ''
    next.on('stdout', (log) => {
      logs += log
    })

    const html = await next.render('/pages-route')

    // Ensure the icons are rendered
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"')

    const modules = [
      ...logs.matchAll(
        /Compiled (\/[\w-]+)*\s*in \d+(\.\d+)?(s|ms) \((\d+) modules\)/g
      ),
    ]

    expect(modules.length).toBeGreaterThanOrEqual(1)
    for (const [, , , , moduleCount] of modules) {
      // Ensure that the number of modules is less than 1000 - otherwise we're
      // importing the entire library.
      expect(parseInt(moduleCount)).toBeLessThan(1000)
    }
  })

  it('should reuse the transformed barrel meta file from SWC', async () => {
    let logs = ''
    next.on('stdout', (log) => {
      logs += log
    })

    const html = await next.render('/dedupe')

    // Ensure the icons are rendered
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"')

    const swcOptimizeBarrelExports = [
      ...logs.matchAll(
        /optimizeBarrelExports: .+\/dist\/esm\/lucide-react\.js/g
      ),
    ]

    expect(swcOptimizeBarrelExports.length).toBe(1)
  })

  it('should handle recursive wildcard exports', async () => {
    const html = await next.render('/recursive')
    expect(html).toContain('<h1>42</h1>')
  })

  it('should support visx', async () => {
    const html = await next.render('/visx')
    expect(html).toContain('<linearGradient')
  })

  it('should not break "use client" directive in optimized packages', async () => {
    const html = await next.render('/client')
    expect(html).toContain('this is a client component')
  })
})
