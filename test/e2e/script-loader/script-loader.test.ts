import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('script-loader', () => {
  const { next, isNextDev, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  // TODO: We will refactor the next/script to be strict mode resilient
  // Don't skip the test case for development mode (strict mode) once refactoring is finished
  it('priority afterInteractive', async () => {
    const browser = await next.browser('/')

    async function test(scriptID: string) {
      await retry(async () => {
        const script = await browser.elementByCss(`script#${scriptID}`)
        const dataAttr = await script.getAttribute('data-nscript')
        const endScripts = await browser.elementsByCss(
          `#__NEXT_DATA__ ~ script#${scriptID}`
        )

        expect(script).toBeDefined()
        expect(dataAttr).toBeDefined()

        expect(endScripts.length).toBe(1)
      })
    }

    // afterInteractive script in page
    await test('scriptAfterInteractive')
    // afterInteractive script in _document
    await test('documentAfterInteractive')
  })

  it('priority lazyOnload', async () => {
    const browser = await next.browser('/page3')

    await browser.waitForElementByCss('#onload-div', { state: 'attached' })

    async function test(scriptId: string, css?: string) {
      await retry(async () => {
        const script = await browser.elementByCss(`script#${scriptId}`)
        const dataAttr = await script.getAttribute('data-nscript')
        const endScripts = await browser.elementsByCss(
          `#__NEXT_DATA__ ~ #${scriptId}`
        )

        expect(script).toBeDefined()
        expect(dataAttr).toBeDefined()

        if (css) {
          const cssTag = await browser.elementByCss(`link[href="${css}"]`)
          expect(cssTag).toBeDefined()
        }

        expect(endScripts.length).toBe(1)
      })
    }

    // lazyOnload script in page
    await test(
      'scriptLazyOnload',
      'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css'
    )
    // lazyOnload script in _document
    await test('documentLazyOnload')
  })

  it('priority beforeInteractive', async () => {
    const $ = await next.render$('/page1')

    function test(id: string) {
      const script = $(`#${id}`)

      expect(script.length).toBe(1)
      expect(script.attr('data-nscript')).toBeDefined()

      let scriptCount: number
      if (isTurbopack) {
        if (isNextDev) {
          scriptCount =
            $(
              `#${id} ~ script[src^="/_next/static/chunks/%5Broot-of-the-server%5D__"]`
            ).length +
            $(
              `#${id} ~ script[src^="/_next/static/immutable/chunks/%5Broot-of-the-server%5D__"]`
            ).length
        } else {
          scriptCount =
            $(`#${id} ~ script[src^="/_next/static/chunks/"]`).length +
            $(`#${id} ~ script[src^="/_next/static/immutable/chunks/"]`).length
        }
      } else {
        scriptCount = $(
          `#${id} ~ script[src^="/_next/static/chunks/main"]`
        ).length
      }
      expect(scriptCount).toBeGreaterThan(0)
    }

    test('scriptBeforeInteractive')
  })

  // Warning - Will be removed in the next major release
  it('priority beforeInteractive - older version', async () => {
    const $ = await next.render$('/page6')

    function test(id: string) {
      const script = $(`#${id}`)

      expect(script.length).toBe(1)
      expect(script.attr('data-nscript')).toBeDefined()

      let scriptCount: number
      if (isTurbopack) {
        if (isNextDev) {
          scriptCount =
            $(
              `#${id} ~ script[src^="/_next/static/chunks/%5Broot-of-the-server%5D__"]`
            ).length +
            $(
              `#${id} ~ script[src^="/_next/static/immutable/chunks/%5Broot-of-the-server%5D__"]`
            ).length
        } else {
          scriptCount =
            $(`#${id} ~ script[src^="/_next/static/chunks/"]`).length +
            $(`#${id} ~ script[src^="/_next/static/immutable/chunks/"]`).length
        }
      } else {
        scriptCount = $(
          `#${id} ~ script[src^="/_next/static/chunks/main"]`
        ).length
      }
      expect(scriptCount).toBeGreaterThan(0)
    }

    test('scriptBeforePageRenderOld')
  })

  it('priority beforeInteractive on navigate', async () => {
    const browser = await next.browser('/')

    // beforeInteractive scripts should load once
    let documentBIScripts = await browser.elementsByCss(
      '[src$="scriptBeforeInteractive"]'
    )
    expect(documentBIScripts.length).toBe(2)

    await browser.waitForElementByCss('[href="/page1"]').click()

    await browser.waitForElementByCss('.container')

    // Ensure beforeInteractive script isn't duplicated on navigation
    documentBIScripts = await browser.elementsByCss(
      '[src$="scriptBeforeInteractive"]'
    )
    expect(documentBIScripts.length).toBe(2)
  })

  it('onload fires correctly', async () => {
    const browser = await next.browser('/page4')

    await retry(async () => {
      const text = await browser.elementById('onload-div-1').text()
      expect(text).toBe('initialaaabbbccc')
    })

    // Navigate to different page and back
    await browser.waitForElementByCss('[href="/page9"]').click()
    await browser.waitForElementByCss('[href="/page4"]').click()

    await browser.waitForElementByCss('#onload-div-1')
    const sameText = await browser.elementById('onload-div-1').text()
    // onload should only be fired once, not on sequential re-mount
    expect(sameText).toBe('initial')
  })

  it('priority beforeInteractive with inline script', async () => {
    const $ = await next.render$('/page5')

    const script = $('#inline-before')
    expect(script.length).toBe(1)

    // css bundle is only generated in production, so only perform inline script position check in production
    if (!isNextDev) {
      expect(
        $(`#inline-before ~ link[href^="/_next/static/"]`).filter(
          (i, element) => $(element).attr('href')?.includes('.css')
        ).length +
          $(`#inline-before ~ link[href^="/_next/static/immutable/"]`).filter(
            (i, element) => $(element).attr('href')?.includes('.css')
          ).length
      ).toBeGreaterThan(0)
    }
  })

  it('priority beforeInteractive with inline script should execute', async () => {
    const browser = await next.browser('/page7')

    await retry(async () => {
      const logs = await browser.log()
      // not only should inline script run, but also should only run once
      expect(
        logs.filter((log) =>
          log.message.includes('beforeInteractive inline script run')
        ).length
      ).toBe(1)
    })
  })

  it('Does not duplicate inline scripts', async () => {
    const browser = await next.browser('/')

    // Navigate away and back to page
    await browser.waitForElementByCss('[href="/page5"]').click()
    await browser.waitForElementByCss('[href="/"]').click()
    await browser.waitForElementByCss('[href="/page5"]').click()

    await browser.waitForElementByCss('.container')

    await retry(async () => {
      const text = await browser.elementById('text').text()
      expect(text).toBe('abc')
    })
  })

  it('onReady fires after load event and then on every subsequent re-mount', async () => {
    const browser = await next.browser('/page8')

    await retry(async () => {
      const text = await browser.elementById('text').text()
      expect(text).toBe('aaa')
    })

    // Navigate to different page and back
    await browser.waitForElementByCss('[href="/page9"]').click()
    await browser.waitForElementByCss('[href="/page8"]').click()

    await browser.waitForElementByCss('.container')
    await retry(async () => {
      const sameText = await browser.elementById('text').text()
      expect(sameText).toBe('aaa')
    })
  })

  // https://github.com/vercel/next.js/issues/39993
  it('onReady should only fires once after loaded (issue #39993)', async () => {
    const browser = await next.browser('/page10')

    await retry(async () => {
      expect(await browser.eval(`window.remoteScriptsOnReadyCalls`)).toBe(1)
      expect(await browser.eval(`window.inlineScriptsOnReadyCalls`)).toBe(1)
    })
  })
})
