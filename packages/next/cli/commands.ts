export type cliCommand = (argv?: string[]) => void
export const commands: { [command: string]: () => Promise<cliCommand> } = {
  build: () => Promise.resolve(require('./next-build').nextBuild),
  start: () => Promise.resolve(require('./next-start').nextStart),
  export: () => Promise.resolve(require('./next-export').nextExport),
  dev: () => Promise.resolve(require('./next-dev').nextDev),
  lint: () => Promise.resolve(require('./next-lint').nextLint),
  telemetry: () => Promise.resolve(require('./next-telemetry').nextTelemetry),
  info: () => Promise.resolve(require('./next-info').nextInfo),
}
