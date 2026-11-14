/**
 * @jest-environment jsdom
 */
import { act, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import appDynamic from '../../packages/next/src/shared/lib/app-dynamic'

describe('next/dynamic', () => {
  it('test dynamic with jest', () => {
    const App = dynamic(() => import('./fixtures/stub-components/hello'))

    act(() => {
      const { unmount } = render(<App />)
      unmount()
    })
  })

  it('uses a parent Suspense fallback when no loading component is provided', () => {
    const Dynamic = appDynamic(() => new Promise(() => {}))

    const { queryByText, getByText } = render(
      <Suspense fallback={<p>Parent fallback</p>}>
        <main>
          <Dynamic />
          <footer>Page footer</footer>
        </main>
      </Suspense>
    )

    expect(getByText('Parent fallback')).toBeInTheDocument()
    expect(queryByText('Page footer')).not.toBeInTheDocument()
  })

  it('uses a custom loading component when one is provided', () => {
    const Dynamic = appDynamic(() => new Promise(() => {}), {
      loading: () => <p>Custom loading</p>,
    })

    const { queryByText, getByText } = render(
      <Suspense fallback={<p>Parent fallback</p>}>
        <main>
          <Dynamic />
          <footer>Page footer</footer>
        </main>
      </Suspense>
    )

    expect(getByText('Custom loading')).toBeInTheDocument()
    expect(getByText('Page footer')).toBeInTheDocument()
    expect(queryByText('Parent fallback')).not.toBeInTheDocument()
  })

  it('uses a parent Suspense fallback for ssr:false without custom loading', () => {
    const Dynamic = appDynamic(() => new Promise(() => {}), { ssr: false })

    const { queryByText, getByText } = render(
      <Suspense fallback={<p>Parent fallback</p>}>
        <main>
          <Dynamic />
          <footer>Page footer</footer>
        </main>
      </Suspense>
    )

    expect(getByText('Parent fallback')).toBeInTheDocument()
    expect(queryByText('Page footer')).not.toBeInTheDocument()
  })

  it('allows pages dynamic to render without a loading component', () => {
    const App = dynamic(() => new Promise(() => {}), {
      loading: undefined,
    })

    const { container } = render(<App />)

    expect(container).toBeEmptyDOMElement()
  })
})
