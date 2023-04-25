/**
 * Polyfills `FormData` in the Node.js runtime.
 */

if (!(global as any).FormData) {
  const { FormData } =
    require('next/dist/compiled/@edge-runtime/primitives/fetch') as typeof import('next/dist/compiled/@edge-runtime/primitives/fetch')
  ;(global as any).FormData = FormData
}
