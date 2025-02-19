import type { MatcherContext } from 'expect'
import { toMatchInlineSnapshot } from 'jest-snapshot'
import {
  assertHasRedbox,
  getRedboxCallStack,
  getRedboxDescription,
  getRedboxEnvironmentLabel,
  getRedboxSource,
  getRedboxLabel,
  getRedboxTotalErrorCount,
  openRedbox,
} from './next-test-utils'
import type { BrowserInterface } from './browsers/base'

declare global {
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- module augmentation needs to match generic params even if unused
    interface Matchers<R> {
      /**
       * Inline snapshot matcher for a Redbox that's popped up by default.
       * When a Redbox is hidden at first and requires manual display by clicking the toast,
       * use {@link toDisplayCollapsedRedbox} instead.
       *
       * Unintented content in the snapshot should be reported to the Next.js DX team.
       * <FIXME-internal-frame> in the snapshot would be unintended.
       * Any node_modules in the snapshot would be unintended.
       * Differences in the snapshot between Turbopack and Webpack would be unintended.
       *
       * @param inlineSnapshot - The snapshot to compare against.
       */
      toDisplayRedbox(inlineSnapshot?: string): Promise<void>

      /**
       * Inline snapshot matcher for a Redbox that's collapsed by default.
       * When a Redbox is immediately displayed,
       * use {@link toDisplayRedbox} instead.
       *
       * Unintented content in the snapshot should be reported to the Next.js DX team.
       * <FIXME-internal-frame> in the snapshot would be unintended.
       * Any node_modules in the snapshot would be unintended.
       * Differences in the snapshot between Turbopack and Webpack would be unintended.
       *
       * @param inlineSnapshot - The snapshot to compare against.
       */
      toDisplayCollapsedRedbox(inlineSnapshot?: string): Promise<void>
    }
  }
}

interface RedboxSnapshot {
  environmentLabel: string
  label: string
  description: string
  source: string
  stack: string[]
  count: number
}

async function createRedboxSnapshot(
  browser: BrowserInterface
): Promise<RedboxSnapshot> {
  const [label, environmentLabel, description, source, stack, count] =
    await Promise.all([
      getRedboxLabel(browser),
      getRedboxEnvironmentLabel(browser),
      getRedboxDescription(browser),
      getRedboxSource(browser),
      getRedboxCallStack(browser),
      getRedboxTotalErrorCount(browser),
    ])

  // We don't need to test the codeframe logic everywhere.
  // Here we focus on the cursor position of the top most frame
  // From
  //
  // pages/index.js (3:11) @ eval
  //
  //   1 | export default function Page() {
  //   2 |   [1, 2, 3].map(() => {
  // > 3 |     throw new Error("anonymous error!");
  //     |           ^
  //   4 |   })
  //   5 | }
  //
  // to
  //
  // pages/index.js (3:11) @ Page
  // > 3 |     throw new Error("anonymous error!");
  //     |           ^
  let focusedSource = source
  if (source !== null) {
    focusedSource = ''
    const sourceFrameLines = source.split('\n')
    for (let i = 0; i < sourceFrameLines.length; i++) {
      const sourceFrameLine = sourceFrameLines[i]
      if (sourceFrameLine === '') {
        continue
      }

      if (sourceFrameLine.startsWith('>')) {
        // This is where the cursor will point
        // Include the cursor and nothing below since it's just surrounding code.
        focusedSource += '\n' + sourceFrameLine
        focusedSource += '\n' + sourceFrameLines[i + 1]
        break
      }
      const isCodeFrameLine = /^ {2}\s*\d+ \|/.test(sourceFrameLine)
      if (!isCodeFrameLine) {
        focusedSource += '\n' + sourceFrameLine
      }
    }
  }

  return {
    environmentLabel,
    label,
    description,
    source: focusedSource?.trim(),
    stack,
    // TODO(newDevOverlay): Always return `count`. Normalizing currently to avoid assertion forks.
    count: label === 'Build Error' && count === -1 ? 1 : count,
  }
}

expect.extend({
  async toDisplayRedbox(
    this: MatcherContext,
    browser: BrowserInterface,
    expectedRedboxSnapshot?: string
  ) {
    // Otherwise jest uses the async stack trace which makes it impossible to know the actual callsite of `toMatchSpeechInlineSnapshot`.
    // @ts-expect-error -- Not readonly
    this.error = new Error()
    // Abort test on first mismatch.
    // Subsequent actions will be based on an incorrect state otherwise and almost always fail as well.
    // TODO: Actually, we may want to proceed. Kinda nice to also do more assertions later.
    this.dontThrow = () => {}

    try {
      await assertHasRedbox(browser)
    } catch (cause) {
      // argument length is relevant.
      // Jest will update absent snapshots but fail if you specify a snapshot even if undefined.
      if (expectedRedboxSnapshot === undefined) {
        return toMatchInlineSnapshot.call(this, String(cause.message))
      } else {
        return toMatchInlineSnapshot.call(
          this,
          String(cause.message),
          expectedRedboxSnapshot
        )
      }
    }

    const redbox = await createRedboxSnapshot(browser)

    // argument length is relevant.
    // Jest will update absent snapshots but fail if you specify a snapshot even if undefined.
    if (expectedRedboxSnapshot === undefined) {
      return toMatchInlineSnapshot.call(this, redbox)
    } else {
      return toMatchInlineSnapshot.call(this, redbox, expectedRedboxSnapshot)
    }
  },
  async toDisplayCollapsedRedbox(
    this: MatcherContext,
    browser: BrowserInterface,
    expectedRedboxSnapshot?: string
  ) {
    // Otherwise jest uses the async stack trace which makes it impossible to know the actual callsite of `toMatchSpeechInlineSnapshot`.
    // @ts-expect-error -- Not readonly
    this.error = new Error()
    // Abort test on first mismatch.
    // Subsequent actions will be based on an incorrect state otherwise and almost always fail as well.
    // TODO: Actually, we may want to proceed. Kinda nice to also do more assertions later.
    this.dontThrow = () => {}

    try {
      await openRedbox(browser)
    } catch (cause) {
      // argument length is relevant.
      // Jest will update absent snapshots but fail if you specify a snapshot even if undefined.
      if (expectedRedboxSnapshot === undefined) {
        return toMatchInlineSnapshot.call(
          this,
          String(cause.message)
            // Should switch to `toDisplayRedbox` not `assertHasRedbox`
            .replace('assertHasRedbox', 'toDisplayRedbox')
        )
      } else {
        return toMatchInlineSnapshot.call(
          this,
          String(cause.message)
            // Should switch to `toDisplayRedbox` not `assertHasRedbox`
            .replace('assertHasRedbox', 'toDisplayRedbox'),
          expectedRedboxSnapshot
        )
      }
    }

    const redbox = await createRedboxSnapshot(browser)

    // argument length is relevant.
    // Jest will update absent snapshots but fail if you specify a snapshot even if undefined.
    if (expectedRedboxSnapshot === undefined) {
      return toMatchInlineSnapshot.call(this, redbox)
    } else {
      return toMatchInlineSnapshot.call(this, redbox, expectedRedboxSnapshot)
    }
  },
})
