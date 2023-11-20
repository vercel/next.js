import type { IncomingMessage, ServerResponse } from 'http'

export type WorkerRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<any>
