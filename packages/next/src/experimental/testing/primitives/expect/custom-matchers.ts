import type { MatchersObject } from './types'

// selectively ported from https://github.com/jest-community/jest-extended
export const customMatchers: MatchersObject = {
  toSatisfy(
    actual: unknown,
    expected: (actual: unknown) => boolean,
    message?: string
  ) {
    const { printReceived, printExpected, matcherHint } = this.utils
    const pass = expected(actual)
    return {
      pass,
      message: () =>
        pass
          ? `\
${matcherHint('.not.toSatisfy', 'received', '')}

Expected value to not satisfy:
${message || printExpected(expected)}
Received:
${printReceived(actual)}`
          : `\
${matcherHint('.toSatisfy', 'received', '')}

Expected value to satisfy:
${message || printExpected(expected)}

Received:
${printReceived(actual)}`,
    }
  },

  toBeOneOf(actual: unknown, expected: Array<unknown> | Set<unknown>) {
    const { equals, customTesters } = this
    const { printReceived, printExpected, matcherHint, iterableEquality } =
      this.utils
    const testers = [...customTesters, iterableEquality]

    let pass: boolean

    if (Array.isArray(expected)) {
      pass =
        expected.length === 0 ||
        expected.some((item) => equals(item, actual, testers))
    } else if (expected instanceof Set) {
      pass =
        expected.size === 0 ||
        expected.has(actual) ||
        [...expected].some((item) => equals(item, actual, testers))
    } else {
      throw new TypeError(
        `You must provide an array or set to ${matcherHint('.toBeOneOf')}, not '${typeof expected}'.`
      )
    }

    return {
      pass,
      message: () =>
        pass
          ? `\
${matcherHint('.not.toBeOneOf', 'received', '')}

Expected value to not be one of:
${printExpected(expected)}
Received:
${printReceived(actual)}`
          : `\
${matcherHint('.toBeOneOf', 'received', '')}

Expected value to be one of:
${printExpected(expected)}

Received:
${printReceived(actual)}`,
    }
  },
}
