import type { MarkdownComponents } from '@next/markdown'

import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { loadUserModule } from './user-module-loader'

type MarkdownComponentsModule = {
  default?: {
    useMarkdownComponents?: () => MarkdownComponents
  }
  useMarkdownComponents?: () => MarkdownComponents
}

const MARKDOWN_COMPONENTS_CANDIDATES = [
  join('src', 'markdown-components.tsx'),
  join('src', 'markdown-components.ts'),
  join('src', 'markdown-components.jsx'),
  join('src', 'markdown-components.js'),
  'markdown-components.tsx',
  'markdown-components.ts',
  'markdown-components.jsx',
  'markdown-components.js',
]

type RequireMarkdownComponentsOptions = {
  dir: string
  tsconfigPath?: string
  dev?: boolean
}

export async function requireMarkdownComponents({
  dir,
  tsconfigPath,
  dev,
}: RequireMarkdownComponentsOptions): Promise<MarkdownComponents> {
  const filePath = getMarkdownComponentsPath(dir)
  if (!filePath) {
    return {}
  }

  const mod = (await loadUserModule(filePath, {
    dir,
    tsconfigPath,
    dev,
  })) as MarkdownComponentsModule
  const loadMarkdownComponents =
    mod.useMarkdownComponents ?? mod.default?.useMarkdownComponents

  if (typeof loadMarkdownComponents !== 'function') {
    return {}
  }

  return loadMarkdownComponents()
}

function getMarkdownComponentsPath(dir: string): string | null {
  for (const candidate of MARKDOWN_COMPONENTS_CANDIDATES) {
    const filePath = join(dir, candidate)
    if (existsSync(filePath)) {
      return filePath
    }
  }

  return null
}
