/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { AppRouterAnnouncer } from '../../packages/next/src/client/components/app-router-announcer'
import type { FlightRouterState } from '../../packages/next/src/shared/lib/app-router-types'
import { PAGE_SEGMENT_KEY } from '../../packages/next/src/shared/lib/segment'

// Helper function to create a simple FlightRouterState tree
function createTree(path: string): FlightRouterState {
  const segments = path.split('/').filter(Boolean)

  if (segments.length === 0) {
    // Root path
    return [PAGE_SEGMENT_KEY, {}, null]
  }

  // Build tree from leaf to root
  let tree: FlightRouterState = [PAGE_SEGMENT_KEY, {}, null]
  for (let i = segments.length - 1; i >= 0; i--) {
    tree = [segments[i], { children: tree }, null]
  }
  return tree
}

// Helper function to get announcer element from shadow DOM
function getAnnouncer(): HTMLElement | null {
  const container =
    document.getElementsByName('next-route-announcer')[0] ||
    document.getElementsByTagName('next-route-announcer')[0]
  return (
    container?.shadowRoot?.getElementById('__next-route-announcer__') || null
  )
}

describe('AppRouterAnnouncer', () => {
  let originalTitle: string
  let originalBody: HTMLBodyElement

  beforeEach(() => {
    // Save original values
    originalTitle = document.title
    originalBody = document.body.cloneNode(true) as HTMLBodyElement

    // Clean up any existing announcer elements
    const existingAnnouncer =
      document.getElementsByName('next-route-announcer')[0] ||
      document.getElementsByTagName('next-route-announcer')[0]
    if (existingAnnouncer) {
      existingAnnouncer.remove()
    }

    // Clear document
    document.title = ''
    document.body.innerHTML = ''
  })

  afterEach(() => {
    // Restore original values
    document.title = originalTitle
    document.body.innerHTML = originalBody.innerHTML
  })

  it('should not announce on first load', async () => {
    const tree = createTree('/')
    document.title = 'Home Page'
    const h1 = document.createElement('h1')
    h1.textContent = 'Home'
    document.body.appendChild(h1)

    render(<AppRouterAnnouncer tree={tree} />)

    // Wait for effects to run
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    expect(announcer?.textContent).toBe('')
  })

  it('should announce when title changes', async () => {
    const tree1 = createTree('/')
    const tree2 = createTree('/about')

    // First render - should not announce
    const { rerender } = render(<AppRouterAnnouncer tree={tree1} />)
    document.title = 'Home Page'

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Second render - title changes
    document.title = 'About Page'
    rerender(<AppRouterAnnouncer tree={tree2} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    expect(announcer?.textContent).toBe('About Page')
  })

  it('should announce H1 when title does not change but H1 changes', async () => {
    const tree1 = createTree('/test')
    const tree2 = createTree('/test/subpath')

    // First render
    document.title = 'Test Page'
    const h1_1 = document.createElement('h1')
    h1_1.textContent = 'Test Page'
    document.body.appendChild(h1_1)

    const { rerender } = render(<AppRouterAnnouncer tree={tree1} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Second render - title stays same, but H1 changes
    const h1_2 = document.createElement('h1')
    h1_2.textContent = 'Test Subpath'
    // Remove old H1 and add new one
    document.body.removeChild(h1_1)
    document.body.appendChild(h1_2)

    rerender(<AppRouterAnnouncer tree={tree2} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    expect(announcer?.textContent).toBe('Test Subpath')
  })

  it('should announce path when title and H1 do not change but path changes', async () => {
    const tree1 = createTree('/test')
    const tree2 = createTree('/test/subpath')

    // First render
    document.title = 'Test Page'
    const h1 = document.createElement('h1')
    h1.textContent = 'Test Page'
    document.body.appendChild(h1)

    const { rerender } = render(<AppRouterAnnouncer tree={tree1} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Second render - title and H1 stay same, but path changes
    rerender(<AppRouterAnnouncer tree={tree2} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    // Path should be announced
    expect(announcer?.textContent).toBe('/test/subpath')
  })

  it('should prioritize title over H1 when both change', async () => {
    const tree1 = createTree('/')
    const tree2 = createTree('/about')

    // First render
    document.title = 'Home'
    const h1_1 = document.createElement('h1')
    h1_1.textContent = 'Home'
    document.body.appendChild(h1_1)

    const { rerender } = render(<AppRouterAnnouncer tree={tree1} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Second render - both title and H1 change
    document.title = 'About'
    const h1_2 = document.createElement('h1')
    h1_2.textContent = 'About Page'
    document.body.removeChild(h1_1)
    document.body.appendChild(h1_2)

    rerender(<AppRouterAnnouncer tree={tree2} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    // Title should be announced, not H1
    expect(announcer?.textContent).toBe('About')
  })

  it('should prioritize H1 over path when title does not change', async () => {
    const tree1 = createTree('/test')
    const tree2 = createTree('/test/subpath')

    // First render
    document.title = 'Test Page'
    const h1_1 = document.createElement('h1')
    h1_1.textContent = 'Test'
    document.body.appendChild(h1_1)

    const { rerender } = render(<AppRouterAnnouncer tree={tree1} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Second render - title stays same, H1 changes, path changes
    const h1_2 = document.createElement('h1')
    h1_2.textContent = 'Subpath'
    document.body.removeChild(h1_1)
    document.body.appendChild(h1_2)

    rerender(<AppRouterAnnouncer tree={tree2} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    // H1 should be announced, not path
    expect(announcer?.textContent).toBe('Subpath')
  })

  it('should handle empty title and use H1 fallback', async () => {
    const tree1 = createTree('/')
    const tree2 = createTree('/about')

    // First render - no title
    document.title = ''
    const h1_1 = document.createElement('h1')
    h1_1.textContent = 'Home'
    document.body.appendChild(h1_1)

    const { rerender } = render(<AppRouterAnnouncer tree={tree1} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Second render - title still empty, H1 changes
    const h1_2 = document.createElement('h1')
    h1_2.textContent = 'About'
    document.body.removeChild(h1_1)
    document.body.appendChild(h1_2)

    rerender(<AppRouterAnnouncer tree={tree2} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    // H1 should be announced
    expect(announcer?.textContent).toBe('About')
  })

  it('should handle empty title and H1, use path fallback', async () => {
    const tree1 = createTree('/')
    const tree2 = createTree('/about')

    // First render - no title, no H1
    document.title = ''

    const { rerender } = render(<AppRouterAnnouncer tree={tree1} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Second render - still no title, no H1, but path changes
    rerender(<AppRouterAnnouncer tree={tree2} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    // Path should be announced
    expect(announcer?.textContent).toBe('/about')
  })

  it('should not announce when nothing changes', async () => {
    const tree = createTree('/test')

    document.title = 'Test Page'
    const h1 = document.createElement('h1')
    h1.textContent = 'Test'
    document.body.appendChild(h1)

    const { rerender } = render(<AppRouterAnnouncer tree={tree} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    // Re-render with same tree and same content
    rerender(<AppRouterAnnouncer tree={tree} />)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const announcer = getAnnouncer()
    // Should remain empty since nothing changed
    expect(announcer?.textContent).toBe('')
  })
})
