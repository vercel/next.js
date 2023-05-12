import type { OutgoingHttpHeaders } from 'http'
import type { ValidationErrors } from './helpers/validate-amp'

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
      amp:
        | {
            validations: Array<{
              page: string
              result: ValidationErrors
            }>
          }
        | undefined
      revalidate: number | false | undefined
    }
  | {
      type: 'error'
      error: any
    }
