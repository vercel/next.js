/**
 * @jest-environment jsdom
 */
import { render } from '@testing-library/react'
import { AppRouterAnnouncer } from '../../packages/next/src/client/components/app-router-announcer'
import type { FlightRouterState } from '../../packages/next/src/shared/lib/app-router-types'

const tree = (): FlightRouterState => ['', {}]

function translate(announcer: Element, mode: 'replace' | 'reparent') {
  const text = document
    .createTreeWalker(announcer, NodeFilter.SHOW_TEXT)
    .nextNode()!
  const outer = document.createElement('font')
  const inner = document.createElement('font')
  outer.appendChild(inner)
  text.parentNode!.replaceChild(outer, text)
  if (mode === 'reparent') inner.appendChild(text)
  else inner.textContent = 'Translated announcement'
}

describe('AppRouterAnnouncer after browser translation', () => {
  const originalTitle = document.title

  afterEach(() => {
    document.title = originalTitle
  })

  it.each(['replace', 'reparent'] as const)(
    'updates and clears announcements after translation uses %s',
    (mode) => {
      document.title = 'Home'
      const { rerender, unmount } = render(<AppRouterAnnouncer tree={tree()} />)
      const announcer = document
        .querySelector('next-route-announcer')!
        .shadowRoot!.querySelector<HTMLElement>('#__next-route-announcer__')!

      expect(announcer.textContent).toBe('')
      expect(announcer.ariaLive).toBe('assertive')
      expect(announcer.role).toBe('alert')

      document.title = 'Tickets'
      rerender(<AppRouterAnnouncer tree={tree()} />)
      expect(announcer.textContent).toBe('Tickets')

      translate(announcer, mode)
      document.title = 'Payment'
      rerender(<AppRouterAnnouncer tree={tree()} />)
      expect(announcer.textContent).toBe('Payment')

      translate(announcer, mode)
      document.title = ''
      rerender(<AppRouterAnnouncer tree={tree()} />)
      expect(announcer.textContent).toBe('')

      document.title = 'Confirmation'
      rerender(<AppRouterAnnouncer tree={tree()} />)
      expect(announcer.textContent).toBe('Confirmation')
      translate(announcer, mode)
      expect(() => unmount()).not.toThrow()
      expect(document.querySelector('next-route-announcer')).toBeNull()
    }
  )
})
