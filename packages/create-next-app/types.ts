export type CreateNextAppOptions = {
  example?: string
  examplePath?: string
  importAlias?: string
  use?: PackageManager
  typescript?: boolean
  javascript?: boolean
  eslint?: boolean
  tailwind?: boolean
  app?: boolean
  srcDir?: boolean
  turbo?: boolean
  resetPreferences?: boolean
  skipInstall?: boolean
  empty?: boolean
  useNpm?: boolean
  usePnpm?: boolean
  useYarn?: boolean
  useBun?: boolean
}

export type ResolvedCreateNextAppOptions = {
  typescript: boolean
  eslint: boolean
  tailwind: boolean
  app: boolean
  srcDir: boolean
  importAlias: string
  skipInstall: boolean
  empty: boolean
  turbo: boolean
}

export type RepoInfo = {
  username: string
  name: string
  branch: string
  filePath: string
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'
