interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
  readonly BASE_URL: string
  readonly SSR: boolean
}

interface ImportMeta {
  env: ImportMetaEnv
  // Keep these overloads structurally identical to webpack/module.d.ts.
  // Consumer projects don't install webpack, while Next's build loads both.
  glob: {
    <M = unknown>(
      pattern: string | readonly string[],
      options?: {
        eager?: false
        import?: string
        query?: string | Record<string, string | number | boolean>
        exhaustive?: boolean
        base?: string
        caseSensitive?: boolean
      }
    ): Record<string, () => Promise<M>>
    <M = unknown>(
      pattern: string | readonly string[],
      options: {
        eager?: true
        import?: string
        query?: string | Record<string, string | number | boolean>
        exhaustive?: boolean
        base?: string
        caseSensitive?: boolean
      }
    ): Record<string, M>
  }
}
