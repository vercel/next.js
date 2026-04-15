import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'

describe('TypeScript Features', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render the page', async () => {
    const $ = await next.render$('/hello')
    expect($('body').text()).toMatch(/Hello World/)
    expect($('body').text()).toMatch(/1000000000000/)
  })

  it('should render the cookies page', async () => {
    const $ = await next.render$('/ssr/cookies')
    expect($('#cookies').text()).toBe('{}')
  })

  it('should render the cookies page with cookies', async () => {
    const res = await next.fetch('/ssr/cookies', {
      headers: {
        Cookie: 'key=value;',
      },
    })
    const html = await res.text()
    expect(html).toContain(`{"key":"value"}`)
  })

  it('should render the generics page', async () => {
    const $ = await next.render$('/generics')
    expect($('#value').text()).toBe('Hello World from Generic')
  })

  it('should render the angle bracket type assertions page', async () => {
    const $ = await next.render$('/angle-bracket-type-assertions')
    expect($('#value').text()).toBe('test')
  })

  // Turbopack prefers `.ts`/`.tsx` over `.js`/`.jsx`, webpack prefers `.js`/`.jsx`
  ;(process.env.IS_TURBOPACK_TEST ? it.skip : it)(
    'should resolve files in correct order',
    async () => {
      const $ = await next.render$('/hello')
      // eslint-disable-next-line jest/no-standalone-expect
      expect($('#imported-value').text()).toBe('OK')
    }
  )

  it('should respond to sync API route correctly', async () => {
    const html = await next.render('/api/sync')
    const data = JSON.parse(html)
    expect(data).toEqual({ code: 'ok' })
  })

  it('should respond to async API route correctly', async () => {
    const html = await next.render('/api/async')
    const data = JSON.parse(html)
    expect(data).toEqual({ code: 'ok' })
  })

  if (isNextDev) {
    it('should not fail to render when an inactive page has an error', async () => {
      await next.patchFile(
        'pages/evil.tsx',
        `import React from 'react'

export default function EvilPage(): JSX.Element {
  return <div notARealProp />
}
`
      )
      try {
        const $ = await next.render$('/hello')
        expect($('body').text()).toMatch(/Hello World/)
      } finally {
        await next.deleteFile('pages/evil.tsx')
      }
    })
  }

  if (isNextStart) {
    it('should build the app successfully', async () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })
  }
})
