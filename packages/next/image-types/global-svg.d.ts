// this file is conditionally added/removed to next-env.d.ts
// if the static image import handling is enabled and there is no custom SVG loader

declare module '*.svg' {
  const content: StaticImageData

  export default content
}
