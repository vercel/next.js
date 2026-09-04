#!/usr/bin/env node

import { bold, cyan, green, red, yellow } from '../lib/picocolors'
import { printAndExit } from '../server/lib/utils'
import {
  agentFeedbackModels,
  eventAgentFeedback,
  type AgentFeedbackModel,
  type AgentFeedbackModelProvider,
  type AgentFeedbackOutcome,
  type AgentFeedbackSeverity,
  type AgentFeedbackType,
} from '../telemetry/events/agent-feedback'
import { Telemetry } from '../telemetry/storage'

export type NextTelemetryOptions = {
  enable?: boolean
  disable?: boolean
}

export type NextTelemetryFeedbackOptions = {
  feedbackType: AgentFeedbackType
  outcome: AgentFeedbackOutcome
  severity: AgentFeedbackSeverity
  modelProvider: AgentFeedbackModelProvider
  model: AgentFeedbackModel
  inputTokens: number
  outputTokens: number
  durationMilliseconds: number
  toolCallCount: number
}

const telemetry = new Telemetry({ distDir: process.cwd() })
let isEnabled = telemetry.isEnabled

const nextTelemetry = (options: NextTelemetryOptions, arg: string) => {
  if (options.enable || arg === 'enable') {
    telemetry.setEnabled(true)
    isEnabled = true

    console.log(cyan('Success!'))
  } else if (options.disable || arg === 'disable') {
    const path = telemetry.setEnabled(false)

    if (isEnabled) {
      console.log(
        cyan(`Your preference has been saved${path ? ` to ${path}` : ''}.`)
      )
    } else {
      console.log(yellow(`Next.js' telemetry collection is already disabled.`))
    }

    isEnabled = false
  } else {
    console.log(bold('Next.js Telemetry'))
  }

  console.log(
    `\nStatus: ${isEnabled ? bold(green('Enabled')) : bold(red('Disabled'))}`
  )

  if (isEnabled) {
    console.log(
      '\nNext.js telemetry is completely anonymous. Thank you for participating!'
    )
  } else {
    console.log(
      `\nYou have opted-out of Next.js' anonymous telemetry program.\nNo data will be collected from your machine.`
    )
  }

  console.log(`\nLearn more: ${cyan('https://nextjs.org/telemetry')}`)
}

const nextTelemetryFeedback = async (options: NextTelemetryFeedbackOptions) => {
  if ((options.modelProvider === 'unknown') !== (options.model === 'unknown')) {
    printAndExit(
      'The --model-provider and --model options must be provided together.'
    )
  }

  const models = agentFeedbackModels[options.modelProvider]
  if (!(models as readonly string[]).includes(options.model)) {
    printAndExit(
      `The model "${options.model}" is not valid for provider "${options.modelProvider}".`
    )
  }

  for (const [name, value] of Object.entries({
    inputTokens: options.inputTokens,
    outputTokens: options.outputTokens,
    durationMilliseconds: options.durationMilliseconds,
    toolCallCount: options.toolCallCount,
  })) {
    if (!Number.isSafeInteger(value) || value < -1) {
      printAndExit(`${name} must be -1 or a non-negative safe integer.`)
    }
  }

  if (!telemetry.isEnabled && !process.env.NEXT_TELEMETRY_DEBUG) {
    console.log(
      `Agent feedback was not sent because Next.js telemetry is disabled.`
    )
    return
  }

  await telemetry.record(
    eventAgentFeedback({
      feedbackType: options.feedbackType,
      outcome: options.outcome,
      severity: options.severity,
      modelProvider: options.modelProvider,
      model: options.model,
      inputTokens: options.inputTokens,
      outputTokens: options.outputTokens,
      durationMilliseconds: options.durationMilliseconds,
      toolCallCount: options.toolCallCount,
    })
  )

  console.log('Thank you for your feedback.')
}

export { nextTelemetry, nextTelemetryFeedback }
