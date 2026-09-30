import {
  isNextDev,
  isNextStart,
  NextInstance,
  nextTestSetup,
  Playwright,
} from 'e2e-utils'
import { EnsureStatic } from 'next/dist/build/segment-config/app/app-segment-config'
import { waitForNoRedbox, waitForRedbox } from '../../../lib/next-test-utils'
import {
  createRedboxSnapshot,
  ErrorSnapshot,
} from '../../../lib/add-redbox-matchers'

// Cannot prerender individual pages in deploy mode
// @force-gate !deploy
describe('unstable_ensureStatic config validation', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
  })

  beforeAll(async () => {
    if (isNextStart) {
      const result = await next.build({
        args: ['--experimental-build-mode', 'compile'],
      })
      if (result.exitCode !== 0) {
        throw new Error('Failed to build. CLI Output:\n\n' + result.cliOutput)
      }
    }
  })

  const prerenderPattern = async (pattern: string) => {
    const args = [
      '--experimental-build-mode',
      'generate',
      '--debug-build-paths',
      pattern,
    ]
    const result = await next.build({ args })
    if (
      result.cliOutput.includes(`Pattern "${pattern}" did not match any files`)
    ) {
      throw new Error(`Pattern "${pattern}" did not match any files`)
    }
    return result
  }

  // `ensureStatic` validation errors are thrown before render,
  // so we expect them to appear quickly.
  // This test suite has many cases, and waiting for the default 5000ms
  // just to determine whether a redbox is shown makes it take a long time.
  const REDBOX_WAIT_OPTS = { waitInMs: 1000 }

  describe('nesting unstable_ensureStatic', () => {
    const ALWAYS_ALLOWED_NESTINGS = [
      [undefined, true],
      ['auto', true],
    ] as const

    const ANYTHING_CAN_BE_NESTED = new Map<EnsureStatic | undefined, boolean>([
      // Everything can be nested under undefined.
      [undefined, true],
      ['auto', true],
      ['shell', true],
      ['prefetch', true],
      ['navigation', true],
      [false, true],
    ])

    const isNestingValid = new Map<
      EnsureStatic,
      Map<EnsureStatic | undefined, boolean>
    >([
      [undefined, ANYTHING_CAN_BE_NESTED],
      ['auto', ANYTHING_CAN_BE_NESTED],
      [
        'shell',
        new Map<EnsureStatic | undefined, boolean>([
          ...ALWAYS_ALLOWED_NESTINGS,
          // Only `"shell"`, `"prefetch"`, or `"navigation"`.
          ['shell', true],
          ['prefetch', true],
          ['navigation', true],
          [false, false],
        ]),
      ],
      [
        'prefetch',
        new Map<EnsureStatic | undefined, boolean>([
          // Only `"prefetch"` or `"navigation"`.
          ...ALWAYS_ALLOWED_NESTINGS,
          ['shell', false],
          ['prefetch', true],
          ['navigation', true],
          [false, false],
        ]),
      ],
      [
        'navigation',
        new Map<EnsureStatic | undefined, boolean>([
          ...ALWAYS_ALLOWED_NESTINGS,
          // Only `"navigation"`.
          ['shell', false],
          ['prefetch', false],
          ['navigation', true],
          [false, false],
        ]),
      ],
      [
        false,
        new Map<EnsureStatic | undefined, boolean>([
          ...ALWAYS_ALLOWED_NESTINGS,
          // Only `false` can be nested under `false`.
          ['shell', false],
          ['prefetch', false],
          ['navigation', false],
          [false, true],
        ]),
      ],
    ])

    const nestingCases: {
      parent: EnsureStatic | undefined
      child: EnsureStatic | undefined
      isValid: boolean
    }[] = []
    for (const [parent, options] of isNestingValid) {
      for (const [child, isValid] of options) {
        nestingCases.push({ parent, child, isValid })
      }
    }
    describe.each(
      [...isNestingValid].map(([parent, options]) => ({ parent, options }))
    )('parent: $parent', ({ parent, options }) => {
      it.each([...options].map(([child, isValid]) => ({ child, isValid })))(
        'child: $child is accepted: $isValid',
        async ({ child, isValid }) => {
          const route = `/nested/parent-${parent}/child-${child}`

          const INVALID_CONFIG_MESSAGE = // `false` has a dedicated error message.
            parent === false || child === false
              ? `A child segment cannot override a parent segment with an incompatible \`unstable_ensureStatic\`.`
              : `A child segment cannot override a parent segment with a less-constrained \`unstable_ensureStatic\`.`

          if (isNextDev) {
            const browser = await next.browser(route)
            if (isValid) {
              await waitForNoRedbox(browser, REDBOX_WAIT_OPTS)
            } else {
              // Invalid nestings should error.
              await expectRedboxWith(
                browser,
                next,
                {
                  label: 'Runtime Error',
                  description: expect.stringContaining(INVALID_CONFIG_MESSAGE),
                },
                REDBOX_WAIT_OPTS
              )
            }
          } else {
            const result = await prerenderPattern(`app/${route}/page.tsx`)
            if (isValid) {
              // Valid nestings should pass.
              expect(result.exitCode).toBe(0)
            } else {
              // Invalid nestings should error.
              expect(result.exitCode).toBe(1)
              expect(result.cliOutput).toContain(INVALID_CONFIG_MESSAGE)
            }
          }
        }
      )
    })
  })

  describe('unstable_ensureStatic in sibling slots', () => {
    it.each<{
      left: EnsureStatic | undefined
      right: EnsureStatic | undefined
      isValid: boolean
    }>([
      // Compatible
      { left: undefined, right: 'prefetch', isValid: true },
      { left: 'auto', right: 'prefetch', isValid: true },
      { left: 'prefetch', right: 'prefetch', isValid: true },
      { left: false, right: false, isValid: true },
      // Incompatible
      { left: 'prefetch', right: 'shell', isValid: false },
      { left: 'shell', right: 'prefetch', isValid: false },
      { left: 'prefetch', right: false, isValid: false },
    ])(
      'left: $left, right: $right is accepted: $isValid',
      async ({ left, right, isValid }) => {
        const route = `/sibling-slots/left-${left}-right-${right}`

        const INVALID_CONFIG_MESSAGE = `Parallel slots cannot have incompatible \`unstable_ensureStatic\`.`

        if (isNextDev) {
          const browser = await next.browser(route)
          if (isValid) {
            // Valid combinations should pass.
            await waitForNoRedbox(browser, REDBOX_WAIT_OPTS)
          } else {
            // Invalid combinations should error.
            await expectRedboxWith(
              browser,
              next,
              {
                label: 'Runtime Error',
                description: expect.stringContaining(INVALID_CONFIG_MESSAGE),
              },
              REDBOX_WAIT_OPTS
            )
          }
        } else {
          const result = await prerenderPattern(`app/${route}/*/page.tsx`)
          if (isValid) {
            // Valid combinations should pass.
            expect(result.exitCode).toBe(0)
          } else {
            // Invalid combinations should error.
            expect(result.exitCode).toBe(1)
            expect(result.cliOutput).toContain(INVALID_CONFIG_MESSAGE)
          }
        }
      }
    )
  })
})

async function expectRedboxWith(
  browser: Playwright,
  next: NextInstance,
  matcher: Partial<ErrorSnapshot>,
  options?: { waitInMs: number }
) {
  await waitForRedbox(browser, options)
  expect(await createRedboxSnapshot(browser, next)).toEqual(
    expect.objectContaining<Partial<ErrorSnapshot>>(matcher)
  )
}
