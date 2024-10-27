import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
// Skipped in Turbopack, will be added later.
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Skipped in Turbopack',
  () => {
    describe('optimizePackageImports - basic', () => {
      const { next } = nextTestSetup({
        env: {
          NEXT_TEST_MODE: '1',
        },
        files: join(__dirname, 'fixture'),
        dependencies: {
          'lucide-react': '0.264.0',
          '@headlessui/react': '1.7.17',
          '@heroicons/react': '2.0.18',
          '@visx/visx': '3.3.0',
          'recursive-barrel': '1.0.0',
        },
      })

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
            /Compiled (\/[\w-]*)*\s*in \d+(\.\d+)?(s|ms) \((\d+) modules\)/g
          ),
        ]

        expect(modules.length).toBeGreaterThanOrEqual(1)
        for (const [, , , , moduleCount] of modules) {
          // Ensure that the number of modules is less than 1500 - otherwise we're
          // importing the entire library.
          expect(parseInt(moduleCount)).toBeLessThan(1500)
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
          // Ensure that the number of modules is less than 1500 - otherwise we're
          // importing the entire library.
          expect(parseInt(moduleCount)).toBeLessThan(1500)
        }
      })

      it('app - should optimize recursive wildcard export mapping', async () => {
        let logs = ''
        next.on('stdout', (log) => {
          logs += log
        })

        await next.render('/recursive-barrel-app')

        const modules = [...logs.matchAll(/\((\d+) modules\)/g)]

        expect(modules.length).toBeGreaterThanOrEqual(1)
        for (const [, moduleCount] of modules) {
          // Ensure that the number of modules is less than 1500 - otherwise we're
          // importing the entire library.
          expect(parseInt(moduleCount)).toBeLessThan(1500)
        }
      })

      it('pages - should optimize recursive wildcard export mapping', async () => {
        let logs = ''
        next.on('stdout', (log) => {
          logs += log
        })

        await next.render('/recursive-barrel')

        const modules = [...logs.matchAll(/\((\d+) modules\)/g)]

        expect(modules.length).toBeGreaterThanOrEqual(1)
        for (const [, moduleCount] of modules) {
          // Ensure that the number of modules is less than 1500 - otherwise we're
          // importing the entire library.
          expect(parseInt(moduleCount)).toBeLessThan(1500)
        }
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

      it('should support "use client" directive in barrel file', async () => {
        const html = await next.render('/client-boundary')
        expect(html).toContain('<button>0</button>')
      })
    })
  }
)
