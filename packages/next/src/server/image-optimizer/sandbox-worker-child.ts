import { executeImageOptimizerOperation } from './operation'
import {
  serializeImageOptimizerError,
  type ImageOptimizerWorkerRequest,
  type ImageOptimizerWorkerResponse,
} from './sandbox-worker-protocol'

function send(message: ImageOptimizerWorkerResponse): void {
  if (!process.send) {
    process.exitCode = 1
    return
  }
  process.send(message)
}

process.on('message', (message: ImageOptimizerWorkerRequest) => {
  if (
    !message ||
    message.type !== 'transform' ||
    !Number.isSafeInteger(message.id) ||
    !message.operation
  ) {
    return
  }

  // Do not await here. Sharp supports concurrent operations, and responses are
  // correlated by id so they may complete out of order.
  void executeImageOptimizerOperation(message.operation).then(
    (value) => send({ type: 'result', id: message.id, value }),
    (error) =>
      send({
        type: 'error',
        id: message.id,
        error: serializeImageOptimizerError(error),
      })
  )
})

// The IPC channel is owned by the parent. Losing it means there is no caller
// that can consume more output, so exit without requiring a shutdown message.
process.on('disconnect', () => process.exit(0))
