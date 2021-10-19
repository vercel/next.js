// this file is conditionally added/removed to next-env.d.ts
// if the static image import handling is enabled

interface StaticImageData {
  src: string
  height: number
  width: number
  blurDataURL?: string
}

declare module '*.png' {
  const content: StaticImageData

  export default content
}

declare module '*.svg' {
  /**
   * By default, use `any` to avoid conflicts with
   * `@svgr/webpack` plugin or
   * `babel-plugin-inline-react-svg` plugin.
   *
   * If you are not using these plugins, you can override
   * the default behavior using a code snippet inside your project
   *
   * // yourProject/src/global.d.ts
   * declare module '*.svg' {
   *   export interface OverrideDefaultTypeSettings {
   *     useAny: false;
   *   }
   * }
   */
  interface DefaultTypeSettings {
    useAny: true;
  }

  export interface OverrideDefaultTypeSettings {}

  type TypeSettings = Omit<DefaultTypeSettings, keyof OverrideDefaultTypeSettings> & OverrideDefaultTypeSettings;
  type ContentType = TypeSettings['useAny'] extends true ? any : StaticImageData;

  const content: ContentType;

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
