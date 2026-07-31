import type { IncomingMessage, ServerResponse } from 'http'
import type { DevToolsConfig } from '../dev-overlay/shared'

import * as fsPromises from 'fs/promises'
import { randomUUID } from 'crypto'
import { basename, dirname, join } from 'path'

import { middlewareResponse } from './middleware-response'
import { devToolsConfigSchema } from '../shared/devtools-config-schema'
import { deepMerge } from '../shared/deepmerge'

const DEVTOOLS_CONFIG_FILENAME = 'next-devtools-config.json'
const DEVTOOLS_CONFIG_MIDDLEWARE_ENDPOINT = '/__nextjs_devtools_config'
const DEVTOOLS_CONFIG_BODY_LIMIT = 64 * 1024
const configUpdateQueues = new Map<string, Promise<void>>()

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

    const previousUpdate = (
      configUpdateQueues.get(configPath) ?? Promise.resolve()
    ).catch(() => {})
    let releaseUpdate!: () => void
    const updateCompleted = new Promise<void>((resolve) => {
      releaseUpdate = resolve
    })
    const queueTail = previousUpdate.then(() => updateCompleted)
    configUpdateQueues.set(configPath, queueTail)
    void queueTail.then(() => {
      if (configUpdateQueues.get(configPath) === queueTail) {
        configUpdateQueues.delete(configPath)
      }
    })

    try {
      const chunks: Buffer[] = []
      let bodySize = 0
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk)
        bodySize += buffer.byteLength
        if (bodySize > DEVTOOLS_CONFIG_BODY_LIMIT) {
          return middlewareResponse.payloadTooLarge(res)
        }
        chunks.push(buffer)
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

      await previousUpdate
      const currentConfig = await getDevToolsConfig(distDir)
      const newConfig = deepMerge(currentConfig, validation.data)
      await writeDevToolsConfigAtomically(
        configPath,
        JSON.stringify(newConfig, null, 2)
      )
      sendUpdateSignal(newConfig)

      return middlewareResponse.noContent(res)
    } finally {
      releaseUpdate()
    }
  }
}

export async function getDevToolsConfig(
  distDir: string
): Promise<DevToolsConfig> {
  const configPath = join(distDir, 'cache', DEVTOOLS_CONFIG_FILENAME)

  try {
    const parsed = JSON.parse(await fsPromises.readFile(configPath, 'utf8'))
    const validation = devToolsConfigSchema.safeParse(parsed)
    return validation.success ? validation.data : {}
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {}
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return {}
    }
    throw error
  }
}

async function writeDevToolsConfigAtomically(
  configPath: string,
  contents: string
): Promise<void> {
  const temporaryPath = join(
    dirname(configPath),
    `.${basename(configPath)}.${process.pid}.${randomUUID()}.tmp`
  )

  try {
    await fsPromises.mkdir(dirname(configPath), { recursive: true })
    await fsPromises.writeFile(temporaryPath, contents)
    await fsPromises.rename(temporaryPath, configPath)
  } catch (error) {
    await fsPromises.unlink(temporaryPath).catch(() => {})
    throw error
  }
}
