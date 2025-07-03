import type { ServerResponse } from 'http'
import type { NextConfigComplete } from '../config-shared'
import type { NextUrlWithParsedQuery } from '../request-meta'

import { randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { getStorageDirectory } from '../cache-dir'

// Keep the uuid in memory as it should never change during the lifetime of the server.
let workspaceUUID: string | null = null

export function isChromeDevtoolsWorkspaceUrl(
  url: NextUrlWithParsedQuery
): boolean {
  return url.pathname === '/.well-known/appspecific/com.chrome.devtools.json'
}

export async function handleChromeDevtoolsWorkspaceRequest(
  response: ServerResponse,
  opts: { dir: string },
  config: NextConfigComplete
): Promise<void> {
  response.setHeader('Content-Type', 'application/json')
  response.end(
    JSON.stringify(
      await getChromeDevtoolsWorkspace(opts.dir, config.distDir),
      null,
      2
    )
  )
}

/**
 * https://developer.chrome.com/docs/devtools/workspaces#generate-json
 */
interface ChromeDevtoolsWorkspace {
  workspace: {
    uuid: string
    root: string
  }
}

/**
 * For https://developer.chrome.com/docs/devtools/workspaces
 */
async function getChromeDevtoolsWorkspace(
  root: string,
  configDistDir: string
): Promise<ChromeDevtoolsWorkspace> {
  if (workspaceUUID === null) {
    const distDir = path.join(root, configDistDir)
    const cacheBaseDir = getStorageDirectory(distDir)

    if (cacheBaseDir === undefined) {
      workspaceUUID = randomUUID()
    } else {
      const cachedUUIDPath = path.join(
        cacheBaseDir,
        'chrome-devtools-workspace-uuid'
      )
      try {
        workspaceUUID = await fs.promises.readFile(cachedUUIDPath, 'utf8')
      } catch {
        // TODO: Why does this need to be v4 and not v5?
        // With v5 we could base it off of the `distDir` and `root` which would
        // allow us to persist the workspace across .next wipes.
        workspaceUUID = randomUUID()

        try {
          await fs.promises.writeFile(cachedUUIDPath, workspaceUUID, 'utf8')
        } catch (cause) {
          console.warn(
            new Error(
              'Failed to persist Chrome DevTools workspace UUID. The Chrome DevTools Workspace needs to be reconnected after the next page reload.',
              { cause }
            )
          )
        }
      }
    }
  }

  return {
    workspace: {
      uuid: workspaceUUID,
      root,
    },
  }
}
