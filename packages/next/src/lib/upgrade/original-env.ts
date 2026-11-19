import { initialEnv, updateInitialEnv } from '@next/env'

type Env = Record<string, string | undefined>

let originalEnv: Env | undefined

// Settings read from next.config or .env after startup that still apply to
// the upgrade and the agent: telemetry opt-outs and debug mode, and package
// manager settings such as a release-age cutoff.
function isToolingPolicy(key: string): boolean {
  return (
    key === 'NEXT_TELEMETRY_DISABLED' ||
    key === 'NEXT_TELEMETRY_DEBUG' ||
    /^(npm_config_|pnpm_config_|yarn_|bun_config_)/i.test(key)
  )
}

// Records the environment the user launched the CLI with, before `bin/next`
// applies its own defaults (`NODE_ENV`, `NEXT_RUNTIME`, ...) and before `.env`
// files are loaded. Calling it again replaces the previous capture.
export function captureOriginalEnv(): void {
  originalEnv = { ...process.env }
}

// Puts `process.env` back to the captured environment, so an agent upgrade
// started from `next dev` or `next build` hands the coding agent the user's
// environment instead of the one Next.js prepared for its own process.
// Every variable set after the capture is dropped, so a variable the upgrade
// itself needs must be set after this call or match isToolingPolicy.
export function restoreOriginalEnv(): void {
  if (!originalEnv) {
    return
  }

  const env = process.env as Env
  const restored: Env = { ...originalEnv }
  for (const key of Object.keys(env)) {
    if (env[key] !== undefined && isToolingPolicy(key)) {
      restored[key] = env[key]
    }
  }

  for (const key of Object.keys(env)) {
    if (restored[key] === undefined) {
      delete env[key]
    }
  }
  Object.assign(env, restored)

  // Keep initialEnv in sync, so a later loadEnvConfig or resetEnv in this
  // process does not bring the Next.js defaults back.
  if (initialEnv) {
    const changes: Env = { ...restored }
    for (const key of Object.keys(initialEnv)) {
      if (!(key in restored)) {
        changes[key] = undefined
      }
    }
    updateInitialEnv(changes)
  }
}
