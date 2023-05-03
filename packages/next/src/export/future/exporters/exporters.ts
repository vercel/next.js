import type { OutgoingHttpHeaders } from 'http'

export type ExportersResult =
  | {
      type: 'not-found'
    }
  | {
      type: 'dynamic'
    }
  | {
      type: 'built'
      metadata:
        | {
            status: number | undefined
            headers: OutgoingHttpHeaders | undefined
          }
        | undefined
      revalidate: number | false | undefined
    }
  | {
      type: 'error'
      error: any
    }
