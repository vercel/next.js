import React from 'react'
import ReactDOM from 'react-dom'

export interface Bootstrapper {
  render(fn: RenderGenerator): void
}

export type RenderOpts = {
  element: React.ReactElement
  callback: () => void
}
export type RenderGenerator = (isInitialRender: boolean) => RenderOpts
type RenderToDOM = (
  isInitialRender: boolean,
  children: React.ReactElement
) => void

function bootstrap(): Bootstrapper {
  let renderToDOM: RenderToDOM | null
  const render = (fn: RenderGenerator) => {
    const container = document.getElementById('__next')
    if (container == null) {
      throw new Error('Could not find __next element')
    }
    let isInitialRender = false
    if (!renderToDOM) {
      if (process.env.__NEXT_REACT_MODE !== 'legacy') {
        const opts = { hydrate: true }
        performance.mark('bootstrap_createRoot_start')
        const reactRoot =
          process.env.__NEXT_REACT_MODE === 'concurrent'
            ? ReactDOM.unstable_createRoot(container, opts)
            : ReactDOM.unstable_createBlockingRoot(container, opts)
        performance.mark('bootstrap_createRoot_end')
        renderToDOM = (_, children) => {
          performance.mark('bootstrap_render_start')
          reactRoot.render(children)
          performance.mark('bootstrap_render_end')
        }
        isInitialRender = true
      } else {
        isInitialRender = typeof ReactDOM.hydrate === 'function'
        renderToDOM = (isInitialRender, children) => {
          if (isInitialRender) {
            ReactDOM.hydrate(children, container)
          } else {
            ReactDOM.render(children, container)
          }
        }
      }
    }
    const content = <NextRoot useContent={() => fn(isInitialRender)} />
    renderToDOM(
      isInitialRender,
      process.env.__NEXT_REACT_MODE !== 'legacy' ? (
        <React.Suspense fallback={null}>{content}</React.Suspense>
      ) : (
        content
      )
    )
  }
  let renderImpl = render

  if (process.env.__NEXT_REACT_MODE !== 'legacy') {
    let generatorFn: RenderGenerator | null = null
    const promise = new Promise(resolve => {
      renderImpl = newGeneratorFn => {
        if (newGeneratorFn != null) {
          generatorFn = newGeneratorFn
          renderImpl = render
          resolve()
        }
      }
    })
    render(isInitalRender => {
      if (generatorFn == null) {
        throw promise
      }
      return generatorFn(isInitalRender)
    })
  }
  return {
    render: fn => renderImpl(fn),
  }
}

function NextRoot({ useContent }: { useContent: () => RenderOpts }) {
  const { element, callback } = useContent()
  React.useLayoutEffect(() => callback(), [callback])
  return element
}

export default bootstrap()
