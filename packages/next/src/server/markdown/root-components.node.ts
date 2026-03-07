import type { MarkdownComponents } from './runtime'

export async function loadMarkdownRootComponents(
  dir: string,
  tsconfigPath?: string
): Promise<MarkdownComponents> {
  return await (
    require('../../lib/require-markdown-components') as typeof import('../../lib/require-markdown-components')
  ).requireMarkdownComponents({
    dir,
    tsconfigPath,
    dev: Boolean(process.env.__NEXT_DEV_SERVER),
  })
}
