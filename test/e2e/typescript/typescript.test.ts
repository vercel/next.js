import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'

describe('TypeScript Features', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: 'latest',
    },
    skipDeployment: true,
  })
  if (skipped) return

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
  ;(isTurbopack ? it.skip : it)(
    'should resolve files in correct order',
    async () => {
      const $ = await next.render$('/hello')
      // eslint-disable-next-line jest/no-standalone-expect
      expect($('#imported-value').text()).toBe('OK')
    }
  )

  // old behavior:
  it.skip('should report type checking to stdout', () => {
    expect(next.cliOutput).toContain('waiting for typecheck results...')
  })

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

    it('should not inform when using default tsconfig path', () => {
      expect(next.cliOutput).not.toMatch(/Using tsconfig file:/)
    })
  }
})
;(isNextStart ? describe : describe.skip)(
  'TypeScript production compilation',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      dependencies: {
        sass: 'latest',
      },
      skipDeployment: true,
    })
    if (skipped) return

    it('should build the app', async () => {
      const { cliOutput, exitCode } = await next.build()
      expect(cliOutput).toMatch(/Compiled successfully/)
      expect(exitCode).toBe(0)
    })

    it('should build the app with functions in next.config.js', async () => {
      const originalConfig = await next.readFile('next.config.js')
      await next.patchFile(
        'next.config.js',
        `
    module.exports = {
      webpack(config) { return config },
      onDemandEntries: {
        // Make sure entries are not getting disposed.
        maxInactiveAge: 1000 * 60 * 60,
      },
    }
    `
      )

      try {
        const { cliOutput, exitCode } = await next.build()
        expect(cliOutput).toMatch(/Compiled successfully/)
        expect(exitCode).toBe(0)
      } finally {
        await next.patchFile('next.config.js', originalConfig)
      }
    })

    describe('should compile with different types', () => {
      it('should compile async getInitialProps for _error', async () => {
        const errorPage = await next.readFile('pages/_error.tsx')
        await next.patchFile(
          'pages/_error.tsx',
          errorPage.replace('static ', 'static async ')
        )
        try {
          const { cliOutput } = await next.build()
          expect(cliOutput).toMatch(/Compiled successfully/)
        } finally {
          await next.patchFile('pages/_error.tsx', errorPage)
        }
      })

      it('should compile sync getStaticPaths & getStaticProps', async () => {
        const page = await next.readFile('pages/ssg/[slug].tsx')
        await next.patchFile(
          'pages/ssg/[slug].tsx',
          page.replace(/async \(/g, '(')
        )
        try {
          const { cliOutput } = await next.build()
          expect(cliOutput).toMatch(/Compiled successfully/)
        } finally {
          await next.patchFile('pages/ssg/[slug].tsx', page)
        }
      })
    })
  }
)
