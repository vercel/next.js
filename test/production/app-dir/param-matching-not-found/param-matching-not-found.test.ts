import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'

describe.each([
  ['explicit-mismatch', '/[lang]/a', '/[lang]/b'],
  ['missing-sibling', '/[lang]/a', '/[lang]/b'],
  ['missing-policy-key', '/[lang]/a', '/[lang]/b/[slug]'],
  ['inherited-override', '/[lang]/a', '/[lang]/b'],
  ['generated-missing', '/[lang]/a', '/[lang]/b'],
  ['missing-ancestor', '/[lang]/a', '/[lang]'],
  ['route-group-missing', '/[lang]/a', '/[lang]/b'],
  ['parallel-missing', '/[lang]', null],
] as const)(
  'not-found parameter coherence: %s',
  (fixture, closedRoute, openRoute) => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'fixtures', fixture)),
        'app/layout.tsx': new FileRef(join(__dirname, 'app/layout.tsx')),
        'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
      },
      skipStart: true,
    })

    it('rejects a parameter that is not explicitly closed in every route', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(exitCode).toBe(1)
      expect(cliOutput).toContain('Parameter "lang"')
      expect(cliOutput).toContain('must explicitly configure "not-found"')
      expect(cliOutput).toContain(closedRoute)
      if (openRoute !== null) {
        expect(cliOutput).toContain(openRoute)
      } else {
        expect(cliOutput).toContain('parallel branch')
      }
    })
  }
)

describe('coherent not-found parameter configurations', () => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'fixtures/valid')),
      'app/layout.tsx': new FileRef(join(__dirname, 'app/layout.tsx')),
      'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
    },
    skipStart: true,
  })

  it('accepts inheritance, explicit agreement, and unrelated parameter definitions', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('must explicitly configure "not-found"')
    expect(exitCode).toBe(0)

    const manifest = await next.readJSON('.next/prerender-manifest.json')
    // Agreement on matching policy does not require identical allowed values.
    expect(manifest.routes['/en/a']).toBeDefined()
    expect(manifest.routes['/fr/b']).toBeDefined()
    // These slug parameters have distinct definitions despite the same name.
    expect(manifest.routes['/products/allowed']).toBeDefined()
    expect(manifest.routes['/blog/allowed']).toBeDefined()
    expect(manifest.routes['/explicit/en/a']).toBeDefined()
    expect(manifest.routes['/explicit/en/b']).toBeDefined()
    expect(manifest.routes['/slots/en']).toBeDefined()
    expect(manifest.routes['/open/one/a']).toBeDefined()
    expect(manifest.routes['/open/one/b']).toBeDefined()
  })
})
