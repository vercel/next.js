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
export type Subscription = {
  unsubscribe: Disposable
  closed: boolean
}
export type Observer<T> = {
  next(chunk: T): void
  error(error: Error): void
  complete(): void
}
export type Observable<T> = (observer: Observer<T>) => Disposable
export type RenderResult = Observable<string>

export function resultFromChunks(chunks: string[]): RenderResult {
  return createObservable(({ next, complete, error }) => {
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
  })
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

export function createObservable<T>(
  observerable: Observable<T>
): Observable<T> {
  return (observer) => {
    let unsubscribe: (() => void) | null = null
    const cleanup = () => {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    }
    const doEvent = (ev: () => void) => {
      if (!unsubscribe) {
        return
      }
      try {
        ev()
      } catch (err) {
        if (!!unsubscribe) {
          try {
            observer.error(err)
          } finally {
            cleanup()
          }
        }
      }
    }
    unsubscribe = observerable({
      next(chunk) {
        doEvent(() => observer.next(chunk))
      },
      complete() {
        doEvent(() => {
          cleanup()
          observer.complete()
        })
      },
      error(err) {
        doEvent(() => {
          cleanup()
          observer.error(err)
        })
      },
    })
    return cleanup
  }
}
