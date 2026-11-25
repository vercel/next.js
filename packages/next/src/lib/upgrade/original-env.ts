import { initialEnv, updateInitialEnv } from '@next/env'

type Env = Record<string, string | undefined>

let originalEnv: Env | undefined

// Settings read from next.config or .env after startup that still apply to
// the upgrade and the agent: telemetry opt-outs and debug mode, and package
// manager release-age cutoffs (see release-age.ts). Only settings that make
// the upgrade more restrictive are kept. Other package manager settings, such
// as the registry or release-age exclusions, would let a .env file change
// what the upgrade downloads and runs.
const TOOLING_POLICY_KEYS = new Set([
  'next_telemetry_disabled',
  'next_telemetry_debug',
  'npm_config_before',
  'npm_config_min_release_age',
  'npm_config_minimum_release_age',
  'pnpm_config_minimum_release_age',
  'yarn_npm_minimal_age_gate',
])

function isToolingPolicy(key: string): boolean {
  return TOOLING_POLICY_KEYS.has(key.toLowerCase())
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
