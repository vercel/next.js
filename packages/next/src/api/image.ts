'use turbopack: no side effects'
// This doesn't reexport from ../shared/lib/image-external.js to provide better tree shaking as ./shared/lib/image-external.js is usually a CJS file.
export { Image as default } from '../client/image-component'
export { getImageProps } from '../shared/lib/image-external-get-image-props'
export type * from '../shared/lib/image-external'
