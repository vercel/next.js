import Observable from 'next/dist/compiled/zen-observable'
import { BLOCKED_PAGES } from '../shared/lib/constants'

export function isBlockedPage(pathname: string): boolean {
  return BLOCKED_PAGES.includes(pathname)
}

export function cleanAmpPath(pathname: string): string {
  if (pathname.match(/\?amp=(y|yes|true|1)/)) {
    pathname = pathname.replace(/\?amp=(y|yes|true|1)&?/, '?')
  }
  if (pathname.match(/&amp=(y|yes|true|1)/)) {
    pathname = pathname.replace(/&amp=(y|yes|true|1)/, '')
  }
  pathname = pathname.replace(/\?$/, '')
  return pathname
}

export type RenderResult = Observable<string>

export function mergeResults(results: Array<RenderResult>): RenderResult {
  // @ts-ignore
  return Observable.prototype.concat.call(...results)
}

export async function resultsToString(
  results: Array<RenderResult>
): Promise<string> {
  const chunks: string[] = []
  await mergeResults(results).forEach((chunk: string) => {
    chunks.push(chunk)
  })
  return chunks.join('')
}
