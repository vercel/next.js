// @ts-ignore
import { useInsertionEffect } from 'react'

// Ref counting to track CSS resources
const CSSResourcesReferences = new Map<string, number>()

let globalInitialCSSFlushed: boolean

export function useStyleInsertionEffect(tree: any) {
  const CSSResources = (tree as any)._css as {
    id?: string
    chunks: string[]
  }[]
  useInsertionEffect(() => {
    if (CSSResources) {
      if (globalInitialCSSFlushed) {
        for (const { id, chunks } of CSSResources) {
          if (id) {
            // Refresh style module if the module is loaded but the
            // style tag was removed after the new route render.
            const shouldRefresh = !!__webpack_require__.c[id]
            const mod = __webpack_require__(id)
            CSSResourcesReferences.set(
              id,
              (CSSResourcesReferences.get(id) || 0) + 1
            )

            if (shouldRefresh) {
              mod?._refresh()
            }
          } else {
            for (const chunk of chunks) {
              const href = '/_next/' + chunk
              CSSResourcesReferences.set(
                href,
                (CSSResourcesReferences.get(href) || 0) + 1
              )
              if (CSSResourcesReferences.get(href) === 1) {
                const link = document.createElement('link')
                link.rel = 'stylesheet'
                link.href = href
                document.head.appendChild(link)
              }
            }
          }
        }
      } else {
        globalInitialCSSFlushed = true
        for (const { id, chunks } of CSSResources) {
          if (id) {
            CSSResourcesReferences.set(
              id,
              (CSSResourcesReferences.get(id) || 0) + 1
            )
          } else {
            for (const chunk of chunks) {
              const href = '/_next/' + chunk
              CSSResourcesReferences.set(
                href,
                (CSSResourcesReferences.get(href) || 0) + 1
              )
            }
          }
        }
      }
    }
    return () => {
      if (CSSResources) {
        for (const { id, chunks } of CSSResources) {
          if (id) {
            const mod = __webpack_require__(id)
            CSSResourcesReferences.set(id, CSSResourcesReferences.get(id)! - 1)
            if (CSSResourcesReferences.get(id) === 0) {
              mod?._remove()
            }
          } else {
            for (const chunk of chunks) {
              const href = '/_next/' + chunk
              CSSResourcesReferences.set(
                href,
                CSSResourcesReferences.get(href)! - 1
              )
              if (CSSResourcesReferences.get(href) === 0) {
                const link = document.querySelector(`link[href="${href}"]`)
                link?.remove()
              }
            }
          }
        }
      }
    }
  }, [CSSResources])
}
