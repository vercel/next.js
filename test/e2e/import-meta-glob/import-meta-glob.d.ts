// Augment ImportMeta with glob for Vite-compatible import.meta.glob support
interface ImportMeta {
  glob(
    pattern: string | string[],
    options?: {
      eager?: boolean
      import?: string
      query?: string
      base?: string
    }
  ): Record<string, any>
}
