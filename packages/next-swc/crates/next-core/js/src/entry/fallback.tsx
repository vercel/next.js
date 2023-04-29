import '../internal/shims-client'

import { createRoot } from 'react-dom/client'

import { initializeHMR, ReactDevOverlay } from '../dev/client'
import { subscribeToUpdate } from '@vercel/turbopack-dev/client/hmr-client'

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

createRoot(el).render(
  <ReactDevOverlay>
    <div dangerouslySetInnerHTML={innerHtml}></div>
  </ReactDevOverlay>
)
