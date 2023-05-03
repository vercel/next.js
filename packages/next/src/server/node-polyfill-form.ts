/**
 * Polyfills `FormData` and `Blob` in the Node.js runtime.
 */

if (!(global as any).FormData) {
  const { FormData } =
    require('next/dist/compiled/@edge-runtime/primitives/fetch') as typeof import('next/dist/compiled/@edge-runtime/primitives/fetch')
  ;(global as any).FormData = FormData
}

if (!(global as any).Blob) {
  const { Blob } =
    require('next/dist/compiled/@edge-runtime/primitives/blob') as typeof import('next/dist/compiled/@edge-runtime/primitives/blob')
  ;(global as any).Blob = Blob
}
