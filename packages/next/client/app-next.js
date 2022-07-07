import { hydrate, version } from './app-index'

// Include app-router and layout-router in the main chunk
import 'next/dist/client/components/app-router.client.js'
import 'next/dist/client/components/layout-router.client.js'

window.next = {
  version,
  root: true,
}

// Override chunk URL mapping in the webpack runtime
// https://github.com/webpack/webpack/blob/2738eebc7880835d88c727d364ad37f3ec557593/lib/RuntimeGlobals.js#L204

// eslint-disable-next-line no-undef
const getChunkScriptFilename = __webpack_require__.u
const chunkFilenameMap = {}

// eslint-disable-next-line no-undef
__webpack_require__.u = (chunkId) => {
  return chunkFilenameMap[chunkId] || getChunkScriptFilename(chunkId)
}

// Ignore the module ID transform in client.
// eslint-disable-next-line no-undef
self.__next_require__ = __webpack_require__

// eslint-disable-next-line no-undef
self.__next_chunk_load__ = (chunk) => {
  if (chunk.endsWith('.css')) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/_next/' + chunk
    document.head.appendChild(link)
    return Promise.resolve()
  }

  const [chunkId, chunkFileName] = chunk.split(':')
  chunkFilenameMap[chunkId] = `static/chunks/${chunkFileName}.js`

  // @ts-ignore
  // eslint-disable-next-line no-undef
  return __webpack_chunk_load__(chunkId)
}

hydrate()
