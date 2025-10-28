import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

// This is implemented in Turbopack, but Turbopack doesn't log the module count.
;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
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
