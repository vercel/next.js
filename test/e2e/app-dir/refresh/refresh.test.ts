import { nextTestSetup } from 'e2e-utils'
import { retry, waitForRedbox, getRedboxDescription } from 'next-test-utils'

describe('app-dir refresh', () => {
  const { next, skipped, isNextDev } = nextTestSetup({
    files: __dirname,
    // We do not have access to runtime logs when deployed
    skipDeployment: true,
  })

  if (skipped) return

  it('should refresh client cache when refresh() is called in a server action', async () => {
    const browser = await next.browser('/refresh')

    const initialServerTimestamp = await browser
      .elementById('server-timestamp')
      .text()

    expect(initialServerTimestamp).toBeTruthy()

    await new Promise((resolve) => setTimeout(resolve, 100))

    await browser.elementById('refresh-button').click()

    await retry(async () => {
      const newServerTimestamp = await browser
        .elementById('server-timestamp')
        .text()
      expect(newServerTimestamp).not.toBe(initialServerTimestamp)
      expect(Number(newServerTimestamp)).toBeGreaterThan(
        Number(initialServerTimestamp)
      )
    })
  })

  it('should throw an error when refresh() is called during page render', async () => {
    const browser = await next.browser('/refresh-invalid-render')

    if (isNextDev) {
      await waitForRedbox(browser)
      const description = await getRedboxDescription(browser)
      expect(description).toContain(
        'refresh can only be called from within a Server Action'
      )
    } else {
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'refresh can only be called from within a Server Action'
        )
      })
    }
  })

  it('should throw an error when refresh() is called in a route handler', async () => {
    const res = await next.fetch('/refresh-invalid-route')
    expect(res.status).toBe(500)

    await retry(async () => {
      expect(next.cliOutput).toContain(
        'refresh can only be called from within a Server Action'
      )
    })
  })

  it('should throw an error when refresh() is called in unstable_cache', async () => {
    const browser = await next.browser('/refresh-invalid-cache')

    if (isNextDev) {
      await waitForRedbox(browser)
      const description = await getRedboxDescription(browser)
      expect(description).toContain(
        'refresh can only be called from within a Server Action'
      )
    } else {
      await retry(async () => {
        expect(next.cliOutput).toContain(
          'refresh can only be called from within a Server Action'
        )
      })
    }
  })

  it('should let you read your write after a redirect and refresh', async () => {
    const browser = await next.browser('/redirect-and-refresh')

    const todoEntries = await browser.elementById('todo-entries').text()
    expect(todoEntries).toBe('No entries')

    const todoInput = await browser.elementById('todo-input')
    await todoInput.fill('foo')

    await browser.elementById('add-button').click()

    await retry(async () => {
      const newTodoEntries = await browser.elementById('todo-entries').text()
      expect(newTodoEntries).toContain('foo')
    })

    expect(await browser.hasElementByCssSelector('#foo-page')).toBe(true)
    expect(await browser.url()).toContain('/redirect-and-refresh/foo')
  })

  it('should not show error boundary when page is reloaded during pending router.refresh()', async () => {
    const browser = await next.browser('/refresh-during-unload')

    // Wait for the page to fully load
    await retry(async () => {
      const content = await browser.elementById('page-content').text()
      expect(content).toBe('Page loaded successfully')
    }, 10000)

    // Clear any previous localStorage flag before the test
    await browser.eval(
      'window.localStorage.removeItem("__ERROR_BOUNDARY_RENDERED__")'
    )

    // Intercept fetch - let first chunk through, then dispatch pagehide and error
    // This simulates what happens when browser aborts mid-stream during page refresh
    await browser.eval(`
      window.__fetchIntercepted = false;
      const originalFetch = window.fetch;
      window.fetch = async function(url, options) {
        const urlStr = typeof url === 'string' ? url : url.toString();
        const hasRscHeader = options?.headers?.['RSC'] === '1' ||
                            options?.headers?.['Next-Router-State-Tree'];
        if (urlStr.includes('_rsc') || hasRscHeader) {
          console.log('[TEST] RSC request intercepted');
          window.__fetchIntercepted = true;

          // Make the real fetch
          const response = await originalFetch.call(this, url, options);
          console.log('[TEST] Got response');

          const reader = response.body.getReader();
          let firstChunk = true;

          const errorStream = new ReadableStream({
            async pull(controller) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                return;
              }
              if (firstChunk) {
                console.log('[TEST] Passing first chunk through');
                firstChunk = false;
                controller.enqueue(value);
              } else {
                // Simulate page unload: dispatch pagehide BEFORE the error
                // This is what happens in real browser when user refreshes the page
                console.log('[TEST] Dispatching pagehide event');
                window.dispatchEvent(new Event('pagehide'));
                // Then error (simulates browser aborting the connection)
                console.log('[TEST] Erroring on second chunk');
                controller.error(new DOMException('The operation was aborted.', 'AbortError'));
              }
            }
          });

          return new Response(errorStream, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        }
        return originalFetch.apply(this, arguments);
      };
    `)

    // Click router.refresh() to start a pending refresh
    await browser.elementById('refresh-button').click()

    // Wait for the error to propagate through React
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Check if error boundary rendered - check both localStorage and DOM
    const errorBoundaryFlag = await browser.eval(
      'window.localStorage.getItem("__ERROR_BOUNDARY_RENDERED__")'
    )
    const hasErrorBoundaryElement = await browser.eval(
      'document.getElementById("error-boundary") !== null'
    )
    console.log('[TEST] Error boundary flag:', errorBoundaryFlag)
    console.log(
      '[TEST] Error boundary element exists:',
      hasErrorBoundaryElement
    )

    // Without the fix, this SHOULD fail (error boundary rendered)
    // With the fix, this should pass (error boundary NOT rendered)
    expect(errorBoundaryFlag).toBeNull()
    expect(hasErrorBoundaryElement).toBe(false)
  })
})
