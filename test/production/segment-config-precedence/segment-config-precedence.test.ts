import { nextTestSetup } from 'e2e-utils'

describe('segment-config-precedence', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('accepts an undefined maxDuration export', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })

  it.each(['region-string-first', 'region-array-first'])(
    'accepts equivalent preferredRegion values in parallel routes: %s',
    async (route) => {
      const $ = await next.render$(`/${route}`)
      expect($('#children').text()).toBe('children')
      expect($('#slot').text()).toBe('slot')
    }
  )

  it.each([
    ['export-first', 'nodejs'],
    ['config-first', 'nodejs'],
    ['undefined-export-first', 'edge'],
    ['undefined-config-first', 'edge'],
  ])(
    'resolves runtime independently of export order: %s',
    async (route, runtime) => {
      const res = await next.fetch(`/api/${route}`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ runtime })
    }
  )

  it('gives top-level maxDuration precedence and falls back for undefined exports', async () => {
    const manifest = await next.readJSON(
      '.next/server/functions-config-manifest.json'
    )
    expect(manifest.functions['/api/export-first'].maxDuration).toBe(10)
    expect(manifest.functions['/api/config-first'].maxDuration).toBe(10)
    expect(manifest.functions['/api/undefined-export-first'].maxDuration).toBe(
      20
    )
    expect(manifest.functions['/api/undefined-config-first'].maxDuration).toBe(
      20
    )
    expect(manifest.functions['/']).toBeUndefined()
  })
})

describe('segment-config validation', () => {
  describe.each(['-1', '1.5', 'NaN', 'Infinity'])(
    'maxDuration = %s',
    (value) => {
      const { next } = nextTestSetup({
        files: __dirname,
        skipStart: true,
        overrideFiles: {
          'app/page.tsx': `
            export const maxDuration = ${value}

            export default function Page() {
              return <p>hello world</p>
            }
          `,
        },
      })

      it('validates maxDuration at build time', async () => {
        const result = await next.build()
        expect(result.exitCode).toBe(1)
        expect(result.cliOutput).toContain('maxDuration')
      })
    }
  )
})
