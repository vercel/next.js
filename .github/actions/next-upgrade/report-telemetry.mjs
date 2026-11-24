import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maxTargetCount = 1000
const failureStages = [
  'preflight',
  'assessment',
  'execution',
  'verification',
  'publishing',
]

export async function reportUpgradeTelemetry({
  events,
  transport,
  disabled,
  runId,
  trigger,
  startTime,
  targetCount,
  result,
}) {
  if (
    disabled ||
    !uuid.test(runId) ||
    (trigger !== 'schedule' && trigger !== 'manual') ||
    !Number.isSafeInteger(targetCount) ||
    targetCount < 0
  ) {
    return
  }

  try {
    if (result === null) {
      await transport(
        events.eventAgentUpgradeCIRunStarted({
          runId,
          trigger,
          targetCount: Math.min(targetCount, maxTargetCount),
        })
      )
      return
    }

    const counts = {
      noUpgrade: 0,
      existingDrafts: 0,
      newDrafts: 0,
      blocked: 0,
      failed: 0,
    }
    let failureStage = failureStages.includes(result.failureStage)
      ? result.failureStage
      : null
    if (!Array.isArray(result.outcomes)) {
      counts.failed = 1
    } else {
      for (const outcome of result.outcomes.slice(0, maxTargetCount)) {
        switch (outcome?.status) {
          case 'no_upgrade':
            counts.noUpgrade++
            break
          case 'existing_draft':
            counts.existingDrafts++
            break
          case 'new_draft':
            counts.newDrafts++
            break
          case 'blocked':
            counts.blocked++
            break
          case 'failed':
            counts.failed++
            if (
              failureStage === null &&
              failureStages.includes(outcome.failureStage)
            ) {
              failureStage = outcome.failureStage
            }
            break
        }
      }
    }

    const durationMs = Number.isSafeInteger(startTime)
      ? Math.max(0, Math.min(Date.now() - startTime, 24 * 60 * 60 * 1000))
      : 0
    await transport(
      events.eventAgentUpgradeCIRunResult({
        runId,
        trigger,
        durationMs,
        ...counts,
        failureStage,
      })
    )
  } catch {
    // Reporting has no effect on the scheduled upgrade result.
  }
}

async function main() {
  if (process.env.NEXT_TELEMETRY_DISABLED) {
    return
  }

  // The workflow installs the published Next.js package for the pinned commit.
  const actionRoot = dirname(fileURLToPath(import.meta.url))
  const require = createRequire(import.meta.url)
  const { Telemetry } = require('next/dist/telemetry/storage')
  const events = require('next/dist/telemetry/events/agent-upgrade')
  const telemetry = new Telemetry({
    distDir: resolve(
      process.env.RUNNER_TEMP || actionRoot,
      'next-upgrade-telemetry'
    ),
    skipNotify: true,
  })
  if (!telemetry.isEnabled) {
    return
  }

  const [phase] = process.argv.slice(2)
  let result = null
  if (phase === 'result') {
    try {
      result = JSON.parse(
        await readFile(process.env.NEXT_UPGRADE_PUBLISH_RESULT, 'utf8')
      )
    } catch {
      result = { failureStage: 'publishing' }
    }
  } else if (phase === 'prepare-failed') {
    // Candidate failures are recorded per group; the job itself fails only before them.
    result = { failureStage: 'preflight' }
  } else if (phase !== 'start') {
    return
  }

  await reportUpgradeTelemetry({
    events,
    transport: async (event) => {
      telemetry.record(event)
      await telemetry.flush()
    },
    disabled: false,
    runId: process.env.NEXT_UPGRADE_TELEMETRY_RUN_ID,
    trigger:
      process.env.GITHUB_EVENT_NAME === 'schedule' ? 'schedule' : 'manual',
    startTime: Number(process.env.NEXT_UPGRADE_TELEMETRY_STARTED_AT),
    targetCount: JSON.parse(process.env.NEXT_UPGRADE_TARGETS).length,
    result,
  })
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  // Use the existing transport with a bound for this disposable process.
  const timeout = setTimeout(() => process.exit(0), 4_000)
  timeout.unref()
  try {
    await main()
  } catch {
    // A missing or unavailable transport does not affect the run.
  }
}
