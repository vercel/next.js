import type { Rule } from 'eslint'

type RuleOption =
  | string
  | string[]
  | {
      pagesDir?: string | string[]
      pageExtensions?: string | string[]
    }

/**
 * Gets the rule options.
 */
export default function getRuleOptions(context: Rule.RuleContext) {
  const options: RuleOption | undefined = context.options?.[0]

  let pagesDir: string[] = []
  let pageExtensions: string[] = ['tsx', 'ts', 'jsx', 'js']

  if (typeof options === 'string') {
    pagesDir = [options]
  } else if (Array.isArray(options)) {
    pagesDir = options
  } else if (typeof options === 'object' && options !== null) {
    if (typeof options.pagesDir === 'string') {
      pagesDir = [options.pagesDir]
    } else if (Array.isArray(options.pagesDir)) {
      pagesDir = options.pagesDir
    }

    if (typeof options.pageExtensions === 'string') {
      pageExtensions = [options.pageExtensions]
    } else if (Array.isArray(options.pageExtensions)) {
      pageExtensions = options.pageExtensions
    }
  }

  return {
    pagesDir,
    pageExtensions,
  }
}
