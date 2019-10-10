import chalk from 'chalk'
import Conf from 'conf'
import { BinaryLike, createHash, randomBytes } from 'crypto'
import isDockerFunction from 'is-docker'
import path from 'path'

import { getAnonymousMeta } from './anonymous-meta'
import * as ciEnvironment from './ci-info'
import { _postPayload } from './post-payload'
import { getRawProjectId } from './project-id'

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
// See the `oneWayHash` function.
const TELEMETRY_KEY_SALT = `telemetry.salt`

const { NEXT_TELEMETRY_DISABLED, NEXT_TELEMETRY_DEBUG } = process.env

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

export class Telemetry {
  private conf: Conf<any>
  private sessionId: string
  private rawProjectId: string

  constructor({ distDir }: { distDir: string }) {
    const storageDirectory = getStorageDirectory(distDir)

    this.conf = new Conf({ projectName: 'nextjs', cwd: storageDirectory })
    this.sessionId = randomBytes(32).toString('hex')
    this.rawProjectId = getRawProjectId()

    this.notify()
  }

  private notify = () => {
    if (this.isDisabled) {
      return
    }

    // The end-user has already been notified about our telemetry integration. We
    // don't need to constantly annoy them about it.
    // We will re-inform users about the telemetry if significant changes are
    // ever made.
    if (this.conf.get(TELEMETRY_KEY_NOTIFY_DATE, '')) {
      return
    }
    this.conf.set(TELEMETRY_KEY_NOTIFY_DATE, Date.now().toString())

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

  get anonymousId(): string {
    const val = this.conf.get(TELEMETRY_KEY_ID)
    if (val) {
      return val
    }

    const generated = randomBytes(32).toString('hex')
    this.conf.set(TELEMETRY_KEY_ID, generated)
    return generated
  }

  get salt(): string {
    const val = this.conf.get(TELEMETRY_KEY_SALT)
    if (val) {
      return val
    }

    const generated = randomBytes(16).toString('hex')
    this.conf.set(TELEMETRY_KEY_SALT, generated)
    return generated
  }

  private get isDisabled(): boolean {
    if (!!NEXT_TELEMETRY_DISABLED) {
      return true
    }
    return this.conf.get(TELEMETRY_KEY_ENABLED, true) === false
  }

  setEnabled = (_enabled: boolean) => {
    const enabled = !!_enabled
    this.conf.set(TELEMETRY_KEY_ENABLED, enabled)
  }

  get isEnabled(): boolean {
    return this.conf.get(TELEMETRY_KEY_ENABLED, true) !== false
  }

  oneWayHash = (payload: BinaryLike): string => {
    const hash = createHash('sha256')

    // Always prepend the payload value with salt. This ensures the hash is truly
    // one-way.
    hash.update(this.salt)

    // Update is an append operation, not a replacement. The salt from the prior
    // update is still present!
    hash.update(payload)
    return hash.digest('hex')
  }

  private get projectId(): string {
    return this.oneWayHash(this.rawProjectId)
  }

  record = (
    _events: TelemetryEvent | TelemetryEvent[]
  ): Promise<{
    isFulfilled: boolean
    isRejected: boolean
    value?: any
    reason?: any
  }> => {
    const _this = this
    // pseudo try-catch
    async function wrapper() {
      return await _this.submitRecord(_events)
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

  private submitRecord = (
    _events: TelemetryEvent | TelemetryEvent[]
  ): Promise<any> => {
    let events: TelemetryEvent[]
    if (Array.isArray(_events)) {
      events = _events
    } else {
      events = [_events]
    }

    if (events.length < 1) {
      return Promise.resolve()
    }

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
    if (this.isDisabled) {
      return Promise.resolve()
    }

    const context: EventContext = {
      anonymousId: this.anonymousId,
      projectId: this.projectId,
      sessionId: this.sessionId,
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
}

function getStorageDirectory(distDir: string): string | undefined {
  const isLikelyEphemeral = ciEnvironment.isCI || isDockerFunction()

  if (isLikelyEphemeral) {
    return path.join(distDir, 'cache')
  }

  return undefined
}
