import type { MarkdownComponents } from './runtime'

type LoadMarkdownRootComponents = (
  dir: string,
  tsconfigPath?: string
) => Promise<MarkdownComponents>

let loadMarkdownRootComponentsImpl: LoadMarkdownRootComponents

if (process.env.NEXT_RUNTIME !== 'edge') {
  loadMarkdownRootComponentsImpl = (
    require('./root-components.node') as typeof import('./root-components.node')
  ).loadMarkdownRootComponents
} else {
  loadMarkdownRootComponentsImpl = async () => ({})
}

export const loadMarkdownRootComponents = loadMarkdownRootComponentsImpl
