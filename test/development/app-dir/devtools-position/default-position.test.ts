import { nextTestSetup } from 'e2e-utils'
import { getDevIndicatorPosition } from './utils'

describe('devtools-position-default', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should devtools indicator position initially be bottom-left by default', async () => {
    const browser = await next.browser('/')
    const style = await getDevIndicatorPosition(browser)
    expect(style).toContain('bottom: 20px')
    expect(style).toContain('left: 20px')
  })

  it('should disable browser touch gestures on the draggable indicator', async () => {
    const browser = await next.browser('/')
    await getDevIndicatorPosition(browser)

    const touchAction = await browser.eval(() => {
      const portal = Array.from(
        document.querySelectorAll('nextjs-portal')
      ).find((p) => p.shadowRoot?.querySelector('[data-nextjs-toast]'))
      const indicator = portal?.shadowRoot?.querySelector('[data-nextjs-toast]')
      const draggable = indicator?.firstElementChild

      return draggable ? getComputedStyle(draggable).touchAction : null
    })

    expect(touchAction).toBe('none')
  })

  it('should end the drag when the pointer is cancelled', async () => {
    const browser = await next.browser('/')
    await getDevIndicatorPosition(browser)

    // A user agent cancels a gesture (a browser/system gesture takes over, a
    // second finger arrives) by firing pointercancel and no pointerup, and it
    // implicitly releases pointer capture as it does so. Pointer capture is
    // owned by the UA and cannot be driven from script, so the three capture
    // methods are stubbed to exactly that post-cancel behaviour: capture is no
    // longer held, and releasing it throws NotFoundError.
    const result = await browser.eval(() => {
      const portal = Array.from(
        document.querySelectorAll('nextjs-portal')
      ).find((p) => p.shadowRoot?.querySelector('[data-nextjs-toast]'))
      const indicator = portal?.shadowRoot?.querySelector('[data-nextjs-toast]')
      const draggable = indicator?.firstElementChild as HTMLElement

      Element.prototype.setPointerCapture = function () {}
      Element.prototype.hasPointerCapture = function () {
        return false
      }
      Element.prototype.releasePointerCapture = function () {
        throw new DOMException(
          "Failed to execute 'releasePointerCapture' on 'Element': No active pointer with the given id is found.",
          'NotFoundError'
        )
      }

      const errors: string[] = []
      window.addEventListener('error', (event) => errors.push(event.message))

      const pointerEvent = (type: string, x: number, y: number) =>
        new PointerEvent(type, {
          pointerId: 1,
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: y,
          bubbles: true,
        })

      const box = draggable.getBoundingClientRect()
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2

      draggable.dispatchEvent(pointerEvent('pointerdown', x, y))
      // past the 5px threshold, so the drag actually starts
      window.dispatchEvent(pointerEvent('pointermove', x + 40, y - 40))
      window.dispatchEvent(pointerEvent('pointercancel', x + 40, y - 40))
      const afterCancel = draggable.style.translate

      // The gesture is over. Neither of these may still be treated as a drag:
      // the move must be ignored, and the up must not release a pointer that
      // no longer exists.
      window.dispatchEvent(pointerEvent('pointermove', x + 200, y - 200))
      window.dispatchEvent(pointerEvent('pointerup', x + 200, y - 200))

      return { errors, afterCancel, afterMove: draggable.style.translate }
    })

    expect(result.errors).toEqual([])
    expect(result.afterMove).toBe(result.afterCancel)
  })
})
