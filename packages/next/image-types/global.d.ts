// this file is conditionally added/removed to next-env.d.ts
// if the static image import handling is enabled

import type { StaticImageData } from '../dist/client/image'

declare module '*.png' {
  const content: StaticImageData

  export default content
}

declare module '*.svg' {
  /**
   * Use `any` to avoid conflicts with
   * `@svgr/webpack` plugin or
   * `babel-plugin-inline-react-svg` plugin.
   */
  const content: any

  export default content
}

declare module '*.jpg' {
  const content: StaticImageData

  export default content
}

declare module '*.jpeg' {
  const content: StaticImageData

  export default content
}

declare module '*.gif' {
  const content: StaticImageData

  export default content
}

declare module '*.webp' {
  const content: StaticImageData

  export default content
}

declare module '*.avif' {
  const content: StaticImageData

  export default content
}

declare module '*.ico' {
  const content: StaticImageData

  export default content
}

declare module '*.bmp' {
  const content: StaticImageData

  export default content
}
