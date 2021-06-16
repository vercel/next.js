/// <reference types="node" />

// Extend the NodeJS namespace with Next.js-defined properties
declare namespace NodeJS {
  interface Process {
    readonly browser: boolean
  }

  interface ProcessEnv {
    readonly NODE_ENV: 'development' | 'production' | 'test'
  }
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.module.sass' {
  const classes: { readonly [key: string]: string }
  export default classes
}

declare module '*.module.scss' {
  const classes: { readonly [key: string]: string }
  export default classes
}

interface StaticImageData {
  src: string
  height: number
  width: number
  placeholder?: string
}

declare module '*.png' {
  const content: StaticImageData

  export default content
}

declare module '*.svg' {
  const content: StaticImageData

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

declare module '*.ico' {
  const content: StaticImageData

  export default content
}

declare module '*.bmp' {
  const content: StaticImageData

  export default content
}
