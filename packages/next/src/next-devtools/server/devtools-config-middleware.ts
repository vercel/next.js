import type { IncomingMessage, ServerResponse } from 'http'
import type { DevToolsConfig } from '../dev-overlay/shared'

import { existsSync } from 'fs'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

import { middlewareResponse } from './middleware-response'
import { devToolsConfigSchema } from '../shared/devtools-config-schema'
import { deepMerge } from '../shared/deepmerge'

const DEVTOOLS_CONFIG_FILENAME = 'next-devtools-config.json'
const DEVTOOLS_CONFIG_MIDDLEWARE_ENDPOINT = '/__nextjs_devtools_config'

export function devToolsConfigMiddleware({
  distDir,
  sendUpdateSignal,
}: {
  distDir: string
  sendUpdateSignal: (data: DevToolsConfig) => void
}) {
  const configPath = join(distDir, 'cache', DEVTOOLS_CONFIG_FILENAME)

  return async function devToolsConfigMiddlewareHandler(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void
  ): Promise<void> {
    const { pathname } = new URL(`http://n${req.url}`)

    if (pathname !== DEVTOOLS_CONFIG_MIDDLEWARE_ENDPOINT) {
      return next()
    }

    if (req.method !== 'POST') {
      return middlewareResponse.methodNotAllowed(res)
    }

    const currentConfig = await getDevToolsConfig(distDir)

    const chunks: Buffer[] = []
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk))
    }

    let body = Buffer.concat(chunks).toString('utf8')
    try {
      body = JSON.parse(body)
    } catch (error) {
      console.error('[Next.js DevTools] Invalid config body passed:', error)
      return middlewareResponse.badRequest(res)
    }

    const validation = devToolsConfigSchema.safeParse(body)
    if (!validation.success) {
      console.error(
        '[Next.js DevTools] Invalid config passed:',
        validation.error.message
      )
      return middlewareResponse.badRequest(res)
    }

    const newConfig = deepMerge(currentConfig, validation.data)
    await writeFile(configPath, JSON.stringify(newConfig, null, 2))

    sendUpdateSignal(newConfig)

    return middlewareResponse.noContent(res)
  }
}

export async function getDevToolsConfig(
  distDir: string
): Promise<DevToolsConfig> {
  const configPath = join(distDir, 'cache', DEVTOOLS_CONFIG_FILENAME)

  if (!existsSync(configPath)) {
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, JSON.stringify({}))
    return {}
  }

  return JSON.parse(await readFile(configPath, 'utf8'))
}
