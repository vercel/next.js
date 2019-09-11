import chalk from 'chalk'
import ciEnvironment from 'ci-info'
import Conf from 'conf'
import { BinaryLike, createHash, randomBytes } from 'crypto'
import findUp from 'find-up'
import isDockerFunction from 'is-docker'
import path from 'path'

import { getAnonymousMeta } from './anonymous-meta'
import { _postPayload } from './post-payload'
import { getProjectId } from './project-id'

let config: Conf<any> | undefined
let projectId: string | undefined
let randomRunId: string | undefined

// This is the key that stores whether or not telemetry is enabled or disabled.
const TELEMETRY_KEY_ENABLED = 'telemetry.enabled'

// This is the key that specifies when the user was informed about anonymous
// telemetry collection.
const TELEMETRY_KEY_NOTIFY_DATE = 'telemetry.notifiedAt'

// This is a quasi-persistent identifier used to dedupe recurring events. It's
// generated from random data and completely anonymous.
const TELEMETRY_KEY_ID = `telemetry.anonymousId`

// This is the cryptographic salt that is included within every hashed value.
// This salt value is never sent to us, ensuring privacy and the one-way nature
// of the hash (prevents dictionary lookups of pre-computed hashes).
// See the `computeHash` function.
const TELEMETRY_KEY_SALT = `telemetry.salt`

const { NEXT_TELEMETRY_DISABLED, NEXT_TELEMETRY_DEBUG } = process.env

let isDisabled: boolean = !!NEXT_TELEMETRY_DISABLED

function notify() {
  // No notification needed if telemetry is not enabled
  if (!config || isDisabled) {
    return
  }

  // The end-user has already been notified about our telemetry integration. We
  // don't need to constantly annoy them about it.
  // We will re-inform users about the telemetry if significant changes are
  // ever made.
  if (config.get(TELEMETRY_KEY_NOTIFY_DATE, '')) {
    return
  }

  config.set(TELEMETRY_KEY_NOTIFY_DATE, Date.now().toString())

  console.log(
    `${chalk.magenta.bold(
      'Attention'
    )}: Next.js now collects completely anonymous telemetry regarding usage.`
  )
  console.log(
    `This information is used to shape Next.js' roadmap and prioritize features.`
  )
  console.log(
    `You can learn more, including how to opt-out if you'd not like to participate in this anonymous program, by visiting the following URL:`
  )
  console.log(chalk.cyan('https://nextjs.org/telemetry'))
  console.log()
}

function setup() {
  if (config) {
    return
  }

  let cwd =
    ciEnvironment.isCI || isDockerFunction()
      ? // CI environments will normally cache `node_modules/`
        findUp.sync('node_modules')
      : undefined
  if (cwd) cwd = path.join(cwd, '.next')

  config = new Conf({ projectName: 'nextjs', cwd })

  let anonymousId = config.get(TELEMETRY_KEY_ID)
  if (!anonymousId) {
    config.set(
      TELEMETRY_KEY_ID,
      (anonymousId = randomBytes(32).toString('hex'))
    )
  }

  if (!config.get(TELEMETRY_KEY_SALT)) {
    config.set(TELEMETRY_KEY_SALT, randomBytes(16).toString('hex'))
  }

  projectId = getProjectId()
  randomRunId = randomBytes(8).toString('hex')

  if (config.get(TELEMETRY_KEY_ENABLED, true) === false) {
    isDisabled = true
  }

  notify()
}

export function computeHash(payload: BinaryLike): string | null {
  setup()

  const salt = config!.get(TELEMETRY_KEY_SALT)
  if (!salt) {
    return null
  }

  const hash = createHash('sha256')

  // Always prepend the payload value with salt. This ensures the hash is truly
  // one-way.
  hash.update(salt)

  // Update is an append operation, not a replacement. The salt from the prior
  // update is still present!
  hash.update(payload)
  return hash.digest('hex')
}

export function setTelemetryEnabled(_enabled: boolean) {
  setup()

  const enabled = !!_enabled
  config!.set(TELEMETRY_KEY_ENABLED, enabled)
  isDisabled = !enabled
}

export function isTelemetryEnabled(): boolean {
  setup()

  return config!.get(TELEMETRY_KEY_ENABLED, true) !== false
}

type TelemetryEvent = { eventName: string; payload: object }
type EventContext = {
  anonymousId: string
  projectId: string
  sessionId: string
}
type EventMeta = { [key: string]: unknown }
type EventBatchShape = {
  eventName: string
  fields: object
}
function _record(_events: TelemetryEvent | TelemetryEvent[]): Promise<any> {
  let events: TelemetryEvent[]
  if (Array.isArray(_events)) {
    events = _events
  } else {
    events = [_events]
  }

  if (events.length < 1) {
    return Promise.resolve()
  }

  setup()

  if (NEXT_TELEMETRY_DEBUG) {
    // Print to standard error to simplify selecting the output
    events.forEach(({ eventName, payload }) =>
      console.error(
        `[telemetry] ` + JSON.stringify({ eventName, payload }, null, 2)
      )
    )
    // Do not send the telemetry data if debugging. Users may use this feature
    // to preview what data would be sent.
    return Promise.resolve()
  }

  // Skip recording telemetry if the feature is disabled
  if (isDisabled) {
    return Promise.resolve()
  }

  const anonymousId = config!.get(TELEMETRY_KEY_ID)
  if (!anonymousId) {
    return Promise.resolve()
  }

  const context: EventContext = {
    anonymousId: anonymousId,
    projectId: projectId!,
    sessionId: randomRunId!,
  }
  const meta: EventMeta = getAnonymousMeta()
  return _postPayload(`https://telemetry.nextjs.org/api/v1/record`, {
    context,
    meta,
    events: events.map(({ eventName, payload }) => ({
      eventName,
      fields: payload,
    })) as Array<EventBatchShape>,
  })
}

export function record(
  _events: TelemetryEvent | TelemetryEvent[]
): Promise<{
  isFulfilled: boolean
  isRejected: boolean
  value?: any
  reason?: any
}> {
  // pseudo try-catch
  async function wrapper() {
    return await _record(_events)
  }

  return wrapper()
    .then(value => ({
      isFulfilled: true,
      isRejected: false,
      value,
    }))
    .catch(reason => ({
      isFulfilled: false,
      isRejected: true,
      reason,
    }))
}
