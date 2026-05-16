import type { ServerRuntime } from '../types'
import { SERVER_RUNTIME } from './constants'

export function isEdgeRuntime(value?: string): value is ServerRuntime {
  return (
    value === SERVER_RUNTIME.experimentalEdge || value === SERVER_RUNTIME.edge
  )
}
