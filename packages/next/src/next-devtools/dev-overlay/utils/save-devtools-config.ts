import type { DevToolsConfig } from '../shared'
import { devToolsConfigSchema } from '../../shared/devtools-config-schema'
import { deepMerge } from '../../shared/deepmerge'

let queuedPatch: DevToolsConfig = {}
let timer: ReturnType<typeof setTimeout> | null = null

function flushPatch() {
  if (Object.keys(queuedPatch).length === 0) {
    return
  }

  const body = JSON.stringify(queuedPatch)
  queuedPatch = {}

  fetch('/__nextjs_devtools_config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    // keepalive in case of fetch interrupted, e.g. navigation or reload
    keepalive: true,
  }).catch((error) => {
    console.log('[Next.js DevTools] Failed to save config:', {
      data: body,
      error,
    })
  })
}

export function saveDevToolsConfig(patch: DevToolsConfig) {
  const validation = devToolsConfigSchema.safeParse(patch)
  if (!validation.success) {
    console.log(
      '[Next.js DevTools] Invalid config patch:',
      validation.error.errors[0].message
    )
    return
  }

  queuedPatch = deepMerge(queuedPatch, patch)

  if (timer) {
    clearTimeout(timer)
  }

  timer = setTimeout(flushPatch, 120)
}
