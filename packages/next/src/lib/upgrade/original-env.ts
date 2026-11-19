import { initialEnv, updateInitialEnv } from '@next/env'

type Env = Record<string, string | undefined>

let originalEnv: Env | undefined

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
// itself needs must be set after this call or be kept explicitly below.
export function restoreOriginalEnv(): void {
  if (!originalEnv) {
    return
  }

  const restored: Env = { ...originalEnv }
  // A telemetry opt-out read from next.config or .env must still apply.
  if (process.env.NEXT_TELEMETRY_DISABLED) {
    restored.NEXT_TELEMETRY_DISABLED = process.env.NEXT_TELEMETRY_DISABLED
  }

  const env = process.env as Env
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
