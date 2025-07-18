import type { IncomingMessage, ServerResponse } from 'http'

import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'next/dist/compiled/zod'

import { middlewareResponse } from './middleware-response'

const DEVTOOLS_CONFIG_FILENAME = 'next-devtools-config.json'
const DEVTOOLS_CONFIG_MIDDLEWARE_ENDPOINT = '/__nextjs_devtools_config'

export function devToolsConfigMiddleware({
  distDir,
  sendUpdateSignal,
}: {
  distDir: string
  sendUpdateSignal: (data: any) => void
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

    if (req.method !== 'GET' && req.method !== 'POST') {
      return middlewareResponse.methodNotAllowed(res)
    }

    const devToolsConfig = await getDevToolsConfig(distDir)

    if (req.method === 'GET') {
      return middlewareResponse.json(res, devToolsConfig)
    }

    if (req.method === 'POST') {
      console.log('POST MAN')
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(Buffer.from(chunk))
        console.log({ chunk })
      }
      const body = Buffer.concat(chunks).toString('utf8')

      console.log({ body })

      const validation = devToolsConfigSchema.safeParse(JSON.parse(body))

      console.log({ validation })
      if (!validation.success) {
        console.log({ errors: validation.error.errors })
        return middlewareResponse.badRequest(res)
      }

      const newConfig = { ...devToolsConfig, ...validation.data }
      await writeFile(configPath, JSON.stringify(newConfig, null, 2))

      sendUpdateSignal(newConfig)

      return middlewareResponse.noContent(res)
    }
  }
}

export async function getDevToolsConfig(
  distDir: string
): Promise<DevToolsConfig> {
  const configPath = join(distDir, 'cache', DEVTOOLS_CONFIG_FILENAME)

  if (!existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify({}))
  }

  return JSON.parse(await readFile(configPath, 'utf8'))
}

export type DevToolsConfig = z.infer<typeof devToolsConfigSchema>

const devToolsConfigSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  indicatorDisabled: z.boolean().optional(),
  devToolsPosition: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .optional(),
  panelPosition: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .optional(),
  panelPositions: z
    .record(
      z.string(),
      z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    )
    .optional(),
  panelSizes: z
    .record(z.string(), z.object({ w: z.number(), h: z.number() }))
    .optional(),
  scale: z.number().optional(),
  hideShortcut: z.boolean().optional(),
})
