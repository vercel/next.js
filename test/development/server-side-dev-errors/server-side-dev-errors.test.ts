import { nextTestSetup } from 'e2e-utils'
import { waitForNoRedbox, retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

describe('server-side dev errors', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  function stripInternalHandler(output) {
    return output
      .replace(/Creating turbopack project \{[\s\S]*?\}\s*/g, '')
      .replace(/WARNING: The git repository is dirty[^\n]*\n?/g, '')
      .replace(/.*at async handler .*next-route-loader.*/g, '')
      .replace(/.*at async handleResponse.*/g, '')
      .replace(/.*at async doRender \(.*/g, '')
      .split(/\n/)
      .filter((item) => {
        const trimmed = item.trim()
        if (!trimmed) return false
        // Drop bootstrap/startup banner lines that may appear after
        // `next.cliOutput` was sliced. The Experiments banner is logged
        // asynchronously after the dev server reports ready (see
        // `logExperimentalInfo` in `start-server.ts`), so it can race
        // with the test capturing `cliOutputIdx`.
        if (trimmed.startsWith('- ')) return false
        if (/^[✓⚠△] /.test(trimmed)) return false
        // Drop compiling indicator lines (e.g. "○ Compiling /gsp ...").
        if (trimmed.startsWith('○ ')) return false
        return true
      })
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

      expect(stderrOutput).toStartWith(
        '⨯ ReferenceError: missingVar is not defined\n    at getStaticProps'
      )
      expect(stderrOutput).toContain('gsp.js:6:3')
      expect(stderrOutput).toContain(
        '  5 | export async function getStaticProps() {\n' +
          '> 6 |   missingVar;return {\n' +
          '    |   ^'
      )

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
      expect(stderrOutput).toStartWith(
        '⨯ ReferenceError: missingVar is not defined\n    at getServerSideProps'
      )
      expect(stderrOutput).toContain('gssp.js:6:3')
      expect(stderrOutput).toContain(
        '  5 | export async function getServerSideProps() {\n' +
          '> 6 |   missingVar;return {\n' +
          '    |   ^'
      )

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
      expect(stderrOutput).toStartWith(
        '⨯ ReferenceError: missingVar is not defined\n    at getServerSideProps'
      )
      expect(stderrOutput).toContain('[slug].js:6:3')
      expect(stderrOutput).toContain(
        '  5 | export async function getServerSideProps() {\n' +
          '> 6 |   missingVar;return {\n' +
          '    |   ^'
      )

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
      if (isTurbopack) {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined\n    at handler'
        )
        expect(stderrOutput).toContain('hello.js:2:3')
        expect(stderrOutput).toContain(
          '  1 | export default function handler(req, res) {\n' +
            "> 2 |   missingVar;res.status(200).json({ hello: 'world' })\n" +
            '    |   ^'
        )
      } else {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined\n    at handler'
        )
        expect(stderrOutput).toContain('hello.js:2:3')
        // TODO(veil): Why not ignore-listed?
        expect(stderrOutput).toContain('\n    at ')
        expect(stderrOutput).toContain(
          '  1 | export default function handler(req, res) {\n' +
            "> 2 |   missingVar;res.status(200).json({ hello: 'world' })\n" +
            '    |   ^'
        )
      }

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
      if (isTurbopack) {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined\n    at handler'
        )
        expect(stderrOutput).toContain('[slug].js:2:3')
        expect(stderrOutput).toContain(
          '  1 | export default function handler(req, res) {\n' +
            '> 2 |   missingVar;res.status(200).json({ slug: req.query.slug })\n' +
            '    |   ^'
        )
      } else {
        expect(stderrOutput).toStartWith(
          '⨯ ReferenceError: missingVar is not defined\n    at handler'
        )
        expect(stderrOutput).toContain('[slug].js:2:3')
        // TODO(veil): Why not ignore-listed?
        expect(stderrOutput).toContain('\n    at')
        expect(stderrOutput).toContain(
          '  1 | export default function handler(req, res) {\n' +
            '> 2 |   missingVar;res.status(200).json({ slug: req.query.slug })\n' +
            '    |   ^'
        )
      }

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

    // FIXME(veil): error repeated
    expect(stderrOutput).toContain('Error: catch this rejection')
    expect(stderrOutput).toContain('uncaught-rejection.js:7:20')
    if (isTurbopack) {
      expect(stderrOutput).toContain('at Timeout._onTimeout')
    } else {
      expect(stderrOutput).toContain('at Timeout.eval [as _onTimeout]')
    }
    expect(stderrOutput).toContain(
      '   5 | export async function getServerSideProps() {\n' +
        '   6 |   setTimeout(() => {\n' +
        ">  7 |     Promise.reject(new Error('catch this rejection'))"
    )
    expect(stderrOutput).toContain(
      '⨯ unhandledRejection: Error: catch this rejection'
    )
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

    // FIXME(veil): error repeated
    expect(stderrOutput).toContain('uncaught-empty-rejection.js:7:20')
    if (isTurbopack) {
      expect(stderrOutput).toContain('at Timeout._onTimeout')
    } else {
      expect(stderrOutput).toContain('at Timeout.eval [as _onTimeout]')
    }
    expect(stderrOutput).toContain(
      '   5 | export async function getServerSideProps() {\n' +
        '   6 |   setTimeout(() => {\n' +
        '>  7 |     Promise.reject(new Error())'
    )
    expect(stderrOutput).toContain('⨯ unhandledRejection: Error:')
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

    // FIXME(veil): error repeated
    expect(stderrOutput).toContain('Error: catch this exception')
    expect(stderrOutput).toContain('uncaught-exception.js:7:11')
    if (isTurbopack) {
      expect(stderrOutput).toContain('at Timeout._onTimeout')
    } else {
      expect(stderrOutput).toContain('at Timeout.eval [as _onTimeout]')
    }
    expect(stderrOutput).toContain(
      '   5 | export async function getServerSideProps() {\n' +
        '   6 |   setTimeout(() => {\n' +
        ">  7 |     throw new Error('catch this exception')"
    )
    expect(stderrOutput).toContain(
      '⨯ uncaughtException: Error: catch this exception'
    )
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

    // FIXME(veil): error repeated
    expect(stderrOutput).toContain('uncaught-empty-exception.js:7:11')
    if (isTurbopack) {
      expect(stderrOutput).toContain('at Timeout._onTimeout')
    } else {
      expect(stderrOutput).toContain('at Timeout.eval [as _onTimeout]')
    }
    expect(stderrOutput).toContain(
      '   5 | export async function getServerSideProps() {\n' +
        '   6 |   setTimeout(() => {\n' +
        '>  7 |     throw new Error()'
    )
    expect(stderrOutput).toContain('⨯ uncaughtException: Error:')
  })
})
