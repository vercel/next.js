import type {
  ImageOptimizerOperation,
  ImageOptimizerOperationResult,
} from './operation'

export interface ImageOptimizerWorkerRequest {
  type: 'transform'
  id: number
  operation: ImageOptimizerOperation
}

export interface SerializedImageOptimizerError {
  name: string
  message: string
  stack?: string
  statusCode?: number
  code?: string
}

export type ImageOptimizerWorkerResponse =
  | {
      type: 'result'
      id: number
      value: ImageOptimizerOperationResult
    }
  | {
      type: 'error'
      id: number
      error: SerializedImageOptimizerError
    }

export function serializeImageOptimizerError(
  error: unknown
): SerializedImageOptimizerError {
  if (!(error instanceof Error)) {
    return { name: 'Error', message: String(error) }
  }

  const withMetadata = error as Error & {
    statusCode?: unknown
    code?: unknown
  }
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    statusCode:
      typeof withMetadata.statusCode === 'number'
        ? withMetadata.statusCode
        : undefined,
    code: typeof withMetadata.code === 'string' ? withMetadata.code : undefined,
  }
}
