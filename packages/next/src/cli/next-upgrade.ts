import { spawnNextUpgrade as runUpgrade } from 'next/dist/lib/upgrade/cli/run'
import { reportAgentUpgradeAgentResult as reportResult } from 'next/dist/lib/upgrade/cli/report'
import { loadAgentUpgradeConfig, prepareUpgrade } from '../lib/upgrade/config'
import { getAgentName } from '../telemetry/agent-name'
import { Telemetry } from '../telemetry/storage'
import {
  eventAgentUpgradeRunStarted,
  eventAgentUpgradeCLIResult,
  eventAgentUpgradeAgentResult,
} from '../telemetry/events/agent-upgrade'

// Supply the invoking Next's integrations without changing upgrade execution.
export function spawnNextUpgrade(
  directory: Parameters<typeof runUpgrade>[0],
  options: Parameters<typeof runUpgrade>[1],
  nudgeSource: Parameters<typeof runUpgrade>[2]
) {
  return runUpgrade(directory, options, nudgeSource, {
    async loadConfig(dir) {
      const config = await loadAgentUpgradeConfig(dir)
      return {
        distDir: config.distDir,
        configuredPolicy: config.experimental?.agentUpgrade,
      }
    },
    prepareUpgrade,
    getAgentName,
    createTelemetry(distDir) {
      const telemetry = new Telemetry({ distDir, skipNotify: true })
      return {
        recordRunStarted(fields) {
          telemetry.record(eventAgentUpgradeRunStarted(fields))
        },
        recordCLIResult(fields) {
          telemetry.record(eventAgentUpgradeCLIResult(fields))
        },
        flush() {
          return telemetry.flush()
        },
      }
    },
  })
}

// Reporting shares the existing consent and storage but never starts an upgrade.
export function reportAgentUpgradeAgentResult(runId: string, result: string) {
  return reportResult(runId, result, loadAgentUpgradeConfig, (distDir) => {
    const telemetry = new Telemetry({ distDir, skipNotify: true })
    return {
      recordAgentResult(fields) {
        return telemetry.record(eventAgentUpgradeAgentResult(fields))
      },
      flush() {
        return telemetry.flush()
      },
    }
  })
}
