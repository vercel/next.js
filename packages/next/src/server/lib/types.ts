import type { IncomingMessage, ServerResponse } from 'http'

import type { Duplex } from 'stream'
import type { NextServer, RequestHandler, UpgradeHandler } from '../next'
import type { ConfiguredExperimentalFeature } from '../config'

export type WorkerRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse
) => Promise<any>

export type WorkerUpgradeHandler = (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
) => any

export type ServerInitResult = {
  requestHandler: RequestHandler
  upgradeHandler: UpgradeHandler
  server: NextServer
  // Make an effort to close upgraded HTTP requests (e.g. Turbopack HMR websockets)
  closeUpgraded: () => void
  // The distDir from config, used by the parent process for telemetry/trace
  distDir: string
  // Experimental features from config, used for logging after server is ready
  experimentalFeatures: ConfiguredExperimentalFeature[]
  // Whether cache components is enabled
  cacheComponents: boolean
  // Whether partial prefetching is enabled (and its mode)
  partialPrefetching?: boolean | 'unstable_eager'
  // Whether AGENTS.md / CLAUDE.md auto-generation is enabled (default true)
  agentRules?: boolean
  // Whether the development server memory threshold restart is enabled
  devMemoryThresholdRestart: boolean
}
