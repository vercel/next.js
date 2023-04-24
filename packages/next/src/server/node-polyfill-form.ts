/**
 * Polyfills `FormData` in the Node.js runtime.
 */

if (!(global as any).FormData) {
  const undici = require('next/dist/compiled/undici')
  ;(global as any).FormData = undici.FormData
}
