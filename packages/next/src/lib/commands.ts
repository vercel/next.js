import type { getValidatedArgs } from './get-validated-args'

export type CliCommand = (args: ReturnType<typeof getValidatedArgs>) => void

export const commands: { [command: string]: () => Promise<CliCommand> } = {
  build: () => Promise.resolve(require('../cli/next-build').nextBuild),
  start: () => Promise.resolve(require('../cli/next-start').nextStart),
  export: () => Promise.resolve(require('../cli/next-export').nextExport),
  dev: () => Promise.resolve(require('../cli/next-dev').nextDev),
  lint: () => Promise.resolve(require('../cli/next-lint').nextLint),
  telemetry: () =>
    Promise.resolve(require('../cli/next-telemetry').nextTelemetry),
  info: () => Promise.resolve(require('../cli/next-info').nextInfo),
  'experimental-compile': () =>
    Promise.resolve(require('../cli/next-build').nextBuild),
  'experimental-generate': () =>
    Promise.resolve(require('../cli/next-build').nextBuild),
}
