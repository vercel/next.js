import type { IncomingMessage, ServerResponse } from 'http'

import type { Duplex } from 'stream'

export type WorkerRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<any>

export type WorkerUpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) => any
