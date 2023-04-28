import type { OutgoingHttpHeaders } from 'http'

export type ExportersResult =
  | {
      type: 'not-found'
    }
  | {
      type: 'built'
      metadata?: {
        status: number
        headers: OutgoingHttpHeaders
      }
      revalidate: number | false | undefined
    }
  | {
      type: 'error'
      error: any
    }
