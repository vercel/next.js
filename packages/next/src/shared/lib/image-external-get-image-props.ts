import type { ImageConfigComplete } from './image-config'
import type { ImageProps } from './get-img-props'

import { getImgProps } from './get-img-props'

// This is replaced by a bundler alias. Use a namespace import so a custom
// loader without a default export can reach the framework's runtime validation
// instead of failing static ESM export validation first.
import * as defaultLoaderModule from 'next/dist/shared/lib/image-loader'

const defaultLoader = Reflect.get(defaultLoaderModule, 'default')

/**
 * For more advanced use cases, you can call `getImageProps()`
 * to get the props that would be passed to the underlying `<img>` element,
 * and instead pass to them to another component, style, canvas, etc.
 *
 * Read more: [Next.js docs: `getImageProps`](https://nextjs.org/docs/app/api-reference/components/image#getimageprops)
 */
export function getImageProps(imgProps: ImageProps) {
  const { props } = getImgProps(imgProps, {
    defaultLoader,
    // This is replaced by webpack define plugin
    imgConf: process.env.__NEXT_IMAGE_OPTS as any as ImageConfigComplete,
  })
  // Normally we don't care about undefined props because we pass to JSX,
  // but this exported function could be used by the end user for anything
  // so we delete undefined props to clean it up a little.
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) {
      delete props[key as keyof typeof props]
    }
  }
  return { props }
}
