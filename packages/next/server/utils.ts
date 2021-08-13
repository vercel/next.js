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

export type Disposable = () => void
// TODO: Consider just using an actual Observable here
export type RenderResult = (observer: {
  next(chunk: string): void
  error(error: Error): void
  complete(): void
}) => Disposable

export function resultFromChunks(chunks: string[]): RenderResult {
  return ({ next, complete, error }) => {
    let canceled = false
    process.nextTick(() => {
      try {
        for (const chunk of chunks) {
          if (canceled) {
            return
          }
          next(chunk)
        }
      } catch (err) {
        if (!canceled) {
          canceled = true
          error(err)
        }
      }

      if (!canceled) {
        canceled = true
        complete()
      }
    })

    return () => {
      canceled = true
    }
  }
}

export function resultToChunks(result: RenderResult): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    result({
      next: (chunk) => {
        chunks.push(chunk)
      },
      error: (error) => reject(error),
      complete: () => resolve(chunks),
    })
  })
}
