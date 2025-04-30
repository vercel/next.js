import { renderToReadableStream } from 'react-dom/server.edge'
import { renderToString } from '../render-to-string'

/**
 * For chromium based browsers (Chrome, Edge, etc.) and Safari,
 * icons need to stay under <head> to be picked up by the browser.
 *
 */
const REINSERT_ICON_SCRIPT = `\
document.querySelectorAll('body link[rel="icon"], body link[rel="apple-touch-icon"]').forEach(el => document.head.appendChild(el))`

export function createServerInsertedMetadata(nonce: string | undefined) {
  let inserted = false

  return {
    async getServerInsertedMetadata(): Promise<string> {
      if (inserted) {
        return ''
      }

      inserted = true
      const html = await renderToString({
        renderToReadableStream,
        element: <script nonce={nonce}>{REINSERT_ICON_SCRIPT}</script>,
      })

      return html
    },
  }
}
