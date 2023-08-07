import { initialize } from './router-server'

export async function getRouterRequestHandlers({
  dir,
  port,
  isDev,
  hostname,
  minimalMode,
  isNodeDebugging,
  keepAliveTimeout,
}: {
  dir: string
  port: number
  isDev: boolean
  hostname: string
  minimalMode?: boolean
  isNodeDebugging?: boolean
  keepAliveTimeout?: number
}): ReturnType<typeof initialize> {
  return initialize({
    dir,
    port,
    hostname,
    dev: isDev,
    minimalMode,
    workerType: 'router',
    isNodeDebugging: isNodeDebugging || false,
    keepAliveTimeout,
  })
}
