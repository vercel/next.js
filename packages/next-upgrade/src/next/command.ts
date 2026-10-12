import { getNpxCommand } from '../cli/package-runner'
import { runChildProcess } from '../cli/run-child-process'
import { upgradeVersion } from '../version'

// Config and telemetry come from the pinned CLI, even if the app's Next is old or missing.
export function runNextCommand(directory: string, args: string[]) {
  const [command, ...runnerArgs] = getNpxCommand(directory).split(' ')
  return runChildProcess(
    command,
    [...runnerArgs, `next@${upgradeVersion}`, ...args],
    { cwd: directory, stdio: 'inherit' },
    null
  )
}
