/// <reference lib="es2023.array" />
/// <reference lib="esnext.disposable" />
// Vitest 5.0.4 conditional mock behavior (MIT). The existing primitives own
// mock functions, equality testers and diagnostic formatting.
import {
  equals,
  getCustomEqualityTesters,
  iterableEquality,
  spies,
  stringify,
  type MockDisposable,
  wrapAssertion,
  type ChaiPlugin,
} from '../../../compiled/next-test-primitives'
type Procedure = spies.Procedure
type Mock<T extends Procedure> = spies.Mock<T>
const isMockFunction = spies.isMockFunction
function noop() {}

type BehaviorType = 'return' | 'throw' | 'resolve' | 'reject'

const whenSymbol = Symbol.for('$$vitest:when')

export function isWhenChain(input: object): input is When<Procedure> {
  try {
    return Reflect.has(input, whenSymbol)
  } catch {
    return false
  }
}

interface BehaviorAction<Value> {
  type: BehaviorType
  value: Value | unknown
  times: number
  remaining: number
  called: boolean
}

interface Behavior<Arguments extends unknown[], Value> {
  arguments: Arguments
  actions: BehaviorAction<Value>[]
}

interface BehaviorOptions {
  times?: number | undefined
}

type OnceBehaviorOptions = Omit<BehaviorOptions, 'times'>

type CalledWithInstance<ReturnType, Fn extends Procedure> = When<Fn> & {
  thenReturn: (
    value: ReturnType,
    options?: BehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>

  thenResolve: (
    value: Awaited<ReturnType>,
    options?: BehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>

  thenReturnOnce: (
    value: ReturnType,
    options?: OnceBehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>

  thenResolveOnce: (
    value: Awaited<ReturnType>,
    options?: OnceBehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>

  thenThrow: (
    value: unknown,
    options?: BehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>

  thenReject: (
    value: unknown,
    options?: BehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>

  thenThrowOnce: (
    value: unknown,
    options?: OnceBehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>

  thenRejectOnce: (
    value: unknown,
    options?: OnceBehaviorOptions | undefined
  ) => CalledWithInstance<ReturnType, Fn>
}

export interface When<Fn extends Procedure> extends MockDisposable {
  calledWith: (
    ...args: Parameters<Fn>
  ) => CalledWithInstance<ReturnType<Fn>, Fn>

  /** @internal */
  _getDiagnostics: () => {
    isExhausted: boolean
    pendingBehaviors: string
  }
}

export interface WhenOptions<Fn extends Procedure = Procedure> {
  onUnmatched?: 'throw' | 'passthrough' | Fn | undefined
}

export function when<Fn extends Procedure>(
  spy: Fn | Mock<Fn>,
  whenOptions?: WhenOptions<Fn>
): When<Fn> {
  if (!isMockFunction(spy)) {
    throw new TypeError(
      'vi.when: the argument must be a mock function created with `vi.fn()` or `vi.spyOn()`'
    )
  }

  type ScopedParameters = Parameters<Fn>
  type ScopedReturn = ReturnType<Fn>

  const behaviors: Behavior<ScopedParameters, ScopedReturn>[] = []
  const originalImplementation = spy.getMockImplementation()

  function findAction(args: ScopedParameters) {
    const testers = [...getCustomEqualityTesters(), iterableEquality]

    for (const behavior of behaviors) {
      if (equals(args, behavior.arguments, testers)) {
        return (
          behavior.actions.findLast(
            (action) => !(action.remaining === 0 && action.called)
          ) ?? null
        )
      }
    }

    return null
  }

  // @ts-expect-error cannot resolve generic args
  spy.mockImplementation((...args: ScopedParameters) => {
    const action = findAction(args)

    if (action === null) {
      const onUnmatched =
        typeof whenOptions?.onUnmatched === 'function'
          ? whenOptions.onUnmatched
          : whenOptions?.onUnmatched === 'throw'
            ? () => {
                throw new Error(
                  `vi.when: no behavior defined when called with [${args.map((arg) => stringify(arg)).join(', ')}]`
                )
              }
            : originalImplementation
      return onUnmatched?.(...args)
    }

    action.remaining -= 1
    action.called = true

    switch (action.type) {
      case 'return': {
        return action.value
      }

      case 'throw': {
        throw action.value
      }

      case 'resolve': {
        return Promise.resolve(action.value)
      }

      case 'reject': {
        return Promise.reject(action.value)
      }
    }
  })

  function getOrCreateBehavior(args: ScopedParameters) {
    const testers = [...getCustomEqualityTesters(), iterableEquality]

    let behavior = behaviors.find((candidate) =>
      equals(args, candidate.arguments, testers)
    )

    if (behavior === undefined) {
      behavior = {
        arguments: args,
        actions: [],
      }

      behaviors.push(behavior)
    }

    return behavior
  }

  // @ts-expect-error `Symbol.dispose` has to be assigned conditionally since it's only supported in Node >= 24
  const output: When<Fn> = markWhenChain({
    calledWith: (...args: ScopedParameters) => {
      const behavior = getOrCreateBehavior(args)

      function appendAction(
        selectedBehavior: Behavior<ScopedParameters, ScopedReturn>,
        type: BehaviorType,
        value: unknown,
        times: number
      ) {
        selectedBehavior.actions.push({
          type,
          value,
          times,
          remaining: times,
          called: false,
        })
      }

      const calledWithInstance: CalledWithInstance<ScopedReturn, Fn> =
        markWhenChain({
          ...output,
          thenThrow: (value, options) => {
            validateOptions(options)
            appendAction(
              behavior,
              'throw',
              value,
              options?.times ?? Number.POSITIVE_INFINITY
            )

            return calledWithInstance
          },
          thenThrowOnce: (value) => {
            appendAction(behavior, 'throw', value, 1)

            return calledWithInstance
          },
          thenReturn: (value, options) => {
            validateOptions(options)
            appendAction(
              behavior,
              'return',
              value,
              options?.times ?? Number.POSITIVE_INFINITY
            )

            return calledWithInstance
          },
          thenReturnOnce: (value) => {
            appendAction(behavior, 'return', value, 1)

            return calledWithInstance
          },
          thenResolve: (value, options) => {
            validateOptions(options)
            appendAction(
              behavior,
              'resolve',
              value,
              options?.times ?? Number.POSITIVE_INFINITY
            )

            return calledWithInstance
          },
          thenResolveOnce: (value) => {
            appendAction(behavior, 'resolve', value, 1)

            return calledWithInstance
          },
          thenReject: (value, options) => {
            validateOptions(options)
            appendAction(
              behavior,
              'reject',
              value,
              options?.times ?? Number.POSITIVE_INFINITY
            )

            return calledWithInstance
          },
          thenRejectOnce: (value) => {
            appendAction(behavior, 'reject', value, 1)

            return calledWithInstance
          },
        })

      return calledWithInstance
    },
    /** @internal */
    _getDiagnostics: () => {
      const pendingBehaviors = behaviors.filter(
        (behavior) =>
          behavior.actions.length === 0 ||
          behavior.actions.some((action) => !hasBeenConsumed(action))
      )

      return {
        isExhausted: behaviors.length !== 0 && pendingBehaviors.length === 0,
        pendingBehaviors: pendingBehaviors
          .map(
            (behavior) =>
              `calledWith(${behavior.arguments.map((argument) => stringify(argument)).join(', ')})${behavior.actions.length === 0 ? '  → no actions' : `\n${formatActions(behavior.actions)}`}`
          )
          .join('\n\n'),
      }
    },
  } satisfies Omit<When<Fn>, symbol>)

  if (Symbol.dispose) {
    output[Symbol.dispose] = () => {
      // @ts-expect-error without an original implementation we should fall back to an undefined-returning function as that's what the mocking functions do
      spy.mockImplementation(originalImplementation ?? noop)
    }
  }

  return output
}

const whenChainMarkerOptions: PropertyDescriptor = {}

function markWhenChain<T extends object>(input: T): T {
  Reflect.defineProperty(input, whenSymbol, whenChainMarkerOptions)

  return input
}

function formatActions(
  actions: Behavior<unknown[], unknown>['actions']
): string {
  const lines = actions.map((action, index) => {
    const method = getMethodName(action.type)
    const symbol = getSymbol(action)
    const left = `  ${symbol} ${method}(${stringify(action.value)}${action.times === Number.POSITIVE_INFINITY ? '' : `, { times: ${action.times} }`})`
    const unreachable =
      !hasBeenConsumed(action) &&
      actions
        .slice(index + 1)
        .some((later) => later.times === Number.POSITIVE_INFINITY)
    const remaining =
      getRemainingLabel(action) + (unreachable ? '  → unreachable action' : '')

    return { left, remaining }
  })

  const maxLeft = Math.max(...lines.map((line) => line.left.length))

  return lines
    .map(({ left, remaining }) => `${left.padEnd(maxLeft + 2)}${remaining}`)
    .join('\n')
}

function getMethodName(type: BehaviorType): string {
  switch (type) {
    case 'return': {
      return 'thenReturn'
    }
    case 'resolve': {
      return 'thenResolve'
    }
    case 'throw': {
      return 'thenThrow'
    }
    case 'reject': {
      return 'thenReject'
    }
    default: {
      ;(type) satisfies never

      throw new Error(`vi.when: "${type}" is not a known method`)
    }
  }
}

function hasBeenConsumed(action: BehaviorAction<unknown>): boolean {
  return (
    action.remaining === 0 /* times-actions reached 0 */ ||
    (action.remaining === Number.POSITIVE_INFINITY && action.called)
  ) /* infinite actions called at least once */
}

function getRemainingLabel(action: BehaviorAction<unknown>): string {
  if (hasBeenConsumed(action)) {
    return action.remaining === Number.POSITIVE_INFINITY
      ? 'exhausted'
      : `exhausted (${action.times} of ${action.times})`
  }

  return action.remaining === Number.POSITIVE_INFINITY
    ? 'never called'
    : `${action.remaining} remaining (out of ${action.times})`
}

function getSymbol(action: BehaviorAction<unknown>): string {
  if (hasBeenConsumed(action)) {
    return '✓'
  }

  return '✗'
}

function validateOptions(options: BehaviorOptions | undefined) {
  if (typeof options?.times === 'number' && options.times <= 0) {
    throw new RangeError('vi.when: `times` option must be greater than 0')
  }
}

export type WhenApi = { when: typeof when; isWhenChain: typeof isWhenChain }

export const MockPlugin: ChaiPlugin = (chai, utils) => {
  utils.addMethod(
    chai.Assertion.prototype,
    'toHaveBeenExhausted',
    wrapAssertion(utils, 'toHaveBeenExhausted', function () {
      const chain = utils.flag(this, 'object')

      if (!isWhenChain(chain)) {
        throw new TypeError(
          `${utils.inspect(chain)} is not a \`vi.when\` instance`
        )
      }

      const diagnostics = chain._getDiagnostics()

      this.assert(
        diagnostics.isExhausted,
        `expected all behaviors to have been exhausted, but some remain:\n\n  ${diagnostics.pendingBehaviors.replaceAll(/\n(?!\n)/g, '\n  ')}`,
        'expected at least one behavior to remain un-exhausted, but all were'
      )
    })
  )
}
