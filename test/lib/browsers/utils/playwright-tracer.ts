import { BrowserContext } from 'playwright'
import { Closer } from './closable'
import * as path from 'node:path'
import {
  formatTestName,
  getCurrentTestContext,
  TestContext,
} from '../../jest-reflection'
import { getCurrentTestTraceOutputDir } from '../../test-trace-output'
import { BrowserContextWrapper } from './playwright-context-wrapper'

type StartedTraceInfo = {
  id: number
  debugName: string
  currentTest: TestContext | null
}

type TraceState =
  | { kind: 'initial' }
  | { kind: 'starting'; info: StartedTraceInfo; promise: Promise<void> }
  | { kind: 'started'; info: StartedTraceInfo }
  | { kind: 'ending'; info: StartedTraceInfo; promise: Promise<void> }
  | { kind: 'ended' }

// This is global so that it's shared for all browsers created in a test file
// (even if the shared playwright state gets recreated)
let nextTraceId = 0

const moduleInitializationTime = Date.now()

export class PlaywrightTracer {
  closer: Closer
  private context: BrowserContext
  private traceState: TraceState = { kind: 'initial' }

  constructor(contextWrapper: BrowserContextWrapper) {
    this.closer = new Closer(this, contextWrapper)
    this.context = contextWrapper.context
  }

  async start() {
    await this.context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    })
  }

  async close() {
    // if the trace didn't get ended normally for some reason, we should end it here to avoid dropping it.
    const { traceState } = this
    if (traceState.kind !== 'initial' && traceState.kind !== 'ended') {
      try {
        await this.ensureCurrentTraceEnded()
      } catch (err) {
        require('console').warn(
          `Failed to end playwright trace '${traceState.info.debugName}' while tearing down`,
          err
        )
      }
    }

    try {
      await this.context.tracing.stop()
    } catch (e) {
      require('console').warn('Failed to teardown playwright tracing', e)
    }
  }

  async startTrace(): Promise<void> {
    const testContext = getCurrentTestContext()
    const testName = testContext.currentTest
      ? formatTestName(testContext.currentTest.nameStack)
      : '(no test)'

    const traceId = nextTraceId++
    const debugName = `${traceId}. ${testName}`

    const { traceState } = this
    if (traceState.kind !== 'initial' && traceState.kind !== 'ended') {
      // This shouldn't ever happen. We're going to error, but first, make sure we're in a consistent state
      // to prevent cascading errors in other tests.
      await this.ensureCurrentTraceEnded()
      const stateDescription =
        traceState.kind === 'started' ? 'still running' : traceState.kind
      throw new Error(
        `Cannot start a new trace '${debugName}' while the previous trace '${traceState.info.debugName}' is ${stateDescription}`
      )
    }

    const traceTitle = `${testContext.testPathRelativeToRepo}: ${testName}`

    const info: StartedTraceInfo = {
      id: traceId,
      debugName,
      currentTest: testContext.currentTest,
    }

    try {
      this.traceState = {
        kind: 'starting',
        info,
        promise: this.context.tracing.startChunk({
          title: traceTitle,
        }),
      }
      await this.traceState.promise
      this.traceState = { kind: 'started', info }
    } catch (err) {
      this.traceState = { kind: 'initial' }
      throw new Error(`Failed to start playwright trace '${debugName}'`, {
        cause: err,
      })
    }
  }

  async endTrace() {
    const { traceState } = this
    if (traceState.kind !== 'started') {
      throw new Error('Cannot call endTrace with no active trace')
    }

    const fileName = this.generateTraceFilename(traceState.info)
    const traceOutputDir = getCurrentTestTraceOutputDir()
    const traceOutputPath = path.join(traceOutputDir, fileName)

    try {
      this.traceState = {
        kind: 'ending',
        info: traceState.info,
        promise: this.context.tracing.stopChunk({ path: traceOutputPath }),
      }
      await this.traceState.promise
    } catch (err) {
      throw new Error(
        `An error occurred while stopping playwright trace '${traceState.info.debugName}'`,
        { cause: err }
      )
    } finally {
      this.traceState = { kind: 'ended' }
    }
  }

  private async ensureCurrentTraceEnded() {
    const { traceState } = this
    if (traceState.kind === 'starting') {
      await traceState.promise
      if (this.traceState.kind === 'started') {
        await this.endTrace()
      }
    } else if (traceState.kind === 'started') {
      await this.endTrace()
    } else if (traceState.kind === 'ending') {
      // finish shutdown
      await traceState.promise
    }
  }

  private generateTraceFilename(traceInfo: StartedTraceInfo) {
    // Make sure that the filename doesn't exceed 255 characters,
    // which is a common filename length limit.
    // (exceeding it causes an ENAMETOOLONG when saving the trace)
    // https://stackoverflow.com/a/54742403
    const maxTotalLength = 255

    const testContext = getCurrentTestContext()

    const startTime = testContext?.suiteStartTime ?? moduleInitializationTime
    const prefix = `pw-${startTime}-${traceInfo.id}-`
    const suffix = `.zip`
    const maxNameLength = maxTotalLength - (prefix.length + suffix.length)

    const traceName = getTraceName(traceInfo, maxNameLength)
    return prefix + traceName + suffix

    function getTraceName(traceInfo: StartedTraceInfo, maxLength: number) {
      const { currentTest } = traceInfo

      let statusPrefix = ''
      let unsafeName = traceInfo.debugName

      if (currentTest) {
        const testStatus =
          currentTest.status === 'success'
            ? 'PASS'
            : currentTest.status === 'failure'
              ? 'FAIL'
              : // if a trace is closed while the test is still running, e.g. because of a manual `browser.close()`,
                // then we might not have a useful test status
                null
        if (testStatus) {
          statusPrefix = testStatus + '__'
        }
        unsafeName = formatTestName(currentTest.nameStack)
      }

      const safeName = middleOut(
        replaceUnsafeChars(unsafeName),
        maxLength - statusPrefix.length,
        '...'
      )

      return statusPrefix + safeName
    }

    function replaceUnsafeChars(text: string) {
      const chars = /[^a-zA-Z0-9\-_.]+/
      return (
        text
          // strip leading unsafe chars to avoid a useless '_' at the start
          .replace(new RegExp(`^${chars.source}`), '')
          // strip trailing unsafe chars to avoid a useless '_' at the end
          .replace(new RegExp(`${chars.source}$`), '')
          // replace each run of unsafe chars with a '_'
          .replaceAll(new RegExp(chars, 'g'), '_')
      )
    }

    /**
     * Truncate `text` to be at most `maxLen` characters,
     * replacing the appropriate number of characters in the middle with `replacement`.
     * */
    function middleOut(text: string, maxLen: number, replacement: string) {
      if (text.length <= maxLen) {
        return text
      }

      // EXAMPLE
      //
      // maxLen = 10:
      //   __________  (it looks like this)
      // replacement (length: 3)
      //   '...'
      // input (length: 17):
      //   '0123456789abcdefg'
      //
      // surplus = 17 - 10 + 3 = 10
      // keep    = 17 - surplus = 7
      // i.e. we need to replace 10 inner chars with: '...' (leaving 7 characters of the actual string)
      //   '0123456789abcdefg'
      //        ^^^^^^^^^^
      // so we take the leading and traling parts:
      //   '0123456789abcdefg'
      //    ^^^^..........^^^
      //     4     (10)    3
      // result:
      //   '0123...efg'
      const surplus = text.length - maxLen + replacement.length
      const keep = text.length - surplus

      // if we have an odd length of characters remaining, prioritize the leading part.
      const halfKeep = Math.floor(keep / 2)
      const leading = keep % 2 === 0 ? halfKeep : halfKeep + 1
      const trailing = halfKeep

      return text.slice(0, leading) + replacement + text.slice(-trailing)
    }
  }
}
