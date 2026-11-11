import { writeFileSync } from 'fs'
import type { NextConfig } from 'next'

if (process.argv.some((arg) => arg.endsWith('detached-flush.js'))) {
  writeFileSync('flush-loaded-config', '')
  throw new Error('Detached flush must not evaluate config')
}

if (process.env.NEXT_TEST_DISABLE_TELEMETRY_IN_CONFIG) {
  process.env.NEXT_TELEMETRY_DISABLED = '1'
}

export default { distDir: 'custom-output' } satisfies NextConfig
