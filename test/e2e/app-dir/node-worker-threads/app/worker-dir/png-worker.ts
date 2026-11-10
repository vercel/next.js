import { parentPort } from 'node:worker_threads'
import pngUrl from './test-image.png'

if (parentPort) {
  parentPort.on('message', (msg) => {
    if (msg === 'get-png-info') {
      // Return the PNG info - the URL will be fetched by the client
      // to verify it's correctly formed and accessible
      parentPort!.postMessage({
        url: pngUrl.src,
        width: pngUrl.width,
        height: pngUrl.height,
      })
    }
  })
}
