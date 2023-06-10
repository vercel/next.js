import '../internal/shims-client'

import React from 'react'
import { createRoot } from 'react-dom/client'

import { initializeHMR, ReactDevOverlay } from '../dev/client'
import { subscribeToUpdate } from '@vercel/turbopack-ecmascript-runtime/dev/client/hmr-client'

const pageChunkPath = location.pathname.slice(1)

subscribeToUpdate(
  {
    path: pageChunkPath,
    headers: {
      accept: 'text/html',
    },
  },
  (update) => {
    if (update.type === 'restart' || update.type === 'notFound') {
      location.reload()
    }
  }
)

initializeHMR({
  assetPrefix: '',
})

const el = document.getElementById('__next')!

const innerHtml = {
  __html: el.innerHTML,
}

function Root({ children }: React.PropsWithChildren<{}>): React.ReactElement {
  if (process.env.__NEXT_TEST_MODE) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    React.useEffect(() => {
      window.__NEXT_HYDRATED = true

      if (window.__NEXT_HYDRATED_CB) {
        window.__NEXT_HYDRATED_CB()
      }
    }, [])
  }

  return children as React.ReactElement
}

createRoot(el).render(
  <Root>
    <ReactDevOverlay>
      <div dangerouslySetInnerHTML={innerHtml}></div>
    </ReactDevOverlay>
  </Root>
)
