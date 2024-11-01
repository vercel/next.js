/** https://nodejs.org/api/module.html#resolvespecifier-context-nextresolve */
export type ResolveContext = {
  conditions: string[]
  importAttributes: Record<string, string>
  parentURL: string | undefined
}

/** https://nodejs.org/api/module.html#loadurl-context-nextload */
export type LoadContext = {
  conditions: string[]
  format: string | null | undefined
  importAttributes: Record<string, string>
}
