import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox, retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('server-side dev errors', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  function stripInternalHandler(output) {
    return output
      .replace(/.*at async handler .*next-route-loader.*/, '')
      .replace(/.*at async handleResponse.*/, '')
      .replace(/.*at async doRender \(.*/, '')
      .split(/\n/)
      .filter((item) => !!item.trim())
      .join('\n')
  }

  it('should show server-side error for gsp page correctly', async () => {
    const content = await next.readFile('pages/gsp.js')

    try {
      const cliOutputIdx = next.cliOutput.length
      await next.patchFile(
        'pages/gsp.js',
        content.replace('return {', 'missingVar;return {')
      )
      const browser = await next.browser('/gsp')

      await retry(() => {
        expect(next.cliOutput.slice(cliOutputIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripInternalHandler(
        stripAnsi(next.cliOutput.slice(cliOutputIdx)).trim()
      )

      expect(stderrOutput).toContain(
        '⨯ ReferenceError: missingVar is not defined'
      )
      expect(stderrOutput).toContain('at getStaticProps')
      expect(stderrOutput).toContain('pages/gsp.js:6:3')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "missingVar is not defined",
         "environmentLabel": null,
         "label": "Runtime ReferenceError",
         "source": "pages/gsp.js (6:3) @ getStaticProps
       > 6 |   missingVar;return {
           |   ^",
         "stack": [
           "getStaticProps pages/gsp.js (6:3)",
         ],
       }
      `)

      await next.patchFile('pages/gsp.js', content)
      await waitForNoRedbox(browser)
    } finally {
      await next.patchFile('pages/gsp.js', content)
    }
  })

  it('should show server-side error for gssp page correctly', async () => {
    const content = await next.readFile('pages/gssp.js')

    try {
      const cliOutputIdx = next.cliOutput.length
      await next.patchFile(
        'pages/gssp.js',
        content.replace('return {', 'missingVar;return {')
      )
      const browser = await next.browser('/gssp')

      await retry(() => {
        expect(next.cliOutput.slice(cliOutputIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripInternalHandler(
        stripAnsi(next.cliOutput.slice(cliOutputIdx)).trim()
      )
      expect(stderrOutput).toContain(
        '⨯ ReferenceError: missingVar is not defined'
      )
      expect(stderrOutput).toContain('at getServerSideProps')
      expect(stderrOutput).toContain('pages/gssp.js:6:3')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "missingVar is not defined",
         "environmentLabel": null,
         "label": "Runtime ReferenceError",
         "source": "pages/gssp.js (6:3) @ getServerSideProps
       > 6 |   missingVar;return {
           |   ^",
         "stack": [
           "getServerSideProps pages/gssp.js (6:3)",
         ],
       }
      `)

      await next.patchFile('pages/gssp.js', content)
      await waitForNoRedbox(browser)
    } finally {
      await next.patchFile('pages/gssp.js', content)
    }
  })

  it('should show server-side error for dynamic gssp page correctly', async () => {
    const content = await next.readFile('pages/blog/[slug].js')

    try {
      const cliOutputIdx = next.cliOutput.length
      await next.patchFile(
        'pages/blog/[slug].js',
        content.replace('return {', 'missingVar;return {')
      )
      const browser = await next.browser('/blog/first')

      await retry(() => {
        expect(next.cliOutput.slice(cliOutputIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripInternalHandler(
        stripAnsi(next.cliOutput.slice(cliOutputIdx)).trim()
      )
      expect(stderrOutput).toContain(
        '⨯ ReferenceError: missingVar is not defined'
      )
      expect(stderrOutput).toContain('at getServerSideProps')
      expect(stderrOutput).toContain('pages/blog/[slug].js:6:3')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "missingVar is not defined",
         "environmentLabel": null,
         "label": "Runtime ReferenceError",
         "source": "pages/blog/[slug].js (6:3) @ getServerSideProps
       > 6 |   missingVar;return {
           |   ^",
         "stack": [
           "getServerSideProps pages/blog/[slug].js (6:3)",
         ],
       }
      `)

      await next.patchFile('pages/blog/[slug].js', content)
    } finally {
      await next.patchFile('pages/blog/[slug].js', content)
    }
  })

  it('should show server-side error for api route correctly', async () => {
    const content = await next.readFile('pages/api/hello.js')

    try {
      const cliOutputIdx = next.cliOutput.length
      await next.patchFile(
        'pages/api/hello.js',
        content.replace('res.status', 'missingVar;res.status')
      )
      const browser = await next.browser('/api/hello')

      await retry(() => {
        expect(next.cliOutput.slice(cliOutputIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripAnsi(next.cliOutput.slice(cliOutputIdx)).trim()
      expect(stderrOutput).toContain(
        '⨯ ReferenceError: missingVar is not defined'
      )
      expect(stderrOutput).toContain('at handler')
      expect(stderrOutput).toContain('pages/api/hello.js:2:3')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "missingVar is not defined",
         "environmentLabel": null,
         "label": "Runtime ReferenceError",
         "source": "pages/api/hello.js (2:3) @ handler
       > 2 |   missingVar;res.status(200).json({ hello: 'world' })
           |   ^",
         "stack": [
           "handler pages/api/hello.js (2:3)",
         ],
       }
      `)

      await next.patchFile('pages/api/hello.js', content)

      await retry(async () => {
        await browser.refresh()
        await waitForNoRedbox(browser)
      })
    } finally {
      await next.patchFile('pages/api/hello.js', content)
    }
  })

  it('should show server-side error for dynamic api route correctly', async () => {
    const content = await next.readFile('pages/api/blog/[slug].js')

    try {
      const cliOutputIdx = next.cliOutput.length
      await next.patchFile(
        'pages/api/blog/[slug].js',
        content.replace('res.status', 'missingVar;res.status')
      )
      const browser = await next.browser('/api/blog/first')

      await retry(() => {
        expect(next.cliOutput.slice(cliOutputIdx)).toContain(
          'ReferenceError: missingVar is not defined'
        )
      })

      const stderrOutput = stripAnsi(next.cliOutput.slice(cliOutputIdx)).trim()
      expect(stderrOutput).toContain(
        '⨯ ReferenceError: missingVar is not defined'
      )
      expect(stderrOutput).toContain('at handler')
      expect(stderrOutput).toContain('pages/api/blog/[slug].js:2:3')

      await expect(browser).toDisplayRedbox(`
       {
         "code": "E394",
         "description": "missingVar is not defined",
         "environmentLabel": null,
         "label": "Runtime ReferenceError",
         "source": "pages/api/blog/[slug].js (2:3) @ handler
       > 2 |   missingVar;res.status(200).json({ slug: req.query.slug })
           |   ^",
         "stack": [
           "handler pages/api/blog/[slug].js (2:3)",
         ],
       }
      `)

      await next.patchFile('pages/api/blog/[slug].js', content)

      await retry(async () => {
        await browser.refresh()
        await waitForNoRedbox(browser)
      })
    } finally {
      await next.patchFile('pages/api/blog/[slug].js', content)
    }
  })

  it('should show server-side error for uncaught rejection correctly', async () => {
    const cliOutputIdx = next.cliOutput.length
    await next.browser('/uncaught-rejection')

    await retry(() => {
      expect(next.cliOutput.slice(cliOutputIdx)).toContain(
        'Error: catch this rejection'
      )
    })

    const stderrOutput = stripAnsi(next.cliOutput.slice(cliOutputIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()

    expect(stderrOutput).toContain('Error: catch this rejection')
    expect(stderrOutput).toContain('pages/uncaught-rejection.js')
    expect(stderrOutput).toContain('unhandledRejection')
  })

  it('should show server-side error for uncaught empty rejection correctly', async () => {
    const cliOutputIdx = next.cliOutput.length
    await next.browser('/uncaught-empty-rejection')

    await retry(() => {
      expect(next.cliOutput.slice(cliOutputIdx)).toContain('Error:')
    })

    const stderrOutput = stripAnsi(next.cliOutput.slice(cliOutputIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()

    expect(stderrOutput).toContain('pages/uncaught-empty-rejection.js')
    expect(stderrOutput).toContain('unhandledRejection')
  })

  it('should show server-side error for uncaught exception correctly', async () => {
    const cliOutputIdx = next.cliOutput.length
    await next.browser('/uncaught-exception')

    await retry(() => {
      expect(next.cliOutput.slice(cliOutputIdx)).toContain('Error:')
    })

    const stderrOutput = stripAnsi(next.cliOutput.slice(cliOutputIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()

    expect(stderrOutput).toContain('Error: catch this exception')
    expect(stderrOutput).toContain('pages/uncaught-exception.js')
    expect(stderrOutput).toContain('uncaughtException')
  })

  it('should show server-side error for uncaught empty exception correctly', async () => {
    const cliOutputIdx = next.cliOutput.length
    await next.browser('/uncaught-empty-exception')

    await retry(() => {
      expect(next.cliOutput.slice(cliOutputIdx)).toContain('Error:')
    })

    const stderrOutput = stripAnsi(next.cliOutput.slice(cliOutputIdx))
      .replace(
        '⚠ Fast Refresh had to perform a full reload due to a Runtime ReferenceError.',
        ''
      )
      .trim()

    expect(stderrOutput).toContain('pages/uncaught-empty-exception.js')
    expect(stderrOutput).toContain('uncaughtException')
  })
})
