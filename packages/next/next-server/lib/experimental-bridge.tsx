import React, {
  cloneElement,
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactDOM from 'react-dom'

export type BridgeProps = {
  children: React.ReactHTMLElement<any>
}

export type ReactMode = 'concurrent' | 'blocking' | 'legacy'

// INTERNAL!!!
export const BridgeContext = createContext<ReactMode | null>(null)

interface RootConstructor {
  new (element: HTMLElement): RootInstance
}

interface RootInstance {
  render(node: React.ReactElement): void
  unmount(): void
}

export function createBridge({
  context,
  mode,
}: {
  // TODO: Consider allowing mapping to a string too, for the old context API
  context: React.Context<any>[]
  mode: ReactMode
}) {
  const useAllContext = () => {
    const contexts: any[] = []
    // eslint-disable-next-line react-hooks/rules-of-hooks
    context.forEach((ctx) => contexts.push(useContext(ctx)))
    return contexts
  }
  const useContent = (children: React.ReactNode) => {
    const currentMode = useContext(BridgeContext)
    if (!currentMode) {
      throw new Error(
        "Could not determine mode. Make sure you're only rendering this component inside a page."
      )
    }

    const contexts = useAllContext()
    const content = useMemo(
      () =>
        context.reduce(
          (innerChildren, Context, i) => (
            <Context.Provider value={contexts[i]}>
              {innerChildren}
            </Context.Provider>
          ),
          <>{children}</>
        ),
      [children, contexts]
    )
    return content
  }
  const useHostId = (element: React.ReactHTMLElement<any>): string => {
    const id = element.props.id
    if (typeof element.type !== 'string' || typeof id !== 'string') {
      throw new Error(
        'Bridge requires a host element child (e.g. `div`) with a unique `id` prop'
      )
    }
    return id
  }
  const Root: RootConstructor = {
    concurrent: ConcurrentRoot,
    blocking: BlockingRoot,
    legacy: LegacyRoot,
  }[mode]

  function ServerBridge({ children }: BridgeProps) {
    useHostId(children)
    const content = useContent(children.props.children)

    // We `renderToStaticMarkup` on the server to match the client semantics.
    // TODO: Ensure `renderToStaticMarkup` is tree-shaken from client builds.
    return cloneElement(
      children,
      {
        dangerouslySetInnerHTML: { __html: renderToStaticMarkup(content) },
      },
      null
    )
  }

  function ClientBridge({ children }: BridgeProps) {
    const content = useContent(children.props.children)
    const containerRef = useRef<HTMLElement>(null)
    const rootRef: React.MutableRefObject<RootInstance | null> = useRef(null)

    useLayoutEffect(() => {
      if (!rootRef.current) {
        rootRef.current = new Root(containerRef.current!)
      }
      const root = rootRef.current
      return () => {
        root.unmount()
      }
    }, [])

    useLayoutEffect(() => {
      const root = rootRef.current
      if (root) {
        root.render(content)
      }
    }, [content])

    const id = useHostId(children)
    const bridgedContent = useMemo(
      () =>
        cloneElement(
          children,
          {
            ref: containerRef,
            dangerouslySetInnerHTML: {
              __html: document.getElementById(id)!.innerHTML,
            },
          },
          null
        ),
      [containerRef, children, id]
    )

    return bridgedContent
  }

  return typeof window === 'undefined' ? ServerBridge : ClientBridge
}

class ConcurrentRoot implements RootInstance {
  _root: any

  constructor(element: HTMLElement) {
    this._root = (ReactDOM as any).unstable_createRoot(element, {
      hydrate: true,
    })
  }

  render(node: React.ReactElement) {
    this._root.render(node)
  }

  unmount() {
    this._root.unmount()
  }
}

class BlockingRoot implements RootInstance {
  _root: any

  constructor(element: HTMLElement) {
    this._root = (ReactDOM as any).unstable_createBlockingRoot(element, {
      hydrate: true,
    })
  }

  render(node: React.ReactElement) {
    this._root.render(node)
  }

  unmount() {
    this._root.unmount()
  }
}

class LegacyRoot implements RootInstance {
  _element: HTMLElement
  _hydrate: boolean

  constructor(element: HTMLElement) {
    this._element = element
    this._hydrate = true
  }

  render(node: React.ReactElement) {
    if (this._hydrate) {
      this._hydrate = false
      ReactDOM.hydrate(node, this._element)
    } else {
      ReactDOM.render(node, this._element)
    }
  }

  unmount() {
    ReactDOM.unmountComponentAtNode(this._element)
  }
}
