import {
  isNextDev,
  isNextStart,
  NextInstance,
  nextTestSetup,
  Playwright,
} from 'e2e-utils'
import { RequireStatic } from 'next/dist/build/segment-config/app/app-segment-config'
import { waitForNoRedbox, waitForRedbox } from '../../../lib/next-test-utils'
import {
  createRedboxSnapshot,
  ErrorSnapshot,
} from '../../../lib/add-redbox-matchers'

const NOT_IMPLEMENTED_VALUES: RequireStatic[] = ['navigation']

describe('require-static-config-validation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: !isNextDev,
    skipDeployment: true, // Build-time validation
  })

  if (skipped) return

  beforeAll(async () => {
    if (isNextStart) {
      const args = ['--experimental-build-mode', 'compile']
      await next.build({ args })
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

  // `requireStatic` validation errors are thrown before render,
  // so we expect them to appear quickly.
  // This test suite has many cases, and waiting for the default 5000ms
  // just to determine whether a redbox is shown makes it take a long time.
  const REDBOX_WAIT_OPTS = { waitInMs: 1000 }

  describe('nesting unstable_requireStatic', () => {
    const ALWAYS_ALLOWED_NESTINGS = [
      [undefined, true],
      ['auto', true],
    ] as const

    const ANYTHING_CAN_BE_NESTED = new Map<RequireStatic | undefined, boolean>([
      // Everything can be nested under undefined.
      [undefined, true],
      ['auto', true],
      ['shell', true],
      ['prefetch', true],
      ['navigation', true],
      [false, true],
    ])

    const isNestingValid = new Map<
      RequireStatic,
      Map<RequireStatic | undefined, boolean>
    >([
      [undefined, ANYTHING_CAN_BE_NESTED],
      ['auto', ANYTHING_CAN_BE_NESTED],
      [
        'shell',
        new Map<RequireStatic | undefined, boolean>([
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
        new Map<RequireStatic | undefined, boolean>([
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
        new Map<RequireStatic | undefined, boolean>([
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
        new Map<RequireStatic | undefined, boolean>([
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
      parent: RequireStatic | undefined
      child: RequireStatic | undefined
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

          const isNotImplemented =
            NOT_IMPLEMENTED_VALUES.includes(parent) ||
            NOT_IMPLEMENTED_VALUES.includes(child)

          const NOT_IMPLMEMENTED_PATTERN =
            /`export const unstable_requireStatic = .+?` is not implemented yet./

          const INVALID_CONFIG_MESSAGE = // `false` has a dedicated error message.
            parent === false || child === false
              ? `A child segment cannot override a parent segment with an incompatible \`unstable_requireStatic\`.`
              : `A child segment cannot override a parent segment with a less-constrained \`unstable_requireStatic\`.`

          if (isNextDev) {
            const browser = await next.browser(route)
            if (isValid) {
              // Valid nestings for options that aren't implemented yet still error.
              if (isNotImplemented) {
                await expectRedboxWith(
                  browser,
                  next,
                  {
                    label: 'Runtime Error',
                    description: expect.stringMatching(
                      NOT_IMPLMEMENTED_PATTERN
                    ),
                  },
                  REDBOX_WAIT_OPTS
                )
              } else {
                // Valid nesting should pass.
                await waitForNoRedbox(browser, REDBOX_WAIT_OPTS)
              }
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
              // Valid nestings for options that aren't implemented yet still error.
              if (isNotImplemented) {
                expect(result.exitCode).toBe(1)
                expect(result.cliOutput).toMatch(NOT_IMPLMEMENTED_PATTERN)
              } else {
                // Valid nestings should pass.
                expect(result.exitCode).toBe(0)
              }
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

  describe('unstable_requireStatic in sibling slots', () => {
    it.each<{
      left: RequireStatic | undefined
      right: RequireStatic | undefined
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

        const isNotImplemented =
          NOT_IMPLEMENTED_VALUES.includes(left) ||
          NOT_IMPLEMENTED_VALUES.includes(right)

        const NOT_IMPLMEMENTED_PATTERN =
          /`export const unstable_requireStatic = .+?` is not implemented yet./

        const INVALID_CONFIG_MESSAGE = `Parallel slots cannot have incompatible \`unstable_requireStatic\`.`

        if (isNextDev) {
          const browser = await next.browser(route)
          if (isValid) {
            // Valid combinations of options that aren't implemented yet still error.
            if (isNotImplemented) {
              await expectRedboxWith(
                browser,
                next,
                {
                  label: 'Runtime Error',
                  description: expect.stringMatching(NOT_IMPLMEMENTED_PATTERN),
                },
                REDBOX_WAIT_OPTS
              )
            } else {
              // Valid combinations should pass.
              await waitForNoRedbox(browser, REDBOX_WAIT_OPTS)
            }
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
            // Valid combinations of options that aren't implemented yet still error.
            if (isNotImplemented) {
              expect(result.exitCode).toBe(1)
              expect(result.cliOutput).toMatch(NOT_IMPLMEMENTED_PATTERN)
            } else {
              // Valid combinations should pass.
              expect(result.exitCode).toBe(0)
            }
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
