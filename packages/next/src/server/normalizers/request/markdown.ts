import { MARKDOWN_SUFFIX, PLAINTEXT_SUFFIX } from '../../../lib/constants'
import type { PathnameNormalizer } from './pathname-normalizer'
import type { NegotiatedType } from '../../lib/markdown-for-agents/accept'

export type MarkdownSuffixMatch = {
  pathname: string
  representation: NegotiatedType
}

/**
 * Optional URL mode: `/about.md` and `/about.txt` map to `/about`.
 * Content negotiation on `/about` remains the default.
 */
export class MarkdownPathnameNormalizer implements PathnameNormalizer {
  public match(pathname: string): boolean {
    return this.extract(pathname) !== null
  }

  public extract(pathname: string): MarkdownSuffixMatch | null {
    if (pathname.endsWith('.mdx')) return null
    if (pathname === '/index.md' || pathname === '/.md') {
      return { pathname: '/', representation: 'markdown' }
    }
    if (pathname === '/index.txt' || pathname === '/.txt') {
      return { pathname: '/', representation: 'plain' }
    }
    if (pathname.endsWith(MARKDOWN_SUFFIX)) {
      return {
        pathname: pathname.slice(0, -MARKDOWN_SUFFIX.length) || '/',
        representation: 'markdown',
      }
    }
    if (pathname.endsWith(PLAINTEXT_SUFFIX)) {
      return {
        pathname: pathname.slice(0, -PLAINTEXT_SUFFIX.length) || '/',
        representation: 'plain',
      }
    }
    return null
  }

  public normalize(pathname: string, _matched?: boolean): string {
    return this.extract(pathname)?.pathname ?? pathname
  }
}
