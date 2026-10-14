import type { NextConfigComplete } from '../server/config-shared'

export function hasCustomExportOutput(config: NextConfigComplete) {
  // In the past, a user had to run "next build" to generate
  // ".next" (or whatever the distDir) followed by "next export"
  // to generate "out" (or whatever the outDir). However, when
  // "output: export" is configured, "next build" does both steps.
  // In this mode, a custom distDir names the export destination.
  return config.output === 'export' && config.distDir !== '.next'
}

export function getBuildDistDir(config: NextConfigComplete): string {
  // A custom distDir is the export destination in this mode. Build artifacts
  // and manifests still live in .next until they are exported.
  return hasCustomExportOutput(config) ? '.next' : config.distDir
}
