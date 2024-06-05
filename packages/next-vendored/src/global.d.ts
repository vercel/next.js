declare module '@vercel/ncc' {
  export type NccOptions = {
    filename?: string
    target?: string
    minify?: boolean
    assetBuilds?: boolean
    cache?: boolean
    externals?: Record<string, string>
    mainFields?: string[]
  }

  export default function ncc(
    inputPath: string,
    options: NccOptions
  ): Promise<{
    code: string
    assets: Record<string, { source: string }>
  }>
}
