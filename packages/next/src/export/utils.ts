import type { NextConfigComplete } from '../server/config-shared'

export function hasCustomExportOutput(config: NextConfigComplete) {
  // In the past, a user had to run "next build" to generate
  // ".next" (or whatever the distDir) followed by "next export"
  // to generate "out" (or whatever the outDir). However, when
  // "output: export" is configured, "next build" does both steps.
  // So the user-configured distDir is actually the outDir.
  // We'll do some custom logic when meeting this condition.
  // e.g.
  // Will set config.distDir to .next to make sure the manifests
  // are still reading from temporary .next directory.
  return config.output === 'export' && config.distDir !== '.next'
}
