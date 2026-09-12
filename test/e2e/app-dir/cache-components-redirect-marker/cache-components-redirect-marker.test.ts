import { nextTestSetup } from 'e2e-utils'

describe('cache-components-redirect-marker', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })
  if (skipped) {
    return
  }

  it('should ignore redirect markers inside hidden subtrees', async () => {
    const browser = await next.browser('/')

    // Inject a redirect marker inside a hidden subtree (display:none)
    // simulating cacheComponents Activity
    await browser.eval(`
      const hiddenDiv = document.createElement('div')
      hiddenDiv.style.display = 'none'
      hiddenDiv.innerHTML =
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/b">'
      document.body.appendChild(hiddenDiv)
    `)

    // Marker exists in the DOM
    expect(
      await browser.eval('!!document.getElementById("__next-page-redirect")')
    ).toBe(true)

    // But walking up from the marker should find the hidden ancestor
    const isVisible = await browser.eval(`
      (() => {
        const marker = document.getElementById('__next-page-redirect')
        let current = marker.parentElement
        while (current && current !== document.documentElement) {
          const style = window.getComputedStyle(current)
          if (style.display === 'none' || current.hasAttribute('hidden')) {
            return false
          }
          current = current.parentElement
        }
        return true
      })()
    `)
    expect(isVisible).toBe(false)
  })

  it('should detect redirect markers in visible subtrees', async () => {
    const browser = await next.browser('/')

    // Inject a redirect marker in a visible subtree (no hidden ancestor)
    await browser.eval(`
      const visibleDiv = document.createElement('div')
      visibleDiv.innerHTML =
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/landed">'
      document.body.appendChild(visibleDiv)
    `)

    // Marker exists in the DOM
    expect(
      await browser.eval('!!document.getElementById("__next-page-redirect")')
    ).toBe(true)

    // Walking up should NOT find a hidden ancestor
    const isVisible = await browser.eval(`
      (() => {
        const marker = document.getElementById('__next-page-redirect')
        let current = marker.parentElement
        while (current && current !== document.documentElement) {
          const style = window.getComputedStyle(current)
          if (style.display === 'none' || current.hasAttribute('hidden')) {
            return false
          }
          current = current.parentElement
        }
        return true
      })()
    `)
    expect(isVisible).toBe(true)
  })

  it('should find visible marker even when hidden marker also exists', async () => {
    const browser = await next.browser('/')

    // Inject one hidden marker and one visible marker
    await browser.eval(`
      const hiddenDiv = document.createElement('div')
      hiddenDiv.style.display = 'none'
      hiddenDiv.innerHTML =
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/b">'
      document.body.appendChild(hiddenDiv)

      const visibleDiv = document.createElement('div')
      visibleDiv.innerHTML =
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/landed">'
      document.body.appendChild(visibleDiv)
    `)

    const markerCount = await browser.eval(
      'document.querySelectorAll("#__next-page-redirect").length'
    )
    expect(markerCount).toBe(2)

    // The hasActiveRedirectMarker logic should find the visible one
    const hasVisibleMarker = await browser.eval(`
      (() => {
        const markers = document.querySelectorAll('#__next-page-redirect')
        for (let i = 0; i < markers.length; i++) {
          let current = markers[i].parentElement
          let foundVisible = true
          while (current && current !== document.documentElement) {
            const style = window.getComputedStyle(current)
            if (style.display === 'none' || current.hasAttribute('hidden')) {
              foundVisible = false
              break
            }
            current = current.parentElement
          }
          if (foundVisible) return true
        }
        return false
      })()
    `)
    expect(hasVisibleMarker).toBe(true)
  })

  it('should ignore all markers when all are in hidden subtrees', async () => {
    const browser = await next.browser('/')

    // Inject two hidden markers
    await browser.eval(`
      const hiddenDiv1 = document.createElement('div')
      hiddenDiv1.style.display = 'none'
      hiddenDiv1.innerHTML =
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/b">'
      document.body.appendChild(hiddenDiv1)

      const hiddenDiv2 = document.createElement('div')
      hiddenDiv2.hidden = true
      hiddenDiv2.innerHTML =
        '<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/c">'
      document.body.appendChild(hiddenDiv2)
    `)

    const markerCount = await browser.eval(
      'document.querySelectorAll("#__next-page-redirect").length'
    )
    expect(markerCount).toBe(2)

    // hasActiveRedirectMarker logic should find none visible
    const hasVisibleMarker = await browser.eval(`
      (() => {
        const markers = document.querySelectorAll('#__next-page-redirect')
        for (let i = 0; i < markers.length; i++) {
          let current = markers[i].parentElement
          let foundVisible = true
          while (current && current !== document.documentElement) {
            const style = window.getComputedStyle(current)
            if (style.display === 'none' || current.hasAttribute('hidden')) {
              foundVisible = false
              break
            }
            current = current.parentElement
          }
          if (foundVisible) return true
        }
        return false
      })()
    `)
    expect(hasVisibleMarker).toBe(false)
  })
})
