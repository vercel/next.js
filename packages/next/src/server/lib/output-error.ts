import type { NextConfigComplete } from '../config-shared'

export function getOutputExportStartError(
  config: Pick<NextConfigComplete, 'distDir'>
) {
  const exportDir = config.distDir === '.next' ? 'out' : config.distDir

  return `"next start" does not work with "output: export" configuration. Use "npx serve@latest ${exportDir}" instead.`
}
